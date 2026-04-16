/**
 * @fileoverview Cloudflare MCP Bridge Service — MCP Client for Cloudflare API
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Extends `BaseMcpClientService` to communicate with the official Cloudflare
 * API MCP server at `https://mcp.cloudflare.com/mcp` via StreamableHTTP transport.
 *
 * Uses **Codemode ON** — the server exposes only two generic tools: `search` and
 * `execute`. Each proxy method in this bridge constructs a deterministic JavaScript
 * code string that calls the exact Cloudflare REST API endpoint, and passes it
 * to the `execute` tool. Cloudflare runs the code in an isolated Dynamic Worker.
 *
 * This gives us access to ALL 2,500+ Cloudflare API endpoints through one MCP
 * connection while keeping token overhead below ~1k tokens.
 *
 * Phase 1 focuses on **Stream** (video processing). The same bridge can be
 * extended to Images, R2, Workers AI, etc. by adding proxy methods.
 *
 * Architecture: Firebase Storage → importVideo(url) → CF processes → enableDownload()
 *   → pull MP4 back to Firebase → deleteVideo() → zero CF storage cost.
 *
 * Configuration:
 *   CLOUDFLARE_API_TOKEN        — API token with Account > Stream > Edit
 *   CLOUDFLARE_ACCOUNT_ID       — Cloudflare account ID
 *   CLOUDFLARE_STREAM_CUSTOMER_CODE — Customer subdomain code for URL construction
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import { logger } from '../../../../../utils/logger.js';
import {
  CfStreamVideoSchema,
  CfClipSchema,
  CfWatermarkProfileSchema,
  CfCaptionSchema,
  CfDownloadSchema,
  CfSignedTokenSchema,
  CfVideoListSchema,
  CfWatermarkListSchema,
  CfCaptionListSchema,
  type CfStreamVideo,
  type CfClip,
  type CfWatermarkProfile,
  type CfCaption,
  type CfDownload,
  type CfSignedToken,
  type CfVideoList,
  type CfWatermarkList,
  type CfCaptionList,
} from './schemas.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Official Cloudflare API MCP server endpoint (Codemode ON). */
const CLOUDFLARE_MCP_URL = 'https://mcp.cloudflare.com/mcp';

/** Timeout for lightweight read operations (get video, list). */
const READ_TIMEOUT_MS = 30_000;

/** Timeout for write operations (import, clip, watermark). */
const WRITE_TIMEOUT_MS = 60_000;

/** Timeout for generation operations (captions — server-side AI). */
const GENERATE_TIMEOUT_MS = 120_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract structured payload from MCP tool call result. */
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
    throw new Error('Cloudflare MCP returned no content');
  }

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

/** Extract error message from MCP result. */
function extractErrorMessage(result: McpToolCallResult): string {
  try {
    const payload = extractPayload(result);
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      if (typeof obj['message'] === 'string') return obj['message'];
      if (typeof obj['error'] === 'string') return obj['error'];
      if (typeof obj['errors'] === 'object' && Array.isArray(obj['errors'])) {
        const firstErr = obj['errors'][0];
        if (typeof firstErr === 'object' && firstErr !== null && 'message' in firstErr) {
          return String((firstErr as Record<string, unknown>)['message']);
        }
      }
      return JSON.stringify(payload);
    }
    return String(payload);
  } catch {
    return 'Unknown Cloudflare MCP error';
  }
}

function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1_000;
  }

  const dateMs = Date.parse(header);
  if (isNaN(dateMs)) return null;

  return Math.max(dateMs - Date.now(), 0);
}

// ─── Service ────────────────────────────────────────────────────────────────

