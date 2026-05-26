import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { MergeVideosInputSchema } from './schemas.js';

export class FfmpegMergeVideosTool extends BaseTool {
  readonly name = 'ffmpeg_merge_videos';
  readonly description =
    'Merge multiple videos into a single output video file. ' +
    'Defaults to concat_filter which re-encodes all inputs to a common codec/timebase — ' +
    'safe for clips from different sources, resolutions, or that have been resized/trimmed. ' +
    'After merging, always call ffmpeg_generate_thumbnail on the output to generate a poster frame. ' +
    'Use that frame as thumbnail metadata for the merged video (do not present it as a separate deliverable unless requested).';
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
    const normalizedInput = normalizeFfmpegToolInput(input, {
      mapOutputFormatToOutputPath: true,
      defaultOutputBase: 'merged',
    });

    const normalizedInputPaths = Array.isArray(normalizedInput['inputPaths'])
      ? normalizedInput['inputPaths'].filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : [];

    if (normalizedInputPaths.length > 0 && normalizedInputPaths.length < 2) {
      return {
        success: false,
        error:
          'ffmpeg_merge_videos requires at least 2 inputPaths. Provide two or more video URLs/paths, e.g. inputPaths: ["clip1.mp4", "clip2.mp4"].',
      };
    }

    const parsed = MergeVideosInputSchema.safeParse(normalizedInput);
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
        data: {
          outputUrl,
          videoUrl: outputUrl,
          filesMerged: parsed.data.inputPaths.length,
          result,
        },
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
