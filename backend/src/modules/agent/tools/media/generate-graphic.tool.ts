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
 * - **Creative-first visuals**: The model is free to choose an original,
 *   context-appropriate palette from the style direction and content.
 * - **Source-image fidelity**: When a subject image is provided, the output
 *   must preserve that exact person and avoid synthetic replacement.
 * - **Dimension-aware**: The prompt compiler enforces exact canvas size
 *   and aspect ratio so the model outputs correctly formatted assets.
 */

import { getStorage } from 'firebase-admin/storage';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_LOGO_CANDIDATE_PATHS = [
  resolve(TOOL_DIR, '../../../../../../packages/design-tokens/assets/logo/nxt1-whitelogo.png'),
  resolve(TOOL_DIR, '../../../../../../dist/packages/design-tokens/assets/logo/nxt1-whitelogo.png'),
] as const;
const STORAGE_LOGO_CANDIDATE_PATHS = [
  'brand-assets/reference/nxt1-whitelogo.png',
  'brand-assets/reference/nxt1-logo.png',
  'brand-assets/logo/nxt1-whitelogo.png',
  'brand-assets/nxt1-whitelogo.png',
] as const;
const LOGO_WIDTH_RATIO = 0.05;
const LOGO_MARGIN_RATIO = 0.015;

const DisplayTextIntentSchema = z.object({
  displayText: z.array(z.string().trim().min(1)).default([]),
  styleDirective: z.string().trim().nullable().optional(),
  reasoning: z.string().trim().optional(),
});

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
  graphicType: z.enum(['athlete', 'team']).default('athlete'),
  textRequirements: z.array(z.string().trim().min(1)).default([]),
  athleteInfo: z
    .object({
      name: z.string().trim().min(1).optional(),
      sport: z.string().trim().min(1).optional(),
      position: z.string().trim().min(1).optional(),
      team: z.string().trim().min(1).optional(),
    })
    .optional(),
  teamInfo: z
    .object({
      name: z.string().trim().min(1).optional(),
      sport: z.string().trim().min(1).optional(),
      subtitle: z.string().trim().min(1).optional(),
    })
    .optional(),
  subjectImageUrl: z.string().trim().min(1).optional(),
  dimensions: z.enum(['1080x1080', '1080x1920', '1920x1080', '1200x675', '1500x500', '1080x1350']),
  styleDescription: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

// ─── Tool Implementation ────────────────────────────────────────────────────

export class GenerateGraphicTool extends BaseTool {
  readonly name = 'generate_graphic';
  readonly description =
    'Generates a professional sports graphic using structured parameters (text, dimensions, style, subject photo). ' +
    'When a subject photo is provided, the output must preserve that exact person and avoid synthetic replacement. ' +
    'Use for game day graphics, player spotlights, announcements, stat cards, and social assets.';
  readonly parameters = GenerateGraphicInputSchema;

  override readonly allowedAgents = ['brand_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;

  constructor(
    private readonly llm: OpenRouterService,
    _db: Firestore = getFirestore()
  ) {
    super();
  }

  /** Fetches the NXT1 logo buffer from local disk or Firebase Storage. */
  private async fetchLogoBuffer(): Promise<Buffer | null> {
    for (const localPath of LOCAL_LOGO_CANDIDATE_PATHS) {
      try {
        const buf = await readFile(localPath);
        if (buf.length > 0) return buf;
      } catch {
        // Try next candidate
      }
    }
    try {
      const bucket = getStorage().bucket();
      for (const storagePath of STORAGE_LOGO_CANDIDATE_PATHS) {
        try {
          const file = bucket.file(storagePath);
          const [exists] = await file.exists();
          if (!exists) continue;
          const [buffer] = await file.download();
          if (buffer.length > 0) return buffer;
        } catch {
          // Try next candidate
        }
      }
    } catch {
      // Storage unavailable — skip logo
    }
    return null;
  }

  /** Stamps the NXT1 logo in the bottom-right corner via Sharp compositing. */
  private async stampLogoBottomRight(baseImage: Buffer, logoPng: Buffer): Promise<Buffer> {
    const meta = await sharp(baseImage).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) return baseImage;

    const targetLogoWidth = Math.max(36, Math.round(width * LOGO_WIDTH_RATIO));
    const margin = Math.max(10, Math.round(width * LOGO_MARGIN_RATIO));

    const logoResized = await sharp(logoPng)
      .resize({ width: targetLogoWidth, fit: 'contain' })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoResized).metadata();
    const logoWidth = logoMeta.width ?? targetLogoWidth;
    const logoHeight = logoMeta.height ?? targetLogoWidth;
    const left = Math.max(0, width - logoWidth - margin);
    const top = Math.max(0, height - logoHeight - margin);

