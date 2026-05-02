import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { MediaStagingService } from './media-staging.service.js';
import { buildPortableMediaArtifact, type MediaWorkflowArtifact } from './media-workflow.js';

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

  constructor(private readonly stagingService: MediaStagingService = new MediaStagingService()) {
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

      const staged = await this.stagingService.stageFromUrl({
        sourceUrl: resolvedSourceUrl,
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
        rationale: 'The media has been prepared and is ready for direct downstream analysis.',
      });

      return {
        success: true,
        data: {
          url: staged.signedUrl,
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
}
