import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { ConvertVideoInputSchema } from './schemas.js';

export class FfmpegConvertVideoTool extends BaseTool {
  readonly name = 'ffmpeg_convert_video';
  readonly description =
    'Convert a video to another format, codec, bitrate, or quality profile. ' +
    'Do not use this as a routine prerequisite before ffmpeg_merge_videos; merge already normalizes audio/video and adds silent audio when needed.';
  readonly parameters = ConvertVideoInputSchema;

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
      mapOutputFormatToOutputPath: true,
      defaultOutputBase: 'converted',
    });
    const parsed = ConvertVideoInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_convert_video',
    });

    try {
      const result = await this.bridge.convertVideo(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      return {
        success: true,
        data: { outputUrl, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert video';
      logger.error('[FfmpegConvertVideoTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
