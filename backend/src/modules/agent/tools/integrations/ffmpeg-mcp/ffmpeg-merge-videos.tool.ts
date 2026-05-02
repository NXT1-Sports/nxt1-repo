import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { MergeVideosInputSchema } from './schemas.js';

export class FfmpegMergeVideosTool extends BaseTool {
  readonly name = 'ffmpeg_merge_videos';
  readonly description = 'Merge multiple videos into a single output video file.';
  readonly parameters = MergeVideosInputSchema;

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
    const parsed = MergeVideosInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_merge_videos',
      inputCount: parsed.data.inputPaths.length,
    });

    try {
      const result = await this.bridge.mergeVideos(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      return {
        success: true,
        data: { outputUrl, filesMerged: parsed.data.inputPaths.length, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to merge videos';
      logger.error('[FfmpegMergeVideosTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
