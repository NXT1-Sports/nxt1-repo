import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { BurnSubtitlesInputSchema } from './schemas.js';
import { generateVideoThumbnail } from './ffmpeg-thumbnail-helper.js';

export class FfmpegBurnSubtitlesTool extends BaseTool {
  readonly name = 'ffmpeg_burn_subtitles';
  readonly description =
    'Burn subtitle tracks into a video file so captions are permanently embedded in output.';
  readonly parameters = BurnSubtitlesInputSchema;

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
    const parsed = BurnSubtitlesInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_burn_subtitles',
    });

    try {
      const result = await this.bridge.burnSubtitles(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      const thumbnailUrl = await generateVideoThumbnail({
        bridge: this.bridge,
        videoUrl: outputUrl,
        outputPath: parsed.data.outputPath,
        fallbackBase: 'subtitled.mp4',
        context,
        logScope: 'FfmpegBurnSubtitlesTool',
      });
      return {
        success: true,
        data: { outputUrl, ...(thumbnailUrl ? { thumbnailUrl } : {}), result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to burn subtitles';
      logger.error('[FfmpegBurnSubtitlesTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
