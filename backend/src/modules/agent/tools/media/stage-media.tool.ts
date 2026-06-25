import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { MediaStagingService } from './media-staging.service.js';
import { MediaTransportResolverService } from './media-transport-resolver.service.js';
import { buildPortableMediaArtifact, type MediaWorkflowArtifact } from './media-workflow.js';
import { FfmpegMcpBridgeService } from '../integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
import { generateVideoThumbnail } from '../integrations/ffmpeg-mcp/ffmpeg-thumbnail-helper.js';
import { logger } from '../../../../utils/logger.js';

const MediaArtifactSchema = z.object({
  mediaKind: z.enum(['video', 'image', 'audio', 'document', 'other']),
  sourceType: z.enum([
    'public_direct',
    'protected_direct',
    'hls_manifest',
    'dash_manifest',
    'playlist',
    'youtube',
    'staged',
    'cloudflare',
    'unknown',
  ]),
  transportReadiness: z.enum([
    'portable',
    'auth_required',
    'download_required',
    'persistence_optional',
    'persistence_required',
    'unknown',
  ]),
  analysisReady: z.boolean(),
  recommendedNextAction: z.enum([
    'analyze_video',
    'stage_media',
    'call_apify_actor',
    'import_video',
    'enable_download',
    'review_media',
  ]),
  sourceUrl: z.string().nullable(),
  portableUrl: z.string().nullable(),
  playableUrls: z.array(z.string()),
  directMp4Urls: z.array(z.string()),
  manifestUrls: z.array(z.string()),
  cloudflareVideoId: z.string().trim().min(1).optional(),
  stagingHeaders: z.record(z.string(), z.string()).optional(),
  rationale: z.string(),
});

const StageMediaInputSchema = z.object({
  sourceUrl: z.string().trim().url('sourceUrl must be a valid URL'),
  fileName: z.string().trim().min(1).max(256).optional(),
  mediaKind: z.enum(['auto', 'video', 'image', 'audio', 'document', 'other']).optional(),
  contentType: z.string().trim().min(1).max(128).optional(),
  expiresInMinutes: z.number().int().min(1).max(1440).optional(),
  headers: z.record(z.string().trim().min(1), z.string()).optional(),
  artifact: MediaArtifactSchema.optional(),
});

export class StageMediaTool extends BaseTool {
  readonly name = 'stage_media';
  readonly description =
    'Fetch remote media or documents and prepare them for downstream AI analysis. ' +
    'Supports video, image, audio, and document files. ' +
    'Accepts optional request headers for authenticated media fetches (for example cookies, referer, origin, or authorization). ' +
    'Use this for one-off AI analysis or transient handoffs when you need a provider-accessible URL without permanently saving the asset.';

  readonly parameters = StageMediaInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  override readonly allowedAgents = [
    'brand_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
  ] as const;

  constructor(
    private readonly stagingService: MediaStagingService = new MediaStagingService(),
    private readonly transportResolver: MediaTransportResolverService = new MediaTransportResolverService(),
    private readonly ffmpegBridge?: Pick<
      FfmpegMcpBridgeService,
      'convertVideo' | 'generateThumbnail'
    >
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = StageMediaInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId || !context.threadId) {
      return {
        success: false,
        error: 'stage_media requires an active userId and threadId context.',
      };
    }

    context.emitStage?.('uploading_assets', {
      icon: 'upload',
      phase: 'stage_media',
      sourceUrl: parsed.data.sourceUrl,
    });

    try {
      const resolvedSourceUrl = parsed.data.sourceUrl ?? parsed.data.artifact?.sourceUrl ?? null;
      if (!resolvedSourceUrl) {
        return {
          success: false,
          error: 'stage_media requires either sourceUrl or artifact.sourceUrl.',
        };
      }

      const resolvedTransport = await this.transportResolver.resolveProcessingUrl({
        sourceUrl: resolvedSourceUrl,
        executionContext: context,
      });

      if (this.shouldNormalizeVideoBeforeStaging(parsed.data, resolvedTransport.url)) {
        const normalized = await this.normalizeVideoForStaging({
          sourceUrl: resolvedTransport.url,
          fileName: parsed.data.fileName,
          context,
        });
        const mediaArtifact: MediaWorkflowArtifact = buildPortableMediaArtifact({
          sourceUrl: normalized.outputUrl,
          mediaKind: 'video',
          cloudflareVideoId: parsed.data.artifact?.cloudflareVideoId,
          rationale: 'The video has been normalized and is ready for direct downstream analysis.',
        });
        const thumbnailUrl = await this.generateStagedVideoThumbnail(
          {
            signedUrl: normalized.outputUrl,
            storagePath: normalized.storagePath ?? normalized.outputPath,
            fileName: normalized.fileName,
          },
          context
        );

        return {
          success: true,
          data: {
            url: normalized.outputUrl,
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            expiresAt: normalized.expiresAt,
            storagePath: normalized.storagePath ?? null,
            fileName: normalized.fileName,
            mediaKind: 'video',
            mimeType: normalized.mimeType,
            sizeBytes: normalized.sizeBytes,
            sourceHost: new URL(resolvedTransport.url).hostname,
            mediaArtifact,
            message:
              'Video normalized successfully and is ready for analysis or downstream processing.',
          },
        };
      }

      const staged = await this.stagingService.stageFromUrl({
        sourceUrl: resolvedTransport.url,
        staging: {
          userId: context.userId,
          threadId: context.threadId,
        },
        environment: context.environment,
        fileName: parsed.data.fileName,
        mediaKind: parsed.data.mediaKind,
        contentType: parsed.data.contentType,
        expiresInMinutes: parsed.data.expiresInMinutes,
        headers: parsed.data.headers ?? parsed.data.artifact?.stagingHeaders,
      });

      const mediaArtifact: MediaWorkflowArtifact = buildPortableMediaArtifact({
        sourceUrl: staged.signedUrl,
        mediaKind: staged.mediaKind,
        cloudflareVideoId: parsed.data.artifact?.cloudflareVideoId,
        rationale: 'The media has been prepared and is ready for direct downstream analysis.',
      });
      const thumbnailUrl =
        staged.mediaKind === 'video'
          ? await this.generateStagedVideoThumbnail(staged, context)
          : null;

      return {
        success: true,
        data: {
          url: staged.signedUrl,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          expiresAt: staged.expiresAt,
          storagePath: staged.storagePath,
          fileName: staged.fileName,
          mediaKind: staged.mediaKind,
          mimeType: staged.mimeType,
          sizeBytes: staged.sizeBytes,
          sourceHost: staged.sourceHost,
          mediaArtifact,
          message:
            'Media prepared successfully and is ready for analysis or downstream processing.',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stage media.',
      };
    }
  }

