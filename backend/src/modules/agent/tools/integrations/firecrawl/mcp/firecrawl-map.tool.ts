/**
 * @fileoverview Firecrawl Map Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Discovers all indexed URLs on a website using the Firecrawl map API.
 * Fast and lightweight — does NOT download page content, only returns URLs.
 *
 * Use cases:
 * - Mapping a college athletics site to find roster, staff, and schedule pages
 * - Discovering all pages under a specific section (e.g. /sports/football/*)
 * - Finding sitemap-indexed URLs before deciding what to scrape
 * - Building a URL inventory for batch scraping or extraction
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../../base.tool.js';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlMapOptions,
} from './firecrawl-mcp-bridge.service.js';
import { z } from 'zod';
import { logger } from '../../../../../../utils/logger.js';

/** Maximum URL length for the base URL. */
const MAX_URL_LENGTH = 2_048;

/** Maximum map results to prevent token overflow. */
const MAX_MAP_LIMIT = 200;

/** Default map limit. */
const DEFAULT_MAP_LIMIT = 100;

export class FirecrawlMapTool extends BaseTool {
  readonly name = 'map_website';
  readonly description =
    'Discover all URLs on a website without downloading content. ' +
    'Use this to find specific pages (roster, coaches, schedule) before scraping them. ' +
    'Returns an array of URLs found on the site. Fast and low-cost. ' +
    'Tip: Use the "search" parameter to filter for specific page types ' +
    '(e.g. search="roster" on a college athletics domain). ' +
    'After mapping, use scrape_webpage to get content from specific URLs.';

  readonly parameters = z.object({
    url: z.string().trim().min(1),
    search: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(MAX_MAP_LIMIT).optional(),
    includeSubdomains: z.boolean().optional(),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly bridge: FirecrawlMcpBridgeService;

  constructor(bridge: FirecrawlMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const url = this.str(input, 'url');
    if (!url) return this.paramError('url');

    if (url.length > MAX_URL_LENGTH) {
      return {
        success: false,
        error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`,
      };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'URL must start with http:// or https://' };
    }

    const search = this.str(input, 'search');
    const limit = Math.min(
      Math.max(this.num(input, 'limit') ?? DEFAULT_MAP_LIMIT, 1),
      MAX_MAP_LIMIT
    );
    const includeSubdomains = input['includeSubdomains'] === true;

    const options: FirecrawlMapOptions = {
      search: search || undefined,
      limit,
      includeSubdomains,
    };

    logger.info('[FirecrawlMap] Mapping website', { url, search, limit, userId: context?.userId });
    context?.emitStage?.('fetching_data', {
      icon: 'search',
      url,
      hostname: new URL(url).hostname,
      phase: 'map_site',
    });

    try {
      const result = await this.bridge.map(url, options);
      const urls = Array.isArray(result)
        ? result
        : ((result as Record<string, unknown>)['urls'] ??
          (result as Record<string, unknown>)['links'] ??
          []);

      logger.info('[FirecrawlMap] Completed', {
        url,
        discoveredUrls: Array.isArray(urls) ? urls.length : 0,
      });

      return {
        success: true,
        data: {
          baseUrl: url,
          search: search || undefined,
          urlCount: Array.isArray(urls) ? urls.length : 0,
          urls,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Map failed';
      logger.error('[FirecrawlMap] Failed', { url, error: message });
      return { success: false, error: message };
    }
  }
}