    return sharp(baseImage)
      .composite([{ input: logoResized, left, top }])
      .toBuffer();
  }

  /**
   * Legacy parity: use an intermediate LLM pass to classify literal display
   * copy vs style language so style terms are not rendered as headline text.
   */
  private async parseDisplayTextIntent(
    textRequirements: readonly string[],
    styleDescription: string,
    userId: string,
    context?: ToolExecutionContext
  ): Promise<string[]> {
    if (!textRequirements.length) {
      return [];
    }

    const systemPrompt = `You classify items in a sports graphic's textRequirements array.
Your job: decide which items should be PRINTED as visible text on the graphic, and which are actually style/theme direction that was accidentally placed here.

DISPLAY TEXT = exact words that belong on the graphic: athlete names, school names, positions, stats, action words like "COMMITTED" or "SIGNED", jersey numbers, dates.

STYLE DIRECTION = visual mood/aesthetic/theme words that describe HOW the graphic looks, NOT what it says. These must NEVER be printed as text.

STYLE DIRECTION examples (always remove from displayText):
- Any theme/aesthetic label: "galaxy", "fire", "neon", "cyber", "glitch", "retro", "cinematic", "ice", "smoke", "chrome", "electric", "grunge", "dark", "gold"
- Compound style phrases: "redhot galaxy", "neon cyber", "fire theme", "galaxy style", "dark mode", "bold style"
- Descriptive design words: "style", "theme", "aesthetic", "vibe", "design", "look", "mood", "background"
- Directives: anything starting with "make", "create", "design", "use", "with", "in a", "give it"

DISPLAY TEXT examples (always keep):
- Names: "JOHN SMITH", "MIKE JOHNSON"
- Schools/teams: "OHIO STATE", "CAROLINA FOOTBALL"
- Positions/roles: "WIDE RECEIVER", "LINEBACKER", "CLASS OF 2026"
- Action words: "COMMITTED", "SIGNED", "WELCOME", "ALL-STATE"
- Stats: "6'4" 215 LBS", "4.4 40-YD DASH", "#1 IN STATE"

GENERIC PLACEHOLDERS (remove unless replaced by actual info):
- "athlete", "player", "recruit", "prospect", "team", "program", "squad"
- "elite athlete", "top athlete", "star player", "future star"

CRITICAL: If any item contains style/theme/aesthetic language mixed with real content, extract ONLY the real content.
Example: "FIRE THEME - JOHN SMITH" → keep only "JOHN SMITH"
Example: "ELITE ATHLETE REDHOT GALAXY" → keep only "ELITE ATHLETE"

CRITICAL: Do NOT keep generic labels without real identity data.
"ATHLETE" by itself is not valid display text.

Return JSON only. No explanation outside the JSON.`;

    const userPrompt = JSON.stringify(
      {
        textRequirements,
        styleDescription,
      },
      null,
      2
    );

    try {
      const parsed = await this.llm.prompt(systemPrompt, userPrompt, {
        tier: 'prompt_engineering',
        temperature: 0.1,
        maxTokens: 300,
        jsonMode: true,
        outputSchema: {
          name: 'graphic_display_text_intent',
          schema: DisplayTextIntentSchema,
          strict: true,
        },
        signal: context?.signal,
        telemetryContext: {
          operationId: '',
          userId,
          agentId: 'brand_coordinator',
          feature: 'generate-graphic-intent-parser',
        },
      });

      const displayText = parsed.parsedOutput?.displayText ?? [];
      const fallbackSanitized = this.sanitizeDisplayTextRequirements(textRequirements);
      const finalText = displayText
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 8);

      return finalText.length > 0 ? finalText : fallbackSanitized;
    } catch {
      return this.sanitizeDisplayTextRequirements(textRequirements);
    }
  }

  /**
   * Filters out likely style directives from text requirements so only
   * true on-canvas copy is rendered by the model.
   */
  private sanitizeDisplayTextRequirements(textRequirements: readonly string[]): string[] {
    const directiveStarts = /^(make|create|design|use|with|in|apply|give|do|can you|please)\b/i;
    const genericPlaceholder = /^(elite\s+)?(athlete|player|recruit|prospect|team|program|squad)$/i;
    const genericPhrase = /\b(athlete|player|recruit|prospect|team|program|squad)\b/i;
    const styleTerms = [
      'style',
      'theme',
      'aesthetic',
      'background',
      'vibe',
      'design',
      'layout',
      'graphic',
      'card',
      'poster',
      'look',
    ];

    const cleaned = textRequirements
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .filter((t) => !directiveStarts.test(t))
      .filter((t) => !genericPlaceholder.test(t))
      .filter((t) => {
        const lower = t.toLowerCase();
        const styleHits = styleTerms.reduce(
          (acc, term) => (lower.includes(term) ? acc + 1 : acc),
          0
        );
        const wordCount = t.split(/\s+/).length;
        const hasDigit = /\d/.test(t);
        // Keep likely scoreboard/date/stat lines. Drop likely style-only directives.
        if (hasDigit) return true;
        if (wordCount <= 3 && genericPhrase.test(t) && !/[A-Z]{2,}\s+[A-Z]{2,}/.test(t))
          return false;
        if (styleHits >= 2) return false;
        if (styleHits >= 1 && wordCount >= 4) return false;
        return true;
      });

    return [...new Set(cleaned)].slice(0, 8);
  }

  private buildDefaultTextRequirements(input: {
    graphicType: 'athlete' | 'team';
    athleteInfo?: {
      name?: string;
      sport?: string;
      position?: string;
      team?: string;
    };
    teamInfo?: {
      name?: string;
      sport?: string;
      subtitle?: string;
    };
  }): string[] {
    const safePush = (list: string[], value?: string): void => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      list.push(trimmed);
    };

    const defaults: string[] = [];

    if (input.graphicType === 'team') {
      safePush(defaults, input.teamInfo?.name);
      safePush(defaults, input.teamInfo?.sport);
      safePush(defaults, input.teamInfo?.subtitle);
    } else {
      safePush(defaults, input.athleteInfo?.name);
      safePush(defaults, input.athleteInfo?.sport);
      safePush(defaults, input.athleteInfo?.position);
      safePush(defaults, input.athleteInfo?.team);
    }

    return [...new Set(defaults)].slice(0, 8);
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

    const {
      graphicType,
      textRequirements,
      athleteInfo,
      teamInfo,
      subjectImageUrl,
      dimensions,
      styleDescription,
      userId,
    } = parsed.data;

    const llmDisplayTextRequirements = await this.parseDisplayTextIntent(
      textRequirements,
      styleDescription,
      userId,
      context
    );
    const displayTextRequirements = this.sanitizeDisplayTextRequirements(
      llmDisplayTextRequirements
    );
    const defaultTextRequirements = this.buildDefaultTextRequirements({
      graphicType,
      athleteInfo,
      teamInfo,
    });
    const effectiveTextRequirements =
      displayTextRequirements.length > 0 ? displayTextRequirements : defaultTextRequirements;

    // ── Compile the creative brief ─────────────────────────────────────
    const preset = DIMENSION_PRESETS[dimensions];
    const hasSubjectImage =
      typeof subjectImageUrl === 'string' && subjectImageUrl.trim().length > 0;
    const prompt = this.compileDesignBrief({
      textRequirements: effectiveTextRequirements,
      dimensions: preset,
      styleDescription,
      hasSubjectImage,
      graphicType,
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

      const normalizedSubjectImageUrl =
        typeof subjectImageUrl === 'string' && subjectImageUrl.trim().length > 0
          ? subjectImageUrl.trim()
          : undefined;
      const hasStrictSubject = !!normalizedSubjectImageUrl;

      // Re-send the same source image in multimodal parts to increase identity anchoring.
      const additionalImageUrls = hasStrictSubject ? [normalizedSubjectImageUrl] : [];

      const result = await this.llm.generateImage({
        prompt,
        referenceImageUrl: normalizedSubjectImageUrl,
        additionalImageUrls,
        temperature: hasStrictSubject ? 0.15 : 0.55,
        signal: context?.signal,
        telemetryContext: {
          operationId: '',
          userId,
          agentId: 'brand_coordinator',
          feature: hasStrictSubject ? 'generate-graphic-subject-locked' : 'generate-graphic',
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

      // Stamp the NXT1 logo in the bottom-right corner.
      // Model receives NO logo images so it cannot hallucinate duplicates;
      // Sharp is the sole, deterministic logo placement mechanism.
      const logoBuffer = await this.fetchLogoBuffer();
      const finalBuffer = logoBuffer
        ? await this.stampLogoBottomRight(imageBuffer, logoBuffer)
        : imageBuffer;

      await file.save(finalBuffer, {
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
   * design brief using delimiter sections and quoted text so the image
   * model never renders style instructions as on-canvas copy.
   *
   * Technique:
   * - `# SECTION` delimiters separate content from style instructions
   * - Display text wrapped in explicit quotes: "Write the exact text: 'PHRASE'"
   * - Style described aesthetically (visual language), never by label name
   * - Subject-lock constraints enforce identity preservation for supplied images
   */
  private compileDesignBrief(params: {
    textRequirements: string[];
    dimensions: { width: number; height: number; label: string };
    styleDescription: string;
    hasSubjectImage: boolean;
    graphicType: 'athlete' | 'team';
  }): string {
    const { textRequirements, dimensions, styleDescription, hasSubjectImage, graphicType } = params;

    // Build the quoted text block — each item wrapped so model renders them literally
    const quotedTextLines =
      textRequirements.length > 0
        ? textRequirements.map((t, i) => `  ${i + 1}. Write the exact text: "${t}"`).join('\n')
        : '  (no text required — design only)';

    // Translate raw styleDescription into aesthetic visual language.
    // This prevents the model from treating style label words as on-canvas copy.
    const aestheticStyle = this.translateToAestheticLanguage(styleDescription);

    const subjectBlock = hasSubjectImage
      ? `
# SUBJECT LOCK (MANDATORY)
<SUBJECT_START>
A real athlete photo is attached. This task is strict image-guided compositing.
Use ONLY the attached athlete identity: same face, same hairline/hair texture, same skin tone, same body proportions.
Preserve visible identity details from the source photo (including facial structure, tattoos, and jersey identity cues).
Allowed edits: cutout, relighting, color grading, background replacement, depth effects, typography overlays.
Forbidden edits: inventing a new person, swapping face, changing ethnicity, changing jersey number, creating a synthetic body double.
If identity cannot be preserved exactly, keep the original subject untouched and style only the background/layout.
<SUBJECT_END>
`
      : '';

    return `You are a professional sports graphic designer. Produce a single, high-quality image.

# CANVAS SPECIFICATIONS
Width: ${dimensions.width}px | Height: ${dimensions.height}px | Format: ${dimensions.label}
Quality: ultra high resolution
Graphic category: ${graphicType === 'team' ? 'TEAM GRAPHIC' : 'ATHLETE GRAPHIC'}
${subjectBlock}
# REQUIRED TEXT — Render ONLY these exact words, spelled character-for-character
<TEXT_START>
${quotedTextLines}
<TEXT_END>

RULES FOR TEXT:
- Render ONLY the text listed above. DO NOT add anything else.
- Each phrase must be spelled EXACTLY as written — zero typos, zero substitutions.
- DO NOT add stats, names, schools, dates, or filler copy that is not listed above.
- DO NOT render generic placeholders like "ATHLETE", "PLAYER", "TEAM", or "PROGRAM" unless explicitly listed in <TEXT_START>.
- DO NOT render anything from the VISUAL STYLE section as text on the graphic.

# VISUAL STYLE — Design aesthetic ONLY. DO NOT render any of this as text.
<STYLE_START>
${aestheticStyle}
Color palette: choose an original, high-contrast sports palette that fits the style above.
Do NOT default to orange and blue unless the user's content explicitly calls for it.
<STYLE_END>

CRITICAL: The <STYLE_START>…<STYLE_END> block contains visual design instructions only.
DO NOT write any word from that section onto the graphic. It describes HOW it should look, not WHAT it says.

CRITICAL: If a subject image is attached, do not synthesize a new athlete.
Treat the attached photo as the locked identity source and preserve that exact person.

# OUTPUT CHECKLIST — verify before finalizing
- [ ] Only the text from <TEXT_START>…<TEXT_END> appears on the graphic
- [ ] Every word is spelled exactly as provided — no typos
- [ ] No style labels, mood words, or theme names appear as visible text${hasSubjectImage ? '\n- [ ] The person in the output is the SAME person from the attached photo' : ''}
- [ ] The design looks like a professional broadcast sports graphic`;
  }

  /**
   * Converts a raw style description (which may contain label words like
   * "galaxy", "neon", "cyber") into purely visual/aesthetic language so
   * the image model reads it as design direction rather than text to render.
   */
  private translateToAestheticLanguage(styleDescription: string): string {
    // Map common style labels to their visual equivalents
    const STYLE_MAP: Record<string, string> = {
      galaxy:
        'deep space backdrop with scattered star fields, subtle nebula gradients, and cosmic dust particles',
      neon: 'vivid electroluminescent glow effects, high-contrast dark background with bright luminous accent lines',
      cyber:
        'dark digital environment with thin grid lines, glowing circuitry patterns, and electric accent highlights',
      glitch:
        'distorted scan-line artifacts, displaced color channels, and fragmented pixel displacement effects',
      fire: 'warm ember tones, rising heat distortion, and orange-to-gold gradient energy radiating upward',
      ice: 'cool crystalline texture, frost patterns, pale blue-white tones with sharp reflective facets',
      retro:
        'warm film grain, muted desaturated tones, vintage halftone texture, and classic serif typography weight',
      cinematic:
        'widescreen letterbox feel, deep shadows, dramatic directional lighting, film-grade color grading',
      minimalist:
        'clean negative space, single focal point, restrained typography, no decorative elements',
      dark: 'near-black background, high contrast, deep shadow areas with selective dramatic accent lighting',
      gold: 'rich metallic gold tones, polished surface sheen, dark backing to maximize contrast',
      chrome: 'reflective metallic silver surface, mirror-like sheen, cool blue-grey tones',
      smoke: 'soft diffused haze, layered translucent mist, dark moody atmosphere',
      grunge: 'rough textured surface, distressed worn edges, high-contrast gritty composition',
      electric:
        'high-voltage energy, bright bolt-like accent streaks, intense saturation against dark ground',
    };

    // Replace known style label words with visual descriptions
    let aesthetic = styleDescription;
    for (const [label, visual] of Object.entries(STYLE_MAP)) {
      const regex = new RegExp(`\\b${label}\\b`, 'gi');
      aesthetic = aesthetic.replace(regex, visual);
    }

    // Ensure the result reads as visual direction, not a label or title
    return aesthetic;
  }
}
