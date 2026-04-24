/**
 * @fileoverview Generate Graphic Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Agent X tool for generating professional, branded sports graphics.
 * Replaces the generic GenerateImageTool with a structured, agnostic
 * design engine that compiles structured parameters (text, colors,
 * dimensions, subject images) into an elite creative brief for the
 * multimodal image model.
 *
 * Key design decisions:
 * - **Agnostic**: No hardcoded graphic types. Coaches, athletes, scouts,
 *   and programs all use the same tool with different inputs.
 * - **Team colors first**: The agent resolves the user's/team's actual
 *   hex colors and passes them via `themeColors`. No sport-color lookups.
 * - **NXT1 logo enforced**: Every generated graphic will include the
 *   NXT1 logo in the bottom-right corner via explicit prompt instructions
 *   and a reference image layer.
 * - **Dimension-aware**: The prompt compiler enforces exact canvas size
 *   and aspect ratio so the model outputs correctly formatted assets.
 */

import { getStorage } from 'firebase-admin/storage';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * NXT1 brand logo URLs stored in Firebase Storage.
 * The white variant is used on dark backgrounds (most sports graphics).
 * The regular variant is used on light backgrounds.
 */
const NXT1_LOGO = {
  white:
    'https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/brand-assets%2Freference%2Fnxt1-whitelogo.png?alt=media&token=3a1545b4-cf41-42fd-865f-211711cff93d',
  regular:
    'https://storage.googleapis.com/nxt-1-de054.appspot.com/brand-assets/reference/nxt1-logo.png',
} as const;

/**
 * Supported graphic dimension presets.
 * Agent X picks the right one based on the user's intent.
 */
const DIMENSION_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  '1080x1080': { width: 1080, height: 1080, label: 'Square (Instagram Post)' },
  '1080x1920': { width: 1080, height: 1920, label: 'Vertical Story (Instagram/TikTok)' },
  '1920x1080': { width: 1920, height: 1080, label: 'Landscape (YouTube/Twitter)' },
  '1200x675': { width: 1200, height: 675, label: 'Landscape Post (Twitter/LinkedIn)' },
  '1500x500': { width: 1500, height: 500, label: 'Banner (Twitter Header)' },
  '1080x1350': { width: 1080, height: 1350, label: 'Portrait (Instagram Portrait)' },
};

