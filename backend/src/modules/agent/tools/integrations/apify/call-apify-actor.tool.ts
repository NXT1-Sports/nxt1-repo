/**
 * @fileoverview Call Apify Actor Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Executes an Apify actor via the hosted MCP server and returns structured
 * results. This is the primary "do work" tool in the Apify MCP bridge —
 * it runs actors synchronously and waits for completion.
 *
 * Budget enforcement:
 * All actor calls are capped to prevent runaway costs:
 * - `maxItems`: Hard cap at 200 items per call
 * - `memoryMbytes`: Capped at 256 MB
 * - `timeoutSecs`: Capped at 300 seconds (5 minutes)
 *
 * Media persistence:
 * When results contain media URLs (images/videos), the tool automatically
 * downloads and re-hosts them in Firebase Storage via ScraperMediaService.
 * This ensures CDN-backed, permanent URLs instead of ephemeral signed URLs
 * from source platforms.
 *
 * Output handling:
 * Results are truncated to fit the LLM context window. For large datasets,
 * the LLM should use `get_apify_actor_output` for pagination.
 *
 * Configuration:
 * Set the `APIFY_API_TOKEN` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { ApifyMcpBridgeService } from './apify-mcp-bridge.service.js';
import {
  ScraperMediaService,
  type MediaInput,
  type MediaThreadContext,
} from '../social/scraper-media.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Budget Constants ────────────────────────────────────────────────────────

/** Hard cap: maximum items any actor can return in a single call. */
const BUDGET_MAX_ITEMS = 200;

/** Hard cap: maximum memory allocation in MB. */
const BUDGET_MAX_MEMORY_MB = 256;

/** Hard cap: maximum run duration in seconds. */
const BUDGET_MAX_TIMEOUT_SECS = 300;

/** Maximum characters of raw output to include in the LLM response. */
const MAX_OUTPUT_CHARS = 50_000;

/** Maximum number of media URLs to persist per call. */
const MAX_MEDIA_ITEMS = 10;

/** Max length for actor ID to prevent abuse. */
const MAX_ACTOR_ID_LENGTH = 200;

