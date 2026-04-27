/**
 * @fileoverview Firecrawl Agent Research Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Executes autonomous multi-source web research using the Firecrawl Agent API.
 * Unlike `scrape_webpage` (single URL) or `firecrawl_search_web` (keyword search),
 * this tool handles open-ended research prompts where the agent itself discovers,
 * navigates, and synthesizes information from multiple sources.
 *
 * Use cases:
 * - Researching a college program's coaching staff across multiple pages
 * - Gathering NIL deal information from various sports news sites
 * - Aggregating recruiting rankings from multiple ranking services
 * - Investigating athlete stats across multiple databases
 *
 * Execution model:
 * - Calls `firecrawl_agent` MCP tool to start an async job → returns a job ID.
 * - Polls `firecrawl_agent_status` every 5 seconds until complete or timeout (3 min).
 * - Returns synthesized results when `status === 'completed'`.
 *
 * Configuration:
 * Set the `FIRECRAWL_API_KEY` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { AgentIdentifier } from '@nxt1/core';
import type {
  FirecrawlMcpBridgeService,
  FirecrawlAgentOptions,
} from './firecrawl-mcp-bridge.service.js';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum characters of output to include in the LLM response. */
const MAX_OUTPUT_CHARS = 60_000;

/** Polling interval between agent status checks (5 seconds). */
const POLL_INTERVAL_MS = 5_000;

/** Maximum total wait time for a research job (3 minutes). */
const RESEARCH_TIMEOUT_MS = 180_000;

/** Maximum credit allowance per research job (internal safety cap). */
const MAX_CREDITS_PER_JOB = 500;

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateOutput(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return (
    text.slice(0, MAX_OUTPUT_CHARS) +
    '\n\n... [OUTPUT TRUNCATED — research results exceed context limit]'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class FirecrawlAgentTool extends BaseTool {
  readonly name = 'firecrawl_agent_research';
  readonly description =
    'Autonomously research a topic across the web using AI-powered multi-source gathering. ' +
    'Unlike scrape_webpage (requires a known URL) or firecrawl_search_web (keyword results only), ' +
    'this tool accepts an open-ended research prompt and discovers, navigates, and synthesizes ' +
    'information from multiple sources automatically. ' +
    'Use for: comparing college programs, aggregating recruit rankings from multiple sites, ' +
    'researching coaching staff across multiple pages, gathering NIL market data, ' +
    'or any complex research task where the sources are unknown upfront. ' +
    'Runs asynchronously and may take up to 3 minutes. Returns synthesized results.';

  readonly parameters = z.object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe('Open-ended research task. Be specific about what data to gather and from where.'),
    urls: z
      .array(z.string().url())
      .max(10)
      .optional()
      .describe(
        'Optional seed URLs to guide the research. Leave empty for fully autonomous discovery.'
      ),
    schema: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Optional JSON schema to shape the output structure.'),
    model: z
      .enum(['spark-1-mini', 'spark-1-pro'])
      .optional()
      .describe('Research model. spark-1-pro is more thorough; spark-1-mini is faster.'),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;

  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  private readonly bridge: FirecrawlMcpBridgeService;

  constructor(bridge: FirecrawlMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const prompt = this.str(input, 'prompt');
    if (!prompt) return this.paramError('prompt');

    const urls = Array.isArray(input['urls'])
      ? (input['urls'] as string[]).filter((u) => typeof u === 'string')
      : undefined;
    const schema =
      input['schema'] && typeof input['schema'] === 'object' && !Array.isArray(input['schema'])
        ? (input['schema'] as Record<string, unknown>)
        : undefined;
    const model =
      input['model'] === 'spark-1-mini' || input['model'] === 'spark-1-pro'
        ? input['model']
        : undefined;

    logger.info('[FirecrawlAgent] Starting research job', {
      prompt: prompt.slice(0, 150),
      hasUrls: !!urls?.length,
      urlCount: urls?.length ?? 0,
      model,
      userId: context?.userId,
    });

    context?.emitStage?.('fetching_data', {
      icon: 'search',
      phase: 'web_research',
      prompt: prompt.slice(0, 100),
    });

    const options: FirecrawlAgentOptions = {
      urls: urls && urls.length > 0 ? urls : undefined,
      schema,
      model,
      maxCredits: MAX_CREDITS_PER_JOB,
    };

    let jobId: string;
    try {
      jobId = await this.bridge.agent(prompt, options);
      logger.info('[FirecrawlAgent] Job enqueued', { jobId, userId: context?.userId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start research job';
      logger.error('[FirecrawlAgent] Failed to enqueue job', { error: message });
      return { success: false, error: message };
    }

    // ── Polling loop ──────────────────────────────────────────────────────────
    const deadline = Date.now() + RESEARCH_TIMEOUT_MS;
    let attempt = 0;

    while (Date.now() < deadline) {
      await delay(POLL_INTERVAL_MS);
      attempt++;

      let statusResult: { status: string; data?: unknown; creditsUsed?: number };
      try {
        statusResult = await this.bridge.getAgentStatus(jobId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[FirecrawlAgent] Status poll failed (will retry)', {
          jobId,
          attempt,
          error: message,
        });
        // Transient poll failure — keep retrying until deadline
        continue;
      }

      logger.info('[FirecrawlAgent] Polling job status', {
        jobId,
        attempt,
        status: statusResult.status,
      });

      switch (statusResult.status) {
        case 'completed': {
          const output = truncateOutput(statusResult.data ?? '(No data returned)');
          logger.info('[FirecrawlAgent] Research completed', {
            jobId,
            creditsUsed: statusResult.creditsUsed,
            outputLength: output.length,
          });
          return {
            success: true,
            data: {
              jobId,
              prompt: prompt.slice(0, 200),
              result: output,
              creditsUsed: statusResult.creditsUsed,
            },
          };
        }

        case 'failed':
        case 'cancelled': {
          logger.error('[FirecrawlAgent] Research failed', {
            jobId,
            status: statusResult.status,
          });
          return {
            success: false,
            error: `Research job ${statusResult.status} (job: ${jobId})`,
          };
        }

        case 'processing':
        default:
          // Still running — continue polling
          break;
      }
    }

    // Deadline exceeded
    logger.error('[FirecrawlAgent] Research timed out', {
      jobId,
      timeoutMs: RESEARCH_TIMEOUT_MS,
      attempts: attempt,
    });
    return {
      success: false,
      error: `Research job timed out after ${RESEARCH_TIMEOUT_MS / 1000}s (job: ${jobId}). The job may still be running — try again later.`,
    };
  }
}
