/**
 * @fileoverview Apify MCP Bridge Service — MCP Client for mcp.apify.com
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Extends `BaseMcpClientService` to communicate with the hosted Apify MCP
 * server at `https://mcp.apify.com` via StreamableHTTP transport.
 *
 * This bridge provides typed proxy methods for each Apify MCP tool:
 * - `searchActors(query, limit?)` — Discover actors by keyword.
 * - `getActorDetails(actorId)` — Fetch actor description + input schema.
 * - `callActor(actorId, input)` — Run an actor synchronously.
 * - `getActorOutput(datasetId, offset?, limit?)` — Paginate large result sets.
 *
 * The individual BaseTool subclasses (search, details, call, output) delegate
 * to these typed methods, keeping tool classes thin.
 *
 * Configuration:
 * Set the `APIFY_API_TOKEN` environment variable.
 *
 * Security:
 * - The bearer token is server-side only; never sent to the frontend.
 * - All inputs are validated before reaching the MCP server.
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import {
  CACHE_TTL,
  generateCacheKey,
  getCacheService,
  incrementCacheHit,
  incrementCacheMiss,
  incrementCacheSet,
} from '../../../../../services/cache.service.js';
import { logger } from '../../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Apify hosted MCP server endpoint. */
const APIFY_MCP_URL = 'https://mcp.apify.com';

/** Timeout for search/details calls (lightweight, 60s). */
const DISCOVERY_TIMEOUT_MS = 60_000;

/** Timeout for actor execution calls (heavy compute, 5 min). */
const EXECUTION_TIMEOUT_MS = 300_000;

/** Timeout for dataset fetch calls (moderate, 2 min). */
const OUTPUT_TIMEOUT_MS = 120_000;

const APIFY_CACHE_PREFIX = {
  SEARCH: 'agent:mcp:apify:search',
  ACTOR_DETAILS: 'agent:mcp:apify:actor',
  DATASET_PAGE: 'agent:mcp:apify:dataset',
} as const;

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

const JsonRecordSchema = z.record(z.string(), JsonValueSchema);

const ActorSearchResponseSchema = z
  .union([
    z.array(JsonRecordSchema),
    z
      .object({
        actors: z.array(JsonRecordSchema).optional(),
        items: z.array(JsonRecordSchema).optional(),
        results: z.array(JsonRecordSchema).optional(),
        total: z.number().optional(),
        count: z.number().optional(),
        offset: z.number().optional(),
        limit: z.number().optional(),
      })
      .passthrough(),
  ])
  .refine(
    (payload) =>
      Array.isArray(payload) ||
      payload.actors !== undefined ||
      payload.items !== undefined ||
      payload.results !== undefined,
    {
      message: 'Expected actor search payload to include actors, items, or results',
    }
  );

const ActorDetailsResponseSchema = z
  .object({
    id: z.string().optional(),
    actorId: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    inputSchema: JsonRecordSchema.optional(),
    defaultRunOptions: JsonRecordSchema.optional(),
    pricing: JsonValueSchema.optional(),
  })
  .passthrough()
  .refine(
    (payload) =>
      payload.id !== undefined ||
      payload.actorId !== undefined ||
      payload.name !== undefined ||
      payload.title !== undefined ||
      payload.description !== undefined ||
      payload.inputSchema !== undefined,
    {
      message: 'Expected actor details payload to include identifying metadata or input schema',
    }
  );

const ActorExecutionResponseSchema = JsonValueSchema;

const ActorOutputResponseSchema = JsonValueSchema;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Normalize MCP tool output into structured payload. */
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
    throw new Error('Apify MCP returned no structured content');
  }

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1_000;
  }

  const dateMs = Date.parse(header);
  if (isNaN(dateMs)) return null;

  return Math.max(dateMs - Date.now(), 0);
}

// ─── Service ────────────────────────────────────────────────────────────────

