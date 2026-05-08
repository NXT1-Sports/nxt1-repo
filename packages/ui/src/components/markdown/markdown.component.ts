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
  effect,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { type TrackingSurface } from '@nxt1/core';
import { getPlatformFaviconUrlFromUrl } from '@nxt1/core/platforms';
import { Marked, Renderer } from 'marked';
import { NxtBrowserService } from '../../services/browser';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Escape HTML special chars to prevent attribute injection in the renderer. */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Renderer ──────────────────────────────────────────────────────────────

type MarkdownMediaType = 'image' | 'video';

export interface MarkdownMediaRequestedEvent {
  readonly url: string;
  readonly type: MarkdownMediaType;
  readonly alt?: string;
}

function inferMediaTypeFromUrl(rawUrl: string): MarkdownMediaType | null {
  try {
    const value = rawUrl.trim();
    if (!value) return null;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalized);
    const pathname = url.pathname.toLowerCase();

    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(pathname)) {
      return 'image';
    }
    if (/\.(mp4|mov|webm|m4v|m3u8)$/i.test(pathname)) {
      return 'video';
    }
    if (/\/images?\//i.test(pathname)) {
      return 'image';
    }
    if (/\/videos?\//i.test(pathname)) {
      return 'video';
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns true for embeddable video extensions (Firebase Storage URLs include ext before '?'). */
function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)([?#]|$)/i.test(url);
}

/**
 * Builds a static video thumbnail with a play-icon overlay.
 * No controls, no autoload — tapping opens the full media viewer.
 */
function buildVideoThumb(safeHref: string, label: string): string {
  // Play triangle SVG (circle + triangle)
  const playIcon =
    `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="22" cy="22" r="22" fill="rgba(0,0,0,0.55)"/>` +
    `<polygon points="17,13 35,22 17,31" fill="#fff"/>` +
    `</svg>`;

  return (
    `<div class="md-video-wrap" data-md-video-src="${safeHref}" role="button" tabindex="0" aria-label="${escapeAttr(label || 'Play video')}">` +
    `<video class="md-video" src="${safeHref}" preload="metadata" muted playsinline></video>` +
    `<div class="md-video-play" aria-hidden="true">${playIcon}</div>` +
    `</div>`
  );
}

function createNxtRenderer(): Renderer {
  const renderer = new Renderer();

  // Links → if href is a video URL, render inline <video>; otherwise open in new tab
  renderer.link = ({ href, title, text }) => {
    // Block javascript: protocol to prevent XSS
    const safeHref = /^javascript:/i.test(href ?? '') ? '#' : escapeAttr(href ?? '');

    if (isVideoUrl(href)) {
      return buildVideoThumb(safeHref, text);
    }

    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    const faviconUrl = href ? getPlatformFaviconUrlFromUrl(href) : null;
    const faviconHtml = faviconUrl
      ? `<img class="md-link-favicon" src="${escapeAttr(faviconUrl)}" alt="" aria-hidden="true" loading="lazy" />`
      : '';
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${faviconHtml}${text}</a>`;
  };

  // Images → if src is actually a video URL (model used ![]() with .mp4), render thumb
  renderer.image = ({ href, title, text }) => {
    const safeHref = escapeAttr(href ?? '');
    if (isVideoUrl(href)) {
      return buildVideoThumb(safeHref, text);
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

// ─── Marked singleton ──────────────────────────────────────────────────────

const markedInstance = new Marked({
  renderer: createNxtRenderer(),
  gfm: true,
  breaks: true,
});

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
        overflow: hidden;
        background: #111;
        margin: var(--nxt1-spacing-2, 0.5rem) 0;
        cursor: pointer;
      }

      nxt1-markdown .md .md-video-wrap:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      nxt1-markdown .md .md-video {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
        pointer-events: none;
      }

      nxt1-markdown .md .md-video-play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.25);
        transition: background 0.15s ease;
      }

      nxt1-markdown .md .md-video-wrap:hover .md-video-play {
        background: rgba(0, 0, 0, 0.4);
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
  readonly trackingSource = input('markdown');
  readonly trackingSurface = input<TrackingSurface>('message');
  readonly mediaRequested = output<MarkdownMediaRequestedEvent>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly browser = inject(NxtBrowserService);

  /**
   * Tracks whether DOMPurify has been loaded.  Used as a computed
   * dependency so `safeHtml` re-evaluates once sanitization is available.
   */
  private readonly _dompurifyReady = signal(false);

  /** Keep inline video cards synced to each video's intrinsic ratio. */
  private readonly _syncInlineVideoRatios = effect(() => {
    this.content();
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => this.hydrateInlineVideoRatios());
  });

  constructor() {
    afterNextRender(() => {
      // Eagerly load DOMPurify on first browser render.
      // Once ready, flip the signal so `safeHtml` re-computes with full
      // sanitization (copy buttons + target attrs preserved).
      import('dompurify').then((mod) => {
        (globalThis as Record<string, unknown>)['DOMPurify'] = mod.default;
        this._dompurifyReady.set(true);
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
        const videoWrap = target.closest('[data-md-video-src]') as HTMLElement | null;
        const videoWrapSrc = videoWrap?.getAttribute('data-md-video-src') ?? '';
        if (videoWrap && /^(https?:\/\/|www\.)/i.test(videoWrapSrc)) {
          e.preventDefault();
          this.mediaRequested.emit({ url: videoWrapSrc, type: 'video' });
          return;
        }

        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        const href = anchor?.getAttribute('href') ?? '';
        if (!anchor || !/^(https?:\/\/|www\.)/i.test(href)) {
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

      // Initial ratio hydration for first render.
      this.hydrateInlineVideoRatios();
    });
  }

  /** Applies actual video width/height ratio to wrapper to avoid fixed 16:9 cards. */
  private hydrateInlineVideoRatios(): void {
    const videos = this.elRef.nativeElement.querySelectorAll(
      '.md-video-wrap > video.md-video'
    ) as NodeListOf<HTMLVideoElement>;

    videos.forEach((video: HTMLVideoElement) => {
      const wrapper = video.closest('.md-video-wrap') as HTMLElement | null;
      if (!wrapper) return;

      const applyRatio = (): void => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          wrapper.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        }
      };

      if (video.readyState >= 1) {
        applyRatio();
      } else {
        video.addEventListener('loadedmetadata', applyRatio, { once: true });
      }
    });
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

    // Parse Markdown → HTML string
    const html = markedInstance.parse(raw, { async: false }) as string;

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
          'class',
          'controls',
          'playsinline',
          'muted',
          'preload',
          'poster',
          'data-md-video-src',
          'role',
          'tabindex',
        ],
        ADD_TAGS: ['button', 'video', 'source'],
      });
      return this.sanitizer.bypassSecurityTrustHtml(clean);
    }

    // Server or DOMPurify not yet loaded → return raw HTML string.
    // Angular's built-in [innerHTML] sanitizer handles XSS automatically.
    // Some custom attrs (target, aria-label) and <button> elements may be
    // stripped on this initial render, but once DOMPurify loads the signal
    // triggers re-evaluation with full fidelity.
    return html;
  });
}
