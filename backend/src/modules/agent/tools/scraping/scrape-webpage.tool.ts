/**
 * @fileoverview Web Scraper Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that extracts clean markdown content from any public URL.
 * Designed for sports profile pages (MaxPreps, Hudl, 247Sports, etc.)
 * but works on any publicly accessible webpage.
 *
 * Architecture:
 * - The tool class is a thin shell that delegates to ScraperService.
 * - ScraperService handles the two-tier scraping strategy (Jina → fetch fallback).
 * - The tool validates input, calls the service, and formats the ToolResult
 *   for the LLM's observation loop.
 *
 * Security:
 * - All URLs are validated for SSRF attacks before any network call.
 * - Content is truncated to prevent LLM context overflow.
 * - Only HTTP(S) protocols are allowed.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { ScraperService } from './scraper.service.js';

export class ScrapeWebpageTool extends BaseTool {
  readonly name = 'scrape_webpage';
  readonly description =
    'Fetches and extracts clean markdown content from a given URL. ' +
    'Use this to read athlete profiles (MaxPreps, Hudl, 247Sports), ' +
    'college program pages, roster pages, news articles, or any public webpage. ' +
    'Returns the page title and content as structured markdown that you can ' +
    'analyze, summarize, or extract data from.';

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
          'Optional maximum character count for the returned content. Defaults to 20,000.',
      },
    },
    required: ['url'],
  } as const;

  override readonly allowedAgents = ['scout', 'recruiter', 'general', 'creative_director'] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly scraper: ScraperService;

  constructor(scraper?: ScraperService) {
    super();
    this.scraper = scraper ?? new ScraperService();
  }

  /**
   * Scrape a URL and return clean markdown content for the LLM.
   *
   * Input:
   *   - url: string (required) — The URL to scrape.
   *   - maxLength: number (optional) — Max characters to return.
   *
   * Output (on success):
   *   - url: The scraped URL.
   *   - title: Page title.
   *   - markdownContent: Extracted content as clean markdown.
   *   - contentLength: Character count.
   *   - provider: Which scraping strategy was used.
   *   - scrapedInMs: Duration.
   */
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
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
      return {
        success: true,
        data: {
          url: result.url,
          title: result.title,
          markdownContent: result.markdownContent,
          contentLength: result.contentLength,
          provider: result.provider,
          scrapedInMs: result.scrapedInMs,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scraping failed';
      return { success: false, error: message };
    }
  }
}
