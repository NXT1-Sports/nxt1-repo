/**
 * @fileoverview Web Scraper Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that extracts structured data AND clean markdown from any
 * public URL. Designed for sports profile pages (MaxPreps, Hudl, 247Sports,
 * etc.) but works universally on any publicly accessible webpage.
 *
 * Architecture:
 * - The tool class is a thin shell that delegates to ScraperService.
 * - ScraperService runs a 3-tier pipeline:
 *     Tier 1: Direct fetch → structured data extraction (NextData, LD+JSON, OG, images, videos, colors)
 *     Tier 2: Firecrawl Cloud → clean prose markdown (parallel with Tier 1, residential proxies)
 *     Tier 3: HTML→Markdown fallback (if Firecrawl fails, uses Tier 1 HTML)
 * - The tool formats the combined result for the LLM's observation loop:
 *     structured JSON (stats, social links, school info) + prose markdown.
 *
 * Security:
 * - All URLs are validated for SSRF attacks before any network call.
 * - Content is truncated to prevent LLM context overflow.
 * - Only HTTP(S) protocols are allowed.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ScraperService } from './scraper.service.js';
import {
  ScraperMediaService,
  type MediaStagingContext,
} from '../integrations/scraper-media.service.js';
import type { PageStructuredData, PageImage } from './page-data.types.js';

export class ScrapeWebpageTool extends BaseTool {
  readonly name = 'scrape_webpage';
  readonly description =
    'Scrapes a URL and returns BOTH structured data AND markdown content. ' +
    'Works on ALL websites including STRICT PLATFORMS like Twitter/X, Instagram, ' +
    'TikTok, YouTube, MaxPreps, Hudl, 247Sports, Rivals, NCSA, PrepStar, ' +
    'college program pages, and news articles. ' +
    'The underlying engine bypasses bot protections, so DO NOT assume a site cannot be scraped — ' +
    'ALWAYS try using this tool first. ' +
    'Automatically extracts embedded data: athlete stats, school/team info, ' +
    'team colors, social links, profile images, and highlight videos. ' +
    'Returns structured JSON (from NextData, LD+JSON, OpenGraph) plus ' +
    'clean prose markdown for analysis.';

  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'The full URL to scrape (e.g. "https://www.maxpreps.com/athlete/jalen-smith/abc123").',
      },
      maxLength: {
        type: 'number',
        description:
          'Optional maximum character count for the returned markdown. Defaults to 30,000.',
      },
    },
    required: ['url'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'general',
    'brand_media_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly scraper: ScraperService;
  private readonly media: ScraperMediaService;

  constructor(scraper?: ScraperService, media?: ScraperMediaService) {
    super();
    this.scraper = scraper ?? new ScraperService();
    this.media = media ?? new ScraperMediaService();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const url = input['url'];

    // ── Input validation ───────────────────────────────────────────────
    if (typeof url !== 'string' || url.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "url" is required and must be a non-empty string.',
      };
    }

    const maxLength =
      typeof input['maxLength'] === 'number' && input['maxLength'] > 0
        ? input['maxLength']
        : undefined;

    // ── Scrape ─────────────────────────────────────────────────────────
    try {
      const result = await this.scraper.scrape({ url: url.trim(), maxLength });

      // ── Stage extracted media to thread storage ──────────────────────
      // Replace ephemeral external URLs (CDN-signed, CORS-blocked) with
      // persistent, thread-scoped Firebase Storage URLs.  When no thread
      // context is available the original external URLs pass through unchanged.
      let stagedImages = result.pageData?.images ?? [];
      let stagedOgImage = result.pageData?.openGraph?.image ?? null;

      if (context?.userId && context?.threadId && result.pageData) {
        const staging: MediaStagingContext = {
          userId: context.userId,
          threadId: context.threadId,
        };

        // Collect unique image URLs to stage (OG image + page images, capped at 10)
        const imageSet = new Map<string, string>(); // originalUrl → src
        if (result.pageData.openGraph?.image) {
          imageSet.set(result.pageData.openGraph.image, result.pageData.openGraph.image);
        }
        for (const img of result.pageData.images) {
          if (!imageSet.has(img.src)) imageSet.set(img.src, img.src);
        }

        const urlsToStage = [...imageSet.values()].slice(0, 10);
        if (urlsToStage.length > 0) {
          const mediaInputs = urlsToStage.map((imgUrl) => ({
            url: imgUrl,
            type: 'image' as const,
            platform: 'web' as const,
            sourceUrl: url.trim(),
          }));

          const persisted = await this.media.persistBatch(mediaInputs, staging);

          // Build a lookup from original URL → staged URL
          const urlMap = new Map<string, string>();
          for (const item of persisted) {
            urlMap.set(item.originalUrl, item.url);
          }

          // Replace OG image if staged
          if (stagedOgImage && urlMap.has(stagedOgImage)) {
            stagedOgImage = urlMap.get(stagedOgImage)!;
          }

          // Replace page images with staged versions
          stagedImages = result.pageData.images.map((img) => ({
            ...img,
            src: urlMap.get(img.src) ?? img.src,
          }));
        }
      }

      // Build structured data with optionally staged image URLs
      const structuredData = this.formatStructuredData(
        result.pageData,
        stagedImages,
        stagedOgImage
      );

      return {
        success: true,
        data: {
          url: result.url,
          title: result.title,
          provider: result.provider,
          scrapedInMs: result.scrapedInMs,
          contentLength: result.contentLength,

          // Favicon URL extracted from <link rel="icon"> (for connected source branding)
          faviconUrl: result.pageData?.faviconUrl ?? null,

          // Structured data summary (richest source — stats, school, colors, social)
          structuredData,

          // Prose markdown (for LLM analysis / summarization)
          markdownContent: result.markdownContent,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scraping failed';
      return { success: false, error: message };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Format structured page data into a concise summary for the LLM.
   * Returns null if no structured data was extracted.
   *
   * @param pageData - Raw structured data from the scrape
   * @param stagedImages - Optionally staged image list (with thread-scoped URLs)
   * @param stagedOgImage - Optionally staged OpenGraph image URL
   */
  private formatStructuredData(
    pageData: PageStructuredData | null,
    stagedImages?: readonly PageImage[],
    stagedOgImage?: string | null
  ): Record<string, unknown> | null {
    if (!pageData || !pageData.hasRichData) return null;

    const summary: Record<string, unknown> = {};

    if (pageData.title) summary['title'] = pageData.title;
    if (pageData.description) summary['description'] = pageData.description;

    // OpenGraph metadata (profile image, type, site name)
    if (pageData.openGraph) {
      const og = pageData.openGraph;
      const ogData: Record<string, string> = {};
      if (og.title) ogData['title'] = og.title;
      // Use staged OG image if available, fall back to original
      const ogImage = stagedOgImage ?? og.image;
      if (ogImage) ogData['image'] = ogImage;
      if (og.type) ogData['type'] = og.type;
      if (og.siteName) ogData['siteName'] = og.siteName;
      if (Object.keys(ogData).length > 0) summary['openGraph'] = ogData;
    }

    // Images (profile photos, team logos) — use staged versions when available
    const images = stagedImages ?? pageData.images;
    if (images.length > 0) {
      summary['images'] = images.slice(0, 10).map((img) => ({
        src: img.src,
        ...(img.alt ? { alt: img.alt } : {}),
        source: img.source,
      }));
    }

    // Videos (Hudl highlights, YouTube, Vimeo)
    if (pageData.videos.length > 0) {
      summary['videos'] = pageData.videos.map((v) => ({
        src: v.src,
        provider: v.provider,
        ...(v.videoId ? { videoId: v.videoId } : {}),
      }));
    }

    // Team/school colors
    if (pageData.colors.length > 0) {
      summary['colors'] = pageData.colors;
    }

    // LD+JSON (schema.org — Person, SportsTeam, Organization, Article)
    if (pageData.ldJson.length > 0) {
      summary['schemaOrg'] = pageData.ldJson.slice(0, 3);
    }

    // Next.js / Nuxt.js raw page data (contains the richest structured info)
    // This is where MaxPreps stores stats, social links, school details, etc.
    if (pageData.nextData) {
      summary['nextData'] = pageData.nextData;
    }
    if (pageData.nuxtData) {
      summary['nuxtData'] = pageData.nuxtData;
    }

    // Generic embedded data blobs (Hudl __hudlEmbed, Redux __INITIAL_STATE__, etc.)
    const embeddedKeys = Object.keys(pageData.embeddedData);
    if (embeddedKeys.length > 0) {
      summary['embeddedData'] = pageData.embeddedData;
    }

    return Object.keys(summary).length > 0 ? summary : null;
  }
}
