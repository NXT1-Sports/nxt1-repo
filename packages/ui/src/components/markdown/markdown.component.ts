/**
 * @fileoverview NxtMarkdownComponent — SSR-safe Markdown renderer
 * @module @nxt1/ui/components/markdown
 *
 * Parses raw Markdown (including SSE streaming partials) into sanitized HTML
 * styled with NXT1 design tokens.  Uses `marked` for parsing and `DOMPurify`
 * for sanitization.  On the server DOMPurify is skipped (no DOM available) and
 * Angular's built-in sanitizer handles cross-site scripting protection.
 *
 * ⭐ SHARED — Works on web, mobile, and SSR ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { type TrackingSurface, extractTrackedDestinationUrl } from '@nxt1/core';
import { getPlatformFaviconUrlFromUrl } from '@nxt1/core/platforms';
import { Marked, Renderer, type TokenizerAndRendererExtension } from 'marked';
import { NxtBrowserService } from '../../services/browser';
import { buildInlineVideoPreviewSrc } from '../video-preview';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Escape HTML special chars to prevent attribute injection in the renderer. */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TIMESTAMP_INLINE_RE = /^(?<![\w.:/-])(?:([0-9]{1,2}):)?([0-5]?\d):([0-5]\d)(?![\w:/-]|\.\d)/;

type MarkdownTimestampToken = {
  type: 'videoTimestamp';
  raw: string;
  text: string;
  timeMs: number;
};

function parseTimestampMs(value: string): number | null {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;

  const [hours, minutes, seconds] =
    parts.length === 3 ? [parts[0]!, parts[1]!, parts[2]!] : [0, parts[0]!, parts[1]!];

  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

const videoTimestampExtension: TokenizerAndRendererExtension = {
  name: 'videoTimestamp',
  level: 'inline',
  start(src) {
    const match = /(?<![\w.:/-])(?:[0-9]{1,2}:)?[0-5]?\d:[0-5]\d(?![\w:/-]|\.\d)/.exec(src);
    return match?.index;
  },
  tokenizer(src) {
    const match = TIMESTAMP_INLINE_RE.exec(src);
    if (!match) return undefined;

    const text = match[0]!;
    const timeMs = parseTimestampMs(text);
    if (timeMs === null) return undefined;

    return {
      type: 'videoTimestamp',
      raw: text,
      text,
      timeMs,
    } satisfies MarkdownTimestampToken;
  },
  renderer(token) {
    const timestamp = token as MarkdownTimestampToken;
    const label = escapeAttr(timestamp.text);
    return `<button type="button" class="md-timestamp-link" data-md-time-ms="${timestamp.timeMs}" aria-label="Jump to ${label}">${label}</button>`;
  },
};

function extractPosterFragment(rawUrl: string): { href: string; posterUrl: string } {
  const marker = '#poster=';
  const markerIndex = rawUrl.indexOf(marker);
  if (markerIndex === -1) return { href: rawUrl, posterUrl: '' };

  const href = rawUrl.slice(0, markerIndex);
  const encodedPosterUrl = rawUrl.slice(markerIndex + marker.length);
  try {
    return { href, posterUrl: decodeURIComponent(encodedPosterUrl).trim() };
  } catch {
    return { href, posterUrl: encodedPosterUrl.trim() };
  }
}

function replaceVideoExtensionWithJpeg(value: string): string | null {
  // Try new naming convention first: video.mp4 → video-thumbnail.jpg
  const thumbnailName = value.replace(/\.(mp4|mov|webm|m4v|avi|mkv)$/i, '-thumbnail.jpg');
  if (thumbnailName !== value) return thumbnailName;

  // Fallback to old convention: video.mp4 → video.jpg
  const replaced = value.replace(/\.(mp4|mov|webm|m4v|avi|mkv)$/i, '.jpg');
  return replaced === value ? null : replaced;
}

function deriveSiblingVideoPosterUrl(videoSrc: string): string | null {
  try {
    const parsed = new URL(videoSrc);
    parsed.hash = '';
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/^(.*\/o\/)(.+)$/);
      if (!match?.[1] || !match[2]) return null;
      const objectPath = decodeURIComponent(match[2]).replace(/^\/+/, '');
      const posterObjectPath = replaceVideoExtensionWithJpeg(objectPath);
      if (!posterObjectPath) return null;
      parsed.pathname = `${match[1]}${encodeURIComponent(posterObjectPath)}`;
      return parsed.toString();
    }

    const decodedPathname = decodeURIComponent(parsed.pathname);
    const posterPathname = replaceVideoExtensionWithJpeg(decodedPathname);
    if (!posterPathname) return null;
    parsed.pathname = posterPathname;
    return parsed.toString();
  } catch {
    const hashlessSrc = videoSrc.split('#')[0] ?? videoSrc;
    const [baseUrl, ...queryParts] = hashlessSrc.split('?');
    if (!baseUrl) return null;
    const thumbnailBase = replaceVideoExtensionWithJpeg(baseUrl);
    if (!thumbnailBase) return null;
    const query = queryParts.length > 0 ? '?' + queryParts.join('?') : '';
    return thumbnailBase + query;
  }
}
// ─── Renderer ──────────────────────────────────────────────────────────────

type MarkdownMediaType = 'image' | 'video';

export interface MarkdownMediaRequestedEvent {
  readonly url: string;
  readonly type: MarkdownMediaType;
  readonly alt?: string;
  readonly poster?: string;
}

