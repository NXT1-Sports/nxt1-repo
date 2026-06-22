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

import type { Storage } from 'firebase-admin/storage';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import { MediaTransportResolverService } from './media-transport-resolver.service.js';
import { AgentMediaLifecycleService } from './agent-media-lifecycle.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
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
const MAX_SUBJECT_PHOTOS = 5;
const MAX_LOGOS = 3;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

const RequiredAssetsSchema = z
  .object({
    subjectPhoto: z.boolean().default(false),
    brandLogo: z.boolean().default(false),
  })
  .default({ subjectPhoto: false, brandLogo: false });

const APPLY_MODES = ['photo_lock', 'logo_overlay', 'mixed', 'style_only'] as const;
const SOCIAL_HANDLE_OR_URL_RE =
  /(?:^|[\s(])@[a-z0-9_]{2,30}\b|(?:https?:\/\/)?(?:www\.)?(?:x|twitter|instagram)\.com\/[a-z0-9_.-]{2,30}/iu;

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

const GenerateGraphicInputSchema = z
  .object({
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
    subjectPhotoUrls: z.array(z.string().trim().url()).max(MAX_SUBJECT_PHOTOS).optional(),
    logoUrls: z.array(z.string().trim().url()).max(MAX_LOGOS).optional(),
    videoSourceUrls: z.array(z.string().trim().url()).max(3).optional(),
    requiredAssets: RequiredAssetsSchema.optional(),
    applyMode: z.enum(APPLY_MODES).optional(),
    assetSelectionApproved: z.boolean().optional(),
    autoRetrievedSources: z.array(z.string().trim().min(1)).max(12).optional(),
    /**
     * Brand colors to enforce on the graphic.
     * Priority: org/team colors (index 0 = primary, index 1 = secondary) > caller-supplied.
     * When provided, the model uses these as the dominant palette instead of choosing freely.
     * When absent and a subjectPhotoUrls entry is present, the model derives the palette from the image.
     */
    themeColors: z.array(z.string().trim().min(1)).max(3).optional(),
    dimensions: z.enum([
      '1080x1080',
      '1080x1920',
      '1920x1080',
      '1200x675',
      '1500x500',
      '1080x1350',
    ]),
    styleDescription: z.string().trim().min(1),
    userId: z.string().trim().min(1),
  })
  .strict();

// ─── Tool Implementation ────────────────────────────────────────────────────

export class GenerateGraphicTool extends BaseTool {
  readonly name = 'generate_graphic';
  readonly description =
    'Generates a professional sports graphic using structured parameters (text, dimensions, style, subject photos, logos). ' +
    'When subject photos are provided, output preserves that exact person; when logos are provided, logos are composited deterministically. ' +
    'For identifiable athlete graphics, provide real subjectPhotoUrls from retrieved media; the tool rejects fake-athlete/silhouette fallbacks. ' +
    'Use for game day graphics, player spotlights, announcements, stat cards, and social assets.';
  readonly parameters = GenerateGraphicInputSchema;

  override readonly allowedAgents = ['brand_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;

  constructor(
    private readonly llm: OpenRouterService,
    _db: Firestore = getFirestore(),
    private readonly transportResolver: MediaTransportResolverService = new MediaTransportResolverService()
  ) {
    super();
  }

  private resolveStorage(context?: ToolExecutionContext): Storage {
    return context?.environment === 'staging' ? stagingStorage : defaultStorage;
  }

  private async resolveImageInputUrls(
    urls: readonly string[],
    context?: ToolExecutionContext
  ): Promise<string[]> {
    if (urls.length === 0) return [];

    const resolved = await Promise.all(
      urls.map(async (url) => {
        const result = await this.transportResolver.resolveProcessingUrl({
          sourceUrl: url,
          fallbackToFirebaseStaging: true,
          stageMediaKind: 'image',
          executionContext: context,
        });

        const normalizedUrl = result.url.trim() || url;
        const inlineDataUrl = await this.toProviderImageDataUrl(normalizedUrl);
        return inlineDataUrl ?? normalizedUrl;
      })
    );

    return resolved;
  }

  private async toProviderImageDataUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'User-Agent': 'NXT1-AgentX/2026.1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!contentType?.startsWith('image/')) return null;

      const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_REFERENCE_IMAGE_BYTES) {
        return null;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
        return null;
      }

      return `data:${contentType};base64,${bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }

  /** Fetches the NXT1 logo buffer from local disk or Firebase Storage. */
  private async fetchLogoBuffer(context?: ToolExecutionContext): Promise<Buffer | null> {
    for (const localPath of LOCAL_LOGO_CANDIDATE_PATHS) {
      try {
        const buf = await readFile(localPath);
        if (buf.length > 0) return buf;
      } catch {
        // Try next candidate
      }
    }
    try {
      const bucket = this.resolveStorage(context).bucket();
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

  /** Stamps one or more user/team logos in the bottom-left corner via Sharp compositing. */
  private async stampLogosBottomLeft(baseImage: Buffer, logos: readonly Buffer[]): Promise<Buffer> {
    if (logos.length === 0) return baseImage;

    const meta = await sharp(baseImage).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) return baseImage;

    const targetLogoWidth = Math.max(36, Math.round(width * LOGO_WIDTH_RATIO));
    const margin = Math.max(10, Math.round(width * LOGO_MARGIN_RATIO));
    const verticalGap = Math.max(8, Math.round(margin * 0.65));
    const resizedLogos = await Promise.all(
      logos.slice(0, MAX_LOGOS).map(async (logo) => {
        try {
          const png = await sharp(logo)
            .resize({ width: targetLogoWidth, fit: 'contain' })
            .png()
            .toBuffer();
          const logoMeta = await sharp(png).metadata();
          return {
            input: png,
            width: logoMeta.width ?? targetLogoWidth,
            height: logoMeta.height ?? targetLogoWidth,
          };
        } catch {
          return null;
        }
      })
    );

    const prepared = resizedLogos.filter((entry): entry is NonNullable<typeof entry> => !!entry);
    if (prepared.length === 0) return baseImage;

    let cursorBottom = height - margin;
    const composites: Array<{ input: Buffer; left: number; top: number }> = [];

    for (const logo of prepared) {
      const top = Math.max(0, cursorBottom - logo.height);
      composites.push({ input: logo.input, left: margin, top });
      cursorBottom = top - verticalGap;
      if (cursorBottom <= 0) break;
    }

    if (composites.length === 0) return baseImage;

    return sharp(baseImage).composite(composites).toBuffer();
  }

  private normalizeUrlList(urls: readonly string[] | undefined, max: number): string[] {
    if (!urls || urls.length === 0) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const url of urls) {
      const trimmed = this.sanitizeInputUrl(url);
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      normalized.push(trimmed);
      if (normalized.length >= max) break;
    }
    return normalized;
  }

  private sanitizeInputUrl(url: string): string {
    let candidate = url
      .trim()
      .replace(/^[<"'`]+/, '')
      .replace(/[>"'`]+$/, '');

    while (candidate.length > 0) {
      const lastChar = candidate.at(-1);
      if (!lastChar || !/[.,;:!?)}\]\\"'`]/.test(lastChar)) {
        break;
      }

      const shortened = candidate.slice(0, -1);
      if (!shortened) break;

      try {
        new URL(shortened);
        candidate = shortened;
        continue;
      } catch {
        break;
      }
    }

    return candidate;
  }

  private isDisallowedSocialRedirect(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      return (
        host === 't.co' ||
        host === 'x.com' ||
        host === 'twitter.com' ||
        host === 'instagram.com' ||
        host === 'facebook.com' ||
        host === 'youtube.com' ||
        host === 'youtu.be'
      );
    } catch {
      return false;
    }
  }

  private normalizeImageUrlList(urls: readonly string[] | undefined, max: number): string[] {
    const normalized = this.normalizeUrlList(urls, max);
    return normalized.filter((url) => !this.isDisallowedSocialRedirect(url));
  }

  private isOrganizationLogoUrl(url: string): boolean {
    const sanitized = this.sanitizeInputUrl(url);
    if (!sanitized) return false;

    try {
      const parsed = new URL(sanitized);
      const pathname = decodeURIComponent(parsed.pathname);
      return /(?:^|\/)Organizations\//i.test(pathname);
    } catch {
      return /(?:^|\/)Organizations\//i.test(sanitized);
    }
  }

  private normalizeOrganizationLogoUrlList(
    urls: readonly string[] | undefined,
    context?: ToolExecutionContext
  ): string[] {
    const normalized = this.normalizeImageUrlList(urls, MAX_LOGOS);
    const contextRecord = context as
      | (Record<string, unknown> & {
          organizationLogoUrl?: unknown;
          logoUrl?: unknown;
        })
      | undefined;

    const contextOrganizationLogoUrls = this.normalizeImageUrlList(
      [contextRecord?.organizationLogoUrl, contextRecord?.logoUrl].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      ),
      MAX_LOGOS
    ).filter((url) => this.isOrganizationLogoUrl(url));

    if (contextOrganizationLogoUrls.length > 0) {
      const allowed = new Set(contextOrganizationLogoUrls);
      return normalized.filter((url) => allowed.has(url));
    }

    return normalized.filter((url) => this.isOrganizationLogoUrl(url));
  }

  private resolveApplyMode(params: {
    explicit: (typeof APPLY_MODES)[number] | undefined;
    hasSubjectPhotos: boolean;
    hasLogos: boolean;
  }): (typeof APPLY_MODES)[number] {
    if (params.explicit) {
      if (params.explicit === 'mixed') {
        if (params.hasSubjectPhotos && params.hasLogos) return 'mixed';
        if (params.hasSubjectPhotos) return 'photo_lock';
        if (params.hasLogos) return 'logo_overlay';
        return 'style_only';
      }

      if (params.explicit === 'photo_lock' && !params.hasSubjectPhotos) {
        return params.hasLogos ? 'logo_overlay' : 'style_only';
      }

      if (params.explicit === 'logo_overlay' && !params.hasLogos) {
        return params.hasSubjectPhotos ? 'photo_lock' : 'style_only';
      }

      return params.explicit;
    }

    if (params.hasSubjectPhotos && params.hasLogos) return 'mixed';
    if (params.hasSubjectPhotos) return 'photo_lock';
    if (params.hasLogos) return 'logo_overlay';
    return 'style_only';
  }

  private assertRequiredAssetsPresent(params: {
    requiredAssets: z.infer<typeof RequiredAssetsSchema>;
    subjectPhotoUrls: readonly string[];
    logoUrls: readonly string[];
  }): string | null {
    if (params.requiredAssets.subjectPhoto && params.subjectPhotoUrls.length === 0) {
      return 'Required subject photo not provided. Attach a subject photo or run retrieval first.';
    }
    if (params.requiredAssets.brandLogo && params.logoUrls.length === 0) {
      return 'Required brand logo not provided. Attach a logo or run retrieval first.';
    }
    return null;
  }

  private assertAuthenticAthleteSourcePresent(params: {
    graphicType: 'athlete' | 'team';
    requiredAssets: z.infer<typeof RequiredAssetsSchema>;
    subjectPhotoUrls: readonly string[];
    textRequirements: readonly string[];
    styleDescription: string;
  }): string | null {
    if (params.graphicType !== 'athlete') return null;
    if (params.subjectPhotoUrls.length > 0) return null;
    if (!params.requiredAssets.subjectPhoto) {
      const searchableBrief = `${params.textRequirements.join(' ')} ${params.styleDescription}`;
      if (!SOCIAL_HANDLE_OR_URL_RE.test(searchableBrief)) return null;
    }

    return (
      'Authentic athlete photo required. The prompt references an identifiable athlete or social account, ' +
      'but no subjectPhotoUrls were provided. First retrieve real media via scrape_twitter, scrape_instagram, ' +
      'chat attachments, or query_nxt1_data profile/timeline media. Do not generate silhouettes, stock humans, ' +
      'or synthetic athlete stand-ins.'
    );
  }

  private async fetchRemoteImageBuffer(url: string, signal?: AbortSignal): Promise<Buffer | null> {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('image/')) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
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
        ...(context?.operationId
          ? {
              telemetryContext: {
                operationId: context.operationId,
                userId,
                agentId: 'brand_coordinator',
                feature: 'generate-graphic-intent-parser',
              },
            }
          : {}),
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

  private buildNotificationTitle(input: {
    graphicType: 'athlete' | 'team';
    textRequirements: readonly string[];
    athleteInfo?: {
      name?: string;
    };
    teamInfo?: {
      name?: string;
    };
  }): string {
    const normalizedText = input.textRequirements.map((text) => text.trim().toLowerCase());
    const isWelcomeGraphic = normalizedText.includes('welcome');
    const subjectName =
      input.graphicType === 'team' ? input.teamInfo?.name?.trim() : input.athleteInfo?.name?.trim();

    if (isWelcomeGraphic) {
      return 'Your welcome graphic is ready';
    }

    if (subjectName) {
      return `Your graphic for ${subjectName} is ready`;
    }

    return 'Your graphic is ready';
  }

  private buildCompletionResponse(input: {
    graphicType: 'athlete' | 'team';
    textRequirements: readonly string[];
    athleteInfo?: {
      name?: string;
    };
    teamInfo?: {
      name?: string;
    };
  }): string {
    const title = this.buildNotificationTitle(input);
    return `${title} in Agent X.`;
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
      subjectPhotoUrls,
      logoUrls,
      requiredAssets,
      applyMode,
      assetSelectionApproved,
      autoRetrievedSources,
      themeColors,
      dimensions,
      styleDescription,
      userId,
    } = parsed.data;

    const normalizedSubjectPhotoUrls = this.normalizeImageUrlList(
      subjectPhotoUrls,
      MAX_SUBJECT_PHOTOS
    );
    const requestedLogoUrls = this.normalizeImageUrlList(logoUrls, MAX_LOGOS);
    const normalizedLogoUrls = this.normalizeOrganizationLogoUrlList(logoUrls, context);
    const resolvedSubjectPhotoUrls = await this.resolveImageInputUrls(
      normalizedSubjectPhotoUrls,
      context
    );
    const resolvedLogoUrls = await this.resolveImageInputUrls(normalizedLogoUrls, context);
    const resolvedRequiredAssets = requiredAssets ?? { subjectPhoto: false, brandLogo: false };
    const validationWarnings: string[] = [];
    const missingAuthenticSubjectError = this.assertAuthenticAthleteSourcePresent({
      graphicType,
      requiredAssets: resolvedRequiredAssets,
      subjectPhotoUrls: normalizedSubjectPhotoUrls,
      textRequirements,
      styleDescription,
    });

    if (missingAuthenticSubjectError) {
      return { success: false, error: missingAuthenticSubjectError };
    }

    const missingAssetError = this.assertRequiredAssetsPresent({
      requiredAssets: resolvedRequiredAssets,
      subjectPhotoUrls: normalizedSubjectPhotoUrls,
      logoUrls: normalizedLogoUrls,
    });

    if (missingAssetError) {
      validationWarnings.push(missingAssetError);
    }

    if (requestedLogoUrls.length > normalizedLogoUrls.length) {
      validationWarnings.push(
        'Only the user organization logoUrl is eligible for bottom-left logo overlay; other logo URLs were ignored.'
      );
    }

    const retrievedSources = (autoRetrievedSources ?? []).filter(
      (source) => source.trim().length > 0
    );
    if (retrievedSources.length > 0 && assetSelectionApproved !== true) {
      validationWarnings.push(
        'Retrieved media was not explicitly approved in args; proceeding with auto-selected assets.'
      );
    }

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
    const notificationTitle = this.buildNotificationTitle({
      graphicType,
      textRequirements: effectiveTextRequirements,
      athleteInfo,
      teamInfo,
    });

    // ── Compile the creative brief ─────────────────────────────────────
    const preset = DIMENSION_PRESETS[dimensions];
    const hasSubjectImage = normalizedSubjectPhotoUrls.length > 0;
    const hasLogos = normalizedLogoUrls.length > 0;
    const resolvedApplyMode = this.resolveApplyMode({
      explicit: applyMode,
      hasSubjectPhotos: hasSubjectImage,
      hasLogos,
    });

    if (applyMode && applyMode !== resolvedApplyMode) {
      validationWarnings.push(
        `Requested applyMode "${applyMode}" could not be satisfied with the supplied assets. Using "${resolvedApplyMode}" instead.`
      );
    }

    const prompt = this.compileDesignBrief({
      textRequirements: effectiveTextRequirements,
      dimensions: preset,
      styleDescription,
      hasSubjectImage,
      hasLogos,
      applyMode: resolvedApplyMode,
      graphicType,
      themeColors,
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

      const referenceImageUrl = hasSubjectImage ? resolvedSubjectPhotoUrls[0] : resolvedLogoUrls[0];
      const hasStrictSubject = hasSubjectImage;

      const additionalImageUrls = [
        ...(hasStrictSubject ? resolvedSubjectPhotoUrls.slice(1) : []),
        ...(hasLogos ? resolvedLogoUrls.slice(hasStrictSubject ? 0 : 1) : []),
      ];

      const result = await this.llm.generateImage({
        prompt,
        referenceImageUrl,
        additionalImageUrls,
        temperature: hasStrictSubject ? 0.15 : 0.55,
        signal: context?.signal,
        ...(context?.operationId
          ? {
              telemetryContext: {
                operationId: context.operationId,
                userId,
                agentId: 'brand_coordinator',
                feature: hasStrictSubject ? 'generate-graphic-subject-locked' : 'generate-graphic',
              },
            }
          : {}),
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

      const bucket = this.resolveStorage(context).bucket();
      const imageBuffer = Buffer.from(result.imageBase64, 'base64');

      const userLogoBuffers = await Promise.all(
        resolvedLogoUrls.map((url) => this.fetchRemoteImageBuffer(url, context?.signal))
      );
      const filteredUserLogos = userLogoBuffers.filter(
        (buffer): buffer is Buffer => !!buffer && buffer.length > 0
      );

      const withUserLogos =
        filteredUserLogos.length > 0
          ? await this.stampLogosBottomLeft(imageBuffer, filteredUserLogos)
          : imageBuffer;

      // Stamp the NXT1 logo in the bottom-right corner.
      // Model receives NO logo images so it cannot hallucinate duplicates;
      // Sharp is the sole, deterministic logo placement mechanism.
      const logoBuffer = await this.fetchLogoBuffer(context);
      const finalBuffer = logoBuffer
        ? await this.stampLogoBottomRight(withUserLogos, logoBuffer)
        : withUserLogos;

      const publicUrl = await AgentMediaLifecycleService.saveBufferAndMakePublic({
        bucket,
        storagePath: filePath,
        buffer: finalBuffer,
        mimeType: result.mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      });

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
          applyMode: resolvedApplyMode,
          notificationTitle,
          response: this.buildCompletionResponse({
            graphicType,
            textRequirements: effectiveTextRequirements,
            athleteInfo,
            teamInfo,
          }),
          usedSubjectPhotoUrls: normalizedSubjectPhotoUrls,
          usedLogoUrls: normalizedLogoUrls,
          ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
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
    hasLogos: boolean;
    applyMode: (typeof APPLY_MODES)[number];
    graphicType: 'athlete' | 'team';
    themeColors?: readonly string[];
  }): string {
    const {
      textRequirements,
      dimensions,
      styleDescription,
      hasSubjectImage,
      hasLogos,
      applyMode,
      graphicType,
      themeColors,
    } = params;

    // Build the quoted text block — each item wrapped so model renders them literally
    const quotedTextLines =
      textRequirements.length > 0
        ? textRequirements.map((t, i) => `  ${i + 1}. Write the exact text: "${t}"`).join('\n')
        : '  (no text required — design only)';

    // Translate raw styleDescription into aesthetic visual language.
    // This prevents the model from treating style label words as on-canvas copy.
    const aestheticStyle = this.translateToAestheticLanguage(styleDescription);

    // Build the color palette instruction.
    // Priority: explicit themeColors (org/team brand) > image-derived > free choice.
    const colorPaletteInstruction = (() => {
      if (themeColors && themeColors.length > 0) {
        const primary = themeColors[0];
        const secondary = themeColors[1] ?? null;
        const accent = themeColors[2] ?? null;
        const colorList = [primary, secondary, accent].filter(Boolean).join(', ');
        return `Color palette: USE THESE EXACT BRAND COLORS as the dominant palette — ${colorList}.
  - Primary color ${primary} must dominate backgrounds, major shapes, and key design elements.
  ${secondary ? `- Secondary color ${secondary} must be used for contrast elements, borders, and accent shapes.` : ''}
  ${accent ? `- Accent color ${accent} can be used sparingly for highlights or glow effects.` : ''}
  Do NOT substitute or invent alternative colors. The palette is locked to the brand colors above.`;
      }
      if (hasSubjectImage) {
        return `Color palette: derive your dominant color palette from the colors present in the attached subject image. Sample the most prominent hues from the image and build the background, shapes, and accent elements around them. Do NOT default to orange and blue.`;
      }
      return `Color palette: choose an original, high-contrast sports palette that fits the style above. Do NOT default to orange and blue unless the user's content explicitly calls for it.`;
    })();

    const subjectBlock =
      (applyMode === 'photo_lock' || applyMode === 'mixed') && hasSubjectImage
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

    const noSubjectBlock = !hasSubjectImage
      ? `
# NO SUBJECT PHOTO PROVIDED (MANDATORY)
<NO_SUBJECT_START>
No real subject image is attached. Do NOT create empty photo frames, cutout boxes, player-card windows, portrait panels, matte placeholders, blank silhouette areas, or "drop image here" zones.
${
  graphicType === 'athlete'
    ? 'Do NOT create or imply a human athlete, silhouette, cutout, face, body, jerseyed player, stock person, AI model, or body double.'
    : 'Do NOT create blank athlete/team-photo panels or reserved media frames.'
}
Use typography, texture, light, motion lines, team/program energy, and verified text to fill the full composition.
If the design needs a real subject image, the caller must provide subjectPhotoUrls before generation.
<NO_SUBJECT_END>
`
      : '';

    const logoBlock =
      (applyMode === 'logo_overlay' || applyMode === 'mixed') && hasLogos
        ? `
# LOGO OVERLAY (MANDATORY)
<LOGO_START>
Brand logo assets are provided for deterministic compositing.
Do NOT invent logos, text marks, mascots, or alternate branding.
The generation model should focus on background/layout aesthetics; logos are overlaid after generation.
<LOGO_END>
`
        : '';

    const noLogoBlock = !hasLogos
      ? `
      # NO BRAND LOGO PROVIDED (MANDATORY)
      <NO_LOGO_START>
      No real brand logo asset is attached. Do NOT create logo boxes, logo placeholders, crest frames, top-corner empty badges, bottom-corner empty badges, or blank logo wells.
      Do NOT invent or approximate a team logo. Use text, color, texture, and abstract team energy instead.
      <NO_LOGO_END>
      `
      : `
      # BRAND LOGO COMPOSITING (MANDATORY)
      <LOGO_COMPOSITING_START>
      Real logo assets are attached and will be composited after generation. Do NOT draw empty logo boxes, blank badge frames, or placeholder wells.
      Keep the composition clean near the bottom-left for overlay placement, but do not render a visible empty container.
      <LOGO_COMPOSITING_END>
      `;

    return `You are a professional sports graphic designer. Produce a single, high-quality image.

# CANVAS SPECIFICATIONS
Width: ${dimensions.width}px | Height: ${dimensions.height}px | Format: ${dimensions.label}
Quality: ultra high resolution
Graphic category: ${graphicType === 'team' ? 'TEAM GRAPHIC' : 'ATHLETE GRAPHIC'}
${subjectBlock}
${noSubjectBlock}
${logoBlock}
${noLogoBlock}
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
${colorPaletteInstruction}
<STYLE_END>

CRITICAL: The <STYLE_START>…<STYLE_END> block contains visual design instructions only.
DO NOT write any word from that section onto the graphic. It describes HOW it should look, not WHAT it says.

CRITICAL: If a subject image is attached, do not synthesize a new athlete.
Treat the attached photo as the locked identity source and preserve that exact person.

CRITICAL: If logos are provided, they are brand-locked assets. Do not hallucinate or mutate logo identity.

CRITICAL: Never leave missing-asset areas in the artwork. The final image must look complete even when no subject photo or logo is supplied.

# OUTPUT CHECKLIST — verify before finalizing
- [ ] Only the text from <TEXT_START>…<TEXT_END> appears on the graphic
- [ ] Every word is spelled exactly as provided — no typos
- [ ] No style labels, mood words, or theme names appear as visible text${hasSubjectImage ? '\n- [ ] The person in the output is the SAME person from the attached photo' : ''}
- [ ] The person in the output is the SAME person from the attached photo${hasSubjectImage ? '' : ' (skip when no subject photo supplied)'}
- [ ] No empty photo frames, blank media panels, logo wells, crest placeholders, or missing-asset boxes are visible
- [ ] If logos are supplied, the design leaves subtle breathing room for compositing without drawing a visible empty container
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
