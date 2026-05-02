/**
 * @fileoverview Scraper Service
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping
 *
 * Two-tier scraping engine that extracts both structured data AND
 * prose markdown from any public URL — zero per-site logic.
 *
 * Pipeline:
 *
 *   **Primary — Firecrawl MCP bridge** (always tried first)
 *     Requests BOTH markdown AND HTML in a single call via the shared MCP bridge.
 *     Firecrawl uses a headless browser, so the HTML is JS-rendered — richer than
 *     a raw fetch. Handles SPAs, Cloudflare-protected pages, and lazy-loaded content.
 *     Markdown → LLM context. HTML → structured data extraction (NextData, LD+JSON,
 *     OpenGraph, images, videos, colors, embeddedData).
 *
 *   **Fallback — Direct HTML fetch** (only when Firecrawl is unavailable)
 *     Fetches raw HTML and extracts structured data + converts to markdown via
 *     node-html-markdown. Runs only when the MCP bridge is not configured or fails.
 *
 * Extended capabilities:
 *
 *   **scrapeWithSchema** — Uses Firecrawl's LLM-powered extract to return
 *     guaranteed typed JSON matching a caller-defined schema. Zero prompt
 *     engineering needed on our side.
 *
 *   **scrapeMany** — Parallel fan-out with configurable concurrency,
 *     per-URL progress callbacks, and partial-success semantics
 *     (returns both successes and failures).
 *
 *   **warmCache** — Proactively scrape a list of URLs so subsequent
 *     requests hit Firecrawl's MCP bridge cache (LONG_TTL). Ideal for
 *     scheduled functions that pre-warm top-viewed athlete profiles.
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
 * const scraper = new ScraperService(firecrawlBridge);
 * const result = await scraper.scrape({
 *   url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123/stats',
 * });
 * // result.pageData.nextData  → full Next.js page props (stats, school, colors)
 * // result.pageData.images    → profile photos, team logos
 * // result.pageData.videos    → Hudl highlights embedded on page
 * // result.pageData.colors    → team hex colors
 * // result.markdownContent    → clean prose for LLM analysis
 *
 * // Schema-based extraction (LLM-powered, guaranteed typed output)
 * const roster = await scraper.scrapeWithSchema(
 *   'https://gocards.com/sports/football/roster',
 *   'Extract the full football roster with player name, number, position, year, and hometown',
 *   {
 *     type: 'object',
 *     properties: {
 *       players: {
 *         type: 'array',
 *         items: {
 *           type: 'object',
 *           properties: {
 *             name: { type: 'string' },
 *             number: { type: 'number' },
 *             position: { type: 'string' },
 *             year: { type: 'string' },
 *             hometown: { type: 'string' },
 *           },
 *         },
 *       },
 *     },
 *   },
 * );
 *
 * // Parallel fan-out with progress tracking
 * const results = await scraper.scrapeMany(
 *   [
 *     { url: 'https://hudl.com/profile/123' },
 *     { url: 'https://maxpreps.com/athlete/456' },
 *     { url: 'https://247sports.com/player/789' },
 *   ],
 *   { concurrency: 3, onItemSettled: (done, total) => console.log(`${done}/${total}`) },
 * );
 * ```
 */

