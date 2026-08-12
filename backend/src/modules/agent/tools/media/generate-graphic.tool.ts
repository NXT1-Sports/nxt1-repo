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

const AutoRetrievedSourceObjectSchema = z
  .object({
    source: z.string().trim().min(1),
    type: z.string().trim().min(1).optional(),
    url: z.string().trim().url().optional(),
  })
  .passthrough();

type AutoRetrievedSourceObject = z.infer<typeof AutoRetrievedSourceObjectSchema>;

function normalizeAutoRetrievedSourceEntry(
  entry: string | AutoRetrievedSourceObject
): string | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const source = entry.source.trim();
  const type = entry.type?.trim();
  const url = entry.url?.trim();
  if (url) {
    return type ? `${source}:${type}:${url}` : `${source}:${url}`;
  }

  return type ? `${source}:${type}` : source;
}

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
    autoRetrievedSources: z
      .array(z.union([z.string().trim().min(1), AutoRetrievedSourceObjectSchema]))
      .max(12)
      .optional(),
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

// ─── Input Coercion ─────────────────────────────────────────────────────────

/**
 * Fields in {@link GenerateGraphicInputSchema} that must be arrays.
 * When the LLM serialises these as JSON strings (e.g. `'["url1"]'`), this
 * list drives the safe-parse coercion step in {@link coerceGraphicInput}.
 *
 * ⚠ Keep in sync with {@link GenerateGraphicInputSchema} — if you add or
 * rename an array-typed field there, update this list accordingly.
 */
const ARRAY_FIELDS = [
  'textRequirements',
  'subjectPhotoUrls',
  'logoUrls',
  'videoSourceUrls',
  'autoRetrievedSources',
  'themeColors',
] as const;

/**
 * Fields that must be plain objects.
 * Stringified JSON objects (`'{"name":"Jordan"}'`) are parsed back to their
 * native form before Zod validation runs.
 *
 * ⚠ Keep in sync with {@link GenerateGraphicInputSchema}.
 */
const OBJECT_FIELDS = ['athleteInfo', 'teamInfo', 'requiredAssets'] as const;

/**
 * Fields that must be booleans.
 * The strings `"true"` and `"false"` are coerced to their boolean equivalents.
 *
 * ⚠ Keep in sync with {@link GenerateGraphicInputSchema}.
 */
const BOOLEAN_FIELDS = ['assetSelectionApproved'] as const;

function normalizeAutoRetrievedSources(
  entries: readonly (string | AutoRetrievedSourceObject)[] | undefined
): readonly string[] {
  if (!entries) {
    return [];
  }

  return entries
    .map((entry) => normalizeAutoRetrievedSourceEntry(entry))
    .filter((entry): entry is string => entry !== null);
}

/**
 * Safely coerces raw LLM tool-call inputs to the native types expected by
 * {@link GenerateGraphicInputSchema}.
 *
 * **Why this exists**: LLMs occasionally serialise structured parameters
 * (arrays, objects, booleans) as JSON strings before handing them to the
 * tool handler. This function attempts to parse those stringified values
 * back to their native types so Zod validation succeeds. Only values whose
 * runtime type does not already match the expected type are touched — no
 * silent mutation of correctly-typed values occurs.
 *
 * **Supported coercions**:
 * - `string` → `Array`  : value trimmed-starts with `[` → `JSON.parse`
 * - `string` → `Object` : value trimmed-starts with `{` → `JSON.parse`
 * - `string` → `boolean`: `"true"` | `"false"` → `true` | `false`
 *
 * **Note on the `[` / `{` heuristic**: Strings that happen to start with
 * `[` or `{` but are not valid JSON (e.g. `"[note: invalid]"`) are caught
 * by the try-catch and left untouched — Zod then emits the appropriate
 * field-level validation error for that value. Parse failures are logged
 * at `debug` level so they can be correlated with model behaviour.
 *
 * **Callers must pass native types** wherever possible. String coercion
 * is provided for backwards-compatible resilience, not as a preferred path.
 */
