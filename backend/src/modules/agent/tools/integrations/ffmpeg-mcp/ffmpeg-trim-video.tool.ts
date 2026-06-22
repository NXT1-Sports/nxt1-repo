import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { TrimVideoInputSchema } from './schemas.js';
import { generateVideoThumbnail } from './ffmpeg-thumbnail-helper.js';

const MIN_PLAYABLE_TRIM_DURATION_SECONDS = 0.5;

function parseTimeSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric >= 0 ? numeric : null;

  const parts = trimmed.split(':');
  if (parts.length < 1 || parts.length > 3) return null;

  let totalSeconds = 0;
  for (const part of parts) {
    const parsed = Number(part);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    totalSeconds = totalSeconds * 60 + parsed;
  }

  return totalSeconds;
}

function normalizeTrimDuration(duration: string): string {
  const parsedSeconds = parseTimeSeconds(duration);
  if (
    parsedSeconds === null ||
    parsedSeconds === 0 ||
    parsedSeconds >= MIN_PLAYABLE_TRIM_DURATION_SECONDS
  ) {
    return duration;
  }

  return String(MIN_PLAYABLE_TRIM_DURATION_SECONDS);
}

export class FfmpegTrimVideoTool extends BaseTool {
  readonly name = 'ffmpeg_trim_video';
  readonly description =
    'Trim or preserve a source video range using start + end or start + duration. For short uploaded highlight clips, use startTime=0 and endTime equal to the source duration when preserving the full clip for merging.';
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
    const normalizedInput = this.normalizeTrimRequest(
      normalizeFfmpegToolInput(input, {
        coerceStringFields: ['startTime', 'endTime', 'duration'],
      })
    );
    const parsed = TrimVideoInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_trim_video',
    });

    try {
      const result = await this.bridge.trimVideo(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      const thumbnailUrl = outputUrl
        ? await this.generateTrimThumbnail(outputUrl, parsed.data.outputPath, context)
        : null;

      return {
        success: true,
        data: {
          outputUrl,
          videoUrl: outputUrl,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          result,
        },
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

  private async generateTrimThumbnail(
    trimmedVideoUrl: string,
    outputPath: string,
    context?: ToolExecutionContext
  ): Promise<string | null> {
    return generateVideoThumbnail({
      bridge: this.bridge,
      videoUrl: trimmedVideoUrl,
      outputPath,
      fallbackBase: 'output.mp4',
      context,
      logScope: 'FfmpegTrimVideoTool',
    });
  }

  private normalizeTrimRequest(input: Record<string, unknown>): Record<string, unknown> {
    const endTime = typeof input['endTime'] === 'string' ? input['endTime'].trim() : '';
    const duration = typeof input['duration'] === 'string' ? input['duration'].trim() : '';
    const normalizedDuration = duration ? normalizeTrimDuration(duration) : '';

    if (endTime && normalizedDuration) {
      const { duration: _duration, ...withoutDuration } = input;
      return withoutDuration;
    }

    if (!normalizedDuration || normalizedDuration === duration) return input;

    return {
      ...input,
      duration: normalizedDuration,
    };
  }
}
