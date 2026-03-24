/**
 * @fileoverview Scraper Types
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Type definitions for the web scraping subsystem.
 * Covers input validation, output shape, and provider configuration.
 */

import type { PageStructuredData } from './page-data.types.js';

// ─── Input ──────────────────────────────────────────────────────────────────

/** Validated scrape request after URL sanitization. */
export interface ScrapeRequest {
  /** The target URL (must be HTTPS or HTTP). */
  readonly url: string;
  /** Maximum markdown content length in characters before truncation (default: 30_000). */
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
  /** Which scraping strategy produced the markdown. */
  readonly provider: ScrapeProvider;
  /** Time taken to scrape in milliseconds. */
  readonly scrapedInMs: number;
  /**
   * Structured data extracted from the page (NextData, LD+JSON, OG, images, videos, colors).
   * Always populated when HTML was fetched directly, null when only Firecrawl markdown is available.
   */
  readonly pageData: PageStructuredData | null;
}

/** Available scraping providers (ordered by preference). */
export type ScrapeProvider = 'firecrawl' | 'fetch-fallback';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum markdown content length (characters) to prevent LLM context overflow. */
export const MAX_SCRAPE_CONTENT_LENGTH = 30_000;

/** Timeout for all outbound scrape requests (ms). */
export const SCRAPE_TIMEOUT_MS = 15_000;

/** Domains and IPs that are explicitly blocked from scraping (SSRF prevention + auth-required platforms). */
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
