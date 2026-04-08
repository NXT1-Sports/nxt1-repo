/**
 * @fileoverview Firecrawl Service — Enterprise Web Extraction Engine
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Wraps the Firecrawl Cloud API to provide Agent X with three capabilities:
 *
 * 1. **scrapeText(url)** — Fast markdown extraction from any URL.
 *    Bypasses Cloudflare, DataDome, and PerimeterX via residential proxies.
 *    Returns clean markdown for LLM analysis.
 *
 * 2. **scrapeWithActions(url, actions)** — Browser Sandbox.
 *    Executes a sequence of browser actions (click, type, wait, scroll)
 *    before extracting the page. Agent X uses this to navigate search bars,
 *    click tabs, or log into authenticated portals.
 *
 * 3. **search(query)** — Web search powered by Firecrawl.
 *    Returns markdown content for each search result.
 *
 * **IMPORTANT**: This service does NOT validate URLs for SSRF.
 * Callers MUST validate URLs via `validateUrl()` from `url-validator.ts`
 * before passing them to any method.
 *
 * All methods include timeout enforcement.
 *
 * @example
 * ```ts
 * const firecrawl = new FirecrawlService();
 *
 * // Simple page read
 * const { markdown } = await firecrawl.scrapeText('https://maxpreps.com/athlete/...');
 *
 * // Browser sandbox (click a tab, then read)
 * const { markdown } = await firecrawl.scrapeWithActions('https://hudl.com/video/...', [
 *   { type: 'click', selector: '#stats-tab' },
 *   { type: 'wait', milliseconds: 2000 },
 * ]);
 * ```
 */

import Firecrawl from '@mendable/firecrawl-js';
import type { ActionOption, Document } from '@mendable/firecrawl-js';
import { logger } from '../../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FirecrawlScrapeResult {
  /** The original URL that was scraped. */
  readonly url: string;
  /** Clean markdown content extracted from the rendered page. */
  readonly markdown: string;
  /** Page title, if found. */
  readonly title: string;
  /** Time taken in milliseconds. */
  readonly scrapedInMs: number;
  /** Action results from sandbox interactions, if any. */
  readonly actions?: Record<string, unknown>;
}

export interface FirecrawlSearchResult {
  /** The search query used. */
  readonly query: string;
  /** Results with URL, title, and markdown content. */
  readonly results: Array<{
    readonly url: string;
    readonly title: string;
    readonly markdown: string;
  }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Firecrawl API timeout (30s — headless browser rendering can be slow). */
const FIRECRAWL_TIMEOUT_MS = 30_000;

/** Maximum markdown length returned to prevent LLM context overflow. */
const MAX_MARKDOWN_LENGTH = 50_000;

// ─── Service ────────────────────────────────────────────────────────────────

export class FirecrawlService {
  private readonly client: Firecrawl;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['FIRECRAWL_API_KEY'];
    if (!key) {
      throw new Error(
        'FIRECRAWL_API_KEY is required. Set it in environment variables or pass it to the constructor.'
      );
    }
    this.client = new Firecrawl({ apiKey: key });
  }

  // ─── 1. Simple Scrape (Markdown) ──────────────────────────────────────

