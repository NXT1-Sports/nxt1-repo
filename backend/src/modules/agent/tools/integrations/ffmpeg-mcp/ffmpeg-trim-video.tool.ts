import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { TrimVideoInputSchema } from './schemas.js';

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
      return {
        success: true,
        data: { outputUrl, videoUrl: outputUrl, result },
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

  private normalizeTrimRequest(input: Record<string, unknown>): Record<string, unknown> {
    const endTime = typeof input['endTime'] === 'string' ? input['endTime'].trim() : '';
    const duration = typeof input['duration'] === 'string' ? input['duration'].trim() : '';
    if (!endTime || !duration) return input;

    const { duration: _duration, ...withoutDuration } = input;
    return withoutDuration;
  }
}