function inferMediaTypeFromUrl(rawUrl: string): MarkdownMediaType | null {
  try {
    const value = rawUrl.trim();
    if (!value) return null;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalized);
    const pathname = url.pathname.toLowerCase();
    const hostname = url.hostname.toLowerCase();

    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(pathname)) {
      return 'image';
    }
    if (/\/images?\//i.test(pathname)) {
      return 'image';
    }
    if (
      /\.(mp4|mov|webm|m4v|m3u8)$/i.test(pathname) ||
      hostname === 'watch.cloudflarestream.com' ||
      hostname === 'iframe.videodelivery.net' ||
      hostname.endsWith('.videodelivery.net') ||
      hostname.endsWith('.cloudflarestream.com')
    ) {
      return 'video';
    }
    // Firebase Storage / GCS: encoded paths or extensionless objects — check full URL
    const lowerUrl = normalized.toLowerCase();
    if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(lowerUrl)) {
      if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#%]|$)/i.test(lowerUrl)) return 'image';
      if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#%]|$)/i.test(lowerUrl)) return 'video';
      if (/(?:\/|%2F)videos?(?:\/|%2F)/i.test(lowerUrl)) return 'video';
      if (/(?:\/|%2F)images?(?:\/|%2F)/i.test(lowerUrl)) return 'image';
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns true for inline video preview links we can open in the media viewer. */
function isInlineVideoPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const lowerUrl = normalized.toLowerCase();
    if (
      /\.(mp4|mov|webm|m4v|m3u8)$/i.test(pathname) ||
      hostname === 'watch.cloudflarestream.com' ||
      hostname === 'iframe.videodelivery.net' ||
      hostname.endsWith('.videodelivery.net') ||
      hostname.endsWith('.cloudflarestream.com')
    ) {
      return true;
    }
    if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(lowerUrl)) {
      if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#%]|$)/i.test(lowerUrl)) return false;
      if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#%]|$)/i.test(lowerUrl)) return true;
      if (/(?:\/|%2F)videos?(?:\/|%2F)/i.test(lowerUrl)) return true;
    }
    return false;
  } catch {
    return /\.(mp4|mov|webm|m4v|m3u8)([?#]|$)/i.test(url);
  }
}

function normalizeTrackedLink(url: string | null | undefined): string | null {
  if (!url) return null;
  return extractRenderableMediaUrlFromLine(url) ?? extractTrackedDestinationUrl(url) ?? url;
}

function isOpenableHttpUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^(https?:\/\/|www\.)/i.test(url.trim());
}

function stripInteractiveTimestampHtml(value: string): string {
  return value.replace(/<button\b[^>]*class="md-timestamp-link"[^>]*>(.*?)<\/button>/g, '$1');
}

function shouldUseCorsForVideoPreview(url: string): boolean {
  try {
    const normalized = decodeHtmlAttributeValue(url).trim();
    const parsed = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(parsed.hostname)) {
      return false;
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return true;
  }
}

/**
 * Builds an inline video preview with a play-icon overlay.
 * No controls — tapping opens the full media viewer.
 * MIME type includes H.264 Level 4.0 high profile codec for mobile device compatibility.
 */
function buildVideoThumb(safeHref: string, label: string, posterUrl?: string): string {
  const previewSrc = buildInlineVideoPreviewSrc(safeHref);
  // Play triangle SVG (circle + triangle)
  const playIcon =
    `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="22" cy="22" r="22" fill="rgba(0,0,0,0.55)"/>` +
    `<polygon points="17,13 35,22 17,31" fill="#fff"/>` +
    `</svg>`;

  const posterHtml = posterUrl
    ? `<img class="md-video-poster" src="${escapeAttr(posterUrl)}" alt="" aria-hidden="true" decoding="async" referrerpolicy="no-referrer" />`
    : `<span class="md-video-poster md-video-poster--fallback" aria-hidden="true"></span>`;

  const posterAttr = posterUrl ? ` poster="${escapeAttr(posterUrl)}"` : '';
  const wrapClass = posterUrl ? 'md-video-wrap md-video-wrap--has-poster' : 'md-video-wrap';
  const corsAttr = shouldUseCorsForVideoPreview(safeHref) ? ' crossorigin="anonymous"' : '';

  return (
    `<span class="${wrapClass}" data-md-video-src="${safeHref}" role="button" tabindex="0" aria-label="${escapeAttr(label || 'Play video')}">` +
    posterHtml +
    `<video class="md-video-preview"${corsAttr} type="video/mp4; codecs=&quot;avc1.640028&quot;" src="${previewSrc}"${posterAttr} muted playsinline webkit-playsinline preload="auto" aria-hidden="true"></video>` +
    `<span class="md-video-play" aria-hidden="true">${playIcon}</span>` +
    `</span>`
  );
}

