/**
 * @fileoverview Read Webpage Tool (Firecrawl-Powered)
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that reads any webpage using Firecrawl Cloud.
 * Unlike the older scrape_webpage tool (which uses direct HTML fetch + fallback),
 * this tool leverages Firecrawl's headless browser with residential proxy rotation
 * to reliably scrape JS-rendered content from sites protected by Cloudflare,
 * DataDome, and other bot detection systems.
 *
 * Best for: MaxPreps, Hudl, 247Sports, Rivals, NCSA, PrepStar, college sites,
 * or any URL where direct fetch returns empty or blocked content.
 *
 * Returns clean markdown only (no structured data extraction).
 * For structured profile data, use scrape_and_index_profile instead.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { FirecrawlService } from './firecrawl.service.js';
import { validateUrl } from './url-validator.js';

export class ReadWebpageTool extends BaseTool {
  readonly name = 'read_webpage';
  readonly description =
    'Reads a webpage and returns clean markdown content using Firecrawl Cloud. ' +
    'Uses headless browser with residential proxy rotation to bypass Cloudflare, ' +
    'DataDome, and other bot protections. Works on ALL websites including ' +
    'MaxPreps, Hudl, 247Sports, Rivals, NCSA, PrepStar, college program pages, ' +
    'news articles, social media profiles, and any JS-rendered content. ' +
    'Returns markdown text suitable for analysis, summarization, or data extraction. ' +
    'Use this for reading any URL. For structured athlete profile extraction, ' +
    'prefer scrape_and_index_profile instead.';

  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'The full URL to read (e.g. "https://www.maxpreps.com/athlete/jalen-smith/abc123").',
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

  private readonly firecrawl: FirecrawlService;

  constructor(firecrawl?: FirecrawlService) {
    super();
    this.firecrawl = firecrawl ?? new FirecrawlService();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = this.str(input, 'url');
    if (!url) return this.paramError('url');

    // Validate URL for SSRF
    try {
      validateUrl(url);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid URL',
      };
    }

    try {
      const result = await this.firecrawl.scrapeText(url);

      if (!result.markdown || result.markdown.trim().length < 50) {
        return {
          success: false,
          error: `Page at ${url} returned very little content. It may be behind a login or paywall.`,
        };
      }

      return {
        success: true,
        data: {
          url: result.url,
          title: result.title,
          scrapedInMs: result.scrapedInMs,
          contentLength: result.markdown.length,
          markdownContent: result.markdown,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read webpage';
      return { success: false, error: message };
    }
  }
}
