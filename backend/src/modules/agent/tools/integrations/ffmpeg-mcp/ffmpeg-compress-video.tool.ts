import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { CompressVideoInputSchema } from './schemas.js';

export class FfmpegCompressVideoTool extends BaseTool {
  readonly name = 'ffmpeg_compress_video';
  readonly description = 'Compress a video by CRF or target file size to reduce output size.';
  readonly parameters = CompressVideoInputSchema;

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
    const parsed = CompressVideoInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_compress_video',
    });

    try {
      const result = await this.bridge.compressVideo(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      return {
        success: true,
        data: { outputUrl, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to compress video';
      logger.error('[FfmpegCompressVideoTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