function createNxtRenderer(): Renderer {
  const renderer = new Renderer();

  // Links → if href is a video URL, render inline <video>;
  //          if href is a bare image URL (text === href), render inline <img>;
  //          otherwise open in new tab.
  renderer.link = ({ href, title, text }) => {
    let normalizedHref = normalizeTrackedLink(href);

    let posterUrl = '';
    if (normalizedHref) {
      const extracted = extractPosterFragment(normalizedHref);
      normalizedHref = extracted.href;
      posterUrl = extracted.posterUrl;
    }

    // Block javascript: protocol to prevent XSS
    const safeHref =
      /^javascript:/i.test(normalizedHref ?? '') || !isOpenableHttpUrl(normalizedHref)
        ? '#'
        : escapeAttr(normalizedHref ?? '');

    const displayText = stripInteractiveTimestampHtml(
      href && normalizedHref && text === href ? normalizedHref : text
    );

    if (isInlineVideoPreviewUrl(normalizedHref)) {
      return buildVideoThumb(safeHref, displayText, posterUrl);
    }

    // When the AI outputs a bare image URL (e.g. Firebase Storage) the GFM
    // autolinker produces a link where text === href. Render it as an inline
    // image instead of a raw URL anchor.
    const isBareUrl = href && normalizedHref && text === href;
    if (isBareUrl && inferMediaTypeFromUrl(normalizedHref ?? '') === 'image') {
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return `<img src="${safeHref}" alt=""${titleAttr} loading="lazy" class="md-inline-img" />`;
    }

    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    const faviconUrl = normalizedHref ? getPlatformFaviconUrlFromUrl(normalizedHref) : null;
    const faviconHtml = faviconUrl
      ? `<img class="md-link-favicon" src="${escapeAttr(faviconUrl)}" alt="" aria-hidden="true" loading="lazy" />`
      : '';
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${faviconHtml}${displayText}</a>`;
  };

  // Images → if src is actually a video URL (model used ![]() with .mp4), render thumb
  renderer.image = ({ href, title, text }) => {
    let normalizedHref = normalizeTrackedLink(href) ?? href ?? '';
    const extracted = extractPosterFragment(normalizedHref);
    normalizedHref = extracted.href;
    const posterUrl = extracted.posterUrl;

    const safeHref = escapeAttr(normalizedHref);
    if (isInlineVideoPreviewUrl(normalizedHref)) {
      return buildVideoThumb(safeHref, text, posterUrl);
    }
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    const altAttr = escapeAttr(text ?? '');
    return `<img src="${safeHref}" alt="${altAttr}"${titleAttr} loading="lazy" />`;
  };

  // Code blocks → wrapper for copy-button + optional language label
  renderer.code = ({ text, lang }) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const langLabel = lang ? `<span class="code-lang-label">${lang}</span>` : '';
    return (
      `<div class="code-block-wrapper">` +
      `${langLabel}` +
      `<button type="button" class="code-copy-btn" aria-label="Copy code">Copy</button>` +
      `<pre><code${langClass}>${text}</code></pre>` +
      `</div>`
    );
  };

  // Tables → responsive scroll wrapper
  renderer.table = function (token) {
    const inner = Renderer.prototype.table.call(this, token);
    return `<div class="table-responsive">${inner}</div>`;
  };

  return renderer;
}

// ─── Streaming normalizer ────────────────────────────────────────────────────

/**
 * Closes any unclosed fenced code block so `marked` renders a valid (if
 * truncated) block instead of leaking raw text during SSE streaming.
 * Also closes a trailing unclosed inline-code backtick span.
 *
 * Safe to call on complete (history) messages — it is a no-op when all
 * fences and backticks are already properly closed. Always applied so that
 * messages persisted mid-stream (user exited before streaming finished)
 * render correctly on reload without requiring a full page refresh.
 */
function normalizeStreamingMarkdown(raw: string): string {
  const lines = raw.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    const m = /^(`{3,}|~{3,})/.exec(line.trimStart());
    if (m) {
      const char = m[1]![0]!;
      const len = m[1]!.length;
      if (!inFence) {
        inFence = true;
        fenceChar = char;
        fenceLen = len;
      } else if (char === fenceChar && len >= fenceLen) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
    }
  }

  if (inFence) {
    // Append a closing fence so marked produces a valid code block.
    return raw + '\n' + fenceChar.repeat(fenceLen);
  }

  // ── Unclosed inline code at the trailing edge ─────────────────────────────
  // If the last line has an odd number of non-escaped backtick characters, the
  // cursor is mid-token.  Close it so the span renders as code rather than
  // leaking the opening backtick as plain text.
  const lastLine = lines[lines.length - 1] ?? '';
  const backtickCount = (lastLine.match(/(?<!\\)`/g) ?? []).length;
  if (backtickCount % 2 !== 0) {
    return raw + '`';
  }

  return raw;
}

// ─── Storage URL pre-processor ──────────────────────────────────────────────

/**
 * Matches bare Firebase / Google Storage URLs pointing to image files.
 * Negative lookbehind `(?<!\()` skips URLs that are already inside
 * Markdown link/image syntax `[text](url)` or `![alt](url)`.
 */
const BARE_STORAGE_IMAGE_URL_RE =
  /(?<!\()https:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\/[^\s)\]]+/g;

/**
 * Converts bare Firebase/Google Storage image URLs to Markdown image syntax.
 * Prevents raw URLs from appearing as yellow link text in chat bubbles.
 *
 * `- https://storage.googleapis.com/.../file.png`
 *   → `- ![](https://storage.googleapis.com/.../file.png)`
 *
 * URLs that are already wrapped in `[text](url)` or `![alt](url)` are left
 * untouched because the lookbehind prevents a match when the URL is preceded
 * by `(`.
 */
function preprocessStorageImageUrls(source: string): string {
  return source.replace(BARE_STORAGE_IMAGE_URL_RE, (url) =>
    inferMediaTypeFromUrl(url) === 'image' ? `![](${url})` : url
  );
}

function unescapeMediaMarkdownSyntax(value: string): string {
  return value.replace(/\\([!()[\]])/g, '$1');
}

function unwrapMediaMarkdownDecorators(value: string): string {
  let current = value.trim();
  const wrappers: readonly (readonly [string, string])[] = [
    ['**', '**'],
    ['__', '__'],
    ['*', '*'],
    ['_', '_'],
  ];

  for (let i = 0; i < 4; i += 1) {
    const match = wrappers.find(
      ([open, close]) =>
        current.startsWith(open) &&
        current.endsWith(close) &&
        current.length > open.length + close.length
    );
    if (!match) break;
    current = current.slice(match[0].length, current.length - match[1].length).trim();
  }

  return current;
}

function extractRenderableMediaUrlFromLine(line: string): string | null {
  const trimmed = line.trim();
  const codeMatch = /^(?<ticks>`+)(?<inner>[^`\n]+)\k<ticks>$/.exec(trimmed);
  const unwrapped = codeMatch?.groups?.['inner']?.trim() ?? trimmed;

  for (const candidate of [
    unwrapped,
    unwrapMediaMarkdownDecorators(unwrapped),
    unescapeMediaMarkdownSyntax(unwrapped),
    unwrapMediaMarkdownDecorators(unescapeMediaMarkdownSyntax(unwrapped)),
  ]) {
    const imageMatch = /^!\[[^\]]*\]\((https?:\/\/.+)\)$/.exec(candidate);
    const linkMatch = /^\[[^\]]+\]\((https?:\/\/.+)\)$/.exec(candidate);
    const bareMatch = /^(https?:\/\/\S+)$/.exec(candidate);
    const url = imageMatch?.[1] ?? linkMatch?.[1] ?? bareMatch?.[1] ?? null;
    if (url && inferMediaTypeFromUrl(url)) return url;
  }

  return null;
}

function isRenderableMediaLine(line: string): boolean {
  return extractRenderableMediaUrlFromLine(line) !== null;
}

