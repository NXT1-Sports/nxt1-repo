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

  readonly parameters = {
    type: 'object',
    properties: {
      textRequirements: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of strings detailing all text that must appear on the graphic. ' +
          'Includes headlines, names, stats, quotes, etc. ' +
          'Example: ["GAME DAY", "John Doe", "Vs Local High School", "7:00 PM"]',
      },
      themeColors: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of 2-4 hex color codes representing the brand palette for this graphic. ' +
          "Use the user's or team's actual colors first. " +
          'First color = primary/dominant, second = secondary/accent. ' +
          'Example: ["#FF6B35", "#004E89", "#FFFFFF"]',
      },
      subjectImageUrl: {
        type: 'string',
        description:
          'Optional public URL of an image to feature in the graphic. ' +
          'Typically an athlete photo, team logo, or facility image. ' +
          'The model will composite this into the design.',
      },
      dimensions: {
        type: 'string',
        enum: Object.keys(DIMENSION_PRESETS),
        description:
          'Canvas dimensions as "WIDTHxHEIGHT". Determines the output size and aspect ratio. ' +
          'Common values: "1080x1080" (square post), "1080x1920" (story), ' +
          '"1920x1080" (landscape), "1500x500" (banner).',
      },
      styleDescription: {
        type: 'string',
        description:
          'Free-form creative direction for the visual style. ' +
          'Examples: "dark moody with neon accents", "clean minimal white background", ' +
          '"gritty urban texture with smoke effects", "premium Nike-style with bold typography", ' +
          '"bright energetic with geometric patterns". ' +
          'Be specific about textures, lighting, typography style, and overall mood.',
      },
      userId: {
        type: 'string',
        description: 'The user ID this graphic is being generated for (used in storage path).',
      },
    },
    required: ['textRequirements', 'dimensions', 'styleDescription', 'userId'],
  } as const;

  override readonly allowedAgents = ['brand_media_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  constructor(private readonly llm: OpenRouterService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const textRequirements = input['textRequirements'];
    const themeColors = input['themeColors'];
    const subjectImageUrl = input['subjectImageUrl'];
    const dimensions = input['dimensions'];
    const styleDescription = input['styleDescription'];
    const userId = input['userId'];

    // ── Input validation ───────────────────────────────────────────────
    if (!Array.isArray(textRequirements) || textRequirements.length === 0) {
      return {
        success: false,
        error: 'Parameter "textRequirements" is required and must be a non-empty array.',
      };
    }
    if (typeof dimensions !== 'string' || !DIMENSION_PRESETS[dimensions]) {
      return {
        success: false,
        error: `Parameter "dimensions" must be one of: ${Object.keys(DIMENSION_PRESETS).join(', ')}`,
      };
    }
    if (typeof styleDescription !== 'string' || styleDescription.trim().length === 0) {
      return { success: false, error: 'Parameter "styleDescription" is required.' };
    }
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return { success: false, error: 'Parameter "userId" is required.' };
    }
    if (themeColors !== undefined && !Array.isArray(themeColors)) {
      return {
        success: false,
        error: 'Parameter "themeColors" must be an array of hex color strings.',
      };
    }
    if (subjectImageUrl !== undefined && typeof subjectImageUrl !== 'string') {
      return { success: false, error: 'Parameter "subjectImageUrl" must be a string URL.' };
    }

    // ── Compile the creative brief ─────────────────────────────────────
    const preset = DIMENSION_PRESETS[dimensions];
    const hasSubjectImage =
      typeof subjectImageUrl === 'string' && subjectImageUrl.trim().length > 0;
    const prompt = this.compileDesignBrief({
      textRequirements: textRequirements as string[],
      themeColors: Array.isArray(themeColors) ? (themeColors as string[]) : undefined,
      dimensions: preset,
      styleDescription: (styleDescription as string).trim(),
      hasSubjectImage,
    });

    // ── Generate the graphic ───────────────────────────────────────────
    try {
      const progress = context?.onProgress;
      progress?.('Composing creative brief…');

      progress?.('Generating image with AI…');

      const result = await this.llm.generateImage({
        prompt,
        referenceImageUrl: typeof subjectImageUrl === 'string' ? subjectImageUrl : undefined,
        additionalImageUrls: [NXT1_LOGO.white],
        signal: context?.signal,
        telemetryContext: {
          operationId: '',
          userId: userId as string,
          agentId: 'brand_media_coordinator',
          feature: 'generate-graphic',
        },
      });

      // ── Upload to Firebase Storage ─────────────────────────────────
      progress?.('Uploading to CDN…');
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
