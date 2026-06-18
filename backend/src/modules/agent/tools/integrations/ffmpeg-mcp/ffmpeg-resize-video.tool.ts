import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { ResizeVideoInputSchema } from './schemas.js';
import { generateVideoThumbnail } from './ffmpeg-thumbnail-helper.js';

export class FfmpegResizeVideoTool extends BaseTool {
  readonly name = 'ffmpeg_resize_video';
  readonly description =
    'Resize a video using width/height or an explicit FFmpeg scale expression.';
  readonly parameters = ResizeVideoInputSchema;

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
    const normalizedInput = normalizeFfmpegToolInput(input);
    const parsed = ResizeVideoInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_resize_video',
    });

    try {
      const result = await this.bridge.resizeVideo(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      const thumbnailUrl = await generateVideoThumbnail({
        bridge: this.bridge,
        videoUrl: outputUrl,
        outputPath: parsed.data.outputPath,
        fallbackBase: 'resized.mp4',
        context,
        logScope: 'FfmpegResizeVideoTool',
      });
      return {
        success: true,
        data: { outputUrl, ...(thumbnailUrl ? { thumbnailUrl } : {}), result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resize video';
      logger.error('[FfmpegResizeVideoTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