const CallApifyActorInputSchema = z.object({
  actorId: z.string().trim().min(1).max(MAX_ACTOR_ID_LENGTH),
  input: z.record(z.string(), z.unknown()),
  skipMediaPersistence: z.boolean().optional().default(false),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Common media URL patterns from popular CDNs. */
const MEDIA_URL_REGEX =
  /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|avi|mkv)(?:\?[^\s"']*)?/gi;

/**
 * Extract media URLs from a nested data structure (arrays, objects, strings).
 * Returns unique URLs up to `maxCount`.
 */
function extractMediaUrls(data: unknown, maxCount: number): string[] {
  const urls = new Set<string>();

  function walk(node: unknown): void {
    if (urls.size >= maxCount) return;

    if (typeof node === 'string') {
      const matches = node.match(MEDIA_URL_REGEX);
      if (matches) {
        for (const url of matches) {
          if (urls.size >= maxCount) break;
          urls.add(url);
        }
      }
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  }

  walk(data);
  return [...urls];
}

/**
 * Truncate output to fit within the LLM context window.
 * Serializes to JSON, then truncates with a trailing notice.
 */
function truncateOutput(data: unknown): string {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (json.length <= MAX_OUTPUT_CHARS) return json;

  return (
    json.slice(0, MAX_OUTPUT_CHARS) +
    '\n\n... [OUTPUT TRUNCATED — use get_apify_actor_output for full paginated results]'
  );
}

function extractStringField(data: unknown, fieldNames: readonly string[]): string | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const record = data as Record<string, unknown>;
  for (const fieldName of fieldNames) {
    if (typeof record[fieldName] === 'string' && record[fieldName].trim().length > 0) {
      return record[fieldName] as string;
    }
  }

  const nestedKeys = ['data', 'run', 'result', 'output'];
  for (const key of nestedKeys) {
    const nested = record[key];
    const value = extractStringField(nested, fieldNames);
    if (value) return value;
  }

  return undefined;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class CallApifyActorTool extends BaseTool {
  readonly name = 'call_apify_actor';
  readonly description =
    'Run an automation task (scraper, crawler, or data extraction job) and get results. ' +
    'IMPORTANT: Before calling this, use get_apify_actor_details to learn the exact input schema. ' +
    'Budget limits are enforced automatically: max 200 items, 256 MB memory, 5 min timeout. ' +
    'For large results, use get_apify_actor_output to paginate through the dataset. ' +
    'Media URLs (images/videos) in results are automatically re-hosted to permanent CDN-backed URLs. ' +
    'Set skipMediaPersistence=true when the task returns large video files that should stay remote for a downstream handoff instead of being buffered. ' +
    'This tool consumes compute resources — only call when you have the correct input parameters.';

  readonly parameters = CallApifyActorInputSchema;

  override readonly allowedAgents = [
    'data_coordinator',
    'recruiting_coordinator',
    'brand_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'analytics' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly bridge: ApifyMcpBridgeService;
  private readonly media: ScraperMediaService;

  constructor(bridge: ApifyMcpBridgeService, media: ScraperMediaService) {
    super();
    this.bridge = bridge;
    this.media = media;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CallApifyActorInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { actorId, input: rawInput, skipMediaPersistence } = parsed.data;

    // ── Budget enforcement ─────────────────────────────────────────────
    const sanitizedInput = this.enforceBudget({ ...rawInput });

    logger.info('[CallApifyActor] Executing actor', {
      actorId,
      inputKeys: Object.keys(sanitizedInput),
      userId: context?.userId,
    });

    context?.emitStage?.('submitting_job', {
      icon: 'processing',
      actorId,
      phase: 'run_actor',
    });

    try {
      // ── Execute via MCP bridge ─────────────────────────────────────
      const result = await this.bridge.callActor(actorId, sanitizedInput, context?.signal);

      // ── Media persistence (best-effort) ────────────────────────────
      let persistedMediaUrls: string[] = [];
      if (result && context?.userId && !skipMediaPersistence) {
        persistedMediaUrls = await this.persistMedia(result, actorId, context);
      }

      // ── Truncate output for LLM ───────────────────────────────────
      const output = truncateOutput(result);
      const datasetId = extractStringField(result, ['datasetId', 'defaultDatasetId']);
      const runId = extractStringField(result, ['runId', 'id']);

      logger.info('[CallApifyActor] Completed', {
        actorId,
        outputLength: output.length,
        persistedMedia: persistedMediaUrls.length,
        datasetId,
        runId,
      });

      return {
        success: true,
        data: {
          actorId,
          datasetId,
          runId,
          output,
          persistedMediaUrls,
          mediaPersistenceSkipped: skipMediaPersistence,
          note:
            persistedMediaUrls.length > 0
              ? `${persistedMediaUrls.length} media file(s) saved to CDN.`
              : skipMediaPersistence
                ? 'Media persistence was skipped for this actor run.'
                : undefined,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Actor execution failed';
      logger.error('[CallApifyActor] Failed', { actorId, error: message });
      return { success: false, error: message };
    }
  }

  // ── Budget Enforcement ──────────────────────────────────────────────────

  /** Clamp budget-related fields to hard caps. */
  private enforceBudget(input: Record<string, unknown>): Record<string, unknown> {
    // Clamp maxItems / resultsLimit / limit (common actor field names)
    for (const key of ['maxItems', 'resultsLimit', 'limit', 'maxResults', 'maxPosts']) {
      if (typeof input[key] === 'number') {
        input[key] = Math.min(input[key] as number, BUDGET_MAX_ITEMS);
      }
    }

    // Inject memory cap
    if (
      typeof input['memoryMbytes'] !== 'number' ||
      (input['memoryMbytes'] as number) > BUDGET_MAX_MEMORY_MB
    ) {
      input['memoryMbytes'] = BUDGET_MAX_MEMORY_MB;
    }

    // Inject timeout cap
    if (
      typeof input['timeoutSecs'] !== 'number' ||
      (input['timeoutSecs'] as number) > BUDGET_MAX_TIMEOUT_SECS
    ) {
      input['timeoutSecs'] = BUDGET_MAX_TIMEOUT_SECS;
    }

    return input;
  }

  // ── Media Persistence ───────────────────────────────────────────────────

  /** Extract and persist media URLs from actor output to Firebase Storage. */
  private async persistMedia(
    data: unknown,
    actorId: string,
    context: ToolExecutionContext
  ): Promise<string[]> {
    try {
      const urls = extractMediaUrls(data, MAX_MEDIA_ITEMS);
      if (urls.length === 0) return [];

      context.emitStage?.('uploading_assets', {
        icon: 'upload',
        actorId,
        mediaCount: urls.length,
      });

      // Determine platform for storage path
      const platform = this.detectPlatform(actorId);

      const mediaItems: MediaInput[] = urls.map((url) => ({
        url,
        type: this.guessMediaType(url),
        platform,
      }));

      const staging: MediaThreadContext | undefined =
        context.userId && context.threadId
          ? { userId: context.userId, threadId: context.threadId }
          : undefined;

      if (!staging) {
        logger.warn('[CallApifyActor] Skipping media persistence — no userId/threadId in context');
        return [];
      }

      const persisted = await this.media.persistBatch(mediaItems, staging);
      return persisted.map((p) => p.url);
    } catch (err) {
      // Media persistence is best-effort — never fail the tool
      logger.warn('[CallApifyActor] Media persistence failed (non-fatal)', {
        actorId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return [];
    }
  }

  /** Map actor ID to a media platform for storage path organization. */
  private detectPlatform(actorId: string): 'instagram' | 'twitter' | 'web' {
    const lower = actorId.toLowerCase();
    if (lower.includes('instagram') || lower.includes('ig-')) return 'instagram';
    if (lower.includes('twitter') || lower.includes('scweet') || lower.includes('x-com'))
      return 'twitter';
    return 'web';
  }

  /** Guess media type from URL extension. */
  private guessMediaType(url: string): 'image' | 'video' {
    const lower = url.toLowerCase();
    if (
      lower.includes('.mp4') ||
      lower.includes('.mov') ||
      lower.includes('.avi') ||
      lower.includes('.mkv')
    ) {
      return 'video';
    }
    return 'image';
  }
}
