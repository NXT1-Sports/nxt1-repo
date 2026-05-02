/**
 * @fileoverview Universal Page Data Extractor
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping
 *
 * Extracts ALL structured data from raw HTML using only standard web
 * formats — zero per-site logic, works on any page on the internet.
 *
 * Extraction pipeline (run in order):
 *   1. <title> + <meta name="description">
 *   2. OpenGraph <meta property="og:*"> tags
 *   3. Twitter <meta name="twitter:*"> tags
 *   4. schema.org <script type="application/ld+json"> blocks
 *   5. __NEXT_DATA__ <script id="__NEXT_DATA__"> blob (Next.js)
 *   6. __NUXT__ / __NUXT_STATE__ window assignment (Nuxt.js)
 *   7. Generic window.__* large JSON blobs (Hudl, etc.)
 *   8. <link rel="preload" as="image"> + <img src="..."> tags
 *   9. <iframe src="..."> video embeds (YouTube, Hudl, Vimeo)
 *   10. Hex color values from JSON blobs (team/brand colors)
 *
 * The extractor uses regex on raw HTML — no DOM parser dependency.
 * This is intentional: it runs in a Node worker context where
 * full DOM parsing would add 5-10x overhead for no benefit.
 */

import type {
  PageStructuredData,
  PageImage,
  PageLink,
  PageVideo,
  OpenGraph,
  TwitterCard,
} from './page-data.types.js';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract all structured data from raw HTML.
 * Pure function — no side effects, no network calls.
 *
 * @param html - Raw HTML string from a fetch response.
 * @param pageUrl - The original page URL (used to resolve relative paths).
 * @returns PageStructuredData with everything extracted.
 */
export function extractPageData(html: string, pageUrl: string): PageStructuredData {
  const title = extractTitle(html);
  const description = extractMetaDescription(html);
  const openGraph = extractOpenGraph(html);
  const twitterCard = extractTwitterCard(html);
  const ldJson = extractLdJson(html);
  const nextData = extractNextData(html);
  const nuxtData = extractNuxtData(html);
  const embeddedData = extractEmbeddedData(html);
  const images = extractImages(html, pageUrl, openGraph, twitterCard);
  const videos = extractVideos(html);
  const colors = extractColors(html, nextData, embeddedData);
  const links = extractLinksFromHtml(html, pageUrl);
  const faviconUrl = extractFavicon(html, pageUrl);

  const hasEmbeddedData = Object.keys(embeddedData).length > 0;

  return {
    title,
    description,
    openGraph,
    twitterCard,
    ldJson,
    nextData,
    nuxtData,
    embeddedData,
    images,
    links,
    videos,
    colors,
    faviconUrl,
    hasRichData: nextData !== null || nuxtData !== null || ldJson.length > 0 || hasEmbeddedData,
  };
}

/**
 * Merge additional links (e.g. from markdown) into an existing PageStructuredData.
 * Deduplicates by URL. New links are appended after HTML-sourced links.
 */
export function mergeLinks(
  pageData: PageStructuredData,
  extra: readonly PageLink[]
): PageStructuredData {
  if (extra.length === 0) return pageData;
  const existing = new Set(pageData.links.map((l) => l.url));
  const novel = extra.filter((l) => !existing.has(l.url));
  if (novel.length === 0) return pageData;
  return { ...pageData, links: [...pageData.links, ...novel] };
}

// ─── Title & Description ────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return decodeHtmlEntities(m?.[1]?.trim() ?? 'Untitled').slice(0, 200);
}

function extractMetaDescription(html: string): string {
  const m =
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i.exec(html);
  return decodeHtmlEntities(m?.[1]?.trim() ?? '').slice(0, 500);
}

// ─── OpenGraph ──────────────────────────────────────────────────────────────

