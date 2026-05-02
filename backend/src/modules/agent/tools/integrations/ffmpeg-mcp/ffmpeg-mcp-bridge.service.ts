/**
 * @fileoverview FFmpeg MCP Bridge Service
 * @module @nxt1/backend/modules/agent/tools/integrations/ffmpeg-mcp
 *
 * Typed bridge over a hosted FFmpeg MCP server (dubnium0/ffmpeg-mcp compatible).
 *
 * This service intentionally exposes only an allowlisted set of operations.
 * Raw passthrough execution (e.g. run_custom_ffmpeg) is intentionally not exposed.
 */

import { basename } from 'node:path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import { logger } from '../../../../../utils/logger.js';
import { MediaStagingService } from '../../media/media-staging.service.js';
import { MediaTransportResolverService } from '../../media/media-transport-resolver.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import {
  FfmpegOperationResultSchema,
  type FfmpegOperationResult,
  type TrimVideoInput,
  type MergeVideosInput,
  type ResizeVideoInput,
  type AddTextOverlayInput,
  type BurnSubtitlesInput,
  type GenerateThumbnailInput,
  type ConvertVideoInput,
  type CompressVideoInput,
} from './schemas.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_RUNNING_TIMEOUT_MS = 180_000;

/**
 * Unwrap the `{ result: "<json-string>" }` envelope that some MCP server
 * implementations (including the upstream dubnium0/ffmpeg-mcp) return.
 * The MCP SDK sometimes surfaces this as `structuredContent` and sometimes
 * as a text block — we handle both paths identically here.
 */
function unwrapMcpEnvelope(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['result'] === 'string'
  ) {
    const inner = (value as Record<string, unknown>)['result'] as string;
    try {
      return JSON.parse(inner);
    } catch {
      // inner string is not JSON — return as-is
    }
  }
  return value;
}

