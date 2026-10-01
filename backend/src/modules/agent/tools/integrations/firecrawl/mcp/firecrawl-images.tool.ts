/**
 * @fileoverview Firecrawl Images Tool — Extract all images from a web page
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Uses Firecrawl's supported HTML scrape output to extract a typed,
 * deduplicated array of image URLs from any public web page.
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

import {
  BaseTool,
  type ToolResult,
  type ToolExecutionContext,
  validationFailure,
} from '../../../base.tool.js';
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
      return validationFailure(parsed.error.issues.map((issue) => issue.message).join(', '));
    }

    const { url, maxImages } = parsed.data;

    if (url.length > MAX_URL_LENGTH) {
      return validationFailure(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`);
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return validationFailure('URL must start with http:// or https://');
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
      const result = await this.bridge.scrape(url, { formats: ['html'] });

      const images = extractImages(result, maxImages, url);

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

export function extractImages(
  result: unknown,
  maxImages: number,
  baseUrl?: string
): readonly ExtractedImage[] {
  if (result == null || typeof result !== 'object') return [];

  const data = result as Record<string, unknown>;

  const rawImages = data['images'] ?? (data['data'] as Record<string, unknown>)?.['images'];
  const html = extractHtmlPayload(data);

  const seen = new Set<string>();
  const output: ExtractedImage[] = [];

  const pushImage = (rawUrl: string, alt?: string): void => {
    if (output.length >= maxImages) return;
    const url = normalizeImageUrl(rawUrl, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    output.push({
      url,
      mimeType: inferMimeType(url),
      ...(alt && alt.trim() ? { alt: alt.trim() } : {}),
    });
  };

  if (Array.isArray(rawImages)) {
    for (const item of rawImages) {
      if (output.length >= maxImages) break;

      if (typeof item === 'string') {
        pushImage(item);
        continue;
      }

      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const url = typeof obj['url'] === 'string' ? obj['url'] : undefined;
        if (url) {
          pushImage(url, typeof obj['alt'] === 'string' ? obj['alt'] : undefined);
        }
      }
    }
  }

  if (html) {
    for (const image of extractImagesFromHtml(html)) {
      pushImage(image.url, image.alt);
      if (output.length >= maxImages) break;
    }
  }

  return output;
}

function extractHtmlPayload(data: Record<string, unknown>): string | null {
  const nested = data['data'];
  const candidates = [
    data['html'],
    data['rawHtml'],
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>)['html'] : undefined,
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>)['rawHtml']
      : undefined,
  ];

  const html = candidates.find((candidate): candidate is string => typeof candidate === 'string');
  return html ?? null;
}

function extractImagesFromHtml(
  html: string
): readonly { readonly url: string; readonly alt?: string }[] {
  const images: { url: string; alt?: string }[] = [];
  const imgTagPattern = /<img\b[^>]*>/gi;
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const match of html.matchAll(imgTagPattern)) {
    const tag = match[0];
    const attrs = new Map<string, string>();
    for (const attrMatch of tag.matchAll(attrPattern)) {
      const name = attrMatch[1]?.toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
      if (name) attrs.set(name, value.trim());
    }

    const alt = attrs.get('alt');
    const src = attrs.get('src') ?? attrs.get('data-src') ?? attrs.get('data-original');
    if (src) images.push({ url: src, ...(alt ? { alt } : {}) });

    const srcset = attrs.get('srcset') ?? attrs.get('data-srcset');
    if (srcset) {
      for (const candidate of srcset.split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) images.push({ url, ...(alt ? { alt } : {}) });
      }
    }
  }

  return images;
}

function normalizeImageUrl(rawUrl: string, baseUrl?: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;

  try {
    return baseUrl ? new URL(trimmed, baseUrl).toString() : new URL(trimmed).toString();
  } catch {
    return null;
  }
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