function extractOpenGraph(html: string): OpenGraph {
  const get = (prop: string): string | undefined => {
    const r = new RegExp(
      `<meta\\s+(?:property|name)=["']og:${prop}["']\\s+content=["']([^"']+)["']` +
        `|<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']og:${prop}["']`,
      'i'
    );
    const m = r.exec(html);
    return m?.[1] ?? m?.[2] ?? undefined;
  };

  return {
    title: get('title'),
    description: get('description'),
    image: get('image'),
    video: get('video'),
    type: get('type'),
    url: get('url'),
    siteName: get('site_name'),
  };
}

// ─── Twitter Card ───────────────────────────────────────────────────────────

function extractTwitterCard(html: string): TwitterCard {
  const get = (name: string): string | undefined => {
    const r = new RegExp(
      `<meta\\s+(?:name|property)=["']twitter:${name}["']\\s+content=["']([^"']+)["']` +
        `|<meta\\s+content=["']([^"']+)["']\\s+(?:name|property)=["']twitter:${name}["']`,
      'i'
    );
    const m = r.exec(html);
    return m?.[1] ?? m?.[2] ?? undefined;
  };

  return {
    card: get('card'),
    title: get('title'),
    description: get('description'),
    image: get('image'),
  };
}

// ─── LD+JSON (schema.org) ───────────────────────────────────────────────────

function extractLdJson(html: string): readonly unknown[] {
  const results: unknown[] = [];
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      results.push(parsed);
    } catch {
      // Malformed JSON — skip
    }
  }

  return results;
}

// ─── __NEXT_DATA__ (Next.js) ────────────────────────────────────────────────

function extractNextData(html: string): unknown | null {
  const m =
    /<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      html
    );
  if (!m?.[1]) return null;

  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// ─── __NUXT__ / __NUXT_STATE__ (Nuxt.js) ────────────────────────────────────

function extractNuxtData(html: string): unknown | null {
  // Nuxt 2: window.__NUXT__ = { ... }
  const nuxt2 = /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i.exec(html);
  if (nuxt2?.[1]) {
    try {
      return JSON.parse(nuxt2[1]);
    } catch {
      /* not valid JSON — often uses JS, skip */
    }
  }

  // Nuxt 3: <script id="__NUXT_DATA__" type="application/json">
  const nuxt3 =
    /<script\s+id=["']__NUXT_DATA__["']\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      html
    );
  if (nuxt3?.[1]) {
    try {
      return JSON.parse(nuxt3[1]);
    } catch {
      return null;
    }
  }

  return null;
}

// ─── Generic Embedded Data (window.__*) ─────────────────────────────────────

/**
 * Extract large JSON blobs assigned to window.__* variables.
 * Catches framework/site-specific data not covered by Next.js or Nuxt extractors:
 *   - window.__hudlEmbed = {...}       (Hudl)
 *   - window.__INITIAL_STATE__ = {...} (Redux SSR)
 *   - window.__PRELOADED_STATE__ = {...}
 *   - window.__APP_DATA__ = {...}
 *   - etc.
 *
 * Only captures blobs ≥ 500 chars (to skip small config objects).
 * Skips __NEXT_DATA__ and __NUXT__ (handled by dedicated extractors).
 */
function extractEmbeddedData(html: string): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // Match: window.__varName = { ... }; before </script>
  // Uses a non-greedy match to find the JSON object, then validates with JSON.parse.
  const re = /window\.(_{1,2}[a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const varName = m[1];
    const jsonStr = m[2];

    // Skip variables handled by dedicated extractors
    if (varName === '__NEXT_DATA__' || varName === '__NUXT__' || varName === '__NUXT_STATE__') {
      continue;
    }

    // Only capture substantial data blobs (skip small configs)
    if (jsonStr.length < 500) continue;

    try {
      const parsed = JSON.parse(jsonStr);
      result[varName] = parsed;
    } catch {
      // Not valid JSON (might use JS expressions) — skip
    }
  }

  return result;
}

