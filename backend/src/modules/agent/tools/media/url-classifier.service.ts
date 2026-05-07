/**
 * @fileoverview URL Classifier Service — Universal Media Acquisition Router
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Deterministic, regex-based URL classifier that maps any incoming URL to
 * the canonical acquisition strategy. This is the single source of truth
 * for media routing — every media-class tool enforces this classification
 * before executing to prevent silent failures and infinite retry loops.
 *
 * Strategy → Tool mapping:
 *   scrape_twitter_single_tweet → scrape_twitter({ mode: "single_tweet", tweetUrl })
 *   scrape_twitter_profile      → scrape_twitter({ mode: "profile_tweets", usernames })
 *   scrape_instagram            → scrape_instagram(...)
 *   analyze_video_direct        → analyze_video({ url })
 *   stage_direct_video          → stage_media({ sourceUrl })
 *   stage_direct_image          → stage_media({ sourceUrl })
 *   stage_direct_stream         → stage_media({ sourceUrl })
 *   firecrawl_scrape            → scrape_webpage({ url }) + extract_page_images({ url })
 *   live_view_required          → open_live_view → extract_live_view_media
 */

// ─── Strategy Types ─────────────────────────────────────────────────────────

export type AcquisitionStrategy =
  | 'scrape_twitter_single_tweet'
  | 'scrape_twitter_profile'
  | 'scrape_instagram'
  | 'scrape_tiktok'
  | 'scrape_facebook'
  | 'scrape_linkedin'
  | 'analyze_video_direct'
  | 'stage_direct_video'
  | 'stage_direct_image'
  | 'stage_direct_stream'
  | 'firecrawl_scrape'
  | 'extract_hudl_video'
  | 'live_view_required';

export type MediaPlatform =
  | 'twitter'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'hudl'
  | 'vimeo'
  | 'facebook'
  | 'linkedin'
  | 'web';

export type MediaAssetKind = 'single_tweet' | 'profile' | 'video' | 'image' | 'stream' | 'page';

export interface UrlClassification {
  /** Platform identifier for the URL. */
  readonly platform: MediaPlatform;
  /** Nature of the asset at the URL. */
  readonly assetKind: MediaAssetKind;
  /** Which acquisition strategy should be used. */
  readonly strategy: AcquisitionStrategy;
  /**
   * Exact corrective tool call syntax for middleware rejection messages.
   * The middleware returns this verbatim so the LLM can call the right tool
   * in one iteration without guessing parameter names.
   */
  readonly correctiveExample: string;
  /** Whether this URL type is blocked in scrape_webpage / extract_web_data. */
  readonly isSocialBlocked: boolean;
}

// ─── Regex Patterns ──────────────────────────────────────────────────────────

/** x.com or twitter.com single tweet: /username/status/ID */
const TWITTER_SINGLE_TWEET = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i;

/** instagram.com/p/* (post) or /reel/* */
const INSTAGRAM_POST = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[^/]+/i;

/** YouTube full or short URL */
const YOUTUBE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]+/i;

/** Vimeo */
const VIMEO = /^https?:\/\/(?:www\.)?vimeo\.com\/\d+/i;

