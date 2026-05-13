import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { normalizeFfmpegToolInput } from './ffmpeg-input-normalizer.js';
import { AddTextOverlayInputSchema } from './schemas.js';

function readMaxOverlayDurationSeconds(): number {
  const rawValue = process.env['FFMPEG_MAX_TEXT_OVERLAY_DURATION_SECONDS'];
  if (!rawValue) return 15;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn('[FfmpegAddTextOverlayTool] Ignoring invalid max overlay duration', {
      value: rawValue,
      fallback: 15,
    });
    return 15;
  }

  return parsed;
}

function validateOverlayWindow(input: {
  readonly startTime?: number;
  readonly endTime?: number;
}): ToolResult | null {
  const maxDurationSeconds = readMaxOverlayDurationSeconds();

  if (input.startTime === undefined || input.endTime === undefined) {
    return {
      success: false,
      error:
        'ffmpeg_add_text_overlay requires startTime and endTime so it does not re-encode the entire video. Use a short overlay window or create a generate_graphic title card for full-reel branding.',
    };
  }

  if (input.endTime <= input.startTime) {
    return {
      success: false,
      error: 'ffmpeg_add_text_overlay requires endTime to be greater than startTime.',
    };
  }

  const durationSeconds = input.endTime - input.startTime;
  if (durationSeconds > maxDurationSeconds) {
    return {
      success: false,
      error:
        `ffmpeg_add_text_overlay is limited to ${maxDurationSeconds}s windows to avoid long full-video re-encodes. ` +
        `Requested ${durationSeconds}s. Use a shorter lower-third window or create a generate_graphic title card/intro for full-reel text.`,
    };
  }

  return null;
}

export class FfmpegAddTextOverlayTool extends BaseTool {
  readonly name = 'ffmpeg_add_text_overlay';
  readonly description =
    'Add a text overlay or watermark to a video with position, timing, and style controls.';
  readonly parameters = AddTextOverlayInputSchema;

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
    const parsed = AddTextOverlayInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return this.zodError(parsed.error);

    const overlayWindowError = validateOverlayWindow(parsed.data);
    if (overlayWindowError) return overlayWindowError;

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_add_text_overlay',
    });

    try {
      const result = await this.bridge.addTextOverlay(parsed.data, context);
      const outputUrl = result.outputUrl ?? result.output_path;
      return {
        success: true,
        // outputUrl: canonical field read by resultData facade mapping
        // videoUrl: promotes to ARTIFACT_KEYS for cross-agent handoff
        data: { outputUrl, videoUrl: outputUrl, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add text overlay';
      logger.error('[FfmpegAddTextOverlayTool] Failed', {
        error: message,
        userId: context?.userId,
      });
      return { success: false, error: message };
    }
  }
}
