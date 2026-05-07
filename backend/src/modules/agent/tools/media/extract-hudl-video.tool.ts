/**
 * @fileoverview Extract Hudl Video Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Extracts direct MP4 video sources from a public Hudl /video/ page by
 * parsing the `window.__hudlEmbed` JSON blob embedded in the page HTML.
 * No auth required for public highlight pages.
 *
 * Public Hudl highlight pages embed three quality tiers in a script tag:
 *   - mobile  (~360p)
 *   - sd      (~480p)
 *   - hd      (~720p)  ← bestUrl always returns this
 *
 * Usage:
 *   extract_hudl_video({ url: "https://www.hudl.com/video/3/3850048/..." })
 *
 * Returns: { title, athleteName, thumbnailUrl, sources, bestUrl, artifact }
 * where artifact is a MediaWorkflowArtifact ready for analyze_video or stage_media.
 *
 * After this tool succeeds, pass bestUrl directly to analyze_video:
 *   analyze_video({ url: data.bestUrl, prompt: "..." })
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { buildPortableMediaArtifact } from './media-workflow.js';
import { z } from 'zod';
import { logger } from '../../../../utils/logger.js';

/** Maximum page size to read (8 MB — Hudl pages are ~600 KB). */
const MAX_BYTES = 8 * 1024 * 1024;

/** Timeout for the page fetch. */
const FETCH_TIMEOUT_MS = 15_000;

/** User-agent that Hudl accepts (mimics a real browser). */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Marker that precedes the embedded data blob. */
const HUDL_EMBED_MARKER = 'window.__hudlEmbed=';

/**
 * Extract the outermost JSON object starting from `startIndex` using bracket
 * counting. More reliable than regex for very large JSON blobs.
 */
function extractJsonObject(html: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(startIndex, i + 1);
    }
  }
  return null;
}

interface HudlVideoSources {
  readonly mobile?: string;
  readonly sd?: string;
  readonly hd?: string;
}

interface HudlPageData {
  readonly title: string;
  readonly athleteName: string;
  readonly thumbnailUrl: string;
  readonly sources: HudlVideoSources;
}

function parseHudlEmbed(html: string): HudlPageData | null {
  // Locate the assignment marker; normalise spaces around `=`
  const markerIdx = html.indexOf(HUDL_EMBED_MARKER);
  if (markerIdx === -1) return null;

  // Find the opening `{` of the JSON blob
  const braceIdx = html.indexOf('{', markerIdx + HUDL_EMBED_MARKER.length);
  if (braceIdx === -1) return null;

  // Walk brackets to find the balanced closing `}` — regex fails on large blobs
  const rawJson = extractJsonObject(html, braceIdx);
  if (!rawJson) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Actual shape: { data: { pageData: { video: { sources, title, thumbnailUri } } } }
  const topData = (data['data'] as Record<string, unknown> | undefined) ?? data;
  const pageData = topData['pageData'] as Record<string, unknown> | undefined;
  if (!pageData) return null;

  const video = pageData['video'] as Record<string, unknown> | undefined;
  const owner = pageData['owner'] as Record<string, unknown> | undefined;

  const sources = (video?.['sources'] as HudlVideoSources | undefined) ?? {};
  const title = (video?.['title'] as string | undefined)?.trim() ?? 'Hudl Highlight';
  const thumbnailUrl = (video?.['thumbnailUri'] as string | undefined) ?? '';

  // Owner display name comes from the page title meta tag fallback
  const titleTagMatch = /<title>([^<]+)<\/title>/i.exec(html);
  const fullTitle = titleTagMatch?.[1]?.trim() ?? title;
  // "Senior Year Highlights - John Keller highlights - Hudl" → "John Keller"
  const nameMatch = / - ([^-]+) highlights - Hudl/i.exec(fullTitle);
  const athleteName = nameMatch?.[1]?.trim() ?? (owner ? String(owner['id'] ?? '') : '');

  return { title, athleteName, thumbnailUrl, sources };
}

const ExtractHudlVideoInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .describe('Public Hudl video page URL (must contain /video/ in the path).'),
});

export class ExtractHudlVideoTool extends BaseTool {
  readonly name = 'extract_hudl_video';
  readonly entityGroup = 'platform_tools' as const;

  readonly description =
    'Extract direct MP4 video sources from a public Hudl /video/ page. ' +
    'Parses the page HTML to find the embedded video sources (mobile/sd/hd). ' +
    'Returns bestUrl (720p MP4) + a MediaWorkflowArtifact ready for analyze_video. ' +
    'Use ONLY for public Hudl /video/ pages. For Hudl library/team pages, run classify_media_url and follow its direct extraction nextStep first; use live view only if direct extraction is unavailable.';

  readonly parameters = ExtractHudlVideoInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ExtractHudlVideoInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
    }

    const { url } = parsed.data;

    // Validate it's a public Hudl /video/ path
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL format.' };
    }

    const isHudl = parsedUrl.hostname.toLowerCase().includes('hudl.com');
    const isVideoPath =
      parsedUrl.pathname.toLowerCase().startsWith('/video/') ||
      parsedUrl.pathname.toLowerCase().startsWith('/embed/video/');

    if (!isHudl) {
      return {
        success: false,
        error: `This tool only handles Hudl URLs. Got: ${parsedUrl.hostname}. Use classify_media_url to find the correct tool.`,
      };
    }

    if (!isVideoPath) {
      return {
        success: false,
        error:
          'This Hudl URL is not a public video page (/video/ path required). ' +
          'Run classify_media_url and follow the direct extraction route first. Use open_live_view only if the classifier returns live_view_required or direct extraction fails with no usable media.',
      };
    }

    logger.info('[ExtractHudlVideo] Fetching Hudl page', { url });

    // Fetch the page HTML directly
    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `Hudl page returned HTTP ${response.status}. The video may have been removed or made private.`,
        };
      }

      // Read up to MAX_BYTES — the embed blob is always in the <head>
      const buffer = await response.arrayBuffer();
      html = new TextDecoder().decode(buffer.slice(0, MAX_BYTES));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[ExtractHudlVideo] Fetch failed', { url, err: msg });
      return { success: false, error: `Failed to fetch Hudl page: ${msg}` };
    }

    // Parse the embedded video data
    const pageData = parseHudlEmbed(html);
    if (!pageData) {
      return {
        success: false,
        error:
          'Could not find video sources in this Hudl page. ' +
          'The page may require login or the video may be private.',
      };
    }

    const { title, athleteName, thumbnailUrl, sources } = pageData;

    if (!sources.hd && !sources.sd && !sources.mobile) {
      return {
        success: false,
        error:
          'Hudl page loaded but no video sources were found. ' +
          'This may be a private or deleted video.',
      };
    }

    // Pick best available quality: hd > sd > mobile
    const bestUrl = (sources.hd ?? sources.sd ?? sources.mobile)!;

    // Build a MediaWorkflowArtifact for the downstream analyze_video call
    const artifact = buildPortableMediaArtifact({
      sourceUrl: bestUrl,
      mediaKind: 'video',
    });

    logger.info('[ExtractHudlVideo] Extracted sources', {
      url,
      title,
      hasMobile: !!sources.mobile,
      hasSd: !!sources.sd,
      hasHd: !!sources.hd,
    });

    return {
      success: true,
      data: {
        title,
        athleteName,
        thumbnailUrl,
        sources: {
          mobile: sources.mobile ?? null,
          sd: sources.sd ?? null,
          hd: sources.hd ?? null,
        },
        bestUrl,
        artifact,
        nextStep: `analyze_video({ url: "${bestUrl}", prompt: "Analyze this athlete highlight film" })`,
        guidance:
          'Pass bestUrl directly to analyze_video for AI film analysis, or to stage_media to get a portable MediaWorkflowArtifact.',
      },
    };
  }
}
