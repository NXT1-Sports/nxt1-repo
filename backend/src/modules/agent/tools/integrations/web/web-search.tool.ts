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

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { resolveUrlDisplay } from '../../favicon-registry.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

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

  readonly parameters = z.object({
    query: z.string().trim().min(1),
    maxResults: z.number().int().min(1).max(MAX_RESULTS_LIMIT).optional(),
    searchDepth: z.enum(['basic', 'advanced']).optional(),
    includeAnswer: z.boolean().optional(),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
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
    context?.emitStage?.('fetching_data', {
      icon: 'search',
      query,
      maxResults,
      searchDepth,
    });
    logger.debug('[WebSearch] Executing search', { query, maxResults, searchDepth });

    try {
      // Combine timeout + cancellation signal — either one fires to abort
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combinedSignal = context?.signal
        ? AbortSignal.any([timeoutSignal, context.signal])
        : timeoutSignal;

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
          signal: combinedSignal,
        });
      } finally {
        // no-op: AbortSignal.timeout handles its own cleanup
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

      context?.emitStage?.('fetching_data', {
        icon: 'search',
        query,
        resultCount: results.length,
        phase: 'analyze_results',
      });
      logger.debug('[WebSearch] Search complete', { query, resultCount: results.length });

      const markdown = [
        `## Web Search Results for "${query}" (${results.length} found)`,
        ...(data.answer ? ['', `**AI Answer:** ${data.answer}`, ''] : ['']),
        ...results.map(
          (r, i) => `### ${i + 1}. ${r.title}\n${resolveUrlDisplay(r.url)} — ${r.excerpt}`
        ),
      ].join('\n');

      return {
        success: true,
        markdown,
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