const GenerateGraphicInputSchema = z.object({
  textRequirements: z.array(z.string().trim().min(1)).min(1),
  themeColors: z.array(z.string().trim().min(1)).optional(),
  subjectImageUrl: z.string().trim().min(1).optional(),
  dimensions: z.enum(['1080x1080', '1080x1920', '1920x1080', '1200x675', '1500x500', '1080x1350']),
  styleDescription: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

// ─── Tool Implementation ────────────────────────────────────────────────────

export class GenerateGraphicTool extends BaseTool {
  readonly name = 'generate_graphic';
  readonly description =
    'Generates a professional, branded sports graphic with the NXT1 logo. ' +
    'Accepts structured design parameters (text, colors, dimensions, subject photo) ' +
    'and compiles them into a precise creative brief for the AI image model. ' +
    'Use for ANY visual content: game day graphics, player spotlights, commitment announcements, ' +
    'team promos, camp flyers, stat cards, scout report visuals, social media posts, ' +
    'welcome graphics, recruiting collateral, and any other branded visual asset. ' +
    'The NXT1 logo is automatically placed in the bottom-right corner of every graphic. ' +
    "Always provide the user's or team's actual brand colors via themeColors.";

  readonly parameters = GenerateGraphicInputSchema;

  override readonly allowedAgents = ['brand_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  constructor(private readonly llm: OpenRouterService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GenerateGraphicInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { textRequirements, themeColors, subjectImageUrl, dimensions, styleDescription, userId } =
      parsed.data;

    // ── Compile the creative brief ─────────────────────────────────────
    const preset = DIMENSION_PRESETS[dimensions];
    const hasSubjectImage =
      typeof subjectImageUrl === 'string' && subjectImageUrl.trim().length > 0;
    const prompt = this.compileDesignBrief({
      textRequirements,
      themeColors,
      dimensions: preset,
      styleDescription,
      hasSubjectImage,
    });

    // ── Generate the graphic ───────────────────────────────────────────
    try {
      context?.emitStage?.('processing_media', {
        icon: 'media',
        dimensions,
        hasSubjectImage,
        phase: 'compose_brief',
      });

      context?.emitStage?.('processing_media', {
        icon: 'media',
        dimensions,
        hasSubjectImage,
        phase: 'generate_image',
      });

      const result = await this.llm.generateImage({
        prompt,
        referenceImageUrl: typeof subjectImageUrl === 'string' ? subjectImageUrl : undefined,
        additionalImageUrls: [NXT1_LOGO.white],
        signal: context?.signal,
        telemetryContext: {
          operationId: '',
          userId,
          agentId: 'brand_coordinator',
          feature: 'generate-graphic',
        },
      });

      // ── Upload to Firebase Storage ─────────────────────────────────
      context?.emitStage?.('uploading_assets', {
        icon: 'upload',
        dimensions,
        phase: 'upload_graphic',
      });
      const timestamp = Date.now();
      const extension = result.mimeType === 'image/jpeg' ? 'jpg' : 'png';

      // Thread-scoped staging: media shares the thread's lifecycle and is
      // bulk-deleted when the thread expires. Falls back to the legacy
      // agent-graphics/ path only when no thread context is available.
      const filePath =
        context?.userId && context?.threadId
          ? `Users/${context.userId}/threads/${context.threadId}/media/${timestamp}-graphic.${extension}`
          : `agent-graphics/${userId}/${timestamp}-graphic.${extension}`;

      const bucket = getStorage().bucket();
      const file = bucket.file(filePath);
      const imageBuffer = Buffer.from(result.imageBase64, 'base64');

      await file.save(imageBuffer, {
        contentType: result.mimeType,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      });

      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      return {
        success: true,
        data: {
          imageUrl: publicUrl,
          storagePath: filePath,
          mimeType: result.mimeType,
          dimensions: `${preset.width}x${preset.height}`,
          model: result.model,
          latencyMs: result.latencyMs,
          costUsd: result.costUsd,
          textContent: result.textContent,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Graphic generation failed';
      return { success: false, error: message };
    }
  }

  // ─── Private: Prompt Compiler ───────────────────────────────────────────

  /**
   * Compiles structured graphic parameters into a precise, deterministic
   * design brief for the multimodal image model.
   */
  private compileDesignBrief(params: {
    textRequirements: string[];
    themeColors?: string[];
    dimensions: { width: number; height: number; label: string };
    styleDescription: string;
    hasSubjectImage: boolean;
  }): string {
    const { textRequirements, themeColors, dimensions, styleDescription, hasSubjectImage } = params;

    const prompt = {
      '🚨_STOP_AND_READ': {
        THIS_IS_NOT_IMAGE_GENERATION: true,
        THIS_IS_PHOTO_EDITING: hasSubjectImage,
        WHAT_YOU_MUST_DO: hasSubjectImage
          ? 'Take the REAL PERSON from the attached photo and put them in a sports graphic'
          : 'Design a graphic containing ONLY the text instructed',
        THE_ATTACHED_PHOTO: hasSubjectImage
          ? 'Contains the ACTUAL ATHLETE - a real human being who must appear in your output'
          : 'NXT1 Logo',
        YOUR_OUTPUT_MUST_SHOW: hasSubjectImage
          ? 'The EXACT SAME PERSON from the input photo - same face, same hair, same skin, same body'
          : 'A professional graphic without hallucinating any individuals',
        IF_YOU_GENERATE_A_DIFFERENT_PERSON: hasSubjectImage
          ? 'You have COMPLETELY FAILED the task'
          : undefined,
        THINK_OF_IT_AS: hasSubjectImage
          ? 'Photoshop compositing - cut out the person and place them in a new designed background'
          : 'Graphic design layout and composition',
        TEXT_ACCURACY: 'ALL text must be spelled EXACTLY as provided - ZERO TYPOS',
        STYLE_VS_CONTENT:
          "If user mentions a style/theme (like 'Star Wars'), use it as VISUAL INSPIRATION only - NEVER put style names as text on the graphic",
      },
      TASK_TYPE: hasSubjectImage ? 'IMAGE_EDITING_WITH_REAL_PHOTO' : 'GRAPHIC_DESIGN',
      CRITICAL_UNDERSTANDING: {
        what_this_is: hasSubjectImage ? 'IMAGE EDITING - NOT IMAGE GENERATION' : 'GRAPHIC DESIGN',
        the_attached_image: hasSubjectImage
          ? 'Contains the REAL athlete who MUST appear in the final graphic'
          : 'Only the NXT1 watermark is required',
        your_job: hasSubjectImage
          ? 'Edit/composite the PROVIDED photo into a professional sports graphic'
          : 'Layout text logically onto the specified dimensions',
        NOT_your_job: 'Generate a new person, create a random athlete, or use stock imagery',
        failure_condition: hasSubjectImage
          ? 'If the final image shows a different person than the attached photo, you have FAILED the task'
          : undefined,
        text_requirement: 'ALL text must be spelled EXACTLY as provided - no typos, no changes',
        style_theme_rule: 'Style references are for VISUAL STYLE only - NEVER display them as text',
      },

      content: {
        text_requirements: textRequirements,
        content_rules: [
          'ONLY display the required text provided - nothing extra',
          'DO NOT invent or add information not provided',
          'DO NOT add stats, GPA, height, weight unless explicitly requested',
        ],
      },

      style_theme_instructions: {
        '⚠️_CRITICAL_DISTINCTION': {
          THIS_IS_STYLE_NOT_CONTENT: true,
          explanation:
            'The following are VISUAL DESIGN instructions, NOT text to put on the graphic',
          example_correct:
            "If user says 'neon style' - create a neon AESTHETIC, do NOT write 'neon' as text",
        },
        visual_style: styleDescription,
        color_palette: themeColors || ['Use natural sporting colors'],
      },

      technical_specs: {
        dimensions: {
          width: dimensions.width,
          height: dimensions.height,
        },
        quality: 'ultra_high_resolution',
        format: dimensions.label,
      },

      nxt1_branding: {
        MANDATORY: 'THE NXT1 LOGO IMAGE MUST APPEAR AS A SMALL TAG/WATERMARK',
        placement: 'Bottom-right corner (ALWAYS) - small watermark position',
        sizing_guidelines: {
          width: 'SMALL - approximately 4-6% of the graphic width',
        },
        rules: [
          'USE THE PROVIDED NXT1 LOGO IMAGE EXACTLY - do not recreate or modify it',
          'Position in bottom-right corner always',
          'Should be barely noticeable - subtle professional touch',
        ],
      },

      text_accuracy_rules: {
        CRITICAL: 'ALL TEXT MUST BE SPELLED EXACTLY CORRECT - ZERO TYPOS ALLOWED',
        rules: [
          'Copy ALL text character-for-character from textRequirements',
          'DO NOT change spelling of names, schools, or any text',
          'DO NOT invent or guess any text - only use what is provided',
          'Double-check every word before rendering it',
        ],
      },

      CRITICAL_RULES: [
        hasSubjectImage
          ? '⚠️ EXTRACT the person from the attached photo and USE THEM in the graphic'
          : undefined,
        hasSubjectImage
          ? '⚠️ DO NOT generate a new person, random athlete, or stock photo look'
          : undefined,
        '⚠️ TEXT ACCURACY: All text must be spelled EXACTLY as provided - NO TYPOS',
        '⚠️ NXT1 logo: Use the PROVIDED image as a SMALL watermark in bottom-right corner',
        '⚠️ CONTENT: ONLY display the text provided',
      ].filter(Boolean),

      before_outputting_verify: [
        hasSubjectImage
          ? 'Is the person in my output the SAME person from the input photo?'
          : undefined,
        hasSubjectImage ? 'Did I use their actual face, not generate a new one?' : undefined,
        'Is ALL TEXT spelled exactly correct with ZERO typos?',
        'Did I ONLY include the requested text?',
        'Is the NXT1 logo SMALL (watermark-sized) in the bottom-right corner?',
      ].filter(Boolean),

      avoid: [
        hasSubjectImage
          ? '🚫 GENERATING A DIFFERENT PERSON - This is the #1 failure mode'
          : undefined,
        hasSubjectImage ? '🚫 AI-generated faces, bodies, or people' : undefined,
        '🚫 MISSPELLING ANY TEXT - must be exact',
        '🚫 TYPOS of any kind in any text element',
        'Amateur or template-looking design',
        'Large NXT1 logo - it should be a small watermark only',
        'Cluttered with unnecessary information',
      ].filter(Boolean),
    };

    return JSON.stringify(prompt, null, 2);
  }
}
