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
import { BaseMcpClientService, type McpToolCallResult } from './base-mcp-client.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Apify hosted MCP server endpoint. */
const APIFY_MCP_URL = 'https://mcp.apify.com';

/** Timeout for search/details calls (lightweight, 60s). */
const DISCOVERY_TIMEOUT_MS = 60_000;

/** Timeout for actor execution calls (heavy compute, 5 min). */
const EXECUTION_TIMEOUT_MS = 300_000;

/** Timeout for dataset fetch calls (moderate, 2 min). */
const OUTPUT_TIMEOUT_MS = 120_000;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Extracted text content from an MCP tool result. */
function extractText(result: McpToolCallResult): string {
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

/** Safely parse JSON from MCP text response, falling back to raw text. */
function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

export class ApifyMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'apify';

  private readonly apiToken: string;

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
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      },
    });
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
    const result = await this.executeTool(
      'search-actors',
      { keywords: query, limit: Math.min(limit, 20) },
      { timeoutMs: DISCOVERY_TIMEOUT_MS }
    );

    if (result.isError) {
      const errorText = extractText(result);
      logger.error('[ApifyMCP] search-actors returned error', { query, error: errorText });
      throw new Error(`Apify actor search failed: ${errorText}`);
    }

    return parseJsonSafe(extractText(result));
  }

  /**
   * Fetch detailed information about a specific Apify actor,
   * including its description, input schema, and pricing.
   *
   * @param actorId - The actor ID (e.g. "apify/instagram-scraper").
   * @returns Parsed actor details or raw text.
   */
  async getActorDetails(actorId: string): Promise<unknown> {
    const result = await this.executeTool(
      'fetch-actor-details',
      { actor: actorId },
      { timeoutMs: DISCOVERY_TIMEOUT_MS }
    );

    if (result.isError) {
      const errorText = extractText(result);
      logger.error('[ApifyMCP] fetch-actor-details returned error', { actorId, error: errorText });
      throw new Error(`Failed to fetch actor details for "${actorId}": ${errorText}`);
    }

    return parseJsonSafe(extractText(result));
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
      { timeoutMs: EXECUTION_TIMEOUT_MS, signal }
    );

    if (result.isError) {
      const errorText = extractText(result);
      logger.error('[ApifyMCP] call-actor returned error', { actorId, error: errorText });
      throw new Error(`Actor "${actorId}" execution failed: ${errorText}`);
    }

    return parseJsonSafe(extractText(result));
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
    const result = await this.executeTool(
      'get-actor-output',
      { datasetId, offset, limit: Math.min(limit, 200) },
      { timeoutMs: OUTPUT_TIMEOUT_MS }
    );

    if (result.isError) {
      const errorText = extractText(result);
      logger.error('[ApifyMCP] get-actor-output returned error', {
        datasetId,
        error: errorText,
      });
      throw new Error(`Failed to fetch output for dataset "${datasetId}": ${errorText}`);
    }

    return parseJsonSafe(extractText(result));
  }
}
