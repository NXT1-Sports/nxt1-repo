/**
 * @fileoverview Search Apify Actors Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Allows Agent X to discover Apify actors by keyword search.
 * Delegates to the ApifyMcpBridgeService which communicates with the
 * hosted Apify MCP server via StreamableHTTP.
 *
 * Use cases:
 * - Finding scrapers for a specific platform (TikTok, LinkedIn, YouTube)
 * - Discovering data extraction actors for custom workflows
 * - Looking up automation actors for batch operations
 *
 * This is a read-only, zero-cost operation (no Apify compute spent).
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { ApifyMcpBridgeService } from './apify-mcp-bridge.service.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum characters for a search query. */
const MAX_QUERY_LENGTH = 200;

/** Maximum search results returned. */
const MAX_RESULTS = 20;

/** Default number of results. */
const DEFAULT_RESULTS = 10;

export class SearchApifyActorsTool extends BaseTool {
  readonly name = 'search_apify_actors';
  readonly description =
    'Search the Apify Store for actors (scrapers, crawlers, automation tools) by keyword. ' +
    'Use this to discover what data extraction capabilities are available before running an actor. ' +
    'Returns actor names, descriptions, and IDs that can be passed to get_apify_actor_details. ' +
    'This is a free operation — no compute costs. ' +
    'Example queries: "instagram scraper", "youtube video downloader", "google maps reviews".';

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search keywords describing the actor you need. ' +
          'Be specific: "twitter profile scraper" is better than "social media".',
      },
      limit: {
        type: 'number',
        description: `Number of results to return (1–${MAX_RESULTS}). Defaults to ${DEFAULT_RESULTS}.`,
      },
    },
    required: ['query'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'recruiting_coordinator',
    'brand_media_coordinator',
    'general',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly bridge: ApifyMcpBridgeService;

  constructor(bridge: ApifyMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const query = this.str(input, 'query');
    if (!query) return this.paramError('query');

    if (query.length > MAX_QUERY_LENGTH) {
      return {
        success: false,
        error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer.`,
      };
    }

    const limit = Math.min(Math.max(this.num(input, 'limit') ?? DEFAULT_RESULTS, 1), MAX_RESULTS);

    try {
      logger.info('[SearchApifyActors] Searching actors', { query, limit });
      const results = await this.bridge.searchActors(query, limit);

      return {
        success: true,
        data: results,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Actor search failed';
      logger.error('[SearchApifyActors] Failed', { query, error: message });
      return { success: false, error: message };
    }
  }
}