function normalizeRenderableMediaLine(line: string): string | null {
  const trimmed = line.trim();
  const codeMatch = /^(?<ticks>`+)(?<inner>[^`\n]+)\k<ticks>$/.exec(trimmed);
  const unwrapped = codeMatch?.groups?.['inner']?.trim() ?? trimmed;
  const normalized = unwrapMediaMarkdownDecorators(unescapeMediaMarkdownSyntax(unwrapped));
  return isRenderableMediaLine(normalized) ? normalized : null;
}

function unwrapMediaOnlyFencedBlocks(source: string): string {
  const fencedBlockPattern = /(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\2\3[ \t]*(?=\n|$)/g;

  return source.replace(
    fencedBlockPattern,
    (match, prefix: string, _indent: string, _fence: string, body: string) => {
      const lines = body.split('\n');
      const nonEmptyLines = lines.map((line) => normalizeRenderableMediaLine(line)).filter(Boolean);
      if (!nonEmptyLines.length) {
        return match;
      }

      return `${prefix}${nonEmptyLines.join('\n')}`;
    }
  );
}

function unwrapMediaOnlyInlineCode(source: string): string {
  return source.replace(/(`+)([^`\n]+?)\1/g, (match, _ticks: string, inner: string) => {
    const normalized = normalizeRenderableMediaLine(inner);
    return normalized ?? match;
  });
}

function deindentMediaOnlyLines(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const normalized = normalizeRenderableMediaLine(line);
      if (!normalized) return line;
      if (/^[ \t]{4,}/.test(line)) return normalized;
      return line.trim() !== normalized ? normalized : line;
    })
    .join('\n');
}

function decodeHtmlAttributeValue(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function haveCurrentVideoDataReadyState(): number {
  return typeof HTMLMediaElement !== 'undefined' &&
    typeof HTMLMediaElement.HAVE_CURRENT_DATA === 'number'
    ? HTMLMediaElement.HAVE_CURRENT_DATA
    : 2;
}

function extractHtmlAttribute(markup: string, attributeName: string): string | null {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escapedName}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = pattern.exec(markup);
  const value = match?.[2]?.trim();
  return value ? decodeHtmlAttributeValue(value) : null;
}