// ─── Images ─────────────────────────────────────────────────────────────────

function extractImages(
  html: string,
  pageUrl: string,
  og: OpenGraph,
  tc: TwitterCard
): readonly PageImage[] {
  const seen = new Set<string>();
  const images: PageImage[] = [];

  const add = (
    src: string | undefined,
    alt: string | undefined,
    source: PageImage['source']
  ): void => {
    if (!src || seen.has(src)) return;
    // Filter out tiny tracking pixels and ad scripts
    if (isTrackingPixel(src)) return;
    seen.add(src);
    images.push({ src: resolveUrl(src, pageUrl), alt, source });
  };

  // Priority 1: OpenGraph image
  add(og.image, og.title, 'og');

  // Priority 2: Twitter card image
  add(tc.image, tc.title, 'twitter');

  // Priority 3: Preload images (usually hero/profile images)
  const preloadRe =
    /<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["']/gi;
  let pm: RegExpExecArray | null;
  while ((pm = preloadRe.exec(html)) !== null) {
    add(pm[1], undefined, 'preload');
  }
  // Also match reversed attribute order
  const preloadRe2 =
    /<link[^>]+as=["']image["'][^>]+rel=["']preload["'][^>]+href=["']([^"']+)["']/gi;
  while ((pm = preloadRe2.exec(html)) !== null) {
    add(pm[1], undefined, 'preload');
  }

  // Priority 4: Content <img> tags (skip tiny, ad, and SVG images)
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    const alt = /alt=["']([^"']*)["']/i.exec(im[0])?.[1];
    add(im[1], alt, 'img');
  }

  return images;
}

// ─── Videos ─────────────────────────────────────────────────────────────────