export function coerceGraphicInput(raw: Record<string, unknown>): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...raw };

  for (const field of ARRAY_FIELDS) {
    const val = coerced[field];
    if (typeof val === 'string' && val.trimStart().startsWith('[')) {
      try {
        coerced[field] = JSON.parse(val);
      } catch {
        // Not valid JSON — leave as-is so Zod can report the type error.
        console.debug(
          `[generate_graphic] coerceGraphicInput: field "${field}" looks like a JSON array but could not be parsed; raw value (truncated): ${val.slice(0, 80)}`
        );
      }
    }
  }

  for (const field of OBJECT_FIELDS) {
    const val = coerced[field];
    if (typeof val === 'string' && val.trimStart().startsWith('{')) {
      try {
        coerced[field] = JSON.parse(val);
      } catch {
        // Not valid JSON — leave as-is so Zod can report the type error.
        console.debug(
          `[generate_graphic] coerceGraphicInput: field "${field}" looks like a JSON object but could not be parsed; raw value (truncated): ${val.slice(0, 80)}`
        );
      }
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const val = coerced[field];
    if (val === 'true') coerced[field] = true;
    else if (val === 'false') coerced[field] = false;
  }

  return coerced;
}

/**
 * Formats a Zod validation failure into a developer-readable error string
 * that includes the field path, a brief description of the expected type,
 * and a safe truncation of the actual value received. Sensitive fields are
 * never included in the output.
 */
function formatValidationError(issues: z.ZodIssue[], raw: Record<string, unknown>): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
      const topField = String(issue.path[0] ?? '');
      const rawVal = topField ? raw[topField] : undefined;
      const actualType = rawVal === null ? 'null' : typeof rawVal;
      const truncated =
        typeof rawVal === 'string'
          ? `"${rawVal.slice(0, 40)}${rawVal.length > 40 ? '…' : ''}"`
          : actualType === 'object'
            ? `[${actualType}]`
            : String(rawVal);
      return `[${path}] ${issue.message} (received ${actualType}: ${truncated})`;
    })
    .join(', ');
}

// ─── Tool Implementation ────────────────────────────────────────────────────