  private async generateStagedVideoThumbnail(
    staged: {
      readonly signedUrl: string;
      readonly storagePath: string;
      readonly fileName: string;
    },
    context?: ToolExecutionContext
  ): Promise<string | null> {
    if (!this.ffmpegBridge || typeof this.ffmpegBridge.generateThumbnail !== 'function')
      return null;

    return generateVideoThumbnail({
      bridge: this.ffmpegBridge,
      videoUrl: staged.signedUrl,
      outputPath: staged.storagePath,
      fallbackBase: staged.fileName,
      context,
      logScope: 'StageMediaTool',
      time: '1',
    });
  }

  private shouldNormalizeVideoBeforeStaging(
    input: z.infer<typeof StageMediaInputSchema>,
    resolvedSourceUrl: string
  ): boolean {
    if (!this.canNormalizeVideo()) return false;

    const requestedKind = input.mediaKind === 'auto' ? undefined : input.mediaKind;
    if (requestedKind === 'video' || input.artifact?.mediaKind === 'video') return true;

    const contentType = input.contentType?.trim().toLowerCase();
    if (contentType?.startsWith('video/')) return true;

    try {
      const parsed = new URL(resolvedSourceUrl);
      return /\.(?:mp4|m4v|mov|webm|mkv|avi)(?:$|[?#])/i.test(parsed.pathname);
    } catch {
      return /\.(?:mp4|m4v|mov|webm|mkv|avi)(?:$|[?#])/i.test(resolvedSourceUrl);
    }
  }

  private async normalizeVideoForStaging(params: {
    readonly sourceUrl: string;
    readonly fileName?: string;
    readonly context: ToolExecutionContext;
  }): Promise<{
    readonly outputUrl: string;
    readonly outputPath: string;
    readonly storagePath?: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes?: number;
    readonly expiresAt?: string;
  }> {
    const bridge = this.ffmpegBridge;
    if (!bridge || typeof bridge.convertVideo !== 'function') {
      throw new Error('FFmpeg bridge is not configured for video normalization.');
    }

    const fileName = this.resolveNormalizedVideoFileName(params.sourceUrl, params.fileName);
    params.context.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'stage_media_video_normalization',
    });

    logger.info('[StageMediaTool] Normalizing staged video before upload', {
      userId: params.context.userId,
      threadId: params.context.threadId,
      fileName,
      sourceHost: new URL(params.sourceUrl).hostname,
    });

    const result = await bridge.convertVideo(
      {
        inputPath: params.sourceUrl,
        outputPath: fileName,
        preset: 'medium',
        crf: 23,
        addSilentAudio: true,
      },
      params.context
    );
    const outputUrl = result.outputUrl?.trim();
    if (!outputUrl) {
      throw new Error('Video normalization completed without an uploaded MP4 URL.');
    }

    return {
      outputUrl,
      outputPath: fileName,
      storagePath: typeof result['storagePath'] === 'string' ? result['storagePath'] : undefined,
      fileName,
      mimeType: typeof result['mimeType'] === 'string' ? result['mimeType'] : 'video/mp4',
      sizeBytes: typeof result['sizeBytes'] === 'number' ? result['sizeBytes'] : undefined,
      expiresAt: typeof result['expiresAt'] === 'string' ? result['expiresAt'] : undefined,
    };
  }

  private resolveNormalizedVideoFileName(sourceUrl: string, requestedFileName?: string): string {
    const preferred =
      requestedFileName?.trim() || this.fileNameFromUrl(sourceUrl) || 'staged-video';
    const sanitized = preferred.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
    const base = sanitized.length > 0 ? sanitized : 'staged-video';
    return /\.(?:mp4|m4v|mov|webm|mkv|avi)$/i.test(base)
      ? base.replace(/\.[^.]+$/, '.mp4')
      : `${base}.mp4`;
  }

  private fileNameFromUrl(sourceUrl: string): string | null {
    try {
      const parsed = new URL(sourceUrl);
      const fromPath = parsed.pathname.split('/').pop();
      return fromPath ? decodeURIComponent(fromPath) : null;
    } catch {
      return null;
    }
  }

  private canNormalizeVideo(): boolean {
    return Boolean(this.ffmpegBridge && typeof this.ffmpegBridge.convertVideo === 'function');
  }
}