function extractVideos(html: string): readonly PageVideo[] {
  const seen = new Set<string>();
  const videos: PageVideo[] = [];

  // Iframe embeds
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = iframeRe.exec(html)) !== null) {
    const src = m[1];
    if (seen.has(src)) continue;
    seen.add(src);

    const info = classifyVideo(src);
    if (info) videos.push(info);
  }

  // OG video meta
  const ogVideo =
    /<meta\s+(?:property|name)=["']og:video(?::url)?["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:video(?::url)?["']/i.exec(html);
  if (ogVideo) {
    const src = ogVideo[1] ?? ogVideo[2];
    if (src && !seen.has(src)) {
      seen.add(src);
      const info = classifyVideo(src);
      if (info) videos.push(info);
    }
  }

  // Hudl embed URLs in data attributes or inline JS
  const hudlRe = /https?:\/\/(?:www\.)?hudl\.com\/(?:video|embed\/athlete)\/[^\s"'<>]+/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hudlRe.exec(html)) !== null) {
    const src = hm[0];
    if (seen.has(src)) continue;
    seen.add(src);
    videos.push({ src, provider: 'hudl', videoId: extractHudlId(src) });
  }

  // Hudl CDN direct mp4 URLs from __hudlEmbed script blocks.
  // Pattern: https://vi.hudl.com/p-highlights/User/{userId}/{highlightId}/{hash}_{quality}.mp4
  // Multiple quality variants (360/480/720) exist per highlight — keep only the best.
  extractHudlCdnVideos(html, seen, videos);

  return videos;
}

/**
 * Extract Hudl CDN direct video URLs from __hudlEmbed script blocks.
 *
 * Hudl stores highlight mp4 URLs across two CDN domains:
 *   - vi.hudl.com/p-highlights/User/{userId}/{highlightId}/{hash}_{quality}.mp4
 *   - vc.hudl.com/p-highlights/User/{userId}/{highlightId}/{hash}_{quality}.mp4
 *
 * Multiple quality variants (360/480/720) exist per highlight.
 * We group by highlightId and keep only the highest quality variant.
 */
function extractHudlCdnVideos(html: string, seen: Set<string>, videos: PageVideo[]): void {
  // Match Hudl CDN direct mp4 URLs from both vi.hudl.com and vc.hudl.com
  const cdnRe = /https?:\/\/v[ic]\.hudl\.com\/p-highlights\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi;
  // Group by highlight ID, tracking best quality per highlight
  const bestByHighlight = new Map<string, { src: string; quality: number }>();

  let cm: RegExpExecArray | null;
  while ((cm = cdnRe.exec(html)) !== null) {
    const src = cm[0];
    // Extract highlight ID and quality from URL:
    // .../User/{userId}/{highlightId}/{hash}_{quality}.mp4
    const parts = /\/([a-f0-9]{20,})\/[a-f0-9]+_(\d+)\.mp4/i.exec(src);
    if (!parts) continue;

    const highlightId = parts[1];
    const quality = parseInt(parts[2], 10);
    const existing = bestByHighlight.get(highlightId);

    if (!existing || quality > existing.quality) {
      bestByHighlight.set(highlightId, { src, quality });
    }
  }

  for (const [highlightId, { src }] of bestByHighlight) {
    if (seen.has(src)) continue;
    seen.add(src);
    videos.push({
      src,
      provider: 'hudl',
      videoId: highlightId,
    });
  }
}

function classifyVideo(src: string): PageVideo | null {
  // YouTube
  const ytMatch =
    /(?:youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/i.exec(src);
  if (ytMatch) {
    return {
      src,
      provider: 'youtube',
      videoId: ytMatch[1],
      poster: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
    };
  }

  // Vimeo
  const vimeoMatch = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(src);
  if (vimeoMatch) {
    return { src, provider: 'vimeo', videoId: vimeoMatch[1] };
  }

  // Hudl
  if (/hudl\.com/i.test(src)) {
    return { src, provider: 'hudl', videoId: extractHudlId(src) };
  }

  // Twitter/X video
  if (/twitter\.com|x\.com/i.test(src)) {
    return { src, provider: 'twitter' };
  }

  // Generic video embed — skip non-video iframes (ads, etc.)
  if (/video|player|embed/i.test(src) && !/doubleclick|googlesyndication|adsystem/i.test(src)) {
    return { src, provider: 'other' };
  }

  return null;
}

function extractHudlId(url: string): string | undefined {
  // Standard Hudl URLs: hudl.com/video/{id} or hudl.com/embed/athlete/{id}
  const standard = /hudl\.com\/(?:video|embed\/athlete)\/(\w+)/i.exec(url);
  if (standard) return standard[1];

  // CDN URLs: vi.hudl.com/p-highlights/User/{userId}/{highlightId}/{hash}_{quality}.mp4
  const cdn = /vi\.hudl\.com\/p-highlights\/[^/]+\/[^/]+\/([a-f0-9]{20,})\//i.exec(url);
  return cdn?.[1];
}

// ─── Colors ─────────────────────────────────────────────────────────────────

function extractColors(
  html: string,
  nextData: unknown | null,
  embeddedData: Readonly<Record<string, unknown>>
): readonly string[] {
  const seen = new Set<string>();
  const colors: string[] = [];

  const addColor = (hex: string): void => {
    // Normalize to 6-digit uppercase without #
    const clean = hex.replace(/^#/, '').toUpperCase();
    if (clean.length !== 6 || !/^[0-9A-F]{6}$/.test(clean)) return;
    // Skip white/near-white and black/near-black (not useful team colors)
    if (clean === 'FFFFFF' || clean === '000000') return;
    if (seen.has(clean)) return;
    seen.add(clean);
    colors.push(clean);
  };

  // Strategy 1: Extract from Next.js data (color1, color2, colorName fields)
  if (nextData && typeof nextData === 'object') {
    extractColorsFromJson(nextData, addColor);
  }

  // Strategy 1b: Extract from generic embedded data blobs
  for (const blob of Object.values(embeddedData)) {
    if (blob && typeof blob === 'object') {
      extractColorsFromJson(blob, addColor);
    }
  }

  // Strategy 2: Look for hex color patterns in data attributes and inline JSON
  // Match patterns like "color":"CC0022" or "primaryColor":"#FF6600"
  const jsonColorRe =
    /["'](?:color\d?|primaryColor|secondaryColor|accentColor|brandColor|teamColor)["']\s*:\s*["']#?([0-9a-fA-F]{6})["']/gi;
  let cm: RegExpExecArray | null;
  while ((cm = jsonColorRe.exec(html)) !== null) {
    addColor(cm[1]);
  }

  return colors;
}

/**
 * Recursively walk a JSON tree looking for fields named color*, returning hex values.
 * Works on any JSON structure — no site-specific assumptions.
 */
function extractColorsFromJson(obj: unknown, addColor: (hex: string) => void, depth = 0): void {
  // Prevent runaway recursion on deeply nested data
  if (depth > 8 || obj === null || obj === undefined) return;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      // Keys like color1, color2, primaryColor, teamColor, etc.
      if (/^(?:color\d?|.*Color\d?$)/i.test(key) && typeof value === 'string') {
        const hex = value.replace(/^#/, '');
        if (/^[0-9a-fA-F]{3,6}$/.test(hex)) {
          addColor(hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex);
        }
      }
      extractColorsFromJson(value, addColor, depth + 1);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 50)) {
      // Limit array traversal
      extractColorsFromJson(item, addColor, depth + 1);
    }
  }
}
// ─── Links ─────────────────────────────────────────────────────────────────

/**
 * Extract all hyperlinks from raw HTML <a href> tags.
 * Resolves relative URLs, deduplicates by href, and strips inner HTML from text.
 * Filters out noise: anchors, javascript:, mailto:, and tracking beacons.
 */
function extractLinksFromHtml(html: string, pageUrl: string): readonly PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];

  const re = /<a[^>]+href=(["'])([^"'#][^"']*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const raw = m[2].trim();
    // Skip non-http, mailto, tel, and javascript: links
    if (!raw.startsWith('http') && !raw.startsWith('//')) continue;
    const url = resolveUrl(raw, pageUrl);
    if (seen.has(url)) continue;
    // Skip known ad/tracking domains
    if (isTrackingPixel(url)) continue;
    seen.add(url);
    const text = m[3]?.replace(/<[^>]+>/g, '').trim() || undefined;
    links.push({ url, text, source: 'html' });
  }

  return links;
}
// ─── Favicon ────────────────────────────────────────────────────────────────

