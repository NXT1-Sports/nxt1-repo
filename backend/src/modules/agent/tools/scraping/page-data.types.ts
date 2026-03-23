/**
 * @fileoverview Page Structured Data Types
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Defines the shape of structured metadata extracted from any web page.
 * Populated by PageDataExtractor — no per-site logic, 100% universal.
 *
 * Extraction sources (all standard web formats):
 *   - __NEXT_DATA__ JSON blob (Next.js apps: MaxPreps, 247Sports, etc.)
 *   - __NUXT__ / __NUXT_STATE__ blob (Nuxt apps)
 *   - Generic window.__* data blobs (Hudl __hudlEmbed, etc.)
 *   - schema.org LD+JSON blocks (ESPN, NCSA, any SEO-optimized site)
 *   - OpenGraph <meta property="og:*"> tags (every site)
 *   - Twitter Card <meta name="twitter:*"> tags (every site)
 *   - <link rel="preload" as="image"> hints (profile photos)
 *   - <img> tags with src attributes (content images)
 *   - <iframe> src URLs (Hudl, YouTube, Vimeo video embeds)
 *   - Inline JSON objects with color/hex fields (team colors)
 */

// ─── Links ──────────────────────────────────────────────────────────────────

export interface PageLink {
  /** Absolute URL. */
  readonly url: string;
  /** Visible anchor text (stripped of inner HTML tags). */
  readonly text?: string;
  /** Where this link was found. */
  readonly source: 'html' | 'markdown';
}

// ─── Images ─────────────────────────────────────────────────────────────────

export interface PageImage {
  /** Absolute URL of the image. */
  readonly src: string;
  /** Alt text, if present. */
  readonly alt?: string;
  /** Where this image was found. */
  readonly source: 'og' | 'preload' | 'img' | 'ld-json' | 'twitter';
}

// ─── Videos ─────────────────────────────────────────────────────────────────

export type VideoProvider = 'youtube' | 'hudl' | 'vimeo' | 'twitter' | 'other';

export interface PageVideo {
  /** Embed or direct URL of the video. */
  readonly src: string;
  /** Detected video platform. */
  readonly provider: VideoProvider;
  /** Platform-specific video ID, if extractable. */
  readonly videoId?: string;
  /** Thumbnail/poster URL, if available. */
  readonly poster?: string;
}

// ─── OpenGraph ───────────────────────────────────────────────────────────────

export interface OpenGraph {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly video?: string;
  readonly type?: string;
  readonly url?: string;
  readonly siteName?: string;
}

// ─── Twitter Card ────────────────────────────────────────────────────────────

export interface TwitterCard {
  readonly card?: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
}

// ─── Full Page Structured Data ───────────────────────────────────────────────

export interface PageStructuredData {
  /** Page <title> tag content. */
  readonly title: string;

  /** Page <meta name="description"> content. */
  readonly description: string;

  /** OpenGraph data extracted from og:* meta tags. */
  readonly openGraph: OpenGraph;

  /** Twitter card data extracted from twitter:* meta tags. */
  readonly twitterCard: TwitterCard;

  /**
   * All schema.org LD+JSON blocks parsed as JSON.
   * Each element is one <script type="application/ld+json"> block.
   */
  readonly ldJson: readonly unknown[];

  /**
   * The __NEXT_DATA__ blob from Next.js apps (MaxPreps, 247Sports, ESPN, etc.).
   * Contains the full server-rendered page props tree — stats, athlete data, etc.
   * null if the page is not a Next.js app.
   */
  readonly nextData: unknown | null;

  /**
   * The __NUXT__ or __NUXT_STATE__ blob from Nuxt.js apps.
   * null if the page is not a Nuxt app.
   */
  readonly nuxtData: unknown | null;

  /**
   * Generic embedded data blobs from window.__* assignments.
   * Captures framework/site-specific data not covered by Next.js or Nuxt
   * (e.g. Hudl's window.__hudlEmbed, window.__INITIAL_STATE__, etc.).
   * Map key is the variable name (e.g. "__hudlEmbed"), value is the parsed JSON.
   * Empty record if no large data blobs were found.
   */
  readonly embeddedData: Readonly<Record<string, unknown>>;

  /** All images found on the page, deduplicated by src. */
  readonly images: readonly PageImage[];

  /**
   * All hyperlinks found on the page, deduplicated by URL.
   * Sourced from: <a href> tags in HTML (source: 'html') and
   * [text](url) patterns in Firecrawl markdown (source: 'markdown').
   * Useful for link-hub pages (bio.site, linktree, etc.) where
   * the athlete links out to all their social/sport profiles.
   */
  readonly links: readonly PageLink[];

  /** All video embeds found on the page (Hudl, YouTube, Vimeo, etc.). */
  readonly videos: readonly PageVideo[];

  /**
   * Hex color values extracted from the page (team colors, brand colors).
   * Sourced from: JSON fields named "color*", inline hex patterns in data attrs.
   * Format: 6-digit hex without # prefix (e.g. "CC0022").
   */
  readonly colors: readonly string[];

  /**
   * The site's favicon URL, extracted from <link rel="icon"> or <link rel="shortcut icon">.
   * Falls back to /favicon.ico at the domain root if no explicit tag is found.
   * null if extraction failed entirely.
   */
  readonly faviconUrl: string | null;

  /**
   * True if any meaningful structured data was found beyond the basics.
   * (nextData, nuxtData, ldJson, or embeddedData present)
   */
  readonly hasRichData: boolean;
}
