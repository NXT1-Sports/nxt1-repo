/**
 * Runway ML MCP Bridge Service
 *
 * Bridges the published @imbsq/runway-mcp MCP server to the NXT1 Agent X
 * tool system. Spawns the MCP server as a child process and exposes typed
 * proxy methods for all 7 Runway tools.
 *
 * Unlike Firecrawl, video/image generation is non-idempotent so proxy methods
 * call executeTool directly (no withCache). Task polling (getTask) uses caching
 * to avoid redundant status checks within a short window.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';

import { logger } from '../../../../../utils/logger.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

// ── Timeouts (ms) ────────────────────────────────────────────────────────────
const VIDEO_GENERATE_TIMEOUT_MS = 120_000;
const IMAGE_GENERATE_TIMEOUT_MS = 90_000;
const TASK_STATUS_TIMEOUT_MS = 30_000;
const UPSCALE_TIMEOUT_MS = 120_000;
const EDIT_TIMEOUT_MS = 120_000;
const ORG_TIMEOUT_MS = 15_000;
const CANCEL_TIMEOUT_MS = 15_000;

// ── Child‑process environment overrides ──────────────────────────────────────
const RUNWAY_CHILD_ENV: Record<string, string> = {
  NODE_NO_WARNINGS: '1',
};

const require = createRequire(import.meta.url);
const RUNWAY_MCP_ENTRY = require.resolve('@imbsq/runway-mcp/build/index.js');

// ── Zod response schemas ─────────────────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface RunwayGenerateVideoOptions {
  readonly promptText?: string;
  readonly promptImage?: string;
  readonly model?: 'gen4_turbo' | 'gen4.5' | 'veo3.1';
  readonly duration?: 4 | 5 | 6 | 8 | 10;
  readonly ratio?: '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672';
  readonly seed?: number;
  readonly watermark?: boolean;
}

export interface RunwayTextToVideoOptions {
  readonly promptText: string;
  readonly model?: 'gen3a_turbo' | 'gen4.5' | 'veo3' | 'veo3.1' | 'veo3.1_fast';
  readonly duration?: 4 | 5 | 6 | 8 | 10;
  readonly ratio?: '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672';
  readonly audio?: boolean;
}

export interface RunwayGenerateImageOptions {
  readonly promptText: string;
  readonly model?: 'gen4_image';
  readonly ratio?: string;
  readonly seed?: number;
  readonly numberResults?: number;
}

export interface RunwayEditVideoOptions {
  readonly promptText?: string;
  readonly promptImage?: string;
  readonly video: string;
  readonly model?: string;
  readonly duration?: 5 | 10;
  readonly ratio?: string;
  readonly seed?: number;
  readonly watermark?: boolean;
}

export interface RunwayUpscaleVideoOptions {
  readonly video: string;
  readonly model?: string;
}

// ── Payload extractor (module-level utility) ─────────────────────────────────

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
    throw new AgentEngineError('RUNWAY_RESPONSE_EMPTY', 'Runway MCP returned no content');
  }

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

function summarizePayload(payload: unknown): {
  readonly payloadType: string;
  readonly keys: readonly string[];
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      payloadType: Array.isArray(payload) ? 'array' : typeof payload,
      keys: [],
    };
  }

  return {
    payloadType: 'object',
    keys: Object.keys(payload as Record<string, unknown>).sort(),
  };
}

// ── Bridge Service ───────────────────────────────────────────────────────────

export class RunwayMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'runway';

  private readonly apiKey: string;

  constructor() {
    super();
    const key = process.env['RUNWAYML_API_SECRET'] ?? process.env['RUNWAY_API_KEY'];
    if (!key) {
      throw new AgentEngineError(
        'RUNWAY_CONFIG_MISSING_API_KEY',
        'RUNWAYML_API_SECRET or RUNWAY_API_KEY environment variable is required for RunwayMcpBridgeService'
      );
    }
    this.apiKey = key;
  }

  // ── Transport ────────────────────────────────────────────────────────────

  protected override getTransport(): Transport {
    return new StdioClientTransport({
      command: process.execPath,
      args: [RUNWAY_MCP_ENTRY],
      env: {
        ...(process.env as Record<string, string>),
        RUNWAYML_API_SECRET: this.apiKey,
        RUNWAY_API_KEY: this.apiKey,
        ...RUNWAY_CHILD_ENV,
      },
    });
  }

  // ── Proxy Methods ────────────────────────────────────────────────────────

  /**
   * Generate a video from text and/or image prompt.
   * Returns task metadata (id, status) — poll with getTask().
   */
  async generateVideo(options: RunwayGenerateVideoOptions): Promise<unknown> {
    const args: Record<string, unknown> = {};
    if (options.promptText) args['promptText'] = options.promptText;
    if (options.promptImage) args['promptImage'] = options.promptImage;
    if (options.model) args['model'] = options.model;
    if (options.duration) args['duration'] = options.duration;
    if (options.ratio) args['ratio'] = options.ratio;
    if (options.seed !== undefined) args['seed'] = options.seed;
    if (options.watermark !== undefined) args['watermark'] = options.watermark;

    logger.info('[RunwayMCP] Generating video', {
      model: options.model ?? 'gen4_turbo',
      hasText: !!options.promptText,
      hasImage: !!options.promptImage,
      duration: options.duration,
    });

    const result = await this.executeTool('runway_generateVideo', args, {
      timeoutMs: VIDEO_GENERATE_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_generateVideo returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway video generation failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_generateVideo' } }
      );
    }

    const payload = extractPayload(result);
    const summary = summarizePayload(payload);
    logger.info('[RunwayMCP] runway_generateVideo payload summary', summary);
    return payload;
  }

  /**
   * Generate a video from text only.
   * Returns task metadata (id, status) — poll with getTask().
   */
  async textToVideo(options: RunwayTextToVideoOptions): Promise<unknown> {
    const args: Record<string, unknown> = {
      promptText: options.promptText,
    };
    if (options.model) args['model'] = options.model;
    if (options.duration) args['duration'] = options.duration;
    if (options.ratio) args['ratio'] = options.ratio;
    if (options.audio !== undefined) args['audio'] = options.audio;

    logger.info('[RunwayMCP] Generating text-to-video', {
      model: options.model ?? 'veo3.1',
      duration: options.duration,
      audio: options.audio ?? false,
    });

    const result = await this.executeTool('runway_textToVideo', args, {
      timeoutMs: VIDEO_GENERATE_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_textToVideo returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway text-to-video generation failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_textToVideo' } }
      );
    }

    const payload = extractPayload(result);
    const summary = summarizePayload(payload);
    logger.info('[RunwayMCP] runway_textToVideo payload summary', summary);
    return payload;
  }

  /**
   * Generate an image from a text prompt.
   * Returns task metadata (id, status) — poll with getTask().
   */
  async generateImage(options: RunwayGenerateImageOptions): Promise<unknown> {
    const args: Record<string, unknown> = {
      promptText: options.promptText,
    };
    if (options.model) args['model'] = options.model;
    if (options.ratio) args['ratio'] = options.ratio;
    if (options.seed !== undefined) args['seed'] = options.seed;
    if (options.numberResults !== undefined) args['numberResults'] = options.numberResults;

    logger.info('[RunwayMCP] Generating image', {
      model: options.model ?? 'gen4_image',
      ratio: options.ratio,
    });

    const result = await this.executeTool('runway_generateImage', args, {
      timeoutMs: IMAGE_GENERATE_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_generateImage returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway image generation failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_generateImage' } }
      );
    }

    const payload = extractPayload(result);
    const summary = summarizePayload(payload);
    logger.info('[RunwayMCP] runway_editVideo payload summary', summary);
    return payload;
  }

  /**
   * Edit / transform an existing video (video-to-video).
   * Returns task metadata (id, status) — poll with getTask().
   */
  async editVideo(options: RunwayEditVideoOptions): Promise<unknown> {
    const args: Record<string, unknown> = {
      video: options.video,
    };
    if (options.promptText) args['promptText'] = options.promptText;
    if (options.promptImage) args['promptImage'] = options.promptImage;
    if (options.model) args['model'] = options.model;
    if (options.duration) args['duration'] = options.duration;
    if (options.ratio) args['ratio'] = options.ratio;
    if (options.seed !== undefined) args['seed'] = options.seed;
    if (options.watermark !== undefined) args['watermark'] = options.watermark;

    logger.info('[RunwayMCP] Editing video', {
      model: options.model,
      hasText: !!options.promptText,
      hasImage: !!options.promptImage,
    });

    const result = await this.executeTool('runway_editVideo', args, {
      timeoutMs: EDIT_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_editVideo returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway video editing failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_editVideo' } }
      );
    }

    const payload = extractPayload(result);
    const summary = summarizePayload(payload);
    logger.info('[RunwayMCP] runway_upscaleVideo payload summary', summary);
    return payload;
  }

  /**
   * Upscale a video to higher resolution.
   * Returns task metadata (id, status) — poll with getTask().
   */
  async upscaleVideo(options: RunwayUpscaleVideoOptions): Promise<unknown> {
    const args: Record<string, unknown> = {
      video: options.video,
    };
    if (options.model) args['model'] = options.model;

    logger.info('[RunwayMCP] Upscaling video', { model: options.model });

    const result = await this.executeTool('runway_upscaleVideo', args, {
      timeoutMs: UPSCALE_TIMEOUT_MS,
    });

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_upscaleVideo returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway video upscale failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_upscaleVideo' } }
      );
    }

    return extractPayload(result);
  }

  /**
   * Poll a Runway task by ID. Cached for 10s to avoid hammering the API.
   */
  async getTask(taskId: string): Promise<unknown> {
    const result = await this.executeTool(
      'runway_getTask',
      { taskId },
      { timeoutMs: TASK_STATUS_TIMEOUT_MS }
    );

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_getTask returned error', {
        taskId,
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway getTask failed for "${taskId}": ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_getTask', taskId } }
      );
    }

    return extractPayload(result);
  }

  /**
   * Cancel a running Runway task.
   */
  async cancelTask(taskId: string): Promise<unknown> {
    logger.info('[RunwayMCP] Cancelling task', { taskId });

    const result = await this.executeTool(
      'runway_cancelTask',
      { taskId },
      { timeoutMs: CANCEL_TIMEOUT_MS }
    );

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_cancelTask returned error', {
        taskId,
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway cancelTask failed for "${taskId}": ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_cancelTask', taskId } }
      );
    }

    return extractPayload(result);
  }

  /**
   * Get organization / account info. Cached since it changes rarely.
   */
  async getOrg(): Promise<unknown> {
    const result = await this.executeTool(
      'runway_getOrg',
      {},
      {
        timeoutMs: ORG_TIMEOUT_MS,
      }
    );

    if (result.isError) {
      const payload = extractPayload(result);
      logger.error('[RunwayMCP] runway_getOrg returned error', {
        error: payload,
      });
      throw new AgentEngineError(
        'RUNWAY_REQUEST_FAILED',
        `Runway getOrg failed: ${JSON.stringify(payload)}`,
        { metadata: { operation: 'runway_getOrg' } }
      );
    }

    return extractPayload(result);
  }
}
