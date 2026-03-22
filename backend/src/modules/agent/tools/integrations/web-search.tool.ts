/**
 * @fileoverview Web Search Tool — Tavily AI Search
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Gives Agent X the ability to search the open web for up-to-date information.
 * Backed by the Tavily AI Search API, which is purpose-built for AI agents and
 * returns clean, structured results without advertising noise.
 *
 * Use cases:
 * - Looking up college programs, coaches, and staff directories
 * - Researching NCAA/NAIA/NJCAA rules and compliance updates
 * - Finding sports news and recent game results
 * - Verifying athlete awards, records, and rankings
 * - Discovering industry trends, NIL opportunities, and market context
 *
 * Configuration:
 * Set the TAVILY_API_KEY environment variable (https://tavily.com).
 *
 * Security:
 * - Results are returned as structured JSON — no HTML execution.
 * - Query length is capped to prevent abuse.
 * - Only publicly accessible content is returned.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

/** Tavily API endpoint. */
const TAVILY_API_URL = 'https://api.tavily.com/search';

/** Max characters for a search query. */
const MAX_QUERY_LENGTH = 500;

/** Default number of results to return. */
const DEFAULT_MAX_RESULTS = 5;

/** Maximum results allowed per call. */
const MAX_RESULTS_LIMIT = 10;

/** Request timeout in ms. */
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Tavily Response Shape ────────────────────────────────────────────────────

interface TavilyResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score: number;
  readonly published_date?: string;
}

interface TavilyResponse {
  readonly query: string;
  readonly results: readonly TavilyResult[];
  readonly answer?: string;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class WebSearchTool extends BaseTool {
  readonly name = 'search_web';
  readonly description =
    'Search the open web for up-to-date information. ' +
    'Use this to look up college programs, coaching staff, NCAA rules, recruiting news, ' +
    'sports records, NIL opportunities, athlete rankings, and any topic that requires ' +
    'current knowledge beyond the NXT1 database. ' +
    'Returns a list of relevant web pages with titles, URLs, and excerpts. ' +
    'For deeper content on a specific URL, follow up with scrape_webpage.';

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The search query. Be specific and targeted. ' +
          'Example: "FCS football recruiting contact period 2025" or ' +
          '"University of Texas head football coach email 2025".',
      },
      maxResults: {
        type: 'number',
        description: `Number of results to return (1–${MAX_RESULTS_LIMIT}). Defaults to ${DEFAULT_MAX_RESULTS}.`,
      },
      searchDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description:
          '"basic" is faster and cheaper (keyword search). ' +
          '"advanced" performs deeper analysis for complex research questions. ' +
          'Defaults to "basic".',
      },
      includeAnswer: {
        type: 'boolean',
        description:
          'When true, Tavily synthesizes a direct AI-generated answer from the top results. ' +
          'Useful for factual questions. Defaults to false.',
      },
    },
    required: ['query'],
  } as const;

  override readonly allowedAgents = [
    'recruiting_coordinator',
    'compliance_coordinator',
    'performance_coordinator',
    'data_coordinator',
    'general',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ───────────────────────────────────────────────
    const query = this.str(input, 'query');
    if (!query) {
      return this.paramError('query');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return {
        success: false,
        error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`,
      };
    }

    const rawMaxResults = this.num(input, 'maxResults');
    const maxResults = Math.min(
      Math.max(1, Math.round(rawMaxResults ?? DEFAULT_MAX_RESULTS)),
      MAX_RESULTS_LIMIT
    );

    const searchDepth =
      input['searchDepth'] === 'advanced' ? ('advanced' as const) : ('basic' as const);

    const includeAnswer = input['includeAnswer'] === true;

    // ── API key check ──────────────────────────────────────────────────
    const apiKey = process.env['TAVILY_API_KEY'];
    if (!apiKey) {
      return {
        success: false,
        error: 'TAVILY_API_KEY is not configured. Set it in your environment to enable web search.',
      };
    }

    // ── Execute search ─────────────────────────────────────────────────
    logger.debug('[WebSearch] Executing search', { query, maxResults, searchDepth });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(TAVILY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            max_results: maxResults,
            search_depth: searchDepth,
            include_answer: includeAnswer,
            include_raw_content: false,
            include_images: false,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error('[WebSearch] Tavily API error', { status: response.status, errorBody });
        return {
          success: false,
          error: `Web search API returned status ${response.status}. ${errorBody.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as TavilyResponse;

      const results = (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        excerpt: r.content?.slice(0, 600) ?? '',
        score: Math.round(r.score * 100) / 100,
        ...(r.published_date ? { publishedDate: r.published_date } : {}),
      }));

      logger.debug('[WebSearch] Search complete', { query, resultCount: results.length });

      return {
        success: true,
        data: {
          query,
          resultCount: results.length,
          ...(data.answer ? { directAnswer: data.answer } : {}),
          results,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Web search failed';
      logger.error('[WebSearch] Unexpected error', { query, error: message });
      return { success: false, error: message };
    }
  }
}