import { NodeHtmlMarkdown } from 'node-html-markdown';
import type {
  ScrapeRequest,
  ScrapeResult,
  ScrapeProvider,
  ScrapeManyResult,
  CacheWarmResult,
} from './scraper.types.js';
import { MAX_SCRAPE_CONTENT_LENGTH, SCRAPE_TIMEOUT_MS } from './scraper.types.js';
import { extractPageData, mergeLinks } from './page-data-extractor.js';
import type { FirecrawlMcpBridgeService } from '../mcp/firecrawl-mcp-bridge.service.js';
import { validateUrl } from './url-validator.js';
import { logger } from '../../../../../../utils/logger.js';
import { parallelBatch } from '../../../../utils/parallel-batch.js';
import type { BatchResult } from '../../../../utils/parallel-batch.js';
import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class ScraperService {
  private readonly nhm = new NodeHtmlMarkdown();
  private readonly mcpBridge: FirecrawlMcpBridgeService | null;

  /**
   * @param injectedMcpBridge Optional Firecrawl MCP bridge (2026 architecture).
   *   When provided, all scraping goes through Firecrawl first (requesting both
   *   markdown + HTML in a single call). Falls back to direct fetch only when
   *   the bridge is unavailable or fails.
   */
  constructor(injectedMcpBridge?: FirecrawlMcpBridgeService | null) {
    this.mcpBridge = injectedMcpBridge ?? null;
  }

  /**
   * Scrape a URL and return structured data + clean markdown.
   *
   * Primary: Firecrawl MCP bridge (markdown + HTML in one call).
   * Fallback: Direct fetch + HTML→Markdown conversion.
   *
   * @throws {Error} If URL is invalid, blocked, or all strategies fail.
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const { url, maxLength = MAX_SCRAPE_CONTENT_LENGTH, signal } = request;

    // ── Validate & sanitize URL ────────────────────────────────────────
    const sanitizedUrl = this.validateUrl(url);
    const start = Date.now();

    // ── Primary: Firecrawl handles everything (markdown + HTML in one call) ──
    const firecrawlResult = await this.tryFirecrawl(sanitizedUrl, maxLength, signal);
    if (firecrawlResult) {
      // Extract structured data from Firecrawl's JS-rendered HTML
      // (richer than raw fetch — handles SPAs, Cloudflare, lazy-loaded content)
      const pageData = firecrawlResult.html
        ? extractPageData(firecrawlResult.html, sanitizedUrl)
        : null;

      // For JS-heavy SPAs (bio.site, linktree, etc.) parse Firecrawl's rendered
      // markdown to get the full link list and merge it in (deduplicated).
      const enrichedPageData = pageData
        ? mergeLinks(pageData, this.parseMarkdownLinks(firecrawlResult.markdownContent))
        : pageData;

      return {
        url: sanitizedUrl,
        title: enrichedPageData?.title ?? firecrawlResult.title,
        markdownContent: firecrawlResult.markdownContent,
        contentLength: firecrawlResult.markdownContent.length,
        provider: 'firecrawl' as ScrapeProvider,
        scrapedInMs: Date.now() - start,
        pageData: enrichedPageData,
      };
    }

    // ── Fallback: Direct fetch (only when Firecrawl is unavailable or fails) ──
    const htmlResult = await this.fetchHtml(sanitizedUrl, signal);
    if (htmlResult) {
      const pageData = extractPageData(htmlResult.html, sanitizedUrl);
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

    throw new AgentEngineError(
      'FIRECRAWL_REQUEST_FAILED',
      `Failed to scrape URL: ${sanitizedUrl}. Both Firecrawl and native fetch failed.`,
      {
        metadata: { url: sanitizedUrl },
      }
    );
  }

  // ─── Schema-Based Extraction (Firecrawl LLM Extract) ─────────────────────

  /**
   * Extract structured data from a URL using Firecrawl's LLM-powered extract.
   *
   * Unlike `scrape()` which returns freeform markdown, this method returns
   * **guaranteed typed JSON** matching a caller-defined schema. Firecrawl runs
   * a server-side LLM at its edge to parse the page and enforce the schema,
   * so our backend gets clean, validated data with zero prompt engineering.
   *
   * Use cases:
   * - Roster tables → `{ players: [{ name, number, position, year }] }`
   * - Coaching directories → `{ coaches: [{ name, title, email, sport }] }`
   * - Event schedules → `{ events: [{ date, opponent, location, time }] }`
   * - Recruit profiles → `{ name, position, height, weight, gpa, offers }`
   *
   * @param url - The target URL to extract from.
   * @param prompt - Natural language description of what to extract.
   * @param schema - Optional JSON Schema for the output (enforced by Firecrawl's LLM).
   * @returns The extracted data as a JSON-compatible value.
   * @throws {Error} If Firecrawl is unavailable or extraction fails.
   */
  async scrapeWithSchema(
    url: string,
    prompt: string,
    schema?: Record<string, unknown>
  ): Promise<unknown> {
    const sanitizedUrl = this.validateUrl(url);

    if (!this.mcpBridge) {
      throw new AgentEngineError(
        'FIRECRAWL_CONFIG_MISSING_API_KEY',
        'scrapeWithSchema requires Firecrawl MCP bridge (FIRECRAWL_API_KEY must be configured)'
      );
    }

    logger.info('[ScraperService] Schema extraction', {
      url: sanitizedUrl,
      prompt: prompt.slice(0, 100),
    });

    const result = await this.mcpBridge.extract([sanitizedUrl], prompt, {
      ...(schema ? { schema } : {}),
    });

    logger.info('[ScraperService] Schema extraction complete', { url: sanitizedUrl });
    return result;
  }

  // ─── Parallel Fan-Out (Multi-URL Scraping) ─────────────────────────────────

  /**
   * Scrape multiple URLs in parallel with concurrency control.
   *
   * Designed for Agent X workflows that need to analyze an entire offensive
   * line, compare multiple recruit profiles, or scrape a coaching directory.
   * Returns partial results — individual URL failures don't kill the batch.
   *
   * @param requests - Array of scrape requests (each has a `url` and optional `maxLength`).
   * @param options - Concurrency limit and optional progress callback.
   * @returns Array of settled results (success with ScrapeResult or failure with error message).
   */
  async scrapeMany(
    requests: readonly ScrapeRequest[],
    options?: {
      /** Max concurrent scrapes (default: 5). Higher values burn through Firecrawl credits faster. */
      readonly concurrency?: number;
      /** Called after each URL completes. `completed` and `total` are counts. */
      readonly onItemSettled?: (completed: number, total: number, url: string) => void;
    }
  ): Promise<ScrapeManyResult[]> {
    const batchResults: BatchResult<ScrapeResult>[] = await parallelBatch<
      ScrapeRequest,
      ScrapeResult
    >(requests, (req) => this.scrape(req), {
      concurrency: options?.concurrency ?? 5,
      onItemSettled: options?.onItemSettled
        ? (completed, total, idx) => options.onItemSettled!(completed, total, requests[idx].url)
        : undefined,
    });

    return batchResults.map((r, i) =>
      r.status === 'fulfilled'
        ? { status: 'success', url: requests[i].url, data: r.value }
        : { status: 'error', url: requests[i].url, error: r.reason.message }
    );
  }

  // ─── Cache Warming ──────────────────────────────────────────────────────────

  /**
   * Proactively scrape a batch of URLs to warm Firecrawl's MCP bridge cache.
   *
   * The MCP bridge caches scrape results with a LONG_TTL (1 hour). By calling
   * this method from a Firebase Scheduled Function (e.g., at 3 AM), subsequent
   * user-facing requests for the same URLs will hit cache and return in ~10ms
   * instead of 4–8 seconds.
   *
   * Returns a summary of how many URLs were warmed vs. failed.
   *
   * @param urls - URLs to pre-scrape (max 100 per batch).
   * @param options - Concurrency and optional progress callback.
   */
  async warmCache(
    urls: readonly string[],
    options?: {
      readonly concurrency?: number;
      readonly onItemSettled?: (completed: number, total: number, url: string) => void;
    }
  ): Promise<CacheWarmResult> {
    if (!this.mcpBridge) {
      logger.warn('[ScraperService] warmCache skipped — Firecrawl MCP bridge not available');
      return { total: urls.length, warmed: 0, failed: urls.length, errors: ['No MCP bridge'] };
    }

    const maxBatch = 100;
    const batch = urls.slice(0, maxBatch);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 10));
    const total = batch.length;
    let warmed = 0;
    let failed = 0;
    const errors: string[] = [];

    logger.info('[ScraperService] Cache warming started', { total, concurrency });

    const results = await parallelBatch(
      batch,
      async (url: string) => {
        const sanitized = this.validateUrl(url);
        // Fire the scrape call — the MCP bridge will cache the result automatically
        await this.mcpBridge!.scrape(sanitized, { formats: ['markdown', 'html'] });
        return url;
      },
      {
        concurrency,
        onItemSettled: (completed, _total, idx) => {
          options?.onItemSettled?.(completed, total, batch[idx] ?? '');
        },
      }
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        warmed++;
      } else {
        failed++;
        errors.push(`${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`);
      }
    }

    logger.info('[ScraperService] Cache warming complete', { total, warmed, failed });
    return { total, warmed, failed, errors: errors.slice(0, 20) };
  }

  // ─── Fallback: Direct HTML Fetch ──────────────────────────────────────────

  /**
   * Fetch raw HTML with a browser-like User-Agent.
   * Used as fallback when Firecrawl MCP bridge is unavailable or fails.
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

  // ─── Primary: Firecrawl MCP Bridge ─────────────────────────────────────────

  /**
   * Scrape via Firecrawl MCP bridge with both markdown AND HTML in a single call.
   *
   * Firecrawl's JS-rendered HTML is richer than a raw fetch — it handles SPAs,
   * Cloudflare-protected pages, and lazy-loaded content. By requesting both formats,
   * we get clean prose markdown for LLM analysis AND full HTML for structured data
   * extraction in one network round-trip.
   *
   * Returns null on failure so the caller can fall back to direct fetch.
   */
  private async tryFirecrawl(
    url: string,
    maxLength: number,
    signal?: AbortSignal
  ): Promise<{ title: string; markdownContent: string; html: string | null } | null> {
    // Bail early if already cancelled
    if (signal?.aborted) return null;

    if (!this.mcpBridge) return null;

    try {
      // Request BOTH markdown AND HTML in a single call
      const result = await this.mcpBridge.scrape(url, { formats: ['markdown', 'html'] });
      const markdown = this.extractMarkdownFromMcpResult(result);
      if (!markdown || markdown.trim().length < 50) return null;

      const html = this.extractHtmlFromMcpResult(result);
      const title = this.extractTitleFromMarkdown(markdown);
      const markdownContent = this.truncate(markdown, maxLength);
      return { title, markdownContent, html };
    } catch (err) {
      logger.warn('[ScraperService] Firecrawl MCP bridge failed, falling back to direct fetch', {
        url,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract markdown content from an MCP bridge scrape result.
   * The bridge returns a Zod-validated payload — extract the best text field.
   */
  private extractMarkdownFromMcpResult(result: unknown): string | null {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (typeof obj['markdown'] === 'string') return obj['markdown'];
      if (typeof obj['content'] === 'string') return obj['content'];
    }
    return null;
  }

  /**
   * Extract raw HTML from an MCP bridge scrape result.
   * Available when `formats: ['markdown', 'html']` is requested.
   */
  private extractHtmlFromMcpResult(result: unknown): string | null {
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (typeof obj['html'] === 'string' && obj['html'].trim().length > 0) return obj['html'];
    }
    return null;
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