export class CloudflareMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'cloudflare';

  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly customerCode: string;
  private rateLimitDelayMs: number | null = null;

  constructor() {
    super();
    const token = process.env['CLOUDFLARE_API_TOKEN'];
    if (!token) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN environment variable is required for the Cloudflare MCP bridge'
      );
    }
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    if (!accountId) {
      throw new Error(
        'CLOUDFLARE_ACCOUNT_ID environment variable is required for the Cloudflare MCP bridge'
      );
    }
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];
    if (!customerCode) {
      throw new Error(
        'CLOUDFLARE_STREAM_CUSTOMER_CODE environment variable is required for the Cloudflare MCP bridge'
      );
    }
    this.apiToken = token;
    this.accountId = accountId;
    this.customerCode = customerCode;
  }

  // ── Transport ───────────────────────────────────────────────────────────

  protected getTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(CLOUDFLARE_MCP_URL), {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        this.rateLimitDelayMs =
          response.status === 429
            ? parseRetryAfterHeader(response.headers.get('retry-after'))
            : null;
        return response;
      },
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      },
    });
  }

  protected override consumeRateLimitDelayMs(): number | null {
    const delayMs = this.rateLimitDelayMs;
    this.rateLimitDelayMs = null;
    return delayMs;
  }

  // ── Core execute helper ─────────────────────────────────────────────────

  /**
   * Execute a deterministic JS code string against the Cloudflare API via
   * the MCP `execute` tool. The code runs in a CF Dynamic Worker sandbox.
   *
   * The code has access to a global `cloudflare` object with a `.request()` method.
   */
  private async executeCode(code: string, timeoutMs: number, operation: string): Promise<unknown> {
    const result = await this.executeTool(
      'execute',
      { code, account_id: this.accountId },
      { timeoutMs }
    );

    if (result.isError) {
      const message = extractErrorMessage(result);
      logger.error(`[CloudflareMCP] ${operation} failed`, { error: message });
      throw new Error(`Cloudflare ${operation} failed: ${message}`);
    }

    const payload = extractPayload(result);

    // CF API wraps responses in { result: ..., success: true, errors: [], messages: [] }
    if (typeof payload === 'object' && payload !== null && 'result' in payload) {
      return (payload as Record<string, unknown>)['result'];
    }

    return payload;
  }

  /** Validate a payload against a Zod schema. */
  private validatePayload<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.error('[CloudflareMCP] Payload validation failed', {
      operation,
      issues: parsed.error.issues,
      payload:
        typeof payload === 'string' ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500),
    });
    throw new Error(`Cloudflare MCP returned invalid payload for ${operation}`);
  }

  // ── Stream Proxy Methods ────────────────────────────────────────────────

  /**
   * Import a video from a URL (e.g. Firebase Storage signed URL) into CF Stream.
   * Cloudflare pulls the video asynchronously; use getVideo() to poll status.
   *
   * @param url - Publicly accessible video URL.
   * @param meta - Optional metadata key-value pairs.
   * @param scheduleDeletionMinutes - Auto-delete after N minutes (ephemeral).
   */
  async importVideo(
    url: string,
    meta?: Record<string, string>,
    scheduleDeletionMinutes?: number
  ): Promise<CfStreamVideo> {
    const metaStr = meta ? `, meta: ${JSON.stringify(meta)}` : '';
    const scheduleStr = scheduleDeletionMinutes
      ? `, scheduledDeletion: new Date(Date.now() + ${scheduleDeletionMinutes} * 60000).toISOString()`
      : '';

    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/copy',
        body: { url: '${url.replace(/'/g, "\\'")}'${metaStr}${scheduleStr} }
      });
      return response;
    `;

    const payload = await this.executeCode(code, WRITE_TIMEOUT_MS, 'importVideo');
    return this.validatePayload(CfStreamVideoSchema, payload, 'importVideo');
  }

  /**
   * Get video details and processing status.
   */
  async getVideo(videoId: string): Promise<CfStreamVideo> {
    const code = `
      const response = await cloudflare.request({
        method: 'GET',
        path: '/accounts/${this.accountId}/stream/${videoId}'
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'getVideo');
    return this.validatePayload(CfStreamVideoSchema, payload, 'getVideo');
  }

  /**
   * List videos in the account. Used internally for CRON cleanup.
   *
   * @param limit - Max results (1-1000, default 25).
   * @param search - Optional search query.
   */
  async listVideos(limit = 25, search?: string): Promise<CfVideoList> {
    const params = [`limit=${Math.min(limit, 1000)}`];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    const qs = params.join('&');

    const code = `
      const response = await cloudflare.request({
        method: 'GET',
        path: '/accounts/${this.accountId}/stream?${qs}'
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'listVideos');
    return this.validatePayload(CfVideoListSchema, payload, 'listVideos');
  }

  /**
   * Delete a video from Cloudflare Stream.
   * Critical for the ephemeral architecture — call after retrieving the final artifact.
   */
  async deleteVideo(videoId: string): Promise<void> {
    const code = `
      await cloudflare.request({
        method: 'DELETE',
        path: '/accounts/${this.accountId}/stream/${videoId}'
      });
      return { deleted: true };
    `;

    await this.executeCode(code, WRITE_TIMEOUT_MS, 'deleteVideo');
  }

  /**
   * Create a highlight clip from a source video.
   *
   * @param sourceVideoId - The CF video UID to clip from.
   * @param startTimeSeconds - Start time in seconds.
   * @param endTimeSeconds - End time in seconds.
   * @param watermarkProfileId - Optional watermark profile UID to apply.
   * @param scheduleDeletionMinutes - Auto-delete after N minutes.
   */
  async clipVideo(
    sourceVideoId: string,
    startTimeSeconds: number,
    endTimeSeconds: number,
    watermarkProfileId?: string,
    scheduleDeletionMinutes?: number
  ): Promise<CfClip> {
    const watermarkStr = watermarkProfileId ? `, watermark: { uid: '${watermarkProfileId}' }` : '';
    const scheduleStr = scheduleDeletionMinutes
      ? `, scheduledDeletion: new Date(Date.now() + ${scheduleDeletionMinutes} * 60000).toISOString()`
      : '';

    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/clip',
        body: {
          clippedFromVideoUID: '${sourceVideoId}',
          startTimeSeconds: ${startTimeSeconds},
          endTimeSeconds: ${endTimeSeconds}${watermarkStr}${scheduleStr}
        }
      });
      return response;
    `;

    const payload = await this.executeCode(code, WRITE_TIMEOUT_MS, 'clipVideo');
    return this.validatePayload(CfClipSchema, payload, 'clipVideo');
  }

  /**
   * Create a watermark profile for stamping onto clips.
   *
   * @param name - Profile name (e.g. "NXT1 Logo").
   * @param imageUrl - URL to a transparent PNG image (max 2MB).
   */
  async createWatermarkProfile(name: string, imageUrl: string): Promise<CfWatermarkProfile> {
    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/watermarks',
        body: {
          name: '${name.replace(/'/g, "\\'")}',
          url: '${imageUrl.replace(/'/g, "\\'")}'
        }
      });
      return response;
    `;

    const payload = await this.executeCode(code, WRITE_TIMEOUT_MS, 'createWatermarkProfile');
    return this.validatePayload(CfWatermarkProfileSchema, payload, 'createWatermarkProfile');
  }

  /**
   * List all watermark profiles in the account.
   */
  async listWatermarkProfiles(): Promise<CfWatermarkList> {
    const code = `
      const response = await cloudflare.request({
        method: 'GET',
        path: '/accounts/${this.accountId}/stream/watermarks'
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'listWatermarkProfiles');
    return this.validatePayload(CfWatermarkListSchema, payload, 'listWatermarkProfiles');
  }

  /**
   * Generate AI captions/subtitles for a video.
   *
   * @param videoId - The CF video UID.
   * @param language - ISO 639-1 language code (default 'en').
   */
  async generateCaptions(videoId: string, language = 'en'): Promise<CfCaption> {
    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/${videoId}/captions/${language}/generate',
        body: {}
      });
      return response;
    `;

    const payload = await this.executeCode(code, GENERATE_TIMEOUT_MS, 'generateCaptions');
    return this.validatePayload(CfCaptionSchema, payload, 'generateCaptions');
  }

  /**
   * List all caption tracks for a video.
   */
  async listCaptions(videoId: string): Promise<CfCaptionList> {
    const code = `
      const response = await cloudflare.request({
        method: 'GET',
        path: '/accounts/${this.accountId}/stream/${videoId}/captions'
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'listCaptions');
    return this.validatePayload(CfCaptionListSchema, payload, 'listCaptions');
  }

  /**
   * Enable downloadable MP4 or M4A rendering of a video.
   * This is CRITICAL for the ephemeral architecture — we need to pull the
   * processed artifact back to Firebase Storage as a downloadable file.
   *
   * @param videoId - The CF video UID.
   * @param type - 'video' for MP4 (default), 'audio' for M4A.
   */
  async enableDownload(videoId: string, type: 'video' | 'audio' = 'video'): Promise<CfDownload> {
    const pathSuffix = type === 'audio' ? '/audio' : '';
    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/${videoId}/downloads${pathSuffix}',
        body: {}
      });
      return response;
    `;

    const payload = await this.executeCode(code, WRITE_TIMEOUT_MS, 'enableDownload');
    return this.validatePayload(CfDownloadSchema, payload, 'enableDownload');
  }

  /**
   * Get download URLs and rendering progress.
   */
  async getDownloadLinks(videoId: string): Promise<CfDownload> {
    const code = `
      const response = await cloudflare.request({
        method: 'GET',
        path: '/accounts/${this.accountId}/stream/${videoId}/downloads'
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'getDownloadLinks');
    return this.validatePayload(CfDownloadSchema, payload, 'getDownloadLinks');
  }

  /**
   * Create a short-lived signed token for private video access.
   *
   * @param videoId - The CF video UID.
   * @param expiresInMinutes - Token lifetime in minutes.
   * @param downloadable - Whether to allow download.
   */
  async createSignedToken(
    videoId: string,
    expiresInMinutes = 60,
    downloadable = false
  ): Promise<CfSignedToken> {
    const exp = Math.floor(Date.now() / 1000) + expiresInMinutes * 60;
    const code = `
      const response = await cloudflare.request({
        method: 'POST',
        path: '/accounts/${this.accountId}/stream/${videoId}/token',
        body: {
          exp: ${exp},
          downloadable: ${downloadable}
        }
      });
      return response;
    `;

    const payload = await this.executeCode(code, READ_TIMEOUT_MS, 'createSignedToken');
    return this.validatePayload(CfSignedTokenSchema, payload, 'createSignedToken');
  }

  /**
   * Toggle whether a video requires signed URLs to view.
   */
  async setRequireSignedUrls(videoId: string, require: boolean): Promise<CfStreamVideo> {
    const code = `
      const response = await cloudflare.request({
        method: 'PATCH',
        path: '/accounts/${this.accountId}/stream/${videoId}',
        body: { requireSignedURLs: ${require} }
      });
      return response;
    `;

    const payload = await this.executeCode(code, WRITE_TIMEOUT_MS, 'setRequireSignedUrls');
    return this.validatePayload(CfStreamVideoSchema, payload, 'setRequireSignedUrls');
  }

  /**
   * Search Cloudflare API endpoints using the MCP `search` tool.
   * Useful for discovering new Stream endpoints during development.
   */
  async searchEndpoints(query: string): Promise<unknown> {
    const result = await this.executeTool('search', { query }, { timeoutMs: READ_TIMEOUT_MS });

    if (result.isError) {
      throw new Error(`Cloudflare endpoint search failed: ${extractErrorMessage(result)}`);
    }

    return extractPayload(result);
  }

  // ── Pure URL Construction (no MCP call needed) ──────────────────────────

  /**
   * Build a thumbnail URL for a CF Stream video.
   *
   * @param videoId - The CF video UID.
   * @param opts - Optional parameters for time, height, width.
   */
  getThumbnailUrl(
    videoId: string,
    opts?: { timeSeconds?: number; height?: number; width?: number }
  ): string {
    const params: string[] = [];
    if (opts?.timeSeconds !== undefined) params.push(`time=${opts.timeSeconds}s`);
    if (opts?.height) params.push(`height=${opts.height}`);
    if (opts?.width) params.push(`width=${opts.width}`);
    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    return `https://customer-${this.customerCode}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.jpg${qs}`;
  }

  /**
   * Build an animated GIF URL for a CF Stream video.
   */
  getAnimatedGifUrl(
    videoId: string,
    opts?: { timeSeconds?: number; height?: number; durationSeconds?: number; fps?: number }
  ): string {
    const params: string[] = [];
    if (opts?.timeSeconds !== undefined) params.push(`time=${opts.timeSeconds}s`);
    if (opts?.height) params.push(`height=${opts.height}`);
    if (opts?.durationSeconds) params.push(`duration=${opts.durationSeconds}s`);
    if (opts?.fps) params.push(`fps=${opts.fps}`);
    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    return `https://customer-${this.customerCode}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.gif${qs}`;
  }

  /**
   * Build an HLS streaming manifest URL.
   */
  getHlsUrl(videoId: string): string {
    return `https://customer-${this.customerCode}.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
  }

  /**
   * Build a DASH streaming manifest URL.
   */
  getDashUrl(videoId: string): string {
    return `https://customer-${this.customerCode}.cloudflarestream.com/${videoId}/manifest/video.mpd`;
  }

  /**
   * Build an embeddable iframe URL.
   */
  getIframeUrl(videoId: string): string {
    return `https://customer-${this.customerCode}.cloudflarestream.com/${videoId}/iframe`;
  }
}
