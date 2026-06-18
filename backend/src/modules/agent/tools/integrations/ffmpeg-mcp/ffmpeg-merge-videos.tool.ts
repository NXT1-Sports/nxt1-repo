import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { MergeVideosInputSchema } from './schemas.js';
import { generateVideoThumbnail } from './ffmpeg-thumbnail-helper.js';

export class FfmpegMergeVideosTool extends BaseTool {
  readonly name = 'ffmpeg_merge_videos';
  readonly description =
    'Merge multiple videos into a single output video file. ' +
    'Defaults to concat_filter which re-encodes all inputs to a common codec/timebase — ' +
    'safe for clips from different sources, resolutions, or that have been resized/trimmed. ' +
    'The backend automatically normalizes audio/video, adds silent audio for no-audio clips, and batches large input lists; do not manually split a highlight reel unless the tool returns an explicit failure. ' +
    'Do not use concat_demuxer as a fallback for professional reels; audio-less intro graphics are supported and should stay in the reel. ' +
    'For branded highlight reels with a Runway/graphic intro as the first input, set maxIntroSeconds to 4 so the opener cannot freeze past the intended timeline. ' +
    'For branded reels, the generated intro-card image is the canonical poster/thumbnail for the merged video. ' +
    'After merging, still call ffmpeg_generate_thumbnail on the output for playback validation and as a fallback poster frame. ' +
    'Use poster/thumbnail images as metadata for the merged video (do not present them as separate deliverables unless requested).';
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
      const mergeInput = {
        ...parsed.data,
        method: 'concat_filter' as const,
      };
      const result = await this.bridge.mergeVideos(mergeInput, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      const thumbnailUrl = await generateVideoThumbnail({
        bridge: this.bridge,
        videoUrl: outputUrl,
        outputPath: parsed.data.outputPath,
        fallbackBase: 'merged.mp4',
        context,
        logScope: 'FfmpegMergeVideosTool',
      });
      return {
        success: true,
        data: {
          outputUrl,
          videoUrl: outputUrl,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          filesMerged: parsed.data.inputPaths.length,
          result,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to merge videos';
      const publicMessage = formatMergeFailureForAgent(message);
      logger.error('[FfmpegMergeVideosTool] Failed', {
        error: message,
        publicError: publicMessage,
        userId: context?.userId,
      });
      return { success: false, error: publicMessage };
    }
  }
}

function formatMergeFailureForAgent(message: string): string {
  if (/audio|stream specifier|matches no streams|no such filter|concat/i.test(message)) {
    return 'Video merge failed during media normalization. Audio-less clips are supported by this pipeline; retry the same reel with the standard concat_filter/re-encode path and keep the branded intro unless its video file itself is unreadable.';
  }

  if (/moov atom|invalid data|error opening input|could not open|not found/i.test(message)) {
    return 'Video merge failed because one source clip could not be opened as a playable video. Re-stage or regenerate that specific source clip, then retry the full merge.';
  }

  return 'Video merge failed before a playable reel could be produced. Retry once with the standard re-encode merge path; if it fails again, report that the media pipeline could not produce a valid video.';
}
