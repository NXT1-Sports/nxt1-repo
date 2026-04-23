/**
 * @fileoverview Generate Captions Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Triggers AI-powered caption/subtitle generation for a Cloudflare Stream video.
 * Supports 12 languages. Captions are generated server-side using Cloudflare's
 * built-in Whisper model.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { GenerateCaptionsInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  pl: 'Polish',
  nl: 'Dutch',
  cs: 'Czech',
};

export class GenerateCaptionsTool extends BaseTool {
  readonly name = 'generate_captions';
  readonly description =
    'Generate AI-powered subtitles/captions for a video in Cloudflare Stream. ' +
    'Uses Cloudflare Whisper to transcribe audio. The video must be in "ready" state. ' +
    'Supported languages: English (en), Spanish (es), French (fr), German (de), ' +
    'Japanese (ja), Korean (ko), Portuguese (pt), Russian (ru), Italian (it), ' +
    'Polish (pl), Dutch (nl), Czech (cs). Default is English.';

  readonly parameters = GenerateCaptionsInputSchema;

  override readonly allowedAgents = [
    'brand_coordinator',
    'data_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly bridge: CloudflareMcpBridgeService;

  constructor(bridge: CloudflareMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GenerateCaptionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { videoId, language } = parsed.data;
    const languageLabel = LANGUAGE_LABELS[language] ?? language;

    logger.info('[GenerateCaptions] Starting generation', {
      videoId,
      language,
      userId: context?.userId,
    });
    context?.emitStage?.('processing_media', {
      icon: 'media',
      videoId,
      language,
      languageLabel,
      phase: 'generate_captions',
    });

    try {
      const caption = await this.bridge.generateCaptions(videoId, language);

      logger.info('[GenerateCaptions] Caption generation initiated', {
        videoId,
        language,
        status: caption.status,
      });

      return {
        success: true,
        data: {
          videoId,
          language,
          languageLabel,
          status: caption.status ?? 'generating',
          generated: caption.generated ?? true,
          message: `${languageLabel} caption generation started. Captions will be available shortly when the video player loads them automatically.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Caption generation failed';
      logger.error('[GenerateCaptions] Failed', { videoId, language, error: message });
      return { success: false, error: message };
    }
  }
}