export class GenerateGraphicTool extends BaseTool {
  readonly name = 'generate_graphic';
  readonly description =
    'Generates a professional sports graphic using structured parameters (text, dimensions, style, subject photos, logos). ' +
    'When subject photos are provided, output preserves that exact person; when logos are provided, they are sent as brand reference assets for natural integration. ' +
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
        try {
          const result = await this.transportResolver.resolveProcessingUrl({
            sourceUrl: url,
            fallbackToFirebaseStaging: true,
            stageMediaKind: 'image',
            executionContext: context,
          });
          const inlineDataUrl = await this.toProviderImageDataUrl(result.url.trim());
          return inlineDataUrl;
        } catch {
          return null;
        }
      })
    );

    return resolved.filter((url): url is string => url !== null);
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

  private normalizeProvidedLogoUrlList(urls: readonly string[] | undefined): string[] {
    return this.normalizeImageUrlList(urls, MAX_LOGOS);
  }

  private resolveApplyMode(params: {
    explicit: (typeof APPLY_MODES)[number] | undefined;
    subjectPhotoCount: number;
    hasLogos: boolean;
  }): (typeof APPLY_MODES)[number] {
    const hasSubjectPhotos = params.subjectPhotoCount > 0;
    const hasMultipleSubjectPhotos = params.subjectPhotoCount > 1;

    if (params.explicit) {
      if (params.explicit === 'mixed') {
        if (hasSubjectPhotos && (params.hasLogos || hasMultipleSubjectPhotos)) return 'mixed';
        if (hasSubjectPhotos) return 'photo_lock';
        if (params.hasLogos) return 'logo_overlay';
        return 'style_only';
      }

      if (params.explicit === 'photo_lock' && !hasSubjectPhotos) {
        return params.hasLogos ? 'logo_overlay' : 'style_only';
      }

      if (params.explicit === 'logo_overlay' && !params.hasLogos) {
        return hasSubjectPhotos ? 'photo_lock' : 'style_only';
      }

      return params.explicit;
    }

    if (hasSubjectPhotos && params.hasLogos) return 'mixed';
    if (hasSubjectPhotos) return 'photo_lock';
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

  private assertRetrievalOrProvidedAssetsPresent(params: {
    subjectPhotoUrls: readonly string[];
    logoUrls: readonly string[];
    videoSourceUrls: readonly string[];
    autoRetrievedSources: readonly string[];
  }): string | null {
    const hasProvidedOrResolvedAssets =
      params.subjectPhotoUrls.length > 0 ||
      params.logoUrls.length > 0 ||
      params.videoSourceUrls.length > 0;
    if (hasProvidedOrResolvedAssets) return null;
    if (params.autoRetrievedSources.length > 0) return null;

    return (
      'Brand/media preflight was skipped. Before generate_graphic, either pass the exact attached/provided asset URLs ' +
      'the user wants used or complete retrieval first via query_nxt1_data / approved scrape flow and carry the ' +
      'lookup markers forward in autoRetrievedSources.'
    );
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
    // Coerce stringified values (arrays, objects, booleans) that LLMs
    // occasionally pass instead of native types before running validation.
    const coerced = coerceGraphicInput(input);
    const parsed = GenerateGraphicInputSchema.safeParse(coerced);
    if (!parsed.success) {
      return {
        success: false,
        error: formatValidationError(parsed.error.issues, coerced),
      };
    }

    const {
      graphicType,
      textRequirements,
      athleteInfo,
      teamInfo,
      subjectPhotoUrls,
      logoUrls,
      videoSourceUrls,
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
    const normalizedLogoUrls = this.normalizeProvidedLogoUrlList(logoUrls);
    const normalizedVideoSourceUrls = this.normalizeImageUrlList(videoSourceUrls, 3);
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
      subjectPhotoUrls: resolvedSubjectPhotoUrls,
      textRequirements,
      styleDescription,
    });

    if (missingAuthenticSubjectError) {
      return { success: false, error: missingAuthenticSubjectError };
    }

    const retrievedSources = normalizeAutoRetrievedSources(autoRetrievedSources);
    const missingPreflightError = this.assertRetrievalOrProvidedAssetsPresent({
      subjectPhotoUrls: resolvedSubjectPhotoUrls,
      logoUrls: resolvedLogoUrls,
      videoSourceUrls: normalizedVideoSourceUrls,
      autoRetrievedSources: retrievedSources,
    });

    if (missingPreflightError) {
      return { success: false, error: missingPreflightError };
    }

    const missingAssetError = this.assertRequiredAssetsPresent({
      requiredAssets: resolvedRequiredAssets,
      subjectPhotoUrls: resolvedSubjectPhotoUrls,
      logoUrls: resolvedLogoUrls,
    });

    if (missingAssetError) {
      if (resolvedRequiredAssets.brandLogo && resolvedLogoUrls.length === 0) {
        return {
          success: false,
          error:
            'Required brand logo could not be accessed. Attach a reachable logo or upload it to NXT1 storage.',
        };
      }
      validationWarnings.push(missingAssetError);
    }

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
    const hasSubjectImage = resolvedSubjectPhotoUrls.length > 0;
    const subjectImageCount = resolvedSubjectPhotoUrls.length;
    const hasLogos = resolvedLogoUrls.length > 0;
    const resolvedApplyMode = this.resolveApplyMode({
      explicit: applyMode,
      subjectPhotoCount: subjectImageCount,
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
      subjectImageCount,
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

      // Stamp the NXT1 logo in the bottom-right corner.
      // User/team logos are model-visible references and should be integrated
      // by the generated artwork, not pasted into a fixed corner afterward.
      const logoBuffer = await this.fetchLogoBuffer(context);
      const finalBuffer = logoBuffer
        ? await this.stampLogoBottomRight(imageBuffer, logoBuffer)
        : imageBuffer;

      const mediaAccess = await AgentMediaLifecycleService.saveBufferAndMakePublic({
        bucket,
        storagePath: filePath,
        buffer: finalBuffer,
        mimeType: result.mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      });

      return {
        success: true,
        data: {
          imageUrl: mediaAccess.url,
          storagePath: mediaAccess.storagePath,
          imageUrlKind: mediaAccess.kind,
          imageUrlDurable: mediaAccess.durable,
          ...(mediaAccess.expiresAt
            ? { imageUrlExpiresAt: new Date(mediaAccess.expiresAt).toISOString() }
            : {}),
          mediaAccess: {
            url: mediaAccess.url,
            storagePath: mediaAccess.storagePath,
            kind: mediaAccess.kind,
            durable: mediaAccess.durable,
            ...(mediaAccess.expiresAt
              ? { expiresAt: new Date(mediaAccess.expiresAt).toISOString() }
              : {}),
          },
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
    subjectImageCount: number;
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
      subjectImageCount,
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
${subjectImageCount > 1 ? 'When multiple subject photos are attached, use every attached subject photo as a reference set. Do not collapse them into one image or ignore any reference.' : ''}
${applyMode === 'mixed' && subjectImageCount > 1 ? 'In mixed mode with multiple subject images, treat the extra attached images as required visible composition inputs. Preserve the primary athlete identity exactly, but also incorporate the secondary attached image(s) as distinct on-canvas elements such as split-frame panels, layered inset art, poster-card callouts, or background plates. Do not reduce extra attached images to color inspiration, texture, or vague style only.' : ''}
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
# LOGO REFERENCE INTEGRATION (MANDATORY)
<LOGO_START>
Real brand logo assets are attached as visual reference inputs.
Naturally integrate the attached logo into the artwork as a professional brand element: emblem, crest, dimensional mark, center badge, header mark, background insignia, uniform/helmet decal, or composition anchor as the design calls for.
Preserve the logo's core identity, colors, proportions, and readable mark. Do NOT invent logos, text marks, mascots, alternate branding, or fake variants.
Blend the logo with lighting, shadows, reflections, motion, and depth so it feels designed into the final graphic rather than pasted on top.
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
      # BRAND LOGO INTEGRATION (MANDATORY)
      <LOGO_INTEGRATION_START>
      Real logo assets are attached as design references. Integrate the logo naturally into the generated composition while preserving its brand identity.
      Do NOT draw empty logo boxes, blank badge frames, placeholder wells, or visible reserved containers.
      <LOGO_INTEGRATION_END>
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

CRITICAL: If logos are provided, they are brand-locked reference assets. Integrate them naturally without hallucinating or mutating logo identity.

CRITICAL: Never leave missing-asset areas in the artwork. The final image must look complete even when no subject photo or logo is supplied.

# OUTPUT CHECKLIST — verify before finalizing
- [ ] Only the text from <TEXT_START>…<TEXT_END> appears on the graphic
- [ ] Every word is spelled exactly as provided — no typos
- [ ] No style labels, mood words, or theme names appear as visible text${hasSubjectImage ? '\n- [ ] The person in the output is the SAME person from the attached photo' : ''}
- [ ] The person in the output is the SAME person from the attached photo${hasSubjectImage ? '' : ' (skip when no subject photo supplied)'}
- [ ] No empty photo frames, blank media panels, logo wells, crest placeholders, or missing-asset boxes are visible
- [ ] If logos are supplied, the attached logo identity is preserved and integrated naturally into the artwork
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
