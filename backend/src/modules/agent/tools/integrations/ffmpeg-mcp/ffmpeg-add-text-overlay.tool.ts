import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { type FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import { AddTextOverlayInputSchema } from './schemas.js';

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
    const parsed = AddTextOverlayInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

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
