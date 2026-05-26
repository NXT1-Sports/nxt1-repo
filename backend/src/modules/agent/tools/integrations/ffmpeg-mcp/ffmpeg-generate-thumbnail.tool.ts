import sharp from 'sharp';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { storage as defaultStorage } from '../../../../../utils/firebase.js';
import { stagingStorage } from '../../../../../utils/firebase-staging.js';
import { AgentMediaLifecycleService } from '../../media/agent-media-lifecycle.service.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { GenerateThumbnailInputSchema, type GenerateThumbnailInput } from './schemas.js';

type CropResult = {
  readonly cropImageUrl: string;
  readonly cropStoragePath: string;
  readonly crop: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
};

export class FfmpegGenerateThumbnailTool extends BaseTool {
  readonly name = 'ffmpeg_generate_thumbnail';
  readonly description = 'Extract a thumbnail image from a video at a specified timestamp.';
  readonly parameters = GenerateThumbnailInputSchema;

  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly bridge: FfmpegMcpBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const normalizedInput = normalizeFfmpegToolInput(input, {
      coerceStringFields: ['time'],
    });
    const parsed = GenerateThumbnailInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_generate_thumbnail',
    });

    try {
      const result = await this.bridge.generateThumbnail(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      const cropResult = outputUrl
        ? await this.createCropFromThumbnail(outputUrl, parsed.data, context)
        : null;
      const imageUrl = cropResult?.cropImageUrl ?? outputUrl;

      return {
        success: true,
        data: {
          outputUrl,
          imageUrl,
          thumbnailUrl: imageUrl,
          ...(cropResult
            ? {
                cropImageUrl: cropResult.cropImageUrl,
                cropStoragePath: cropResult.cropStoragePath,
                crop: cropResult.crop,
                fullFrameUrl: outputUrl,
              }
            : {}),
          result,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate thumbnail';
      logger.error('[FfmpegGenerateThumbnailTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }

  private async createCropFromThumbnail(
    thumbnailUrl: string,
    input: GenerateThumbnailInput,
    context?: ToolExecutionContext
  ): Promise<CropResult | null> {
    if (!input.cropBounds || !context?.userId) {
      return null;
    }
    if (!/^https?:\/\//iu.test(thumbnailUrl)) {
      return null;
    }

    try {
      const response = await fetch(thumbnailUrl, { signal: context.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail (${response.status})`);
      }

      const sourceBuffer = Buffer.from(await response.arrayBuffer());
      const image = sharp(sourceBuffer);
      const metadata = await image.metadata();
      const sourceWidth = metadata.width ?? 0;
      const sourceHeight = metadata.height ?? 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Thumbnail dimensions unavailable');
      }

      const bounds = input.cropBounds;
      const minX = bounds.minX * sourceWidth;
      const minY = bounds.minY * sourceHeight;
      const maxX = bounds.maxX * sourceWidth;
      const maxY = bounds.maxY * sourceHeight;
      const boundsWidth = Math.max(1, maxX - minX);
      const boundsHeight = Math.max(1, maxY - minY);
      const padding = Math.max(48, Math.max(boundsWidth, boundsHeight) * 0.65);
      const left = Math.max(0, Math.floor(minX - padding));
      const top = Math.max(0, Math.floor(minY - padding));
      const right = Math.min(sourceWidth, Math.ceil(maxX + padding));
      const bottom = Math.min(sourceHeight, Math.ceil(maxY + padding));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      const cropBuffer = await sharp(sourceBuffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 92 })
        .toBuffer();

      const storage =
        context.environment === 'staging'
          ? stagingStorage
          : context.environment === 'production'
            ? defaultStorage
            : process.env['NODE_ENV'] === 'staging'
              ? stagingStorage
              : defaultStorage;
      const outputPath = input.outputPath.replace(/\.[^.]+$/u, '-crop.jpg');
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: context.userId,
        threadId: context.threadId,
        mimeType: 'image/jpeg',
        fileName: outputPath,
        zone: 'tmp',
      });
      const signed = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket: storage.bucket(),
        storagePath,
        buffer: cropBuffer,
        mimeType: 'image/jpeg',
      });

      return {
        cropImageUrl: signed.url,
        cropStoragePath: storagePath,
        crop: { left, top, width, height },
      };
    } catch (error) {
      logger.warn('[FfmpegGenerateThumbnailTool] Failed to crop thumbnail', {
        error: error instanceof Error ? error.message : String(error),
        userId: context.userId,
      });
      return null;
    }
  }
}
