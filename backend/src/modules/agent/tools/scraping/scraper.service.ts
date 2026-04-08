/**
 * @fileoverview Scraper Service
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Three-tier scraping engine that extracts both structured data AND
 * prose markdown from any public URL — zero per-site logic.
 *
 * Pipeline:
 *
 *   **Tier 1 — Direct HTML fetch** (always runs first)
 *     Fetches the raw HTML and extracts ALL embedded structured data:
 *     __NEXT_DATA__, __NUXT__, LD+JSON, OpenGraph, images, videos, colors.
 *     This is where the richest data lives (stats, school info, social links)
 *     and it works even when the page blocks bots.
 *
 *   **Tier 2 — Firecrawl Cloud** (runs in parallel with Tier 1)
 *     Headless browser with residential proxy rotation.
 *     Returns clean prose markdown from JS-rendered pages.
 *     Bypasses Cloudflare, DataDome, and PerimeterX bot protections.
 *
 *   **Tier 3 — HTML→Markdown fallback** (only if Firecrawl fails)
 *     Converts the Tier 1 HTML to markdown via node-html-markdown.
 *     Strips nav/footer/scripts before conversion.
 *
 * Tiers 1 + 2 run in parallel. If Firecrawl works, we use its markdown.
 * If Firecrawl fails (or API key not configured), we fall back to Tier 3.
 *
 * Security:
 *   - SSRF protection: blocks private IPs, cloud metadata endpoints,
 *     and non-HTTP(S) protocols.
 *   - Input validation: rejects malformed URLs before any network call.
 *   - Content truncation: caps markdown output at MAX_SCRAPE_CONTENT_LENGTH.
 *   - Timeout enforcement: all requests have a hard SCRAPE_TIMEOUT_MS deadline.
 *
 * @example
 * ```ts
 * const scraper = new ScraperService();
 * const result = await scraper.scrape({
 *   url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123/stats',
 * });
 * // result.pageData.nextData  → full Next.js page props (stats, school, colors)
 * // result.pageData.images    → profile photos, team logos
 * // result.pageData.videos    → Hudl highlights embedded on page
 * // result.pageData.colors    → team hex colors
 * // result.markdownContent    → clean prose for LLM analysis
 * ```
 */

