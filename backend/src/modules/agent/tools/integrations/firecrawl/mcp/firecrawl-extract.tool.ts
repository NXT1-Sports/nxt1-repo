/**
 * @fileoverview Firecrawl Extract Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Extracts structured data from one or more known web pages using Firecrawl's
 * JSON-mode scrape flow.
 * Pass a natural language prompt describing what to extract and optionally
 * a JSON schema for the output format.
 *
 * Use cases:
 * - Extracting roster data (player names, positions, numbers) from college sites
 * - Pulling coaching staff emails and phone numbers
 * - Scraping product/pricing info from multiple known pages
 * - Extracting event schedules and dates from athletic departments
 *
 * Budget: Each URL is scraped separately in JSON mode.
 * Maximum 25 URLs per call.
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../../base.tool.js';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlExtractOptions,
} from './firecrawl-mcp-bridge.service.js';
import { checkSocialDomainBlock } from '../../../media/media-acquisition.middleware.js';
import { z } from 'zod';
import { logger } from '../../../../../../utils/logger.js';
import {
  ScraperMediaService,
  type MediaInput,
  type MediaThreadContext,
  type PersistedMedia,
} from '../../social/scraper-media.service.js';
import {
  applyPersistedMediaToKnownFields,
  buildMediaUrlMap,
} from '../../media-output-normalizer.js';

/** Maximum URL length. */
const MAX_URL_LENGTH = 2_048;

/** Maximum number of URLs per call. */
const MAX_URLS = 25;

/** Maximum prompt length. */
const MAX_PROMPT_LENGTH = 2_000;

/** Maximum output size to return to the LLM. */
const MAX_OUTPUT_CHARS = 50_000;

/** Maximum number of media URLs to persist per call. */
const MAX_MEDIA_ITEMS = 10;

const MEDIA_URL_PATTERN =
  /https?:\/\/[^\s"')\]}]+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|avi|mkv|m3u8|mpd)(?:\?[^\s"')\]}]*)?/gi;

function extractMediaUrls(data: unknown, maxCount: number): string[] {
  const urls = new Set<string>();

  const scan = (value: unknown): void => {
    if (urls.size >= maxCount || value == null) return;

    if (typeof value === 'string') {
      for (const match of value.matchAll(MEDIA_URL_PATTERN)) {
        const url = match[0]?.trim();
        if (!url) continue;
        urls.add(url);
        if (urls.size >= maxCount) return;
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        scan(item);
        if (urls.size >= maxCount) return;
      }
      return;
    }

    if (typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        scan(nested);
        if (urls.size >= maxCount) return;
      }
    }
  };

  scan(data);
  return Array.from(urls).slice(0, maxCount);
}

function truncateOutput(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n\n... [OUTPUT TRUNCATED]';
}

export class FirecrawlExtractTool extends BaseTool {
  readonly name = 'extract_web_data';
  readonly description =
    'Extract structured JSON data from one or more already-known web pages using AI. ' +
    'Pass a prompt describing what to extract and optionally a JSON schema for the output format. ' +
    'Best for: roster tables, coaching directories, event schedules, and pricing pages when you already have the page URLs. ' +
    'Maximum 25 URLs per call. For URL discovery use firecrawl_search_web, map_website, or firecrawl_agent_research.';

