/**
 * @fileoverview Firecrawl MCP Bridge Service — MCP Client for Firecrawl Web Scraping
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Extends `BaseMcpClientService` to communicate with the Firecrawl MCP server
 * spawned locally via `npx -y firecrawl-mcp` over Stdio transport.
 *
 * This bridge provides typed proxy methods for each Firecrawl MCP tool:
 * - `scrape(url, options?)` — Extract content from a single URL as markdown or JSON.
 * - `search(query, options?)` — Web search with optional content extraction.
 * - `map(url, options?)` — Discover all URLs on a website.
 * - `extract(urls, prompt, options?)` — LLM-powered structured extraction.
 * - `crawl(url, options?)` — Multi-page crawl with depth/limit control.
 * - `checkCrawlStatus(id)` — Poll a running crawl job for results.
 *
 * Read-through caching is applied to scrape, search, and map to conserve
 * Firecrawl API credits. Crawl/extract are NOT cached (mutable, expensive).
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 *
 * Security:
 * - The API key is passed as an environment variable to the spawned process only.
 * - All outputs are validated with strict Zod schemas before returning to the LLM.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { BaseMcpClientService, type McpToolCallResult } from './base-mcp-client.service.js';
import {
  CACHE_TTL,
  generateCacheKey,
  getCacheService,
  incrementCacheHit,
  incrementCacheMiss,
  incrementCacheSet,
} from '../../../../services/cache.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Timeout for single-page scrape (60s — pages can be JS-heavy). */
const SCRAPE_TIMEOUT_MS = 60_000;

/** Timeout for web search (30s — lightweight). */
const SEARCH_TIMEOUT_MS = 30_000;

/** Timeout for site mapping (60s — can discover many URLs). */
const MAP_TIMEOUT_MS = 60_000;

/** Timeout for LLM extraction (90s — involves server-side LLM processing). */
const EXTRACT_TIMEOUT_MS = 90_000;

/** Timeout for crawl initiation (30s — just starts the job). */
const CRAWL_TIMEOUT_MS = 30_000;

/** Timeout for crawl status check (30s — polling endpoint). */
const CRAWL_STATUS_TIMEOUT_MS = 30_000;

/** Maximum URLs allowed in a single batch scrape/extract call (prevent token overflow). */
const MAX_BATCH_URLS = 25;

/** Maximum crawl limit to prevent runaway credit burn. */
const MAX_CRAWL_LIMIT = 50;

/** Maximum crawl depth to prevent exponential page explosion. */
const MAX_CRAWL_DEPTH = 3;

/** Maximum search results to prevent token overflow. */
const MAX_SEARCH_RESULTS = 10;

const FIRECRAWL_CACHE_PREFIX = {
  SCRAPE: 'agent:mcp:firecrawl:scrape',
  SEARCH: 'agent:mcp:firecrawl:search',
  MAP: 'agent:mcp:firecrawl:map',
} as const;

/** Retry configuration injected into the Firecrawl child process env. */
const FIRECRAWL_CHILD_ENV = {
  FIRECRAWL_RETRY_MAX_ATTEMPTS: '5',
  FIRECRAWL_RETRY_INITIAL_DELAY: '1000',
  FIRECRAWL_RETRY_MAX_DELAY: '10000',
  FIRECRAWL_RETRY_BACKOFF_FACTOR: '2',
} as const;

// ─── Zod Schemas ────────────────────────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

/** Schema for firecrawl_scrape output — content array or structured object. */
const ScrapeResponseSchema = z.union([
  z.string().min(1),
  z
    .object({
      markdown: z.string().optional(),
      html: z.string().optional(),
      content: z.string().optional(),
      json: JsonValueSchema.optional(),
      metadata: z.record(z.string(), JsonValueSchema).optional(),
      branding: z.record(z.string(), JsonValueSchema).optional(),
    })
    .passthrough()
    .refine(
      (payload) =>
        payload.markdown !== undefined ||
        payload.html !== undefined ||
        payload.content !== undefined ||
        payload.json !== undefined ||
        payload.branding !== undefined,
      { message: 'Scrape response must include markdown, html, content, json, or branding' }
    ),
]);

/** Schema for firecrawl_search output — array of search results. */
const SearchResponseSchema = z.union([
  z.array(
    z
      .object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().optional(),
        snippet: z.string().optional(),
        description: z.string().optional(),
        score: z.number().optional(),
        publishedDate: z.string().optional(),
        published_date: z.string().optional(),
      })
      .passthrough()
  ),
  z
    .object({
      results: z.array(z.record(z.string(), JsonValueSchema)).optional(),
      data: z.array(z.record(z.string(), JsonValueSchema)).optional(),
      answer: z.string().optional(),
      query: z.string().optional(),
    })
    .passthrough()
    .refine((payload) => payload.results !== undefined || payload.data !== undefined, {
      message: 'Search response must include results or data array',
    }),
]);