function extractPayloadFromContent(result: McpToolCallResult): unknown {
  const textBlocks = result.content
    .flatMap((content) => {
      if (content.type === 'text' && content.text) return [content.text];
      if (typeof content.data === 'string' && content.data.trim().length > 0) return [content.data];
      return [] as string[];
    })
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (textBlocks.length === 0) {
    return null;
  }

  const combined = textBlocks.join('\n');
  try {
    return unwrapMcpEnvelope(JSON.parse(combined));
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

function extractPayload(result: McpToolCallResult): unknown {
  const structuredPayload =
    result.structuredContent && Object.keys(result.structuredContent).length > 0
      ? unwrapMcpEnvelope(result.structuredContent)
      : null;

  const contentPayload = extractPayloadFromContent(result);

  if (structuredPayload === null && contentPayload === null) {
    throw new AgentEngineError('FFMPEG_MCP_RESPONSE_EMPTY', 'FFmpeg MCP returned no content');
  }

  if (structuredPayload === null) return contentPayload;
  if (contentPayload === null) return structuredPayload;

  if (
    typeof structuredPayload === 'object' &&
    structuredPayload !== null &&
    !Array.isArray(structuredPayload) &&
    typeof contentPayload === 'object' &&
    contentPayload !== null &&
    !Array.isArray(contentPayload)
  ) {
    const merged = {
      ...(structuredPayload as Record<string, unknown>),
      ...(contentPayload as Record<string, unknown>),
    };

    return merged;
  }

  return contentPayload ?? structuredPayload;
}

function extractErrorMessage(result: McpToolCallResult): string {
  try {
    const payload = extractPayload(result);
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'object' && payload !== null) {
      const objectPayload = payload as Record<string, unknown>;
      if (typeof objectPayload['error'] === 'string') return objectPayload['error'];
      if (typeof objectPayload['message'] === 'string') return objectPayload['message'];
      return JSON.stringify(payload);
    }
    return String(payload);
  } catch {
    return 'Unknown FFmpeg MCP error';
  }
}

export class FfmpegMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'ffmpeg-mcp';
  private static readonly TOKEN_HEADER = 'x-ffmpeg-mcp-token';

  private readonly baseUrl: string;
  private readonly apiToken: string | null;
  private readonly mediaTransportResolver = new MediaTransportResolverService();
  private readonly mediaStaging = new MediaStagingService();

  /** Root URL of the MCP server (baseUrl without the /mcp path suffix). */
  private get serverRootUrl(): string {
    return this.baseUrl.replace(/\/mcp$/, '');
  }

  constructor() {
    super();

    const baseUrl = process.env['FFMPEG_MCP_URL'];
    if (!baseUrl) {
      throw new AgentEngineError(
        'FFMPEG_MCP_CONFIG_MISSING_URL',
        'FFMPEG_MCP_URL environment variable is required for FfmpegMcpBridgeService'
      );
    }

    this.baseUrl = baseUrl;
    this.apiToken = process.env['FFMPEG_MCP_API_TOKEN'] ?? null;
  }

  protected override getTransport(): Transport {
    const headers: Record<string, string> = {};
    if (this.apiToken) {
      headers[FfmpegMcpBridgeService.TOKEN_HEADER] = this.apiToken;
    }

    return new StreamableHTTPClientTransport(new URL(this.baseUrl), {
      requestInit: {
        headers,
      },
    });
  }

  private async executeOperation(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    const argsWithThreadScopedOutputPath = this.withThreadScopedOutputPath(args, context, toolName);
    const resolvedArgs = await this.resolveOperationArgs(argsWithThreadScopedOutputPath, context);
    const result = await this.executeTool(toolName, resolvedArgs, { timeoutMs });

    if (result.isError) {
      const message = extractErrorMessage(result);
      throw new AgentEngineError('FFMPEG_MCP_REQUEST_FAILED', message, {
        metadata: { toolName },
      });
    }

    const payload = extractPayload(result);
    const parsed = FfmpegOperationResultSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error('[FfmpegMCP] Invalid response payload', {
        toolName,
        issues: parsed.error.issues,
        payload,
      });
      throw new AgentEngineError(
        'FFMPEG_MCP_INVALID_RESPONSE',
        `FFmpeg MCP returned invalid payload for ${toolName}`,
        { metadata: { toolName } }
      );
    }

    if (!parsed.data.success) {
      throw new AgentEngineError(
        'FFMPEG_MCP_OPERATION_FAILED',
        parsed.data.error ?? `FFmpeg MCP ${toolName} failed`,
        { metadata: { toolName, payload: parsed.data } }
      );
    }

    // Keep FFmpeg outputs under the standard Users/{userId}/threads/{threadId}
    // storage hierarchy for consistency with all other staged media.
    if (context && parsed.data.outputUrl && this.shouldRestageOutputUrl(parsed.data.outputUrl)) {
      const staged = await this.stageOutputFromPublicUrl(parsed.data.outputUrl, toolName, context);
      if (staged) {
        return { ...parsed.data, outputUrl: staged };
      }
    }

    // When the MCP server has GCS configured, outputUrl is already a public URL.
    // When GCS is not configured the server leaves the file in /tmp/ and returns
    // the local path in output_path. Download it via the /files/ endpoint and
    // stage it to Firebase Storage so the frontend has a real accessible URL.
    if (!parsed.data.outputUrl && parsed.data.output_path && context) {
      const staged = await this.stageOutputFromMcpServer(
        parsed.data.output_path,
        toolName,
        context
      );
      if (staged) {
        return { ...parsed.data, outputUrl: staged };
      }
    }

    return parsed.data;
  }

  private withThreadScopedOutputPath(
    args: Record<string, unknown>,
    context: ToolExecutionContext | undefined,
    toolName: string
  ): Record<string, unknown> {
    if (!context?.userId) return args;

    const existingOutputPath = args['output_path'];
    if (typeof existingOutputPath !== 'string' || existingOutputPath.trim().length === 0) {
      return args;
    }

    const normalizedOutputPath = existingOutputPath.trim();

    // Keep explicit absolute paths untouched.
    if (normalizedOutputPath.startsWith('/')) {
      return args;
    }

    // If already thread-scoped, do not rewrite.
    if (/^Users\//.test(normalizedOutputPath)) {
      return args;
    }

    const fileName = basename(normalizedOutputPath) || `${toolName}.mp4`;
    const threadId = context.threadId ?? 'agent-x';
    const threadScopedOutputPath = [
      'Users',
      context.userId,
      'threads',
      threadId,
      'media',
      'staged',
      'video',
      fileName,
    ].join('/');

    return {
      ...args,
      output_path: threadScopedOutputPath,
    };
  }

  private shouldRestageOutputUrl(outputUrl: string): boolean {
    const normalized = outputUrl.trim().toLowerCase();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      return false;
    }

    return (
      normalized.includes('/agent-x/ffmpeg/') ||
      normalized.includes('agent-x%2fffmpeg%2f') ||
      normalized.includes('/o/agent-x%2fffmpeg')
    );
  }

  private async stageOutputFromPublicUrl(
    sourceUrl: string,
    toolName: string,
    context: ToolExecutionContext
  ): Promise<string | null> {
    logger.info('[FfmpegMCP] Restaging FFmpeg output URL to thread-scoped storage', {
      toolName,
      userId: context.userId,
      threadId: context.threadId,
    });

    try {
      const staged = await this.mediaStaging.stageFromUrl({
        sourceUrl,
        staging: {
          userId: context.userId,
          threadId: context.threadId ?? 'agent-x',
        },
        environment: context.environment,
        mediaKind: 'video',
      });

      logger.info('[FfmpegMCP] Restaged FFmpeg output URL successfully', {
        toolName,
        storagePath: staged.storagePath,
        sizeBytes: staged.sizeBytes,
      });

      return staged.signedUrl;
    } catch (err) {
      logger.warn('[FfmpegMCP] Failed to restage FFmpeg output URL', {
        toolName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Download a processed output file from the MCP server's /files/ endpoint
   * and stage it to Firebase Storage, returning a time-limited signed URL.
   *
   * The MCP server keeps output files on disk when GCS upload is not configured
   * and serves them at GET /files/{filename} (Bearer token required).
   */
  private async stageOutputFromMcpServer(
    outputPath: string,
    toolName: string,
    context: ToolExecutionContext
  ): Promise<string | null> {
    if (!outputPath.startsWith('/tmp/')) return null;

    const filename = basename(outputPath);
    if (!filename) return null;

    const downloadUrl = `${this.serverRootUrl}/files/${encodeURIComponent(filename)}`;

    logger.info('[FfmpegMCP] Staging output from MCP server to Firebase', {
      toolName,
      filename,
      userId: context.userId,
      threadId: context.threadId,
    });

    try {
      const staged = await this.mediaStaging.stageFromUrl({
        sourceUrl: downloadUrl,
        staging: {
          userId: context.userId,
          threadId: context.threadId ?? 'agent-x',
        },
        environment: context.environment,
        mediaKind: 'auto',
        headers: this.apiToken
          ? { [FfmpegMcpBridgeService.TOKEN_HEADER]: this.apiToken }
          : undefined,
      });

      logger.info('[FfmpegMCP] Output staged to Firebase', {
        toolName,
        signedUrl: staged.signedUrl,
        storagePath: staged.storagePath,
        sizeBytes: staged.sizeBytes,
      });

      return staged.signedUrl;
    } catch (err) {
      logger.warn('[FfmpegMCP] Failed to stage output from MCP server', {
        toolName,
        downloadUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async resolveOperationArgs(
    args: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<Record<string, unknown>> {
    const nextArgs: Record<string, unknown> = { ...args };

    const inputPath = nextArgs['input_path'];
    if (typeof inputPath === 'string' && inputPath.trim().length > 0) {
      const resolved = await this.mediaTransportResolver.resolveProcessingUrl({
        sourceUrl: inputPath,
        fallbackToFirebaseStaging: true,
        stageMediaKind: 'video',
        executionContext: context,
      });
      nextArgs['input_path'] = resolved.url;
      if (resolved.source !== 'direct' && resolved.source !== 'unchanged') {
        logger.info('[FfmpegMCP] Resolved input_path for processing', {
          source: resolved.source,
          cloudflareVideoId: resolved.cloudflareVideoId,
          stagedStoragePath: resolved.stagedStoragePath,
        });
      }
    }

    const inputPaths = nextArgs['input_paths'];
    if (Array.isArray(inputPaths)) {
      const resolvedPaths = await Promise.all(
        inputPaths.map(async (value) => {
          if (typeof value !== 'string' || value.trim().length === 0) {
            return value;
          }

          const resolved = await this.mediaTransportResolver.resolveProcessingUrl({
            sourceUrl: value,
            fallbackToFirebaseStaging: true,
            stageMediaKind: 'video',
            executionContext: context,
          });

          return resolved.url;
        })
      );

      nextArgs['input_paths'] = resolvedPaths;
    }

    return nextArgs;
  }

  async trimVideo(
    input: TrimVideoInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'trim_video',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'trimmed.mp4',
        start_time: input.startTime,
        end_time: input.endTime,
        duration: input.duration,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async mergeVideos(
    input: MergeVideosInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'merge_videos',
      {
        // Pass as array — the upstream tool expects a list, not a comma-separated string
        input_paths: input.inputPaths,
        output_path: input.outputPath ?? 'merged.mp4',
        method: input.method,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async resizeVideo(
    input: ResizeVideoInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'resize_video',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'resized.mp4',
        width: input.width,
        height: input.height,
        scale: input.scale,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async addTextOverlay(
    input: AddTextOverlayInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'add_text_overlay',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'overlay.mp4',
        text: input.text,
        font_size: input.fontSize,
        font_color: input.fontColor,
        x: input.x,
        y: input.y,
        start_time: input.startTime,
        end_time: input.endTime,
        box: input.box,
        box_color: input.boxColor,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async burnSubtitles(
    input: BurnSubtitlesInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'burn_subtitles',
      {
        input_path: input.inputPath,
        subtitle_path: input.subtitlePath,
        output_path: input.outputPath ?? 'subtitled.mp4',
        font_size: input.fontSize,
        font_name: input.fontName,
        primary_color: input.primaryColor,
        margin_v: input.marginV,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async generateThumbnail(
    input: GenerateThumbnailInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'generate_thumbnail',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'thumbnail.jpg',
        time: input.time,
      },
      DEFAULT_TIMEOUT_MS,
      context
    );
  }

  async convertVideo(
    input: ConvertVideoInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'convert_video',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'converted.mp4',
        video_codec: input.videoCodec,
        audio_codec: input.audioCodec,
        video_bitrate: input.videoBitrate,
        audio_bitrate: input.audioBitrate,
        preset: input.preset,
        crf: input.crf,
        extra_args: input.extraArgs,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }

  async compressVideo(
    input: CompressVideoInput,
    context?: ToolExecutionContext
  ): Promise<FfmpegOperationResult> {
    return this.executeOperation(
      'compress_video',
      {
        input_path: input.inputPath,
        output_path: input.outputPath ?? 'compressed.mp4',
        target_size_mb: input.targetSizeMb,
        crf: input.crf,
        video_codec: input.videoCodec,
        preset: input.preset,
      },
      LONG_RUNNING_TIMEOUT_MS,
      context
    );
  }
}
