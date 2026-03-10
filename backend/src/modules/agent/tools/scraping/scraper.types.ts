/**
 * @fileoverview Scraper Types
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Type definitions for the web scraping subsystem.
 * Covers input validation, output shape, and provider configuration.
 */

// ─── Input ──────────────────────────────────────────────────────────────────

/** Validated scrape request after URL sanitization. */
export interface ScrapeRequest {
  /** The target URL (must be HTTPS or HTTP). */
  readonly url: string;
  /** Maximum content length in characters before truncation (default: 20_000). */
  readonly maxLength?: number;
}

// ─── Output ─────────────────────────────────────────────────────────────────

/** Structured result from a successful scrape. */
export interface ScrapeResult {
  /** The original URL that was scraped. */
  readonly url: string;
  /** The page title, if found. */
  readonly title: string;
  /** Clean markdown content extracted from the page. */
  readonly markdownContent: string;
  /** Character count of the markdown content. */
  readonly contentLength: number;
  /** Which scraping strategy was used. */
  readonly provider: ScrapeProvider;
  /** Time taken to scrape in milliseconds. */
  readonly scrapedInMs: number;
}

/** Available scraping providers (ordered by preference). */
export type ScrapeProvider = 'jina' | 'fetch-fallback';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum content length (characters) to prevent LLM context overflow. */
export const MAX_SCRAPE_CONTENT_LENGTH = 20_000;

/** Timeout for all outbound scrape requests (ms). */
export const SCRAPE_TIMEOUT_MS = 15_000;

/** Domains and IPs that are explicitly blocked from scraping (SSRF prevention). */
export const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata endpoint
  '[::1]', // IPv6 loopback (bracketed)
  '::1', // IPv6 loopback
  '0:0:0:0:0:0:0:1', // IPv6 loopback (expanded)
  '[::ffff:169.254.169.254]', // IPv4-mapped IPv6 metadata
  '[::ffff:127.0.0.1]', // IPv4-mapped IPv6 loopback
] as const;

/** Domains we know how to scrape well (for logging/analytics). */
export const KNOWN_SPORTS_DOMAINS = [
  'maxpreps.com',
  'hudl.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'rivals.com',
  '247sports.com',
  'espn.com',
  'ncaa.org',
  'ncsasports.org',
  'perfectgame.org',
  'prepbaseballreport.com',
  'athleticnet.net',
  'milesplit.com',
  'swimcloud.com',
] as const;
