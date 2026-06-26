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
import { MediaTransportResolverService } from './media-transport-resolver.service.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_IMAGES_PER_REQUEST = 10;
const IMAGE_FETCH_TIMEOUT_MS = 45_000;

/** Vision requests are fast — cap at 60 s to avoid hanging the agent loop. */
const VISION_TIMEOUT_MS = 60_000;

interface PreparedVisionImage {
  readonly originalUrl: string;
  readonly providerUrl: string;
  readonly source: 'data_url' | 'remote_url';
}

interface SkippedVisionImage {
  readonly url: string;
  readonly reason: string;
}

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
    '- Verifying that a scraped tactical board or play diagram actually matches the requested sport, concept, routes, and structure\n' +
    '- Identifying sport, position indicators, and recruiting photo suitability\n' +
    '- Do NOT use this tool for NXT1 film-review drawing workflows. When a user circles, highlights, or marks a\n' +
    '  play in the film review panel, use ffmpeg_burn_annotation to burn the structured annotation into the clip and\n' +
    '  then run analyze_video on the annotated video. The flattened annotated snapshot is reference-only in that\n' +
    '  workflow and should not be the primary analysis path.\n' +
    "\nFor athlete intel enrichment: call analyze_image on the athlete's profileImgs and recent image Posts " +
    '(cap at 5 images) before generating scouting assessments. Pass visionSummary output to write_athlete_images.\n' +
    '\nFor data verification: after scraping a profile and discovering images, call analyze_image to confirm ' +
    'sport/subject match before persisting. Reject only on clear sport mismatch — flag ambiguous cases.';

  readonly parameters = AnalyzeImageInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(
    private readonly llm: OpenRouterService,
    private readonly transportResolver: MediaTransportResolverService = new MediaTransportResolverService()
  ) {
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

    // ── Resolve + inline images. Providers regularly fail to fetch long signed
    // Firebase/GCS URLs, so the backend downloads the image once and sends a
    // data URL to the vision model whenever possible.
    const preparedResults = await Promise.all(
      imageUrls.map(async (url) => {
        try {
          return await this.prepareVisionImage(url, context);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.warn('[AnalyzeImageTool] Image preparation failed, skipping image', {
            url: url.slice(0, 180),
            error: reason,
          });
          return { url, reason } satisfies SkippedVisionImage;
        }
      })
    );

    const preparedImages = preparedResults.filter(
      (result): result is PreparedVisionImage => 'providerUrl' in result
    );
    const skippedImages = preparedResults.filter(
      (result): result is SkippedVisionImage => 'reason' in result
    );

    if (preparedImages.length === 0) {
      return {
        success: false,
        error:
          'I could not access any of the image URLs for vision analysis. Please provide a downloadable JPG, PNG, or WebP image.',
      };
    }

    // ── Build multimodal message ────────────────────────────────────────────
    const contentParts: LLMContentPart[] = preparedImages.map((image) => ({
      type: 'image_url' as const,
      image_url: { url: image.providerUrl, detail: 'auto' as const },
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
          'For tactical play-diagram verification requests: confirm whether the image is truly an X-and-O diagram/board, ' +
          'whether the sport matches, and whether the visible formation/routes/assignments materially match the requested concept. ' +
          'If the request asks for a verdict, use a strict coaching standard: return FAIL whenever the concept match is partial, generic, blurry, ambiguous, or unsupported by visible evidence. ' +
          'Never pass a diagram simply because it is sports-related. ' +
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
        ...(context?.operationId && context.userId
          ? {
              telemetryContext: {
                operationId: context.operationId,
                userId: context.userId,
                agentId: 'data_coordinator',
                feature: 'image-analysis',
              },
            }
          : {}),
      });

      // ── Extract text response ─────────────────────────────────────────────
      const analysisText = typeof result.content === 'string' ? result.content : '';

      logger.info('[AnalyzeImageTool] Image analysis complete', {
        imageCount: preparedImages.length,
        skippedImageCount: skippedImages.length,
        responseLength: analysisText.length,
      });

      return {
        success: true,
        data: {
          analysis: analysisText,
          imageCount: preparedImages.length,
          imageUrls,
          skippedImages,
        },
        markdown: `## Image Analysis (${preparedImages.length} image${preparedImages.length === 1 ? '' : 's'})\n\n${analysisText}`,
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

  private async prepareVisionImage(
    sourceUrl: string,
    context?: ToolExecutionContext
  ): Promise<PreparedVisionImage> {
    const resolved = await this.transportResolver.resolveProcessingUrl({
      sourceUrl,
      fallbackToFirebaseStaging: true,
      preferFreshFirebaseSignedUrl: true,
      stageMediaKind: 'image',
      executionContext: context,
    });

    const providerUrl = await this.toImageDataUrl(resolved.url);
    return {
      originalUrl: sourceUrl,
      providerUrl,
      source: 'data_url',
    };
  }

  private async toImageDataUrl(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'NXT1-AgentX/2026.1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Image fetch failed with status ${response.status}`);
    }

    const mimeType = this.resolveImageMimeType(response.headers.get('content-type'), url);
    const bytes = Buffer.from(await response.arrayBuffer());

    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  }

  private resolveImageMimeType(contentType: string | null, url: string): string {
    const normalized = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (normalized.startsWith('image/')) return normalized;

    const path = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    })();

    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }
}