  readonly parameters = z.object({
    urls: z.array(z.string().trim().min(1)).min(1).max(MAX_URLS),
    prompt: z.string().trim().min(1),
    schema: z.record(z.string(), z.unknown()).optional(),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly bridge: FirecrawlMcpBridgeService;
  private readonly media: ScraperMediaService;

  constructor(
    bridge: FirecrawlMcpBridgeService,
    media: ScraperMediaService = new ScraperMediaService()
  ) {
    super();
    this.bridge = bridge;
    this.media = media;
  }

  private guessMediaType(url: string): 'image' | 'video' {
    const lower = url.toLowerCase();
    if (
      lower.includes('.mp4') ||
      lower.includes('.mov') ||
      lower.includes('.avi') ||
      lower.includes('.mkv') ||
      lower.includes('.m3u8') ||
      lower.includes('.mpd')
    ) {
      return 'video';
    }
    return 'image';
  }

  private async persistMedia(
    data: unknown,
    context?: ToolExecutionContext
  ): Promise<readonly PersistedMedia[]> {
    const urls = extractMediaUrls(data, MAX_MEDIA_ITEMS);
    if (urls.length === 0) return [];

    const staging: MediaThreadContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    if (!staging) {
      logger.warn('[FirecrawlExtract] Skipping media persistence — no userId/threadId in context');
      return [];
    }

    const mediaItems: MediaInput[] = urls.map((url) => ({
      url,
      type: this.guessMediaType(url),
      platform: 'web',
      sourceUrl: url,
    }));

    const persisted = await this.media.persistBatch(mediaItems, staging);
    return persisted;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const urls = input['urls'];
    if (!Array.isArray(urls) || urls.length === 0) {
      return this.paramError('urls');
    }

    const validUrls = urls.filter(
      (u): u is string =>
        typeof u === 'string' &&
        u.length <= MAX_URL_LENGTH &&
        (u.startsWith('http://') || u.startsWith('https://'))
    );

    if (validUrls.length === 0) {
      return {
        success: false,
        error: 'No valid URLs provided. URLs must start with http:// or https://.',
      };
    }

    // Hard block social domains across all extract URLs
    for (const u of validUrls) {
      const socialBlock = checkSocialDomainBlock(u);
      if (socialBlock) return socialBlock;
    }

    if (validUrls.length > MAX_URLS) {
      return {
        success: false,
        error: `Maximum ${MAX_URLS} URLs per extract call. Received: ${validUrls.length}.`,
      };
    }

    const prompt = this.str(input, 'prompt');
    if (!prompt) return this.paramError('prompt');

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return {
        success: false,
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      };
    }

    const legacyDiscoveryFlags = [
      'enableWebSearch',
      'allowExternalLinks',
      'includeSubdomains',
    ].filter((key) => Object.prototype.hasOwnProperty.call(input, key));
    if (legacyDiscoveryFlags.length > 0) {
      return {
        success: false,
        error:
          '`extract_web_data` only supports structured extraction from already-known page URLs. ' +
          `Unsupported option(s): ${legacyDiscoveryFlags.join(', ')}. ` +
          'Use `firecrawl_search_web` to find candidate pages, `map_website` to discover site URLs, or `firecrawl_agent_research` for open-ended multi-source research.',
      };
    }

    const schema = input['schema'] as Record<string, unknown> | undefined;
    const options: FirecrawlExtractOptions = {
      schema,
    };

    logger.info('[FirecrawlExtract] Extracting data', {
      urlCount: validUrls.length,
      promptLength: prompt.length,
      hasSchema: !!schema,
      userId: context?.userId,
    });
    context?.emitStage?.('fetching_data', {
      icon: 'search',
      urlCount: validUrls.length,
      phase: 'extract_data',
    });

    try {
      const result = await this.bridge.extract(validUrls, prompt, options);
      const persistedMedia = await this.persistMedia(result, context);
      const persistedMediaUrls = persistedMedia.map((entry) => entry.url);
      const normalizedResult = applyPersistedMediaToKnownFields(result, persistedMedia);
      const output = truncateOutput(normalizedResult);

      logger.info('[FirecrawlExtract] Completed', {
        urlCount: validUrls.length,
        outputLength: output.length,
      });

      return {
        success: true,
        data: {
          urlCount: validUrls.length,
          extraction: output,
          persistedMediaUrls,
          mediaUrlMap: buildMediaUrlMap(persistedMedia),
          _hint:
            persistedMediaUrls.length > 0
              ? `${persistedMediaUrls.length} media asset(s) were staged. Route video URLs to write_athlete_videos or write_team_post. Route image URLs to write_athlete_images only after verifying they are real profile/action images, not video poster, thumbnail, cover, or preview frames.`
              : 'No media assets were found in the extraction output.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      logger.error('[FirecrawlExtract] Failed', {
        urlCount: validUrls.length,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