/**
 * Extract the site favicon URL from HTML <link> tags.
 * Looks for rel="icon", rel="shortcut icon", or rel="apple-touch-icon".
 * Falls back to /favicon.ico at the domain root.
 */
function extractFavicon(html: string, pageUrl: string): string | null {
  // Match <link rel="icon" href="..."> (or rel="shortcut icon" / "apple-touch-icon")
  // Handles both attribute orders: rel before href and href before rel.
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut\s+)?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
  ];

  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) {
      return resolveUrl(m[1], pageUrl);
    }
  }

  // Fallback: domain root /favicon.ico
  try {
    return new URL('/favicon.ico', pageUrl).href;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve a potentially relative URL against the page's origin. */
function resolveUrl(raw: string, pageUrl: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) {
    return raw.startsWith('//') ? `https:${raw}` : raw;
  }
  try {
    return new URL(raw, pageUrl).href;
  } catch {
    return raw;
  }
}

/** Detect tracking pixels and ad beacons by URL pattern. */
function isTrackingPixel(src: string): boolean {
  return /(?:pixel|beacon|tracking|analytics|1x1|spacer|blank\.gif|doubleclick|googlesyndication|googleads|adsystem|facebook\.com\/tr|bat\.bing)/i.test(
    src
  );
}

/** Decode common HTML entities. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
