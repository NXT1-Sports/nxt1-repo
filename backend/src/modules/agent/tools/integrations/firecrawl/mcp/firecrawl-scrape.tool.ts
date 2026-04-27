/**
 * @fileoverview Firecrawl Scrape Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Scrapes content from a single URL using the Firecrawl MCP server.
 * Returns clean markdown or structured JSON suitable for LLM consumption.
 *
 * Use cases:
 * - Extracting roster data from a college athletics page
 * - Scraping coaching staff directories
 * - Reading NCAA compliance articles
 * - Pulling structured product/program data via JSON format
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../../base.tool.js';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlScrapeOptions,
} from './firecrawl-mcp-bridge.service.js';
import { z } from 'zod';
import { logger } from '../../../../../../utils/logger.js';

/** Maximum characters of output to include in the LLM response. */
const MAX_OUTPUT_CHARS = 50_000;

/** Maximum URL length to prevent abuse. */
const MAX_URL_LENGTH = 2_048;

function truncateOutput(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return (
    text.slice(0, MAX_OUTPUT_CHARS) +
    '\n\n... [OUTPUT TRUNCATED — page content exceeds context limit]'
  );
}

export class FirecrawlScrapeTool extends BaseTool {
  readonly name = 'scrape_webpage';
  readonly description =
    'Scrape content from a single web page URL. Returns clean markdown or structured JSON. ' +
    'Use this after search_web to get full page content, or when you know the exact URL. ' +
    'Supports extracting: article text, roster tables, coaching directories, program info. ' +
    'For structured data, use JSON format with a schema. For full page content, use markdown format. ' +
    'For discovering URLs on a site first, use map_website instead. ' +
    'For searching the web without a specific URL, use search_web instead.';

  readonly parameters = z.object({
    url: z.string().trim().min(1),
    format: z.enum(['markdown', 'json', 'branding']).optional(),
    jsonPrompt: z.string().trim().min(1).optional(),
    onlyMainContent: z.boolean().optional(),
    mobile: z.boolean().optional(),
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

    const format = this.str(input, 'format') ?? 'markdown';
    const jsonPrompt = this.str(input, 'jsonPrompt');
    const onlyMainContent = input['onlyMainContent'] !== false;
    const mobile = input['mobile'] === true;

    const options: FirecrawlScrapeOptions = {
      formats:
        format === 'json' && jsonPrompt
          ? [{ type: 'json', prompt: jsonPrompt } as unknown as string]
          : [format],
      onlyMainContent,
      mobile,
    };

    logger.info('[FirecrawlScrape] Scraping URL', { url, format, userId: context?.userId });
    context?.emitStage?.('fetching_data', {
      icon: 'search',
      url,
      hostname: new URL(url).hostname,
      phase: 'scrape_page',
    });

    try {
      const result = await this.bridge.scrape(url, options);
      const output = truncateOutput(result);

      logger.info('[FirecrawlScrape] Completed', { url, outputLength: output.length });

      return {
        success: true,
        data: {
          url,
          format,
          content: output,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scrape failed';
      logger.error('[FirecrawlScrape] Failed', { url, error: message });
      return { success: false, error: message };
    }
  }
}
