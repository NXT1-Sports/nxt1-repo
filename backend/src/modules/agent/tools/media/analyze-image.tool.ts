/**
 * @fileoverview Analyze Image Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Agent X tool for analyzing one or more images via OpenRouter's vision models
 * using the existing `vision_analysis` model tier (Gemini 3.1 Pro / GPT-4o).
 *
 * Use cases:
 * - Verify a scraped image actually belongs to the target athlete
 *   (jersey number match, sport context, correct subject)
 * - Classify image kind: action_shot, headshot, team_photo, graphic, banner
 * - Extract visual evidence for intel reports: technique, body composition,
 *   physicality, uniform details, game context, field/court position
 * - Quality-gate images before persisting to Firebase via write_athlete_images
 * - Identify sport, position indicators, and recruiting photo standards
 *
 * Accepts up to 10 public image URLs per call. Sends them as `image_url`
 * content parts alongside a user-supplied analysis prompt.
 *
 * The `vision_analysis` tier is automatically applied — no caller configuration
 * needed. Falls through to `openai/gpt-4o` in dev and Gemini 3.1 Pro in prod.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMContentPart, LLMMessage } from '../../llm/llm.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_IMAGES_PER_REQUEST = 10;

/** Vision requests are fast — cap at 60 s to avoid hanging the agent loop. */
const VISION_TIMEOUT_MS = 60_000;

// ─── Input Schema ────────────────────────────────────────────────────────────

const AnalyzeImageInputSchema = z.object({
  imageUrls: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_IMAGES_PER_REQUEST)
    .describe(
      `Array of public image URLs to analyze (max ${MAX_IMAGES_PER_REQUEST}). ` +
        'Firebase Storage signed URLs, CDN links, and standard HTTPS URLs are all accepted.'
    ),
  prompt: z
    .string()
    .trim()
    .min(1)
    .describe(
      'What to analyze or extract from the image(s). ' +
        'Be specific: e.g. "Verify this is a football action shot showing jersey #12", ' +
        '"Classify each image as action_shot, headshot, or team_photo and note any quality issues", ' +
        '"Identify the sport, position, and whether the athlete\'s face is clearly visible."'
    ),
});

// ─── Tool ────────────────────────────────────────────────────────────────────

export class AnalyzeImageTool extends BaseTool {
  readonly name = 'analyze_image';

  readonly description =
    'Analyzes one or more images using AI vision (Gemini / GPT-4o). ' +
    'Accepts up to 10 public image URLs and returns structured observations based on the prompt. ' +
    '\n\nUse for:\n' +
    '- Verifying a scraped image belongs to the target athlete (jersey number, sport context, correct subject)\n' +
    '- Classifying image kind: action_shot, headshot, team_photo, graphic, banner\n' +
    '- Extracting visual evidence for intel reports: technique, physicality, body composition, uniform details\n' +
    '- Quality-gating images before saving to the athlete profile via write_athlete_images\n' +
    '- Identifying sport, position indicators, and recruiting photo suitability\n' +
    "\nFor athlete intel enrichment: call analyze_image on the athlete's profileImgs and recent image Posts " +
    '(cap at 5 images) before generating scouting assessments. Pass visionSummary output to write_athlete_images.\n' +
    '\nFor data verification: after scraping a profile and discovering images, call analyze_image to confirm ' +
    'sport/subject match before persisting. Reject only on clear sport mismatch — flag ambiguous cases.';

  readonly parameters = AnalyzeImageInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly llm: OpenRouterService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = AnalyzeImageInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { imageUrls, prompt } = parsed.data;

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'analyze_image',
      imageCount: imageUrls.length,
    });

    // ── Build multimodal message ────────────────────────────────────────────
    const contentParts: LLMContentPart[] = imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'auto' as const },
    }));
    contentParts.push({ type: 'text', text: prompt });

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          'You are an expert sports image analyst and talent scout. ' +
          'Analyze images with precision and objectivity — describe only what is directly visible. ' +
          'For athlete images: identify sport, jersey number (if visible), position indicators, ' +
          'body mechanics, physicality, and whether the image is suitable for a recruiting profile. ' +
          'Classify image kind (action_shot, headshot, team_photo, graphic, banner). ' +
          'Flag sport mismatches or wrong subjects with explicit reasoning. ' +
          'For quality assessment: note resolution, lighting, subject clarity, and occlusion. ' +
          'Be specific and evidence-based. Do not speculate beyond what is clearly visible.',
      },
      { role: 'user', content: contentParts },
    ];

    try {
      const result = await this.llm.complete(messages, {
        tier: 'vision_analysis',
        maxTokens: 2048,
        temperature: 0.2,
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        telemetryContext: context?.userId
          ? {
              operationId: context.sessionId ?? '',
              userId: context.userId,
              agentId: 'data_coordinator',
              feature: 'image-analysis',
            }
          : undefined,
      });

      // ── Extract text response ─────────────────────────────────────────────
      const analysisText = typeof result.content === 'string' ? result.content : '';

      logger.info('[AnalyzeImageTool] Image analysis complete', {
        imageCount: imageUrls.length,
        responseLength: analysisText.length,
      });

      return {
        success: true,
        data: {
          analysis: analysisText,
          imageCount: imageUrls.length,
          imageUrls,
        },
        markdown: `## Image Analysis (${imageUrls.length} image${imageUrls.length === 1 ? '' : 's'})\n\n${analysisText}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image analysis failed';
      logger.error('[AnalyzeImageTool] Analysis failed', {
        error: message,
        imageCount: imageUrls.length,
      });
      return { success: false, error: message };
    }
  }
}