export class ApifyMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'apify';

  private readonly apiToken: string;
  private rateLimitDelayMs: number | null = null;

  constructor() {
    super();
    const token = process.env['APIFY_API_TOKEN'];
    if (!token) {
      throw new Error('APIFY_API_TOKEN environment variable is required for the Apify MCP bridge');
    }
    this.apiToken = token;
  }

  // ── Transport ───────────────────────────────────────────────────────────

  protected getTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(APIFY_MCP_URL), {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        this.rateLimitDelayMs =
          response.status === 429
            ? parseRetryAfterHeader(response.headers.get('retry-after'))
            : null;
        return response;
      },
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      },
    });
  }

  protected override consumeRateLimitDelayMs(): number | null {
    const delayMs = this.rateLimitDelayMs;
    this.rateLimitDelayMs = null;
    return delayMs;
  }

  // ── Proxy Methods (typed wrappers around raw MCP tool calls) ────────────

  /**
   * Search the Apify Store for actors matching a keyword query.
   *
   * @param query - Search keywords (e.g. "instagram scraper", "twitter api").
   * @param limit - Max results to return (default 10, max 20).
   * @returns Parsed search results or raw text.
   */
  async searchActors(query: string, limit = 10): Promise<unknown> {
    return this.withCache(
      APIFY_CACHE_PREFIX.SEARCH,
      { query, limit: Math.min(limit, 20) },
      CACHE_TTL.SEARCH,
      'search-actors',
      ActorSearchResponseSchema,
      async () => {
        const result = await this.executeTool(
          'search-actors',
          { keywords: query, limit: Math.min(limit, 20) },
          { timeoutMs: DISCOVERY_TIMEOUT_MS }
        );

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[ApifyMCP] search-actors returned error', { query, error: payload });
          throw new Error(`Apify actor search failed: ${JSON.stringify(payload)}`);
        }

        return extractPayload(result);
      }
    );
  }

  /**
   * Fetch detailed information about a specific Apify actor,
   * including its description, input schema, and pricing.
   *
   * @param actorId - The actor ID (e.g. "apify/instagram-scraper").
   * @returns Parsed actor details or raw text.
   */
  async getActorDetails(actorId: string): Promise<unknown> {
    return this.withCache(
      APIFY_CACHE_PREFIX.ACTOR_DETAILS,
      { actorId },
      CACHE_TTL.PROFILES,
      'fetch-actor-details',
      ActorDetailsResponseSchema,
      async () => {
        const result = await this.executeTool(
          'fetch-actor-details',
          { actor: actorId },
          { timeoutMs: DISCOVERY_TIMEOUT_MS }
        );

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[ApifyMCP] fetch-actor-details returned error', {
            actorId,
            error: payload,
          });
          throw new Error(
            `Failed to fetch actor details for "${actorId}": ${JSON.stringify(payload)}`
          );
        }

        return extractPayload(result);
      }
    );
  }

  /**
   * Run an Apify actor with the given input and wait for results.
   *
   * IMPORTANT: Callers should enforce budget caps (maxItems, memoryMbytes,
   * timeoutSecs) by injecting them into `input` BEFORE calling this method.
   *
   * @param actorId - The actor ID (e.g. "apify/instagram-scraper").
   * @param input - The actor's input parameters (JSON).
   * @param signal - Optional AbortSignal for cancellation.
   * @returns Parsed actor output or raw text.
   */
  async callActor(
    actorId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const memory = typeof input['memoryMbytes'] === 'number' ? input['memoryMbytes'] : 256;
    const timeout = typeof input['timeoutSecs'] === 'number' ? input['timeoutSecs'] : 120;

    // Strip budget fields from input — they belong in callOptions, not actor input.
    // Leaving them in would cause actor schema validation failures (additionalProperties: false).
    const { memoryMbytes: _m, timeoutSecs: _t, ...actorInput } = input;

    const result = await this.executeTool(
      'call-actor',
      {
        actor: actorId,
        input: actorInput,
        callOptions: { memory, timeout },
      },
      { timeoutMs: EXECUTION_TIMEOUT_MS, signal, retryOnTransportError: false }
    );

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[ApifyMCP] call-actor returned error', { actorId, error: payload });
      throw new Error(`Actor "${actorId}" execution failed: ${JSON.stringify(payload)}`);
    }

    return this.validatePayload(ActorExecutionResponseSchema, extractPayload(result), 'call-actor');
  }

  /**
   * Fetch paginated output from a completed actor run's dataset.
   *
   * @param datasetId - The Apify dataset ID from a previous run.
   * @param offset - Starting index for pagination (default 0).
   * @param limit - Number of items to fetch (default 100, max 200).
   * @returns Parsed dataset items or raw text.
   */
  async getActorOutput(datasetId: string, offset = 0, limit = 100): Promise<unknown> {
    return this.withCache(
      APIFY_CACHE_PREFIX.DATASET_PAGE,
      { datasetId, offset, limit: Math.min(limit, 200) },
      CACHE_TTL.SEARCH,
      'get-actor-output',
      ActorOutputResponseSchema,
      async () => {
        const result = await this.executeTool(
          'get-actor-output',
          { datasetId, offset, limit: Math.min(limit, 200) },
          { timeoutMs: OUTPUT_TIMEOUT_MS }
        );

        if (result.isError) {
          const payload = extractPayload(result);
          logger.error('[ApifyMCP] get-actor-output returned error', {
            datasetId,
            error: payload,
          });
          throw new Error(
            `Failed to fetch output for dataset "${datasetId}": ${JSON.stringify(payload)}`
          );
        }

        return extractPayload(result);
      }
    );
  }

  private validatePayload<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.error('[ApifyMCP] Payload validation failed', {
      operation,
      issues: parsed.error.issues,
    });
    throw new Error(`Apify MCP returned invalid payload for ${operation}`);
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
        logger.info('[ApifyMCP] Cache HIT', { operation, cacheKey });
        return this.validatePayload(schema, cached, `${operation} (cached)`);
      }

      incrementCacheMiss();
      logger.info('[ApifyMCP] Cache MISS', { operation, cacheKey });
    } catch (err) {
      logger.warn('[ApifyMCP] Cache unavailable, continuing without cache', {
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
        logger.warn('[ApifyMCP] Cache write failed', {
          operation,
          cacheKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return fresh;
  }
}