/** Schema for firecrawl_map output — array of discovered URLs. */
const MapResponseSchema = z.union([
  z.array(z.string().url()),
  z
    .object({
      urls: z.array(z.string()).optional(),
      links: z.array(z.string()).optional(),
    })
    .passthrough()
    .refine((payload) => payload.urls !== undefined || payload.links !== undefined, {
      message: 'Map response must include urls or links array',
    }),
]);

/** Schema for firecrawl_extract output — structured extraction result. */
const ExtractResponseSchema = JsonValueSchema;

/** Schema for firecrawl_crawl initiation — returns a job ID. */
const CrawlInitResponseSchema = z.union([
  z.string().min(1),
  z
    .object({
      id: z.string().optional(),
      jobId: z.string().optional(),
      status: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .refine(
      (payload) =>
        payload.id !== undefined || payload.jobId !== undefined || payload.message !== undefined,
      { message: 'Crawl init response must include id, jobId, or message' }
    ),
]);

/** Schema for firecrawl_check_crawl_status — status + optional results. */
const CrawlStatusResponseSchema = JsonValueSchema;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FirecrawlScrapeOptions {
  readonly formats?: ReadonlyArray<string>;
  readonly onlyMainContent?: boolean;
  readonly waitFor?: number;
  readonly mobile?: boolean;
  readonly includeTags?: ReadonlyArray<string>;
  readonly excludeTags?: ReadonlyArray<string>;
}

export interface FirecrawlSearchOptions {
  readonly limit?: number;
  readonly lang?: string;
  readonly country?: string;
  readonly location?: string;
  readonly tbs?: string;
  readonly scrapeOptions?: FirecrawlScrapeOptions;
}

export interface FirecrawlMapOptions {
  readonly search?: string;
  readonly limit?: number;
  readonly includeSubdomains?: boolean;
  readonly sitemap?: 'include' | 'skip' | 'only';
  readonly ignoreQueryParameters?: boolean;
}

export interface FirecrawlExtractOptions {
  readonly systemPrompt?: string;
  readonly schema?: Record<string, unknown>;
  readonly allowExternalLinks?: boolean;
  readonly enableWebSearch?: boolean;
  readonly includeSubdomains?: boolean;
}

export interface FirecrawlCrawlOptions {
  readonly maxDepth?: number;
  readonly limit?: number;
  readonly allowExternalLinks?: boolean;
  readonly deduplicateSimilarURLs?: boolean;
}

// ─── Payload Extraction ─────────────────────────────────────────────────────

/** Normalize MCP tool output into a structured payload, stripping MCP envelope. */
function extractPayload(result: McpToolCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  const textBlocks = result.content
    .flatMap((content) => {
      if (content.type === 'text' && content.text) return [content.text];
      if (typeof content.data === 'string' && content.data.trim().length > 0) return [content.data];
      return [] as string[];
    })
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (textBlocks.length === 0) {
    throw new Error('Firecrawl MCP returned no content');
  }

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

export class FirecrawlMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'firecrawl';

  private readonly apiKey: string;

  constructor() {
    super();
    const key = process.env['FIRECRAWL_API_KEY'];
    if (!key) {
      throw new Error(
        'FIRECRAWL_API_KEY environment variable is required for the Firecrawl MCP bridge'
      );
    }
    this.apiKey = key;
  }

  // ── Transport ───────────────────────────────────────────────────────────

  protected getTransport(): Transport {
    return new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'firecrawl-mcp'],
      env: {
        ...(process.env as Record<string, string>),
        FIRECRAWL_API_KEY: this.apiKey,
        ...FIRECRAWL_CHILD_ENV,
      },
    });
  }

  // ── Proxy Methods ─────────────────────────────────────────────────────────

  /**
   * Scrape content from a single URL in markdown or JSON format.
   *
   * Cached: yes (LONG_TTL — page content rarely changes within the hour).
   *
   * @param url - The URL to scrape.
   * @param options - Format, filtering, and rendering options.
   * @returns Parsed scrape result (markdown, JSON, or branding).
   */
  async scrape(url: string, options?: FirecrawlScrapeOptions): Promise<unknown> {
    const args: Record<string, unknown> = { url };
    if (options?.formats) args['formats'] = options.formats;
    if (options?.onlyMainContent !== undefined) args['onlyMainContent'] = options.onlyMainContent;
    if (options?.waitFor !== undefined) args['waitFor'] = options.waitFor;
    if (options?.mobile !== undefined) args['mobile'] = options.mobile;
    if (options?.includeTags) args['includeTags'] = options.includeTags;
    if (options?.excludeTags) args['excludeTags'] = options.excludeTags;

    return this.withCache(
      FIRECRAWL_CACHE_PREFIX.SCRAPE,
      { url, ...options },
      CACHE_TTL.RANKINGS,
      'firecrawl_scrape',
      ScrapeResponseSchema,
      async () => {
        const result = await this.executeTool('firecrawl_scrape', args, {
          timeoutMs: SCRAPE_TIMEOUT_MS,
        });

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[FirecrawlMCP] firecrawl_scrape returned error', { url, error: payload });
          throw new Error(`Firecrawl scrape failed for "${url}": ${JSON.stringify(payload)}`);
        }

        return extractPayload(result);
      }
    );
  }

  /**
   * Search the web for relevant information and optionally extract content.
   *
   * Cached: yes (SEARCH TTL — results change moderately).
   *
   * @param query - The search query.
   * @param options - Limit, locale, and optional scrape settings.
   * @returns Parsed search results array.
   */
  async search(query: string, options?: FirecrawlSearchOptions): Promise<unknown> {
    const limit = Math.min(options?.limit ?? 5, MAX_SEARCH_RESULTS);
    const args: Record<string, unknown> = { query, limit };
    if (options?.lang) args['lang'] = options.lang;
    if (options?.country) args['country'] = options.country;
    if (options?.location) args['location'] = options.location;
    if (options?.tbs) args['tbs'] = options.tbs;
    if (options?.scrapeOptions) args['scrapeOptions'] = options.scrapeOptions;

    return this.withCache(
      FIRECRAWL_CACHE_PREFIX.SEARCH,
      { query, limit, lang: options?.lang, country: options?.country, tbs: options?.tbs },
      CACHE_TTL.SEARCH,
      'firecrawl_search',
      SearchResponseSchema,
      async () => {
        const result = await this.executeTool('firecrawl_search', args, {
          timeoutMs: SEARCH_TIMEOUT_MS,
        });

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[FirecrawlMCP] firecrawl_search returned error', { query, error: payload });
          throw new Error(`Firecrawl search failed for "${query}": ${JSON.stringify(payload)}`);
        }

        return extractPayload(result);
      }
    );
  }

  /**
   * Map a website to discover all indexed URLs.
   *
   * Cached: yes (RANKINGS TTL — site structure doesn't change often).
   *
   * @param url - The base URL of the website to map.
   * @param options - Search filter, subdomain inclusion, limit.
   * @returns Array of discovered URLs.
   */
  async map(url: string, options?: FirecrawlMapOptions): Promise<unknown> {
    const args: Record<string, unknown> = { url };
    if (options?.search) args['search'] = options.search;
    if (options?.limit !== undefined) args['limit'] = options.limit;
    if (options?.includeSubdomains !== undefined)
      args['includeSubdomains'] = options.includeSubdomains;
    if (options?.sitemap) args['sitemap'] = options.sitemap;
    if (options?.ignoreQueryParameters !== undefined)
      args['ignoreQueryParameters'] = options.ignoreQueryParameters;

    return this.withCache(
      FIRECRAWL_CACHE_PREFIX.MAP,
      { url, ...options },
      CACHE_TTL.RANKINGS,
      'firecrawl_map',
      MapResponseSchema,
      async () => {
        const result = await this.executeTool('firecrawl_map', args, {
          timeoutMs: MAP_TIMEOUT_MS,
        });

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[FirecrawlMCP] firecrawl_map returned error', { url, error: payload });
          throw new Error(`Firecrawl map failed for "${url}": ${JSON.stringify(payload)}`);
        }

        return extractPayload(result);
      }
    );
  }

  /**
   * Extract structured information from web pages using LLM capabilities.
   *
   * NOT cached: extraction is prompt-dependent and compute-heavy.
   *
   * @param urls - URLs to extract data from (max 25).
   * @param prompt - Natural language description of what to extract.
   * @param options - Schema, system prompt, and scope controls.
   * @returns Extracted structured data.
   */
  async extract(
    urls: string[],
    prompt: string,
    options?: FirecrawlExtractOptions
  ): Promise<unknown> {
    if (urls.length > MAX_BATCH_URLS) {
      throw new Error(
        `Firecrawl extract limited to ${MAX_BATCH_URLS} URLs per call. Received: ${urls.length}`
      );
    }

    const args: Record<string, unknown> = { urls, prompt };
    if (options?.systemPrompt) args['systemPrompt'] = options.systemPrompt;
    if (options?.schema) args['schema'] = options.schema;
    if (options?.allowExternalLinks !== undefined)
      args['allowExternalLinks'] = options.allowExternalLinks;
    if (options?.enableWebSearch !== undefined) args['enableWebSearch'] = options.enableWebSearch;
    if (options?.includeSubdomains !== undefined)
      args['includeSubdomains'] = options.includeSubdomains;

    const result = await this.executeTool('firecrawl_extract', args, {
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[FirecrawlMCP] firecrawl_extract returned error', {
        urls,
        prompt,
        error: payload,
      });
      throw new Error(`Firecrawl extract failed: ${JSON.stringify(payload)}`);
    }

    return this.validatePayload(ExtractResponseSchema, extractPayload(result), 'firecrawl_extract');
  }

  /**
   * Start an asynchronous crawl job on a website.
   *
   * NOT cached: crawl is a mutable, long-running operation.
   * Budget limits are enforced: max depth 3, max pages 50.
   *
   * @param url - The base URL to crawl.
   * @param options - Depth, limit, and deduplication settings.
   * @returns Job ID for status polling.
   */
  async crawl(url: string, options?: FirecrawlCrawlOptions): Promise<unknown> {
    const maxDepth = Math.min(options?.maxDepth ?? 2, MAX_CRAWL_DEPTH);
    const limit = Math.min(options?.limit ?? 20, MAX_CRAWL_LIMIT);

    const args: Record<string, unknown> = {
      url,
      maxDepth,
      limit,
    };
    if (options?.allowExternalLinks !== undefined)
      args['allowExternalLinks'] = options.allowExternalLinks;
    if (options?.deduplicateSimilarURLs !== undefined)
      args['deduplicateSimilarURLs'] = options.deduplicateSimilarURLs;

    const result = await this.executeTool('firecrawl_crawl', args, {
      timeoutMs: CRAWL_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[FirecrawlMCP] firecrawl_crawl returned error', { url, error: payload });
      throw new Error(`Firecrawl crawl failed for "${url}": ${JSON.stringify(payload)}`);
    }

    return this.validatePayload(CrawlInitResponseSchema, extractPayload(result), 'firecrawl_crawl');
  }

  /**
   * Check the status of a running crawl job.
   *
   * @param id - The crawl job ID from a previous `crawl()` call.
   * @returns Status, progress, and partial/complete results.
   */
  async checkCrawlStatus(id: string): Promise<unknown> {
    const result = await this.executeTool(
      'firecrawl_check_crawl_status',
      { id },
      { timeoutMs: CRAWL_STATUS_TIMEOUT_MS }
    );

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[FirecrawlMCP] firecrawl_check_crawl_status returned error', {
        id,
        error: payload,
      });
      throw new Error(
        `Firecrawl crawl status check failed for job "${id}": ${JSON.stringify(payload)}`
      );
    }

    return this.validatePayload(
      CrawlStatusResponseSchema,
      extractPayload(result),
      'firecrawl_check_crawl_status'
    );
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private validatePayload<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.error('[FirecrawlMCP] Payload validation failed', {
      operation,
      issues: parsed.error.issues,
    });
    throw new Error(`Firecrawl MCP returned invalid payload for ${operation}`);
  }

  private async withCache<T>(
    prefix: string,
    params: Record<string, unknown>,
    ttl: number,
    operation: string,
    schema: z.ZodType<T>,
    load: () => Promise<unknown>
  ): Promise<T> {
    const cacheKey = generateCacheKey(prefix, params);
    let cache: ReturnType<typeof getCacheService> | null = null;

    try {
      cache = getCacheService();
      const cached = await cache.get<unknown>(cacheKey);
      if (cached !== null && cached !== undefined) {
        incrementCacheHit();
        logger.info('[FirecrawlMCP] Cache HIT', { operation, cacheKey });
        return this.validatePayload(schema, cached, `${operation} (cached)`);
      }

      incrementCacheMiss();
      logger.info('[FirecrawlMCP] Cache MISS', { operation, cacheKey });
    } catch (err) {
      logger.warn('[FirecrawlMCP] Cache unavailable, continuing without cache', {
        operation,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const fresh = this.validatePayload(schema, await load(), operation);

    if (cache) {
      try {
        await cache.set(cacheKey, fresh, { ttl });
        incrementCacheSet();
      } catch (err) {
        logger.warn('[FirecrawlMCP] Cache write failed', {
          operation,
          cacheKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return fresh;
  }
}