/** HLS manifest */
const HLS_MANIFEST = /\.m3u8(?:[?#]|$)/i;

/** DASH manifest */
const DASH_MANIFEST = /\.mpd(?:[?#]|$)/i;

/** Direct MP4 / MOV / AVI / MKV / WEBM */
const DIRECT_VIDEO = /\.(?:mp4|mov|avi|mkv|webm)(?:[?#]|$)/i;

/** Direct image extensions */
const DIRECT_IMAGE = /\.(?:jpg|jpeg|png|webp|gif|avif|svg)(?:[?#]|$)/i;

/** Hudl hostnames (mixed public + gated surfaces) */
const HUDL = /^https?:\/\/(?:www\.)?(?:[a-z0-9-]+\.)?hudl\.com/i;

/** YouTube channel/handle pages (not individual video URLs) */
const YOUTUBE_CHANNEL =
  /^https?:\/\/(?:www\.)?youtube\.com\/(?:@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i;

/** Social domains blocked in scrape_webpage / extract_web_data */
const SOCIAL_BLOCKED_HOSTNAMES = new Set([
  'x.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'threads.net',
]);

// ─── Service ─────────────────────────────────────────────────────────────────

export class UrlClassifierService {
  /**
   * Classify a URL and return the acquisition strategy, platform, asset kind,
   * and corrective call syntax for the LLM.
   *
   * @param rawUrl — The raw URL string to classify.
   * @returns UrlClassification — never throws; returns 'firecrawl_scrape' for unknowns.
   */
  classify(rawUrl: string): UrlClassification {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      // Non-parseable URL — treat as generic web page
      return this.webPage(rawUrl);
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const href = rawUrl;

    // ── Twitter / X ────────────────────────────────────────────────────
    if (hostname === 'x.com' || hostname === 'twitter.com') {
      if (TWITTER_SINGLE_TWEET.test(href)) {
        return {
          platform: 'twitter',
          assetKind: 'single_tweet',
          strategy: 'scrape_twitter_single_tweet',
          correctiveExample: `scrape_twitter({ mode: "single_tweet", tweetUrl: "${rawUrl}" })`,
          isSocialBlocked: true,
        };
      }
      return {
        platform: 'twitter',
        assetKind: 'profile',
        strategy: 'scrape_twitter_profile',
        correctiveExample: `scrape_twitter({ mode: "profile_tweets", usernames: ["${this.extractTwitterUsername(href)}"], limit: 30 })`,
        isSocialBlocked: true,
      };
    }

    // ── Instagram ──────────────────────────────────────────────────────
    if (hostname === 'instagram.com') {
      const isPost = INSTAGRAM_POST.test(href);
      return {
        platform: 'instagram',
        assetKind: isPost ? 'video' : 'profile',
        strategy: 'scrape_instagram',
        correctiveExample: `scrape_instagram({ url: "${rawUrl}" })`,
        isSocialBlocked: true,
      };
    }

    // ── Facebook ───────────────────────────────────────────────────────
    if (hostname === 'facebook.com' || hostname === 'fb.com') {
      return {
        platform: 'facebook',
        assetKind: 'profile',
        strategy: 'scrape_facebook',
        correctiveExample: `call_apify_actor({ actor: "apify/facebook-pages-scraper", input: { startUrls: [{ url: "${rawUrl}" }], maxPosts: 20 } })`,
        isSocialBlocked: true,
      };
    }

    // ── LinkedIn ───────────────────────────────────────────────────────
    if (hostname === 'linkedin.com') {
      return {
        platform: 'linkedin',
        assetKind: 'profile',
        strategy: 'scrape_linkedin',
        correctiveExample: `call_apify_actor({ actor: "anchor/linkedin-profile-scraper", input: { profileUrls: ["${rawUrl}"] } })`,
        isSocialBlocked: true,
      };
    }

    // ── TikTok ─────────────────────────────────────────────────────────
    if (hostname === 'tiktok.com') {
      return {
        platform: 'tiktok',
        assetKind: 'profile',
        strategy: 'scrape_tiktok',
        correctiveExample: `call_apify_actor({ actor: "clockworks~free-tiktok-scraper", input: { profiles: ["${this.extractTikTokUsername(rawUrl)}"], resultsPerPage: 10, shouldDownloadVideos: false } })`,
        isSocialBlocked: true,
      };
    }

    // ── Other social blocked ───────────────────────────────────────────
    if (SOCIAL_BLOCKED_HOSTNAMES.has(hostname)) {
      return {
        platform: 'web',
        assetKind: 'page',
        strategy: 'firecrawl_scrape',
        correctiveExample: `scrape_webpage({ url: "${rawUrl}" }) — Note: this platform may have limited scrapeability`,
        isSocialBlocked: true,
      };
    }

    // ── YouTube ────────────────────────────────────────────────────────
    if (hostname === 'youtube.com' || hostname === 'youtu.be') {
      if (YOUTUBE.test(href)) {
        return {
          platform: 'youtube',
          assetKind: 'video',
          strategy: 'analyze_video_direct',
          correctiveExample: `analyze_video({ url: "${rawUrl}" })`,
          isSocialBlocked: false,
        };
      }
      // Channel/handle pages — scrape rawHtml to discover video IDs, then analyze individually
      if (YOUTUBE_CHANNEL.test(href)) {
        return {
          platform: 'youtube',
          assetKind: 'profile',
          strategy: 'firecrawl_scrape',
          correctiveExample: `scrape_webpage({ url: "${rawUrl}" }) — rawHtml contains watch?v=ID links for all channel videos; extract IDs then call analyze_video({ url: "https://youtube.com/watch?v=ID" }) on each`,
          isSocialBlocked: false,
        };
      }
    }

    // ── Vimeo ──────────────────────────────────────────────────────────
    if (hostname === 'vimeo.com' && VIMEO.test(href)) {
      return {
        platform: 'vimeo',
        assetKind: 'video',
        strategy: 'analyze_video_direct',
        correctiveExample: `analyze_video({ url: "${rawUrl}" })`,
        isSocialBlocked: false,
      };
    }

    // ── Direct streams ─────────────────────────────────────────────────
    if (HLS_MANIFEST.test(href)) {
      return {
        platform: 'web',
        assetKind: 'stream',
        strategy: 'stage_direct_stream',
        correctiveExample: `stage_media({ sourceUrl: "${rawUrl}" })`,
        isSocialBlocked: false,
      };
    }

    if (DASH_MANIFEST.test(href)) {
      return {
        platform: 'web',
        assetKind: 'stream',
        strategy: 'stage_direct_stream',
        correctiveExample: `stage_media({ sourceUrl: "${rawUrl}" })`,
        isSocialBlocked: false,
      };
    }

    // ── Direct video files ─────────────────────────────────────────────
    if (DIRECT_VIDEO.test(href)) {
      return {
        platform: 'web',
        assetKind: 'video',
        strategy: 'stage_direct_video',
        correctiveExample: `stage_media({ sourceUrl: "${rawUrl}" })`,
        isSocialBlocked: false,
      };
    }

    // ── Direct image files ─────────────────────────────────────────────
    if (DIRECT_IMAGE.test(href)) {
      return {
        platform: 'web',
        assetKind: 'image',
        strategy: 'stage_direct_image',
        correctiveExample: `stage_media({ sourceUrl: "${rawUrl}" })`,
        isSocialBlocked: false,
      };
    }

    // ── Hudl (public pages vs auth-gated) ──────────────────────────────
    if (HUDL.test(href)) {
      const path = url.pathname.toLowerCase();
      if (path.startsWith('/video/') || path.startsWith('/embed/video/')) {
        return {
          platform: 'hudl',
          assetKind: 'video',
          strategy: 'extract_hudl_video',
          correctiveExample: `extract_hudl_video({ url: "${rawUrl}" })`,
          isSocialBlocked: false,
        };
      }

      return {
        platform: 'hudl',
        assetKind: 'page',
        strategy: 'firecrawl_scrape',
        correctiveExample:
          `scrape_webpage({ url: "${rawUrl}", waitFor: 8000 }) — fan.hudl.com is a Next.js app requiring 8 s render time. ` +
          `rawHtml contains two CDN patterns: ` +
          `(1) akamaihd.net CDN — thumbnails follow pattern /{clipId}/{hash}_720.jpg; ` +
          `derive MP4 by replacing the .jpg extension with .mp4, then call analyze_video on each. ` +
          `(2) vg.hudl.com CDN — look for <video src="..."> tags containing direct signed MP4 URLs ` +
          `matching vg.hudl.com/p-highlights/Team/{teamId}/{guid}/{hash}_720.mp4?v=... — ` +
          `extract these directly with regex /https?://vg.hudl.com/p-highlights[^"'\\s]+.mp4[^"'\\s]*/g. ` +
          `Do NOT try to derive mp4 from vg.hudl.com thumbnail JPGs — their folder and hash differ from the mp4 paths. ` +
          `Only the featured (currently-playing) video appears as an MP4 in the HTML; ` +
          `remaining clips appear as thumbnail JPGs whose corresponding mp4 URLs are not in the static markup.`,
        isSocialBlocked: false,
      };
    }

    // ── Generic web page ───────────────────────────────────────────────
    return this.webPage(rawUrl);
  }

  /**
   * Check if a hostname is in the social blocked list.
   * Used by Firecrawl scrape/extract tools to hard-block social domains.
   */
  isSocialBlocked(rawUrl: string): boolean {
    try {
      const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
      return SOCIAL_BLOCKED_HOSTNAMES.has(hostname);
    } catch {
      return false;
    }
  }

  /**
   * Extract the Twitter/X username from a URL.
   * e.g. https://x.com/alcoafootball → "alcoafootball"
   */
  private extractTwitterUsername(href: string): string {
    try {
      const path = new URL(href).pathname;
      const parts = path.split('/').filter(Boolean);
      return parts[0] ?? 'username';
    } catch {
      return 'username';
    }
  }

  /**
   * Extract TikTok @username from a profile or video URL.
   * e.g. https://www.tiktok.com/@nxt1sports/video/123 → "nxt1sports"
   */
  private extractTikTokUsername(href: string): string {
    try {
      const path = new URL(href).pathname;
      const match = path.match(/^\/@?([^/?#]+)/);
      return match?.[1] ?? 'username';
    } catch {
      return 'username';
    }
  }

  private webPage(rawUrl: string): UrlClassification {
    return {
      platform: 'web',
      assetKind: 'page',
      strategy: 'firecrawl_scrape',
      correctiveExample: `scrape_webpage({ url: "${rawUrl}", format: "markdown" }) and extract_page_images({ url: "${rawUrl}" })`,
      isSocialBlocked: false,
    };
  }
}
