import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { TrimVideoInputSchema } from './schemas.js';

export class FfmpegTrimVideoTool extends BaseTool {
  readonly name = 'ffmpeg_trim_video';
  readonly description =
    'Trim a source video using start + end or start + duration and produce a new output file.';
  readonly parameters = TrimVideoInputSchema;

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
    const parsed = TrimVideoInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_trim_video',
    });

    try {
      const result = await this.bridge.trimVideo(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      return {
        success: true,
        data: { outputUrl, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trim video';
      logger.error('[FfmpegTrimVideoTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
