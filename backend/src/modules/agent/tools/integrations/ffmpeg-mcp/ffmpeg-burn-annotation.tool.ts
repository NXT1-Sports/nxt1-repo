import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { BurnAnnotationInputSchema } from './schemas.js';

function readMaxAnnotationDurationSeconds(): number {
  const rawValue = process.env['FFMPEG_MAX_ANNOTATION_BURN_DURATION_SECONDS'];
  if (!rawValue) return 45;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn('[FfmpegBurnAnnotationTool] Ignoring invalid max annotation duration', {
      value: rawValue,
      fallback: 45,
    });
    return 45;
  }

  return parsed;
}

function validateAnnotationWindow(input: {
  readonly startTime?: number;
  readonly endTime?: number;
}): ToolResult | null {
  if (input.startTime === undefined || input.endTime === undefined) {
    return null;
  }

  if (input.endTime <= input.startTime) {
    return {
      success: false,
      error: 'ffmpeg_burn_annotation requires endTime to be greater than startTime.',
    };
  }

  const durationSeconds = input.endTime - input.startTime;
  const maxDurationSeconds = readMaxAnnotationDurationSeconds();
  if (durationSeconds > maxDurationSeconds) {
    return {
      success: false,
      error:
        `ffmpeg_burn_annotation is limited to ${maxDurationSeconds}s windows when timed overlays are used. ` +
        `Requested ${durationSeconds}s. Trim the play first or burn the annotation into a shorter play window.`,
    };
  }

  return null;
}

function readOptionalTraceField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class FfmpegBurnAnnotationTool extends BaseTool {
  readonly name = 'ffmpeg_burn_annotation';
  readonly description =
    'Burn a film-review drawing annotation directly into a video clip using normalized bounds or path points. ' +
    'Use this for circled/highlighted plays before analyze_video so the model sees the annotation continuously in motion.';
  readonly parameters = BurnAnnotationInputSchema;

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
    const annotationDebugId = readOptionalTraceField(normalizedInput, 'annotationDebugId');
    const drawBounds = readOptionalTraceField(normalizedInput, 'drawBounds');
    const renderedDrawBounds = readOptionalTraceField(normalizedInput, 'renderedDrawBounds');
    const parsed = BurnAnnotationInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    const timingError = validateAnnotationWindow(parsed.data);
    if (timingError) return timingError;

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_burn_annotation',
    });

    try {
      const result = await this.bridge.burnAnnotation(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      logger.info('[FfmpegBurnAnnotationTool] Completed', {
        userId: context?.userId,
        threadId: context?.threadId,
        operationId: context?.operationId,
        sessionId: context?.sessionId,
        annotationDebugId,
        drawBounds,
        renderedDrawBounds,
        outputUrl,
        annotationKind: parsed.data.annotation.kind,
        annotationBounds: parsed.data.annotation.bounds,
        pointCount: parsed.data.annotation.points?.length ?? 0,
        strokeColor: parsed.data.strokeColor,
        strokeWidth: parsed.data.strokeWidth,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
      });
      return {
        success: true,
        data: { outputUrl, videoUrl: outputUrl, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to burn annotation';
      logger.error('[FfmpegBurnAnnotationTool] Failed', {
        error: message,
        userId: context?.userId,
        threadId: context?.threadId,
        operationId: context?.operationId,
        sessionId: context?.sessionId,
      });
      return { success: false, error: message };
    }
  }
}