function appendPosterFragmentToVideoUrl(videoUrl: string, posterUrl: string | null): string {
  if (!posterUrl || /#poster=/i.test(videoUrl)) return videoUrl;
  return `${videoUrl}#poster=${encodeURIComponent(posterUrl).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )}`;
}

function normalizeRawVideoHtml(source: string, suppressIncomplete = false): string {
  const normalized = source.replace(
    /<video\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>(?:[\s\S]*?<\/video>)?/gi,
    (match, _quote: string, srcValue: string) => {
      const normalizedUrl =
        extractRenderableMediaUrlFromLine(srcValue) ?? decodeHtmlAttributeValue(srcValue).trim();
      const posterUrl = extractHtmlAttribute(match, 'poster');
      const renderableUrl = appendPosterFragmentToVideoUrl(normalizedUrl, posterUrl);
      return inferMediaTypeFromUrl(normalizedUrl) === 'video'
        ? `[View Video](${renderableUrl})`
        : match;
    }
  );

  if (!suppressIncomplete) {
    return normalized;
  }

  return normalized.replace(/<video\b[\s\S]*$/i, (fragment) => {
    const srcMatch = /\bsrc=(['"])([\s\S]*)$/i.exec(fragment);
    const candidateValue = srcMatch?.[2]?.trim() ?? '';
    const normalizedUrl = extractRenderableMediaUrlFromLine(candidateValue) ?? candidateValue;

    if (inferMediaTypeFromUrl(normalizedUrl) === 'video') {
      return `[View Video](${normalizedUrl})`;
    }

    return '';
  });
}

export function preprocessMediaPresentationMarkdown(
  source: string,
  suppressIncompleteRawVideoHtml = false
): string {
  return normalizeRawVideoHtml(
    deindentMediaOnlyLines(unwrapMediaOnlyInlineCode(unwrapMediaOnlyFencedBlocks(source))),
    suppressIncompleteRawVideoHtml
  );
}

// ─── Marked singleton ──────────────────────────────────────────────────────

const markedInstance = new Marked({
  renderer: createNxtRenderer(),
  gfm: true,
  breaks: true,
});

markedInstance.use({ extensions: [videoTimestampExtension] });

// ─── Component ─────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-markdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<div class="md" [innerHTML]="safeHtml()"></div>`,
  styles: [
    `
      /* =========================================================
         HOST — All styles scoped under nxt1-markdown to prevent
         global leaking (ViewEncapsulation.None is required for
         [innerHTML] styling but we manually namespace everything).
         ========================================================= */

      nxt1-markdown {
        display: block;
        line-height: 1.6;
        word-break: break-word;
        overflow-wrap: break-word;
      }

      /* =========================================================
         TYPOGRAPHY — Headings
         ========================================================= */

      nxt1-markdown .md :is(h1, h2, h3, h4, h5, h6) {
        margin: 0 0 var(--nxt1-spacing-2, 0.5rem);
        font-family: var(--nxt1-fontFamily-display, var(--nxt1-fontFamily-system, inherit));
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        line-height: 1.3;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      nxt1-markdown .md h1 {
        font-size: var(--nxt1-fontSize-2xl, 1.5rem);
      }

      nxt1-markdown .md h2 {
        font-size: var(--nxt1-fontSize-xl, 1.25rem);
      }

      nxt1-markdown .md h3 {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
      }

      nxt1-markdown .md h4,
      nxt1-markdown .md h5,
      nxt1-markdown .md h6 {
        font-size: var(--nxt1-fontSize-base, 1rem);
      }

      /* =========================================================
         TYPOGRAPHY — Body text
         ========================================================= */

      nxt1-markdown .md p {
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      nxt1-markdown .md p:last-child {
        margin-bottom: 0;
      }

      /* =========================================================
         TYPOGRAPHY — Bold / Italic / Emphasis
         ========================================================= */

      nxt1-markdown .md strong,
      nxt1-markdown .md b {
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      nxt1-markdown .md em,
      nxt1-markdown .md i {
        font-style: italic;
      }

      /* =========================================================
         LINKS
         ========================================================= */

      nxt1-markdown .md a {
        color: var(--nxt1-color-primary, #ccff00);
        text-decoration: none;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        transition: opacity 0.15s ease;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      nxt1-markdown .md .md-link-favicon {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        flex: 0 0 14px;
        margin: 0;
        vertical-align: middle;
        background: rgba(255, 255, 255, 0.06);
      }

      nxt1-markdown .md a:hover {
        opacity: 0.8;
        text-decoration: underline;
      }

      nxt1-markdown .md .md-timestamp-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 1.55em;
        margin: 0 0.08em;
        padding: 0 0.38em;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 36%, transparent);
        border-radius: var(--nxt1-ui-radius-sm, 4px);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 13%, transparent);
        color: var(--nxt1-color-primary, #ccff00);
        font: inherit;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        line-height: 1.2;
        cursor: pointer;
        vertical-align: baseline;
        appearance: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          opacity 0.15s ease;
      }

      nxt1-markdown .md .md-timestamp-link:hover {
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 20%, transparent);
        border-color: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 52%, transparent);
      }

      nxt1-markdown .md .md-timestamp-link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* =========================================================
         LISTS
         ========================================================= */

      nxt1-markdown .md ul,
      nxt1-markdown .md ol {
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        padding-left: var(--nxt1-spacing-5, 1.25rem);
      }

      nxt1-markdown .md li {
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      nxt1-markdown .md li::marker {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      nxt1-markdown .md li > ul,
      nxt1-markdown .md li > ol {
        margin-top: var(--nxt1-spacing-1, 0.25rem);
        margin-bottom: 0;
      }

      /* =========================================================
         BLOCKQUOTE
         ========================================================= */

      nxt1-markdown .md blockquote {
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
        border-left: 3px solid var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        border-radius: 0 var(--nxt1-ui-radius-sm, 6px) var(--nxt1-ui-radius-sm, 6px) 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      nxt1-markdown .md blockquote p:last-child {
        margin-bottom: 0;
      }

      /* =========================================================
         INLINE CODE
         ========================================================= */

      nxt1-markdown .md :not(pre) > code {
        padding: 0.15em 0.4em;
        font-size: 0.875em;
        font-family: var(--nxt1-fontFamily-mono, 'SF Mono', 'Fira Code', monospace);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-ui-radius-sm, 4px);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* =========================================================
         CODE BLOCKS
         ========================================================= */

      nxt1-markdown .md .code-block-wrapper {
        position: relative;
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-ui-radius-default, 8px);
        overflow: hidden;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.08));
      }

      nxt1-markdown .md .code-lang-label {
        display: block;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        font-size: 0.6875rem;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-bottom: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.08));
      }

      nxt1-markdown .md .code-copy-btn {
        position: absolute;
        top: var(--nxt1-spacing-1, 0.25rem);
        right: var(--nxt1-spacing-2, 0.5rem);
        padding: 4px 10px;
        font-size: 0.6875rem;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        border: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-ui-radius-sm, 4px);
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        opacity: 0;
        transition:
          opacity 0.15s ease,
          background 0.15s ease;
        z-index: 1;
      }

      nxt1-markdown .md .code-block-wrapper:hover .code-copy-btn {
        opacity: 1;
      }

      nxt1-markdown .md .code-copy-btn:hover {
        background: var(--nxt1-color-surface-400, rgba(255, 255, 255, 0.12));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      nxt1-markdown .md pre {
        margin: 0;
        padding: var(--nxt1-spacing-3, 0.75rem);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      nxt1-markdown .md pre code {
        display: block;
        font-size: 0.8125rem;
        line-height: 1.6;
        font-family: var(--nxt1-fontFamily-mono, 'SF Mono', 'Fira Code', monospace);
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: break-word;
        tab-size: 2;
      }

      /* =========================================================
         TABLES — Responsive with horizontal scroll
         ========================================================= */

      nxt1-markdown .md .table-responsive {
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        border: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.08));
      }

      nxt1-markdown .md table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      nxt1-markdown .md th {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        text-align: left;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-bottom: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.08));
        white-space: nowrap;
      }

      nxt1-markdown .md td {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        border-bottom: 1px solid var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.06));
      }

      nxt1-markdown .md tr:last-child td {
        border-bottom: none;
      }

      nxt1-markdown .md tr:hover td {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      /* =========================================================
         HORIZONTAL RULE
         ========================================================= */

      nxt1-markdown .md hr {
        margin: var(--nxt1-spacing-4, 1rem) 0;
        border: none;
        height: 1px;
        background: var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.08));
      }

      /* =========================================================
         IMAGES
         ========================================================= */

      nxt1-markdown .md img {
        max-width: 100%;
        height: auto;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        margin: var(--nxt1-spacing-2, 0.5rem) 0;
      }

      /* =========================================================
         INLINE VIDEO THUMBNAIL (tap → opens full media viewer)
         ========================================================= */

      nxt1-markdown .md .md-video-wrap {
        position: relative;
        display: block;
        width: min(240px, 100%);
        border-radius: var(--nxt1-ui-radius-default, 8px);
        background: #000;
        margin: var(--nxt1-spacing-2, 0.5rem) 0;
        cursor: pointer;
      }

      nxt1-markdown .md .md-video-wrap--has-poster {
        display: inline-block;
        width: auto;
        max-width: min(240px, 100%);
        aspect-ratio: auto;
        background: #000;
        height: unset;
      }

      nxt1-markdown .md .md-video-poster {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }

      nxt1-markdown .md .md-video-wrap--has-poster img.md-video-poster {
        position: relative;
        inset: auto;
        width: auto;
        max-width: 100%;
        height: auto;
        max-height: min(360px, 70vh);
        object-fit: contain;
        background: #000;
        margin: 0;
      }

      nxt1-markdown .md .md-video-poster--fallback {
        z-index: 0;
        background:
          radial-gradient(circle at 30% 22%, rgba(204, 255, 0, 0.18), transparent 34%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.035)), #111;
      }

      nxt1-markdown .md .md-video-preview {
        position: relative;
        z-index: 1;
        display: block;
        width: 100%;
        height: auto;
        max-height: min(360px, 70vh);
        object-fit: contain;
        background: transparent;
        pointer-events: none;
      }

      nxt1-markdown .md .md-video-wrap--has-poster .md-video-preview {
        display: none;
      }

      nxt1-markdown .md .md-video-wrap:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      nxt1-markdown .md .md-video-play {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        background: transparent;
        transition: transform 0.15s ease;
      }

      nxt1-markdown .md .md-video-wrap:hover .md-video-play {
        transform: scale(1.05);
      }

      /* =========================================================
         REDUCED MOTION
         ========================================================= */

      @media (prefers-reduced-motion: reduce) {
        nxt1-markdown .md a,
        nxt1-markdown .md .code-copy-btn {
          transition: none;
        }
      }
    `,
  ],
})
export class NxtMarkdownComponent {
  /** Raw markdown string (can be partial during SSE streaming). */
  readonly content = input('');
  /**
   * Set to `true` while the message is being streamed via SSE.
   * Enables a pre-parse normalizer that closes incomplete markdown tokens
   * (fenced code blocks, inline code spans) so `marked` produces clean HTML
   * for every incremental chunk rather than leaking raw syntax.
   */
  readonly isStreaming = input(false);
  readonly trackingSource = input('markdown');
  readonly trackingSurface = input<TrackingSurface>('message');
  readonly mediaRequested = output<MarkdownMediaRequestedEvent>();
  readonly timestampClicked = output<number>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly browser = inject(NxtBrowserService);
  private lastHandledVideoTouchAt = 0;

  /**
   * Tracks whether DOMPurify has been loaded.  Used as a computed
   * dependency so `safeHtml` re-evaluates once sanitization is available.
   *
   * Initialized from globalThis so that instances created after the first
   * component has already loaded DOMPurify start as ready immediately —
   * preventing a blank-frame flash on every new message bubble.
   */
  private readonly _dompurifyReady = signal(
    typeof (globalThis as Record<string, unknown>)['DOMPurify'] !== 'undefined'
  );

  constructor() {
    afterNextRender(() => {
      this.elRef.nativeElement.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          if (this.emitVideoRequestFromEvent(e)) {
            this.lastHandledVideoTouchAt = Date.now();
          }
        },
        { passive: false }
      );

      this.elRef.nativeElement.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        this.emitVideoRequestFromEvent(e);
      });

      // Delegated click handler for dynamically injected controls and links.
      this.elRef.nativeElement.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;

        if (target.classList.contains('code-copy-btn')) {
          const wrapper = target.closest('.code-block-wrapper');
          const code = wrapper?.querySelector('code');
          if (!code) return;

          navigator.clipboard.writeText(code.textContent ?? '').then(() => {
            target.textContent = 'Copied!';
            setTimeout(() => (target.textContent = 'Copy'), 1500);
          });
          return;
        }

        const timestampButton = target.closest('[data-md-time-ms]') as HTMLElement | null;
        const timestampMs = Number(timestampButton?.getAttribute('data-md-time-ms'));
        if (timestampButton && Number.isFinite(timestampMs) && timestampMs >= 0) {
          e.preventDefault();
          this.timestampClicked.emit(timestampMs);
          return;
        }

        const image = target.closest('img[src]') as HTMLImageElement | null;
        const imageSrc = image?.getAttribute('src') ?? '';
        if (
          image &&
          !image.classList.contains('md-link-favicon') &&
          /^(https?:\/\/|www\.)/i.test(imageSrc)
        ) {
          e.preventDefault();
          this.mediaRequested.emit({
            url: imageSrc,
            type: 'image',
            alt: image.getAttribute('alt') ?? undefined,
          });
          return;
        }

        // Video thumbnail wrapper (data-md-video-src) — tap opens media viewer
        if (Date.now() - this.lastHandledVideoTouchAt > 700 && this.emitVideoRequestFromEvent(e)) {
          return;
        }

        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        const href = anchor?.getAttribute('href') ?? '';
        if (!anchor) {
          return;
        }

        if (!isOpenableHttpUrl(href)) {
          // Prevent empty/relative links from navigating the current app route.
          e.preventDefault();
          return;
        }

        const mediaType = inferMediaTypeFromUrl(href);
        if (mediaType) {
          e.preventDefault();
          this.mediaRequested.emit({ url: href, type: mediaType });
          return;
        }

        e.preventDefault();
        void this.browser.openLink({
          url: href,
          source: this.trackingSource(),
          surface: this.trackingSurface(),
        });
      });

      this.elRef.nativeElement.addEventListener(
        'error',
        (e: Event) => {
          const target = e.target as HTMLElement | null;
          if (!target?.classList.contains('md-video-poster')) return;

          const wrap = target.closest('.md-video-wrap') as HTMLElement | null;
          const video = wrap?.querySelector<HTMLVideoElement>('.md-video-preview') ?? null;
          if (!wrap || !video) return;

          const poster = target as HTMLImageElement;
          const retryCount = Number(poster.dataset['mdPosterRetry'] ?? '0');
          const posterSrc = poster.currentSrc || poster.getAttribute('src');
          if (retryCount < 1 && posterSrc) {
            poster.dataset['mdPosterRetry'] = String(retryCount + 1);
            poster.removeAttribute('src');
            setTimeout(() => {
              if (!poster.isConnected) return;
              poster.setAttribute('src', posterSrc);
            }, 80);
            return;
          }

          target.remove();
          wrap.classList.remove('md-video-wrap--has-poster');
          wrap.classList.add('md-video-wrap--poster-failed');

          const src = video.getAttribute('src');
          if (src) {
            video.setAttribute('src', buildInlineVideoPreviewSrc(src));
          }
        },
        true
      );

      this.elRef.nativeElement.addEventListener(
        'loadedmetadata',
        (e: Event) => {
          const video = e.target as HTMLVideoElement | null;
          if (!video?.classList.contains('md-video-preview')) return;
          if (!video.videoWidth || !video.videoHeight) return;
          const wrap = video.closest('.md-video-wrap') as HTMLElement | null;
          if (!wrap) return;
          wrap.style.setProperty(
            '--md-video-aspect-ratio',
            `${video.videoWidth} / ${video.videoHeight}`
          );
          wrap.classList.add('md-video-wrap--metadata-sized');
          this.hydrateFallbackVideoPosterFromFrame(video);
        },
        true
      );

      this.elRef.nativeElement.addEventListener(
        'loadeddata',
        (e: Event) => {
          const video = e.target as HTMLVideoElement | null;
          if (!video?.classList.contains('md-video-preview')) return;
          this.hydrateFallbackVideoPosterFromFrame(video);
        },
        true
      );

      this.elRef.nativeElement.addEventListener(
        'canplay',
        (e: Event) => {
          const video = e.target as HTMLVideoElement | null;
          if (!video?.classList.contains('md-video-preview')) return;
          this.hydrateFallbackVideoPosterFromFrame(video);
        },
        true
      );

      this.elRef.nativeElement.addEventListener(
        'timeupdate',
        (e: Event) => {
          const video = e.target as HTMLVideoElement | null;
          if (!video?.classList.contains('md-video-preview')) return;
          this.hydrateFallbackVideoPosterFromFrame(video);
        },
        true
      );

      // On mobile, preload="auto" is often ignored, so video events don't fire.
      // Use MutationObserver to detect when video elements are added and poll for metadata.
      const videoObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLVideoElement && node.classList.contains('md-video-preview')) {
              this.prepareInlineVideoPreview(node);
              continue;
            }
            if (!(node instanceof Element)) continue;
            const nestedVideos = Array.from(
              node.querySelectorAll('video.md-video-preview')
            ) as HTMLVideoElement[];
            nestedVideos.forEach((video: HTMLVideoElement) =>
              this.prepareInlineVideoPreview(video)
            );
          }
        }
      });
      videoObserver.observe(this.elRef.nativeElement, { childList: true, subtree: true });
      this.processExistingInlineVideoPreviews();

      // Load DOMPurify on first browser render if not already present.
      // Once ready, flip the signal so `safeHtml` re-computes with full
      // sanitization (copy buttons + target attrs preserved).
      if ((globalThis as Record<string, unknown>)['DOMPurify']) {
        // Already loaded by a sibling instance — nothing to do.
        return;
      }
      import('dompurify').then((mod) => {
        (globalThis as Record<string, unknown>)['DOMPurify'] = mod.default;
        this._dompurifyReady.set(true);
      });
    });
  }

  private emitVideoRequestFromEvent(e: Event): boolean {
    const target = e.target as HTMLElement | null;
    const videoWrap = target?.closest('[data-md-video-src]') as HTMLElement | null;
    const videoWrapSrc = videoWrap?.getAttribute('data-md-video-src') ?? '';
    if (!videoWrap || !/^(https?:\/\/|www\.)/i.test(videoWrapSrc)) return false;
    const poster =
      videoWrap.querySelector<HTMLVideoElement>('video.md-video-preview')?.poster ||
      videoWrap.querySelector<HTMLImageElement>('img.md-video-poster')?.src ||
      '';

    e.preventDefault();
    e.stopPropagation();
    this.mediaRequested.emit({
      url: videoWrapSrc,
      type: 'video',
      ...(poster ? { poster } : {}),
    });
    return true;
  }

  private pollVideoMetadataOnMobile(video: HTMLVideoElement): void {
    let attempts = 0;
    const maxAttempts = 50; // ~5 seconds with 100ms intervals
    let loadRequested = false;

    const poll = () => {
      attempts++;

      if (!loadRequested) {
        loadRequested = true;
        try {
          video.load();
        } catch {
          // Ignore load errors; mobile WebViews may still advance readyState.
        }
      }

      // Try to trigger load by setting currentTime
      try {
        video.currentTime = 0.1;
      } catch {
        // Ignore errors
      }

      if (video.readyState >= haveCurrentVideoDataReadyState()) {
        this.hydrateFallbackVideoPosterFromFrame(video);
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 100);
      }
    };

    poll();
  }

  private processExistingInlineVideoPreviews(): void {
    const videos = Array.from(
      this.elRef.nativeElement.querySelectorAll('video.md-video-preview')
    ) as HTMLVideoElement[];
    videos.forEach((video: HTMLVideoElement) => this.prepareInlineVideoPreview(video));
  }

  private prepareInlineVideoPreview(video: HTMLVideoElement): void {
    this.tryLoadVideoThumbnailPoster(video);
    this.pollVideoMetadataOnMobile(video);
    this.kickstartMobileInlineVideoPreview(video);
  }

  private kickstartMobileInlineVideoPreview(video: HTMLVideoElement): void {
    if (video.dataset['mdPreviewKickstarted'] === 'true') return;
    if (video.dataset['mdPosterHydrated'] === 'true') return;

    const wrap = video.closest('.md-video-wrap') as HTMLElement | null;
    if (wrap?.classList.contains('md-video-wrap--has-poster')) return;

    video.dataset['mdPreviewKickstarted'] = 'true';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const pauseAndHydrate = (): void => {
      this.hydrateFallbackVideoPosterFromFrame(video);
      try {
        video.pause();
      } catch {
        /* no-op */
      }
    };

    const cleanup = (): void => {
      video.removeEventListener('loadeddata', pauseAndHydrate);
      video.removeEventListener('canplay', pauseAndHydrate);
      video.removeEventListener('timeupdate', pauseAndHydrate);
    };

    video.addEventListener('loadeddata', pauseAndHydrate, { once: true });
    video.addEventListener('canplay', pauseAndHydrate, { once: true });
    video.addEventListener('timeupdate', pauseAndHydrate, { once: true });

    try {
      video.load();
    } catch {
      /* no-op */
    }

    const playResult = typeof video.play === 'function' ? video.play() : null;
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => undefined);
    }

    setTimeout(() => {
      pauseAndHydrate();
      cleanup();
    }, 900);
  }

  private tryLoadVideoThumbnailPoster(video: HTMLVideoElement): void {
    // First check if poster attribute already has a URL (from backend injection)
    const existingPoster = video.getAttribute('poster');
    if (existingPoster) {
      this.loadPosterImage(video, existingPoster);
      return;
    }

    const videoSrc = video.src || video.getAttribute('src');
    if (!videoSrc) return;

    const thumbnailUrl = deriveSiblingVideoPosterUrl(videoSrc);
    if (!thumbnailUrl) return;
    this.loadPosterImage(video, thumbnailUrl);
  }

  private loadPosterImage(video: HTMLVideoElement, posterUrl: string): void {
    const wrap = video.closest('.md-video-wrap') as HTMLElement | null;
    if (!wrap) return;

    const img = document.createElement('img');
    img.className = 'md-video-poster';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');

    img.onload = () => {
      const fallbackPoster = wrap.querySelector<HTMLElement>('.md-video-poster--fallback');
      if (fallbackPoster) {
        fallbackPoster.replaceWith(img);
      }
      wrap.classList.add('md-video-wrap--has-poster');
      video.poster = posterUrl;
      video.setAttribute('poster', posterUrl);
      video.dataset['mdPosterHydrated'] = 'true';
    };

    img.onerror = () => {
      // Thumbnail not found, fallback to frame extraction
      this.hydrateFallbackVideoPosterFromFrame(video);
    };

    img.src = posterUrl;
  }

  private hydrateFallbackVideoPosterFromFrame(video: HTMLVideoElement): void {
    if (video.dataset['mdPosterHydrated'] === 'true') return;

    const wrap = video.closest('.md-video-wrap') as HTMLElement | null;
    if (!wrap || wrap.classList.contains('md-video-wrap--has-poster')) return;

    const fallbackPoster =
      wrap.querySelector<HTMLElement>('.md-video-poster--fallback') ??
      wrap.querySelector<HTMLElement>('.md-video-poster:not(img)');
    if (!fallbackPoster) return;

    if (video.readyState < haveCurrentVideoDataReadyState()) return;

    try {
      const sourceWidth = Math.max(1, Math.round(video.videoWidth || 320));
      const sourceHeight = Math.max(1, Math.round(video.videoHeight || 180));
      const maxEdge = Math.max(sourceWidth, sourceHeight);
      const scale = maxEdge > 640 ? 640 / maxEdge : 1;
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.drawImage(video, 0, 0, width, height);
      const posterUrl = canvas.toDataURL('image/jpeg', 0.78);
      if (!posterUrl.startsWith('data:image/')) return;

      const poster = document.createElement('img');
      poster.className = 'md-video-poster';
      poster.src = posterUrl;
      poster.alt = '';
      poster.setAttribute('aria-hidden', 'true');
      poster.setAttribute('decoding', 'async');
      fallbackPoster.replaceWith(poster);

      video.poster = posterUrl;
      video.setAttribute('poster', posterUrl);
      wrap.classList.add('md-video-wrap--has-poster');
      wrap.classList.remove('md-video-wrap--poster-failed');
      video.dataset['mdPosterHydrated'] = 'true';

      video.pause();
    } catch {
      video.dataset['mdPosterHydrated'] = 'failed';
    }
  }

  /**
   * Computed signal: raw markdown → parsed HTML → sanitized SafeHtml.
   *
   * Dependencies: `content()` (new SSE chunk) + `_dompurifyReady()`.
   *
   * Flow:
   * - Server: returns raw HTML string — Angular's built-in [innerHTML]
   *   sanitizer provides XSS protection (some attrs/tags may be stripped).
   * - Browser (DOMPurify not yet loaded): same fallback.
   * - Browser (DOMPurify ready): full sanitization via DOMPurify with
   *   `bypassSecurityTrustHtml` — preserves target, rel, aria-label,
   *   and <button> elements.
   */
  readonly safeHtml = computed<SafeHtml>(() => {
    const raw = this.content();
    if (!raw) return '';

    const isBrowserRuntime = typeof window !== 'undefined';

    // Always normalize markdown to close any incomplete tokens (unclosed fences,
    // trailing backticks). For live streaming this handles partial chunks; for
    // history messages this handles content that was persisted mid-stream when
    // the user navigated away before the response finished — ensuring correct
    // rendering on reload without requiring a full page refresh.
    const normalized = normalizeStreamingMarkdown(raw);

    // Convert bare Firebase/Google Storage image URLs to Markdown image syntax
    // so they render as <img> instead of raw yellow link text.
    const source = preprocessStorageImageUrls(
      preprocessMediaPresentationMarkdown(normalized, this.isStreaming())
    );

    // On browser runtimes, wait for DOMPurify before injecting HTML to avoid
    // sanitizer crashes on malformed/partial markdown in older WebViews.
    if (isBrowserRuntime && !this._dompurifyReady()) {
      return '';
    }

    try {
      // Parse Markdown → HTML string
      const html = markedInstance.parse(source, { async: false }) as string;

      // Browser + DOMPurify available → full sanitization with attribute preservation
      if (this._dompurifyReady()) {
        const DOMPurify = (globalThis as Record<string, unknown>)[
          'DOMPurify'
        ] as (typeof import('dompurify'))['default'];
        const clean = DOMPurify.sanitize(html, {
          ADD_ATTR: [
            'target',
            'rel',
            'aria-label',
            'src',
            'alt',
            'aria-hidden',
            'loading',
            'decoding',
            'referrerpolicy',
            'class',
            'controls',
            'playsinline',
            'webkit-playsinline',
            'muted',
            'preload',
            'poster',
            'crossorigin',
            'data-md-video-src',
            'data-md-time-ms',
            'role',
            'tabindex',
          ],
          ADD_TAGS: ['button', 'video', 'source'],
        });
        return this.sanitizer.bypassSecurityTrustHtml(clean);
      }

      // Server fallback: Angular's SSR sanitizer path will still protect output.
      return html;
    } catch {
      // Fail closed on malformed markdown input.
      return '';
    }
  });
}
