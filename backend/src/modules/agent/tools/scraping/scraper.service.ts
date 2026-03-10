/**
 * @fileoverview Scraper Service
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Extracts clean markdown content from any public URL using a
 * two-tier strategy:
 *
 *   1. **Jina AI Reader** (primary) — Handles JS-rendered pages,
 *      bot protection, and returns clean markdown. Free tier, no
 *      API key required.
 *
 *   2. **Native `fetch` + node-html-markdown** (fallback) — Direct
 *      HTML fetch and conversion when Jina is unavailable.
 *
 * Security:
 *   - SSRF protection: blocks private IPs, cloud metadata endpoints,
 *     and non-HTTP(S) protocols.
 *   - Input validation: rejects malformed URLs before any network call.
 *   - Content truncation: caps output at MAX_SCRAPE_CONTENT_LENGTH to
 *     prevent LLM context overflow.
 *   - Timeout enforcement: all requests have a hard SCRAPE_TIMEOUT_MS
 *     deadline.
 *
 * @example
 * ```ts
 * const scraper = new ScraperService();
 * const result = await scraper.scrape({
 *   url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123/stats',
 * });
 * console.log(result.markdownContent); // Clean markdown of the page
 * ```
 */

import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { ScrapeRequest, ScrapeResult, ScrapeProvider } from './scraper.types.js';
import { MAX_SCRAPE_CONTENT_LENGTH, SCRAPE_TIMEOUT_MS, BLOCKED_DOMAINS } from './scraper.types.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class ScraperService {
  private readonly nhm = new NodeHtmlMarkdown();

  /**
   * Scrape a URL and return clean markdown content.
   *
   * Tries Jina AI Reader first, falls back to native fetch + HTML conversion.
   * All URLs are validated for SSRF safety before any network request is made.
   *
   * @throws {Error} If URL is invalid, blocked, or both providers fail.
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const { url, maxLength = MAX_SCRAPE_CONTENT_LENGTH } = request;

    // ── Validate & sanitize URL ────────────────────────────────────────
    const sanitizedUrl = this.validateUrl(url);
    const start = Date.now();

    // ── Strategy 1: Jina AI Reader ─────────────────────────────────────
    const jinaResult = await this.tryJina(sanitizedUrl, maxLength);
    if (jinaResult) {
      return { ...jinaResult, scrapedInMs: Date.now() - start };
    }

    // ── Strategy 2: Native fetch fallback ──────────────────────────────
    const fallbackResult = await this.tryFetchFallback(sanitizedUrl, maxLength);
    if (fallbackResult) {
      return { ...fallbackResult, scrapedInMs: Date.now() - start };
    }

    throw new Error(`Failed to scrape URL: ${sanitizedUrl}. Both Jina and native fetch failed.`);
  }

  // ─── Strategy 1: Jina AI Reader ─────────────────────────────────────────

  /**
   * Uses Jina AI's free reader API to get clean markdown from any URL.
   * Jina handles JS rendering, bot protection bypass, and content extraction.
   */
  private async tryJina(
    url: string,
    maxLength: number
  ): Promise<Omit<ScrapeResult, 'scrapedInMs'> | null> {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(jinaUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/markdown',
          'X-Return-Format': 'markdown',
          'X-No-Cache': 'true',
        },
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });

      if (!response.ok) return null;

      const rawMarkdown = await response.text();
      if (!rawMarkdown || rawMarkdown.trim().length < 50) return null;

      const title = this.extractTitleFromMarkdown(rawMarkdown);
      const markdownContent = this.truncate(rawMarkdown, maxLength);

      return {
        url,
        title,
        markdownContent,
        contentLength: markdownContent.length,
        provider: 'jina' as ScrapeProvider,
      };
    } catch {
      // Jina failed — fall through to next strategy
      return null;
    }
  }

  // ─── Strategy 2: Native Fetch + HTML→Markdown ───────────────────────────

  /**
   * Direct HTML fetch with conversion via node-html-markdown.
   * Works for simple server-rendered pages. Does not execute JavaScript.
   */
  private async tryFetchFallback(
    url: string,
    maxLength: number
  ): Promise<Omit<ScrapeResult, 'scrapedInMs'> | null> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NXT1Bot/1.0; +https://nxt1sports.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });

      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return null;
      }

      const html = await response.text();
      if (!html || html.trim().length < 100) return null;

      // Strip non-content elements before conversion
      const cleanedHtml = this.stripNonContentHtml(html);
      const rawMarkdown = this.nhm.translate(cleanedHtml);
      const title = this.extractTitleFromHtml(html);
      const markdownContent = this.truncate(rawMarkdown, maxLength);

      return {
        url,
        title,
        markdownContent,
        contentLength: markdownContent.length,
        provider: 'fetch-fallback' as ScrapeProvider,
      };
    } catch {
      return null;
    }
  }

  // ─── Validation & Security ──────────────────────────────────────────────

  /**
   * Validates and sanitizes a URL for SSRF safety.
   *
   * @throws {Error} If URL is invalid, uses a blocked protocol, or targets
   *                 a blocked host (private IPs, cloud metadata endpoints).
   */
  validateUrl(raw: string): string {
    const trimmed = raw.trim();

    // Must be a valid URL
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(`Invalid URL: "${trimmed}"`);
    }

    // Protocol must be HTTP or HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Blocked protocol: "${parsed.protocol}". Only HTTP(S) is allowed.`);
    }

    // Block private/internal hosts (SSRF prevention)
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of BLOCKED_DOMAINS) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        throw new Error(`Blocked host: "${hostname}". Internal/private addresses are not allowed.`);
      }
    }

    // Block private IP ranges (IPv4: 10.x, 172.16-31.x, 192.168.x; IPv6: link-local, unique-local)
    if (this.isPrivateIp(hostname)) {
      throw new Error(`Blocked host: "${hostname}". Private IP addresses are not allowed.`);
    }

    return parsed.href;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Check if a hostname is a private/reserved IPv4 or IPv6 address. */
  private isPrivateIp(hostname: string): boolean {
    // Strip brackets for IPv6 addresses like [::1]
    const clean = hostname.replace(/^\[|\]$/g, '');

    // ── IPv6 checks ─────────────────────────────────────────────────
    // Loopback: ::1 or expanded forms
    if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
    // Link-local (fe80::/10)
    if (/^fe[89ab]/i.test(clean)) return true;
    // Unique local (fc00::/7 — includes fd00::/8)
    if (/^f[cd]/i.test(clean)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract and check the IPv4 part
    const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(clean);
    if (v4Mapped) return this.isPrivateIpv4(v4Mapped[1]);

    // ── IPv4 checks ─────────────────────────────────────────────────
    return this.isPrivateIpv4(clean);
  }

  /** Check if a dotted-decimal string is a private/reserved IPv4 address. */
  private isPrivateIpv4(hostname: string): boolean {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!ipv4) return false;

    const [, a, b] = ipv4.map(Number);
    return (
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      a === 127 || // loopback
      a === 0 // 0.0.0.0/8
    );
  }

  /** Extract a title from the first H1 in markdown content. */
  private extractTitleFromMarkdown(markdown: string): string {
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    if (h1Match?.[1]) return h1Match[1].trim();

    // Fallback: first non-empty line
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

    // Try to break at a paragraph boundary (\n\n)
    const truncated = content.slice(0, maxLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    if (lastParagraph > maxLength * 0.7) {
      return truncated.slice(0, lastParagraph).trim() + '\n\n[Content truncated]';
    }

    return truncated.trim() + '\n\n[Content truncated]';
  }
}
