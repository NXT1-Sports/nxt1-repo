/**
 * @fileoverview Firecrawl Extract Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Extracts structured data from web pages using Firecrawl's LLM extraction.
 * Pass a natural language prompt describing what to extract and optionally
 * a JSON schema for the output format.
 *
 * Use cases:
 * - Extracting roster data (player names, positions, numbers) from college sites
 * - Pulling coaching staff emails and phone numbers
 * - Scraping product/pricing info from multiple pages
 * - Extracting event schedules and dates from athletic departments
 *
 * Budget: Extract uses server-side LLM processing — more expensive than scrape.
 * Maximum 25 URLs per call.
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../../base.tool.js';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlExtractOptions,
} from './firecrawl-mcp-bridge.service.js';
import { z } from 'zod';
import { logger } from '../../../../../../utils/logger.js';

/** Maximum URL length. */
const MAX_URL_LENGTH = 2_048;

/** Maximum number of URLs per call. */
const MAX_URLS = 25;

/** Maximum prompt length. */
const MAX_PROMPT_LENGTH = 2_000;

/** Maximum output size to return to the LLM. */
const MAX_OUTPUT_CHARS = 50_000;

function truncateOutput(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n\n... [OUTPUT TRUNCATED]';
}

export class FirecrawlExtractTool extends BaseTool {
  readonly name = 'extract_web_data';
  readonly description =
    'Extract structured data from one or more web pages using AI. ' +
    'Pass a prompt describing what to extract and optionally a JSON schema for the output format. ' +
    'Uses server-side LLM processing — more powerful than simple scraping. ' +
    'Best for: roster tables, coaching directories, event schedules, pricing pages. ' +
    'Maximum 25 URLs per call. For discovering URLs first, use map_website.';

  readonly parameters = z.object({
    urls: z.array(z.string().trim().min(1)).min(1).max(MAX_URLS),
    prompt: z.string().trim().min(1),
    schema: z.record(z.string(), z.unknown()).optional(),
    enableWebSearch: z.boolean().optional(),
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
    const urls = input['urls'];
    if (!Array.isArray(urls) || urls.length === 0) {
      return this.paramError('urls');
    }

    const validUrls = urls.filter(
      (u): u is string =>
        typeof u === 'string' &&
        u.length <= MAX_URL_LENGTH &&
        (u.startsWith('http://') || u.startsWith('https://'))
    );

    if (validUrls.length === 0) {
      return {
        success: false,
        error: 'No valid URLs provided. URLs must start with http:// or https://.',
      };
    }

    if (validUrls.length > MAX_URLS) {
      return {
        success: false,
        error: `Maximum ${MAX_URLS} URLs per extract call. Received: ${validUrls.length}.`,
      };
    }

    const prompt = this.str(input, 'prompt');
    if (!prompt) return this.paramError('prompt');

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return {
        success: false,
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      };
    }

    const schema = input['schema'] as Record<string, unknown> | undefined;
    const enableWebSearch = input['enableWebSearch'] === true;

    const options: FirecrawlExtractOptions = {
      schema,
      enableWebSearch,
    };

    logger.info('[FirecrawlExtract] Extracting data', {
      urlCount: validUrls.length,
      promptLength: prompt.length,
      hasSchema: !!schema,
      userId: context?.userId,
    });
    context?.emitStage?.('fetching_data', {
      icon: 'search',
      urlCount: validUrls.length,
      phase: 'extract_data',
    });

    try {
      const result = await this.bridge.extract(validUrls, prompt, options);
      const output = truncateOutput(result);

      logger.info('[FirecrawlExtract] Completed', {
        urlCount: validUrls.length,
        outputLength: output.length,
      });

      return {
        success: true,
        data: {
          urlCount: validUrls.length,
          extraction: output,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      logger.error('[FirecrawlExtract] Failed', {
        urlCount: validUrls.length,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
