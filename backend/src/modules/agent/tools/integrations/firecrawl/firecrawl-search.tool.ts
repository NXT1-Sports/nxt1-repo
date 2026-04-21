/**
 * @fileoverview Firecrawl Search Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Searches the web using the Firecrawl search API and optionally extracts
 * content from the top results. This differs from the Tavily-backed
 * `search_web` tool in that it uses Firecrawl's infrastructure and can
 * automatically scrape search result pages.
 *
 * Use cases:
 * - Finding recent recruiting news for a specific athlete/program
 * - Researching NCAA rule changes and compliance updates
 * - Looking up coaching staff contact information
 * - Discovering college program stats and rankings
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlSearchOptions,
} from './firecrawl-mcp-bridge.service.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum characters for a search query. */
const MAX_QUERY_LENGTH = 500;

/** Maximum search results. */
const MAX_RESULTS = 10;

/** Default number of results. */
const DEFAULT_RESULTS = 5;

/** Maximum output size to return to the LLM. */
const MAX_OUTPUT_CHARS = 60_000;

function truncateOutput(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return (
    text.slice(0, MAX_OUTPUT_CHARS) +
    '\n\n... [OUTPUT TRUNCATED — use scrape_webpage for full content on specific URLs]'
  );
}

export class FirecrawlSearchTool extends BaseTool {
  readonly name = 'firecrawl_search_web';
  readonly description =
    'Search the web using Firecrawl and optionally extract content from results. ' +
    'Returns titles, URLs, and content excerpts from top results. ' +
    'Use this for scouting news, compliance research, program lookups, and staff directories. ' +
    'Supports geographic filtering and time-based filtering (past day/week/month). ' +
    'For deep content from a specific URL, follow up with scrape_webpage.';

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The search query. Be specific and targeted. ' +
          'Example: "Florida Gators 2026 football recruiting class" or ' +
          '"NCAA Division 1 dead period dates basketball 2026".',
      },
      limit: {
        type: 'number',
        description: `Number of results (1–${MAX_RESULTS}). Defaults to ${DEFAULT_RESULTS}.`,
      },
      country: {
        type: 'string',
        description: 'Country code for localized results (e.g. "us", "gb"). Defaults to "us".',
      },
      timeFilter: {
        type: 'string',
        enum: ['past_day', 'past_week', 'past_month'],
        description:
          'Filter results by recency. "past_day" for breaking news, "past_week" for recent updates.',
      },
      extractContent: {
        type: 'boolean',
        description:
          'When true, scrapes main content from each result page (slower but more detailed). Defaults to false.',
      },
    },
    required: ['query'],
  } as const;

  override readonly allowedAgents = [
    'recruiting_coordinator',
    'compliance_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'general',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly bridge: FirecrawlMcpBridgeService;

  constructor(bridge: FirecrawlMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
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
    const country = this.str(input, 'country') ?? 'us';
    const extractContent = input['extractContent'] === true;

    const tbsMap: Record<string, string> = {
      past_day: 'qdr:d',
      past_week: 'qdr:w',
      past_month: 'qdr:m',
    };
    const timeFilter = this.str(input, 'timeFilter');
    const tbs = timeFilter && tbsMap[timeFilter] ? tbsMap[timeFilter] : undefined;

    const options: FirecrawlSearchOptions = {
      limit,
      country,
      tbs,
      scrapeOptions: extractContent ? { formats: ['markdown'], onlyMainContent: true } : undefined,
    };

    logger.info('[FirecrawlSearch] Searching', {
      query,
      limit,
      country,
      tbs,
      userId: context?.userId,
    });
    context?.onProgress?.('Searching the web…');

    try {
      const results = await this.bridge.search(query, options);
      const output = truncateOutput(results);

      logger.info('[FirecrawlSearch] Completed', { query, outputLength: output.length });

      return {
        success: true,
        data: {
          query,
          resultCount: Array.isArray(results) ? results.length : undefined,
          results: output,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      logger.error('[FirecrawlSearch] Failed', { query, error: message });
      return { success: false, error: message };
    }
  }
}