  /**
   * Scrape a URL and return clean markdown.
   * Firecrawl handles JS rendering, Cloudflare bypass, and content extraction.
   *
   * Uses the v2 API which throws `SdkError` on failure (no success/error wrapper).
   *
   * @param url - The target URL to scrape.
   * @returns Markdown content, title, and metadata.
   * @throws {Error} If the scrape fails or the URL is invalid.
   */
  async scrapeText(url: string, signal?: AbortSignal): Promise<FirecrawlScrapeResult> {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const start = Date.now();

    logger.info('[FirecrawlService] Scraping URL', { url });

    const doc: Document = await this.client.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: FIRECRAWL_TIMEOUT_MS,
    });

    // Check again after the (possibly long) network call
    if (signal?.aborted) throw new Error('Operation cancelled');

    const markdown = this.truncate(doc.markdown ?? '', MAX_MARKDOWN_LENGTH);
    const title = doc.metadata?.title ?? this.extractTitleFromMarkdown(markdown) ?? '';

    logger.info('[FirecrawlService] Scrape succeeded', {
      url,
      chars: markdown.length,
      ms: Date.now() - start,
    });

    return {
      url,
      markdown,
      title,
      scrapedInMs: Date.now() - start,
    };
  }

  // ─── 2. Browser Sandbox (Actions + Scrape) ───────────────────────────

  /**
   * Execute a sequence of browser actions on a page, then extract content.
   *
   * Actions are executed in order. Valid action types:
   * - `click` — Click an element by CSS selector.
   * - `write` — Type text into the currently focused element.
   * - `press` — Press a keyboard key (e.g., "Tab", "Enter").
   * - `wait` — Wait for a number of milliseconds or until an element appears.
   * - `scroll` — Scroll up or down.
   * - `screenshot` — Take a screenshot at this step.
   * - `scrape` — Return intermediate scrape data at this action step.
   *
   * Uses the v2 API which throws `SdkError` on failure.
   *
   * @param url - The starting URL to navigate to.
   * @param actions - Ordered browser actions to perform before extraction.
   * @returns Markdown content of the page after all actions complete.
   */
  async scrapeWithActions(
    url: string,
    actions: ActionOption[],
    signal?: AbortSignal
  ): Promise<FirecrawlScrapeResult> {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const start = Date.now();

    logger.info('[FirecrawlService] Sandbox scrape starting', {
      url,
      actionCount: actions.length,
      actionTypes: actions.map((a) => a.type),
    });

    const doc: Document = await this.client.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: FIRECRAWL_TIMEOUT_MS,
      actions,
    });

    const markdown = this.truncate(doc.markdown ?? '', MAX_MARKDOWN_LENGTH);
    const title = doc.metadata?.title ?? this.extractTitleFromMarkdown(markdown) ?? '';

    logger.info('[FirecrawlService] Sandbox scrape succeeded', {
      url,
      chars: markdown.length,
      ms: Date.now() - start,
    });

    return {
      url,
      markdown,
      title,
      scrapedInMs: Date.now() - start,
      ...(doc.actions ? { actions: doc.actions } : {}),
    };
  }

  // ─── 3. Web Search ────────────────────────────────────────────────────

  /**
   * Search the web and return results with markdown content where available.
   *
   * v2 `.search()` returns `SearchData` with `.web`, `.news`, `.images` arrays.
   * Each web result may include scraped content if Firecrawl could access the page.
   *
   * @param query - The search query string.
   * @param limit - Maximum number of results (default: 5).
   * @returns Search results with markdown content.
   */
  async search(query: string, limit = 5, signal?: AbortSignal): Promise<FirecrawlSearchResult> {
    if (signal?.aborted) throw new Error('Operation cancelled');
    logger.info('[FirecrawlService] Web search', { query, limit });

    const response = await this.client.search(query, { limit });

    // v2 SearchData has .web[] which may contain Document objects
    const webResults = response.web ?? [];
    const results = webResults.map((item) => {
      // Each item can be SearchResultWeb (url, title, description)
      // or a full Document (url, title, markdown, etc.) depending on scrapeOptions
      const doc = item as Record<string, unknown>;
      return {
        url: (doc['url'] as string) ?? '',
        title: (doc['title'] as string) ?? '',
        markdown: this.truncate(
          (doc['markdown'] as string) ?? (doc['description'] as string) ?? '',
          MAX_MARKDOWN_LENGTH
        ),
      };
    });

    logger.info('[FirecrawlService] Search succeeded', {
      query,
      resultCount: results.length,
    });

    return { query, results };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /** Truncate content to prevent LLM context overflow. */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '\n\n[Content truncated]';
  }

  /** Extract the first H1 from markdown as a title. */
  private extractTitleFromMarkdown(markdown: string): string | null {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() ?? null;
  }
}
