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
 *   **Tier 2 — Jina AI Reader** (runs in parallel with Tier 1)
 *     Returns clean prose markdown from the rendered page.
 *     Handles JS-rendered content, bot protection bypass.
 *
 *   **Tier 3 — HTML→Markdown fallback** (only if Jina fails)
 *     Converts the Tier 1 HTML to markdown via node-html-markdown.
 *     Strips nav/footer/scripts before conversion.
 *
 * Tiers 1 + 2 run in parallel. If Jina works, we use its markdown.
 * If Jina fails, we fall back to Tier 3 using HTML already fetched in Tier 1.
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
import { MAX_SCRAPE_CONTENT_LENGTH, SCRAPE_TIMEOUT_MS, BLOCKED_DOMAINS } from './scraper.types.js';
import { extractPageData, mergeLinks } from './page-data-extractor.js';
import type { PageStructuredData } from './page-data.types.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class ScraperService {
  private readonly nhm = new NodeHtmlMarkdown();

  /**
   * Scrape a URL and return structured data + clean markdown.
   *
   * Runs direct fetch (for structured data) and Jina (for prose) in parallel.
   * Falls back to HTML→Markdown conversion if Jina is unavailable.
   *
   * @throws {Error} If URL is invalid, blocked, or all strategies fail.
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const { url, maxLength = MAX_SCRAPE_CONTENT_LENGTH } = request;

    // ── Validate & sanitize URL ────────────────────────────────────────
    const sanitizedUrl = this.validateUrl(url);
    const start = Date.now();

    // ── Parallel: Tier 1 (direct fetch for structured data) + Tier 2 (Jina for prose) ──
    const [htmlResult, jinaResult] = await Promise.all([
      this.fetchHtml(sanitizedUrl),
      this.tryJina(sanitizedUrl, maxLength),
    ]);

    // ── Extract structured data from HTML (Tier 1) ─────────────────────
    let pageData: PageStructuredData | null = null;
    if (htmlResult) {
      pageData = extractPageData(htmlResult.html, sanitizedUrl);
    }

    // ── Determine best markdown source ─────────────────────────────────
    // Prefer Jina markdown (rendered, clean). Fall back to HTML conversion.
    if (jinaResult) {
      const title = pageData?.title ?? jinaResult.title;
      // For JS-heavy SPAs (bio.site, linktree, etc.) Tier 1 HTML is nearly empty
      // so pageData.links will be empty. Parse Jina's rendered markdown to get
      // the full link list and merge it in (deduplicated).
      const enrichedPageData = pageData
        ? mergeLinks(pageData, this.parseMarkdownLinks(jinaResult.markdownContent))
        : pageData;
      return {
        url: sanitizedUrl,
        title,
        markdownContent: jinaResult.markdownContent,
        contentLength: jinaResult.markdownContent.length,
        provider: 'jina' as ScrapeProvider,
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

    throw new Error(`Failed to scrape URL: ${sanitizedUrl}. Both Jina and native fetch failed.`);
  }

  // ─── Tier 1: Direct HTML Fetch ────────────────────────────────────────────

  /**
   * Fetch raw HTML with a browser-like User-Agent.
   * Returns the full HTML string for structured data extraction.
   */
  private async fetchHtml(url: string): Promise<{ html: string } | null> {
    try {
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
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
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

  // ─── Tier 2: Jina AI Reader ───────────────────────────────────────────────

  /**
   * Uses Jina AI's free reader API to get clean markdown from any URL.
   * Jina handles JS rendering, bot protection bypass, and content extraction.
   */
  private async tryJina(
    url: string,
    maxLength: number
  ): Promise<{ title: string; markdownContent: string } | null> {
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

      return { title, markdownContent };
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
        throw new Error(
          hostname.includes('instagram') ||
            hostname.includes('twitter') ||
            hostname.includes('tiktok') ||
            hostname.includes('facebook') ||
            hostname.includes('threads') ||
            hostname.includes('snapchat')
            ? `Cannot scrape "${hostname}" — social media platforms require authentication. Use only the user context already provided.`
            : `Blocked host: "${hostname}". Internal/private addresses are not allowed.`
        );
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
    const clean = hostname.replace(/^\[|\]$/g, '');

    if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
    if (/^fe[89ab]/i.test(clean)) return true;
    if (/^f[cd]/i.test(clean)) return true;
    const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(clean);
    if (v4Mapped) return this.isPrivateIpv4(v4Mapped[1]);

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

  /**
   * Parse all hyperlinks from Jina's rendered markdown output.
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
