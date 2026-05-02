/**
 * @fileoverview Get Apify Actor Output Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Fetches paginated results from a completed actor run's dataset.
 * Use this after `call_apify_actor` when the output was truncated
 * or when only a portion of results is needed.
 *
 * The LLM can iterate through large datasets page-by-page without
 * loading everything into the context window at once.
 *
 * Media persistence:
 * Like `call_apify_actor`, any media URLs in the output are automatically
 * re-hosted to Firebase Storage.
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

/** Maximum items per page (hard cap). */
const MAX_PAGE_SIZE = 200;

/** Default items per page. */
const DEFAULT_PAGE_SIZE = 100;

/** Maximum characters of output to include. */
const MAX_OUTPUT_CHARS = 50_000;

/** Max media items to persist per page. */
const MAX_MEDIA_ITEMS = 10;

const GetApifyActorOutputInputSchema = z.object({
  datasetId: z.string().trim().min(1),
  offset: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
});

/** Common media URL patterns. */
const MEDIA_URL_REGEX =
  /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|avi|mkv)(?:\?[^\s"']*)?/gi;

/** Extract unique media URLs from nested data. */
function extractMediaUrls(data: unknown, maxCount: number): string[] {
  const urls = new Set<string>();
  function walk(node: unknown): void {
    if (urls.size >= maxCount) return;
    if (typeof node === 'string') {
      const matches = node.match(MEDIA_URL_REGEX);
      if (matches)
        for (const url of matches) {
          if (urls.size < maxCount) urls.add(url);
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

/** Truncate large output. */
function truncateOutput(data: unknown): string {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (json.length <= MAX_OUTPUT_CHARS) return json;
  return (
    json.slice(0, MAX_OUTPUT_CHARS) + '\n\n... [OUTPUT TRUNCATED — increase offset to paginate]'
  );
}

export class GetApifyActorOutputTool extends BaseTool {
  readonly name = 'get_apify_actor_output';
  readonly description =
    'Fetch paginated results from a completed automation task run dataset. ' +
    'Use this after call_apify_actor when the output was truncated or to retrieve specific pages. ' +
    'Supports offset and limit for pagination (max 200 items per page). ' +
    'Media URLs in results are automatically re-hosted to permanent CDN-backed URLs.';

  readonly parameters = GetApifyActorOutputInputSchema;

  override readonly allowedAgents = [
    'data_coordinator',
    'recruiting_coordinator',
    'brand_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = false;
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
    const parsed = GetApifyActorOutputInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { datasetId } = parsed.data;

    const offset = Math.max(parsed.data.offset ?? 0, 0);
    const limit = Math.min(Math.max(parsed.data.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    try {
      logger.info('[GetApifyActorOutput] Fetching output', { datasetId, offset, limit });
      context?.emitStage?.('fetching_data', {
        icon: 'search',
        datasetId,
        offset,
        limit,
      });

      const result = await this.bridge.getActorOutput(datasetId, offset, limit);

      // ── Media persistence (best-effort) ────────────────────────────
      let persistedMediaUrls: string[] = [];
      if (result && context?.userId) {
        persistedMediaUrls = await this.persistMedia(result, context);
      }

      const output = truncateOutput(result);

      logger.info('[GetApifyActorOutput] Completed', {
        datasetId,
        offset,
        limit,
        outputLength: output.length,
        persistedMedia: persistedMediaUrls.length,
      });

      return {
        success: true,
        data: {
          datasetId,
          offset,
          limit,
          output,
          persistedMediaUrls,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch actor output';
      logger.error('[GetApifyActorOutput] Failed', { datasetId, error: message });
      return { success: false, error: message };
    }
  }

  /** Extract and persist media URLs from output. */
  private async persistMedia(data: unknown, context: ToolExecutionContext): Promise<string[]> {
    try {
      const urls = extractMediaUrls(data, MAX_MEDIA_ITEMS);
      if (urls.length === 0) return [];

      const mediaItems: MediaInput[] = urls.map((url) => ({
        url,
        type: this.guessMediaType(url),
        platform: 'web' as const,
      }));

      const staging: MediaThreadContext | undefined =
        context.userId && context.threadId
          ? { userId: context.userId, threadId: context.threadId }
          : undefined;

      if (!staging) {
        logger.warn(
          '[GetApifyActorOutput] Skipping media persistence — no userId/threadId in context'
        );
        return [];
      }

      const persisted = await this.media.persistBatch(mediaItems, staging);
      return persisted.map((p) => p.url);
    } catch (err) {
      logger.warn('[GetApifyActorOutput] Media persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return [];
    }
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
