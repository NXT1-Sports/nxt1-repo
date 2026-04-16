/**
 * @fileoverview UTM Parameter Utilities — NXT1 Attribution System
 * @module @nxt1/core/seo
 *
 * Centralized, typed UTM parameter generation for all share surfaces.
 *
 * ## Architecture
 *
 * ```
 * buildShareUrl(content, baseUrl)         ← canonical URL (NO UTM — SEO-safe)
 *          ↓
 * buildUTMShareUrl(url, medium, campaign) ← UTM-tagged URL for sharing
 * ```
 *
 * SEO canonical URLs ($buildProfileSeoConfig, $buildTeamSeoConfig) always use
 * the raw `buildShareUrl()` output — never append UTM to canonical URLs.
 * UTM is only appended at share-time.
 *
 * ## UTM Strategy
 *
 * | utm_source | utm_medium | utm_campaign | utm_content   |
 * |------------|------------|--------------|---------------|
 * | nxt1       | share      | profile      | football      |
 * | nxt1       | copy_link  | team         | basketball    |
 * | nxt1       | qr         | article      |               |
 * | nxt1       | email      | invite       |               |
 *
 * GA4 auto-collects these params from the URL on page load — zero additional
 * backend instrumentation required for attribution.
 *
 * @example
 * ```typescript
 * import { buildUTMShareUrl, UTM_MEDIUM, UTM_CAMPAIGN } from '@nxt1/core/seo';
 *
 * const url = buildShareUrl(profile, origin);
 * const trackedUrl = buildUTMShareUrl(url, UTM_MEDIUM.SHARE, UTM_CAMPAIGN.PROFILE, profile.sport);
 * // → https://nxt1sports.com/profile/football/john-doe/123456?utm_source=nxt1&utm_medium=share&utm_campaign=profile&utm_content=football
 * ```
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * UTM source — always "nxt1" since we generate every share link.
 * Maps to GA4 "Source" dimension.
 */
export const UTM_SOURCE = {
  NXT1: 'nxt1',
} as const;

/**
 * UTM medium — how the link reached the recipient.
 * Maps to GA4 "Medium" dimension.
 */
export const UTM_MEDIUM = {
  /** Native share sheet (iOS / Android / Web Share API) */
  SHARE: 'share',
  /** Explicit "Copy Link" button click */
  COPY_LINK: 'copy_link',
  /** QR code scan */
  QR: 'qr',
  /** Agent X email outreach */
  EMAIL: 'email',
  /** Direct/referral link (generic fallback) */
  DIRECT: 'direct',
} as const;

/**
 * UTM campaign — what kind of content is being shared.
 * Maps to GA4 "Campaign" dimension.
 */
export const UTM_CAMPAIGN = {
  /** Athlete profile page */
  PROFILE: 'profile',
  /** Team/program page */
  TEAM: 'team',
  /** Social feed post */
  POST: 'post',
  /** Pulse news article */
  ARTICLE: 'article',
  /** Video / highlight reel */
  VIDEO: 'video',
  /** Team invite link */
  INVITE: 'invite',
  /** Generic app download / referral */
  APP: 'app',
} as const;

// ============================================
// TYPES
// ============================================

/** Literal union of all UTM sources */
export type UTMSource = (typeof UTM_SOURCE)[keyof typeof UTM_SOURCE];

/** Literal union of all UTM mediums */
export type UTMMedium = (typeof UTM_MEDIUM)[keyof typeof UTM_MEDIUM];

/** Literal union of all UTM campaigns */
export type UTMCampaign = (typeof UTM_CAMPAIGN)[keyof typeof UTM_CAMPAIGN];

/**
 * UTM parameter bag.
 * `medium` and `campaign` are required; all others are optional.
 */
export interface UTMParams {
  /** Traffic source (default: "nxt1") */
  readonly source?: string;
  /** How the link was shared — share | copy_link | qr | email */
  readonly medium: string;
  /** What content type is being shared */
  readonly campaign: string;
  /** Extra segmentation — e.g. sport name ("football", "basketball") */
  readonly content?: string;
  /** Reserved for paid search keywords; unused in organic share flows */
  readonly term?: string;
}

// ============================================
// FUNCTIONS
// ============================================

/**
 * Append UTM tracking parameters to a URL string.
 *
 * - First-write wins: existing UTM params are never overwritten.
 * - Returns the original string unchanged if it is empty or not a
 *   valid absolute URL (prevents crashing on relative paths).
 * - Available in all environments: URL global is available in
 *   Node.js 20+ and all modern browsers.
 *
 * @param url - Full absolute URL (e.g. "https://nxt1sports.com/profile/...")
 * @param params - UTM parameters to append
 * @returns URL string with UTM params appended
 *
 * @example
 * ```typescript
 * appendUTMParams(
 *   'https://nxt1sports.com/profile/football/john-doe/123456',
 *   { source: 'nxt1', medium: 'share', campaign: 'profile', content: 'football' }
 * );
 * // → 'https://nxt1sports.com/profile/football/john-doe/123456?utm_source=nxt1&utm_medium=share&utm_campaign=profile&utm_content=football'
 * ```
 */
export function appendUTMParams(url: string, params: UTMParams): string {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const p = parsed.searchParams;

    // First-write wins — never overwrite existing UTM params
    if (!p.has('utm_source') && params.source) {
      p.set('utm_source', params.source);
    }
    if (!p.has('utm_medium') && params.medium) {
      p.set('utm_medium', params.medium);
    }
    if (!p.has('utm_campaign') && params.campaign) {
      p.set('utm_campaign', params.campaign);
    }
    if (!p.has('utm_content') && params.content) {
      p.set('utm_content', params.content);
    }
    if (!p.has('utm_term') && params.term) {
      p.set('utm_term', params.term);
    }

    return parsed.toString();
  } catch {
    // Not a valid absolute URL — return unchanged (defensive)
    return url;
  }
}

/**
 * Build a UTM-tagged share URL in a single call.
 * Automatically sets `utm_source=nxt1`.
 *
 * Use this whenever constructing a URL for sharing, copying, or QR encoding.
 * Do NOT use on SEO canonical URLs — those must stay clean.
 *
 * @param url - Clean canonical URL (output of `buildShareUrl`)
 * @param medium - How the link will be shared (`UTM_MEDIUM.*`)
 * @param campaign - Content type being shared (`UTM_CAMPAIGN.*`)
 * @param content - Optional sub-segment (e.g. sport name)
 * @returns UTM-tagged URL string
 *
 * @example
 * ```typescript
 * buildUTMShareUrl(
 *   'https://nxt1sports.com/profile/football/john-doe/123456',
 *   UTM_MEDIUM.SHARE,
 *   UTM_CAMPAIGN.PROFILE,
 *   'football'
 * );
 * // → 'https://nxt1sports.com/profile/football/john-doe/123456?utm_source=nxt1&utm_medium=share&utm_campaign=profile&utm_content=football'
 *
 * buildUTMShareUrl(
 *   'https://nxt1sports.com/team/football/lincoln-high/ABC123',
 *   UTM_MEDIUM.QR,
 *   UTM_CAMPAIGN.TEAM
 * );
 * // → 'https://nxt1sports.com/team/football/lincoln-high/ABC123?utm_source=nxt1&utm_medium=qr&utm_campaign=team'
 * ```
 */
export function buildUTMShareUrl(
  url: string,
  medium: string,
  campaign: string,
  content?: string
): string {
  return appendUTMParams(url, {
    source: UTM_SOURCE.NXT1,
    medium,
    campaign,
    content,
  });
}