import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { ScrapeRequest, ScrapeResult, ScrapeProvider } from './scraper.types.js';
import { MAX_SCRAPE_CONTENT_LENGTH, SCRAPE_TIMEOUT_MS } from './scraper.types.js';
import { extractPageData, mergeLinks } from './page-data-extractor.js';
import type { PageStructuredData } from './page-data.types.js';
import { FirecrawlService } from './firecrawl.service.js';
import { validateUrl } from './url-validator.js';
import { logger } from '../../../../utils/logger.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class ScraperService {
  private readonly nhm = new NodeHtmlMarkdown();
  private firecrawl: FirecrawlService | null = null;

  /**
   * @param injectedFirecrawl Optional pre-configured FirecrawlService instance.
   *   When provided, skips lazy init. Useful for testing and shared-instance usage.
   */
  constructor(injectedFirecrawl?: FirecrawlService | null) {
    if (injectedFirecrawl !== undefined) {
      this.firecrawl = injectedFirecrawl;
    }
  }

  /** Lazy-init Firecrawl service (only when API key is available). */
  private getFirecrawl(): FirecrawlService | null {
    if (this.firecrawl) return this.firecrawl;
    try {
      this.firecrawl = new FirecrawlService();
      return this.firecrawl;
    } catch {
      // API key not configured — Firecrawl unavailable, fall back to HTML fetch
      return null;
    }
  }

  /**
   * Scrape a URL and return structured data + clean markdown.
   *
   * Runs direct fetch (for structured data) and Firecrawl (for prose) in parallel.
   * Falls back to HTML→Markdown conversion if Firecrawl is unavailable.
   *
   * @throws {Error} If URL is invalid, blocked, or all strategies fail.
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const { url, maxLength = MAX_SCRAPE_CONTENT_LENGTH, signal } = request;

    // ── Validate & sanitize URL ────────────────────────────────────────
    const sanitizedUrl = this.validateUrl(url);
    const start = Date.now();

    // ── Parallel: Tier 1 (direct fetch for structured data) + Tier 2 (Firecrawl for prose) ──
    const [htmlResult, firecrawlResult] = await Promise.all([
      this.fetchHtml(sanitizedUrl, signal),
      this.tryFirecrawl(sanitizedUrl, maxLength, signal),
    ]);

    // ── Extract structured data from HTML (Tier 1) ─────────────────────
    let pageData: PageStructuredData | null = null;
    if (htmlResult) {
      pageData = extractPageData(htmlResult.html, sanitizedUrl);
    }

    // ── Determine best markdown source ─────────────────────────────────
    // Prefer Firecrawl markdown (rendered, clean, bypasses bot protection).
    // Fall back to HTML→Markdown conversion.
    if (firecrawlResult) {
      const title = pageData?.title ?? firecrawlResult.title;
      // For JS-heavy SPAs (bio.site, linktree, etc.) Tier 1 HTML is nearly empty
      // so pageData.links will be empty. Parse Firecrawl's rendered markdown to get
      // the full link list and merge it in (deduplicated).
      const enrichedPageData = pageData
        ? mergeLinks(pageData, this.parseMarkdownLinks(firecrawlResult.markdownContent))
        : pageData;
      return {
        url: sanitizedUrl,
        title,
        markdownContent: firecrawlResult.markdownContent,
        contentLength: firecrawlResult.markdownContent.length,
        provider: 'firecrawl' as ScrapeProvider,
        scrapedInMs: Date.now() - start,
        pageData: enrichedPageData,
      };
    }

    // ── Tier 3: HTML→Markdown fallback ─────────────────────────────────
    if (htmlResult) {
      const cleanedHtml = this.stripNonContentHtml(htmlResult.html);
      const rawMarkdown = this.nhm.translate(cleanedHtml);
      const markdownContent = this.truncate(rawMarkdown, maxLength);
      const title = pageData?.title ?? this.extractTitleFromHtml(htmlResult.html);

      return {
        url: sanitizedUrl,
        title,
        markdownContent,
        contentLength: markdownContent.length,
        provider: 'fetch-fallback' as ScrapeProvider,
        scrapedInMs: Date.now() - start,
        pageData,
      };
    }

    throw new Error(
      `Failed to scrape URL: ${sanitizedUrl}. Both Firecrawl and native fetch failed.`
    );
  }

  // ─── Tier 1: Direct HTML Fetch ────────────────────────────────────────────

  /**
   * Fetch raw HTML with a browser-like User-Agent.
   * Returns the full HTML string for structured data extraction.
   */
  private async fetchHtml(url: string, signal?: AbortSignal): Promise<{ html: string } | null> {
    try {
      // Combine the timeout signal with the cancellation signal (if provided).
      // Either one firing will abort the fetch.
      const timeoutSignal = AbortSignal.timeout(SCRAPE_TIMEOUT_MS);
      const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: combinedSignal,
      });

      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return null;
      }

      const html = await response.text();
      if (!html || html.trim().length < 100) return null;

      return { html };
    } catch {
      return null;
    }
  }

  // ─── Tier 2: Firecrawl (Headless Browser + Residential Proxies) ────────────

  /**
   * Uses Firecrawl Cloud to get clean markdown from any URL.
   * Handles JS rendering, Cloudflare/DataDome bypass via residential proxy rotation.
   * Falls back gracefully to null if Firecrawl API key is not configured.
   */
  private async tryFirecrawl(
    url: string,
    maxLength: number,
    signal?: AbortSignal
  ): Promise<{ title: string; markdownContent: string } | null> {
    const fc = this.getFirecrawl();
    if (!fc) return null;

    // Bail early if already cancelled
    if (signal?.aborted) return null;

    try {
      const result = await fc.scrapeText(url, signal);

      if (!result.markdown || result.markdown.trim().length < 50) return null;

      const title = result.title || this.extractTitleFromMarkdown(result.markdown);
      const markdownContent = this.truncate(result.markdown, maxLength);

      return { title, markdownContent };
    } catch (err) {
      logger.warn('[ScraperService] Firecrawl failed, falling back to HTML→Markdown', {
        url,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    }
  }

  // ─── Validation & Security ──────────────────────────────────────────────

  /**
   * Validates and sanitizes a URL for SSRF safety.
   * Delegates to the standalone `validateUrl` function in `url-validator.ts`.
   *
   * @throws {Error} If URL is invalid, uses a blocked protocol, or targets
   *                 a blocked host (private IPs, cloud metadata endpoints).
   */
  validateUrl(raw: string): string {
    return validateUrl(raw);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Parse all hyperlinks from Firecrawl's rendered markdown output.
   * Handles both labelled links `[text](url)` and bare icon links `[](url)`.
   * Returns only absolute http(s) URLs, deduplicated.
   */
  private parseMarkdownLinks(markdown: string): import('./page-data.types.js').PageLink[] {
    const seen = new Set<string>();
    const links: import('./page-data.types.js').PageLink[] = [];

    // Matches: [optional text](https://...)
    const re = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(markdown)) !== null) {
      const url = m[2].trim();
      if (seen.has(url)) continue;
      seen.add(url);
      const text = m[1].trim() || undefined;
      links.push({ url, text, source: 'markdown' });
    }

    return links;
  }

  /** Extract a title from the first H1 in markdown content. */
  private extractTitleFromMarkdown(markdown: string): string {
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    if (h1Match?.[1]) return h1Match[1].trim();

    const firstLine = markdown.split('\n').find((l) => l.trim().length > 0);
    return firstLine?.trim().slice(0, 120) ?? 'Untitled';
  }

  /** Extract <title> tag from raw HTML. */
  private extractTitleFromHtml(html: string): string {
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return titleMatch?.[1]?.trim().slice(0, 120) ?? 'Untitled';
  }

  /** Remove script, style, nav, footer, and other non-content HTML elements. */
  private stripNonContentHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }

  /** Truncate content to maxLength, breaking at a paragraph boundary. */
  private truncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content.trim();

    const truncated = content.slice(0, maxLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    if (lastParagraph > maxLength * 0.7) {
      return truncated.slice(0, lastParagraph).trim() + '\n\n[Content truncated]';
    }

    return truncated.trim() + '\n\n[Content truncated]';
  }
}
