/**
 * @fileoverview Firecrawl Images Tool — Extract all images from a web page
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Uses Firecrawl's native `formats: ['images']` capability to extract a
 * typed, deduplicated array of all image URLs from any public web page.
 * This replaces fragile regex-based URL extraction.
 *
 * Use cases:
 * - Collecting action shots from a college athletics roster page
 * - Extracting headshots from a scouting report or media guide
 * - Pulling team photos from a program's website
 * - Gathering graphics and banner images from any public web page
 *
 * Returns `images[]` with url, inferred mimeType, and alt text when available.
 * Social domains (x.com, instagram.com, etc.) are hard-blocked — use dedicated
 * social scrapers instead.
 *
 * Configuration: Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../../base.tool.js';
import type { FirecrawlMcpBridgeService } from './firecrawl-mcp-bridge.service.js';
import { checkSocialDomainBlock } from '../../../media/media-acquisition.middleware.js';
import { z } from 'zod';
import { logger } from '../../../../../../utils/logger.js';

/** Maximum images to return per call. */
const MAX_IMAGES = 100;

/** Maximum URL length to prevent abuse. */
const MAX_URL_LENGTH = 2_048;

const ExtractPageImagesInputSchema = z.object({
  url: z.string().trim().min(1).describe('The page URL to extract images from.'),
  maxImages: z
    .number()
    .int()
    .min(1)
    .max(MAX_IMAGES)
    .optional()
    .default(50)
    .describe('Maximum number of images to return (default: 50, max: 100).'),
});

export class FirecrawlImagesTool extends BaseTool {
  readonly name = 'extract_page_images';
  readonly entityGroup = 'user_tools' as const;
  readonly description =
    'Extract all images from any public web page using Firecrawl. ' +
    'Returns a typed array of image objects with URL, MIME type, and alt text. ' +
    'Use this to collect action shots, headshots, team photos, and graphics from ' +
    'college athletics pages, scouting reports, media guides, and program websites. ' +
    'Do NOT use for social media platforms (x.com, instagram.com, etc.) — ' +
    'use scrape_twitter or scrape_instagram instead. ' +
    'Pair with scrape_webpage when you also need page text content.';

  readonly parameters = ExtractPageImagesInputSchema;
  readonly isMutation = false;
  readonly category = 'system' as const;

  private readonly bridge: FirecrawlMcpBridgeService;

  constructor(bridge: FirecrawlMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ExtractPageImagesInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    const { url, maxImages } = parsed.data;

    if (url.length > MAX_URL_LENGTH) {
      return {
        success: false,
        error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`,
      };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'URL must start with http:// or https://' };
    }

    // Hard block social domains — use dedicated social scrapers
    const socialBlock = checkSocialDomainBlock(url);
    if (socialBlock) return socialBlock;

    logger.info('[FirecrawlImages] Extracting images', { url, maxImages, userId: context?.userId });

    context?.emitStage?.('fetching_data', {
      icon: 'media',
      url,
      maxImages,
    });

    try {
      const result = await this.bridge.scrape(url, { formats: ['images'] });

      const images = extractImages(result, maxImages);

      logger.info('[FirecrawlImages] Images extracted', { url, count: images.length });

      return {
        success: true,
        data: {
          url,
          images,
          count: images.length,
          note:
            images.length === 0
              ? 'No images found on this page. The page may be JavaScript-rendered or require authentication.'
              : `${images.length} image(s) found. Use write_athlete_images to persist action shots/headshots.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract images';
      logger.error('[FirecrawlImages] Failed', { url, error: message });
      return { success: false, error: message };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ExtractedImage {
  readonly url: string;
  readonly mimeType: string;
  readonly alt?: string;
}

function extractImages(result: unknown, maxImages: number): readonly ExtractedImage[] {
  if (result == null || typeof result !== 'object') return [];

  const data = result as Record<string, unknown>;

  // Firecrawl native images format — data.images is string[]
  const rawImages = data['images'] ?? (data['data'] as Record<string, unknown>)?.['images'];

  if (!Array.isArray(rawImages)) return [];

  const seen = new Set<string>();
  const output: ExtractedImage[] = [];

  for (const item of rawImages) {
    if (output.length >= maxImages) break;

    if (typeof item === 'string' && item.startsWith('http') && !seen.has(item)) {
      seen.add(item);
      output.push({
        url: item,
        mimeType: inferMimeType(item),
      });
      continue;
    }

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const url = typeof obj['url'] === 'string' ? obj['url'] : undefined;
      if (url && url.startsWith('http') && !seen.has(url)) {
        seen.add(url);
        output.push({
          url,
          mimeType: inferMimeType(url),
          ...(typeof obj['alt'] === 'string' && obj['alt'] ? { alt: obj['alt'] } : {}),
        });
      }
    }
  }

  return output;
}

function inferMimeType(url: string): string {
  const lower = url.toLowerCase().split('?')[0] ?? '';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg'; // most common default
}
