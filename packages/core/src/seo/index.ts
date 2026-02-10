/**
 * @fileoverview SEO & Social Sharing Types
 * @module @nxt1/core/seo
 *
 * Pure TypeScript types for SEO metadata and social sharing.
 * 100% portable - works on web, mobile, and backend.
 *
 * Used by:
 * - Web: SeoService updates meta tags for SSR
 * - Mobile: ShareService constructs shareable content
 * - Backend: Generate Open Graph images, sitemap entries
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// BASE TYPES
// ============================================

/**
 * Open Graph content type
 * @see https://ogp.me/#types
 */
export type OpenGraphType =
  | 'website'
  | 'article'
  | 'profile'
  | 'video.other'
  | 'video.movie'
  | 'music.song'
  | 'music.album';

/**
 * Twitter card type
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards
 */
export type TwitterCardType = 'summary' | 'summary_large_image' | 'player' | 'app';

// ============================================
// PAGE METADATA
// ============================================

/**
 * Core page metadata used for SEO and social sharing
 */
export interface PageMetadata {
  /** Page title (appears in browser tab, search results) */
  title: string;

  /** Page description (search result snippet, social preview) */
  description: string;

  /** Canonical URL for this page */
  canonicalUrl?: string;

  /** Primary image for social sharing */
  image?: string;

  /** Image alt text for accessibility */
  imageAlt?: string;

  /** Keywords for search engines (less important now, but still used) */
  keywords?: string[];

  /** Whether search engines should index this page */
  noIndex?: boolean;

  /** Whether search engines should follow links on this page */
  noFollow?: boolean;
}

/**
 * Open Graph metadata for rich social previews
 * @see https://ogp.me/
 */
export interface OpenGraphMetadata {
  /** Content type */
  type: OpenGraphType;

  /** Title for social preview */
  title: string;

  /** Description for social preview */
  description: string;

  /** Primary image URL (should be absolute) */
  image: string;

  /** Image dimensions for proper rendering */
  imageWidth?: number;
  imageHeight?: number;

  /** Page URL */
  url: string;

  /** Site name */
  siteName?: string;

  /** Locale (e.g., 'en_US') */
  locale?: string;

  /** Video URL for video content */
  video?: string;

  /** Audio URL for audio content */
  audio?: string;
}

/**
 * Twitter card metadata
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
 */
export interface TwitterMetadata {
  /** Card type */
  card: TwitterCardType;

  /** Twitter @username of website */
  site?: string;

  /** Twitter @username of content creator */
  creator?: string;

  /** Title (falls back to og:title) */
  title?: string;

  /** Description (falls back to og:description) */
  description?: string;

  /** Image URL (falls back to og:image) */
  image?: string;

  /** Image alt text */
  imageAlt?: string;

  /** Player URL for video cards */
  player?: string;

  /** Player dimensions */
  playerWidth?: number;
  playerHeight?: number;
}

/**
 * Complete SEO configuration for a page
 * Combines all metadata types
 */
export interface SeoConfig {
  /** Core page metadata */
  page: PageMetadata;

  /** Open Graph metadata (optional, falls back to page) */
  openGraph?: Partial<OpenGraphMetadata>;

  /** Twitter metadata (optional, falls back to openGraph/page) */
  twitter?: Partial<TwitterMetadata>;

  /** JSON-LD structured data */
  structuredData?: Record<string, unknown>;
}

// ============================================
// SHAREABLE CONTENT TYPES
// ============================================

/**
 * Base interface for shareable content
 */
export interface ShareableContent {
  /** Content type for routing */
  type: 'profile' | 'team' | 'video' | 'post' | 'highlight';

  /** Unique identifier */
  id: string;

  /** URL slug (human-readable ID) */
  slug?: string;

  /** Display title */
  title: string;

  /** Short description */
  description: string;

  /** Preview image URL */
  imageUrl?: string;
}

/**
 * Athlete profile shareable content
 */
export interface ShareableProfile extends ShareableContent {
  type: 'profile';

  /** Athlete's full name */
  athleteName: string;

  /** Primary position */
  position?: string;

  /** Graduation year */
  classYear?: number;

  /** School/team name */
  school?: string;

  /** Primary sport */
  sport?: string;

  /** Location (City, State) */
  location?: string;
}

/**
 * Team shareable content
 */
export interface ShareableTeam extends ShareableContent {
  type: 'team';

  /** Team name */
  teamName: string;

  /** Sport */
  sport?: string;

  /** Location */
  location?: string;

  /** Team logo URL */
  logoUrl?: string;

  /** Team record (e.g., "10-2") */
  record?: string;
}

/**
 * Video/highlight shareable content
 */
export interface ShareableVideo extends ShareableContent {
  type: 'video' | 'highlight';

  /** Video title */
  videoTitle: string;

  /** Athlete name (if athlete video) */
  athleteName?: string;

  /** Video duration in seconds */
  duration?: number;

  /** Thumbnail URL */
  thumbnailUrl?: string;

  /** View count */
  views?: number;
}

/**
 * Post shareable content
 */
export interface ShareablePost extends ShareableContent {
  type: 'post';

  /** Author name */
  authorName: string;

  /** Author avatar URL */
  authorAvatar?: string;

  /** Post timestamp */
  createdAt: string;

  /** Like count */
  likes?: number;
}

// ============================================
// SHARE COPY
// ============================================

export * from './share-copy';

// ============================================
// HELPER FUNCTIONS (Pure TypeScript)
// ============================================

/** NXT1 base URL for constructing shareable links */
const BASE_URL = 'https://nxt1sports.com';

/** Default Open Graph image */
const DEFAULT_OG_IMAGE = `${BASE_URL}/assets/images/og-image.jpg`;

/** Default Twitter handle */
const TWITTER_HANDLE = '@nxt1sports';

/**
 * Construct a full shareable URL for any content type
 *
 * @param content - The shareable content
 * @returns Full URL string
 *
 * @example
 * ```typescript
 * const url = buildShareUrl({ type: 'profile', id: 'john-smith', ... });
 * // Returns: 'https://nxt1sports.com/profile/john-smith'
 * ```
 */
export function buildShareUrl(content: ShareableContent): string {
  const identifier = content.slug || content.id;

  switch (content.type) {
    case 'profile':
      return `${BASE_URL}/profile/${identifier}`;
    case 'team':
      return `${BASE_URL}/team/${identifier}`;
    case 'video':
    case 'highlight':
      return `${BASE_URL}/video/${identifier}`;
    case 'post':
      return `${BASE_URL}/post/${identifier}`;
    default:
      return `${BASE_URL}/${content.type}/${identifier}`;
  }
}

/**
 * Build SEO configuration from shareable profile content
 *
 * @param profile - Shareable profile data
 * @returns Complete SEO configuration
 */
export function buildProfileSeoConfig(profile: ShareableProfile): SeoConfig {
  const url = buildShareUrl(profile);
  const title = buildProfileTitle(profile);
  const description = buildProfileDescription(profile);

  return {
    page: {
      title,
      description,
      canonicalUrl: url,
      image: profile.imageUrl || DEFAULT_OG_IMAGE,
      keywords: buildProfileKeywords(profile),
    },
    openGraph: {
      type: 'profile',
      title: profile.athleteName,
      description,
      image: profile.imageUrl || DEFAULT_OG_IMAGE,
      imageWidth: 1200,
      imageHeight: 630,
      url,
      siteName: 'NXT1 Sports',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      title: profile.athleteName,
      description,
      image: profile.imageUrl || DEFAULT_OG_IMAGE,
      imageAlt: `${profile.athleteName} profile photo`,
    },
    structuredData: buildProfileStructuredData(profile, url),
  };
}

/**
 * Build SEO configuration from shareable team content
 *
 * @param team - Shareable team data
 * @returns Complete SEO configuration
 */
export function buildTeamSeoConfig(team: ShareableTeam): SeoConfig {
  const url = buildShareUrl(team);
  const title = `${team.teamName}${team.sport ? ` ${team.sport}` : ''} | NXT1 Sports`;
  const description =
    team.description ||
    `Follow ${team.teamName}${team.location ? ` from ${team.location}` : ''}. View roster, schedule, highlights, and recruiting information on NXT1 Sports.`;

  return {
    page: {
      title,
      description,
      canonicalUrl: url,
      image: team.logoUrl || team.imageUrl || DEFAULT_OG_IMAGE,
    },
    openGraph: {
      type: 'website',
      title: team.teamName,
      description,
      image: team.imageUrl || team.logoUrl || DEFAULT_OG_IMAGE,
      imageWidth: 1200,
      imageHeight: 630,
      url,
      siteName: 'NXT1 Sports',
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
    },
    structuredData: buildTeamStructuredData(team, url),
  };
}

/**
 * Build SEO configuration from shareable video content
 *
 * @param video - Shareable video data
 * @returns Complete SEO configuration
 */
export function buildVideoSeoConfig(video: ShareableVideo): SeoConfig {
  const url = buildShareUrl(video);
  const title = `${video.videoTitle}${video.athleteName ? ` - ${video.athleteName}` : ''} | NXT1 Sports`;
  const description =
    video.description ||
    `Watch ${video.videoTitle}${video.athleteName ? ` featuring ${video.athleteName}` : ''} on NXT1 Sports.`;

  return {
    page: {
      title,
      description,
      canonicalUrl: url,
      image: video.thumbnailUrl || video.imageUrl || DEFAULT_OG_IMAGE,
    },
    openGraph: {
      type: 'video.other',
      title: video.videoTitle,
      description,
      image: video.thumbnailUrl || video.imageUrl || DEFAULT_OG_IMAGE,
      imageWidth: 1200,
      imageHeight: 630,
      url,
      siteName: 'NXT1 Sports',
    },
    twitter: {
      card: 'player',
      site: TWITTER_HANDLE,
      player: url,
      playerWidth: 1280,
      playerHeight: 720,
    },
    structuredData: buildVideoStructuredData(video, url),
  };
}

// ============================================
// INTERNAL HELPER FUNCTIONS
// ============================================

/**
 * Build page title for athlete profile
 */
function buildProfileTitle(profile: ShareableProfile): string {
  const parts = [profile.athleteName];

  if (profile.position) {
    parts.push(profile.position);
  }

  if (profile.classYear) {
    parts.push(`Class of ${profile.classYear}`);
  }

  parts.push('NXT1 Sports');

  return parts.join(' | ');
}

/**
 * Build description for athlete profile
 */
function buildProfileDescription(profile: ShareableProfile): string {
  if (profile.description) {
    return profile.description;
  }

  const parts: string[] = [];

  if (profile.position && profile.sport) {
    parts.push(`${profile.position} in ${profile.sport}`);
  } else if (profile.position) {
    parts.push(profile.position);
  } else if (profile.sport) {
    parts.push(`${profile.sport} athlete`);
  }

  if (profile.school) {
    parts.push(`at ${profile.school}`);
  }

  if (profile.location) {
    parts.push(`from ${profile.location}`);
  }

  if (profile.classYear) {
    parts.push(`graduating in ${profile.classYear}`);
  }

  const base =
    parts.length > 0 ? `${profile.athleteName} is a ${parts.join(' ')}` : profile.athleteName;

  return `${base}. View highlights, stats, and recruiting information on NXT1 Sports.`;
}

/**
 * Build keywords for athlete profile
 */
function buildProfileKeywords(profile: ShareableProfile): string[] {
  const keywords: string[] = [profile.athleteName, 'recruiting', 'highlights', 'NXT1'];

  if (profile.sport) keywords.push(profile.sport, `${profile.sport} recruiting`);
  if (profile.position) keywords.push(profile.position);
  if (profile.school) keywords.push(profile.school);
  if (profile.location) keywords.push(profile.location);
  if (profile.classYear) keywords.push(`class of ${profile.classYear}`);

  return keywords;
}

/**
 * Build JSON-LD structured data for athlete profile
 * @see https://schema.org/Person
 */
function buildProfileStructuredData(
  profile: ShareableProfile,
  url: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.athleteName,
    url,
    image: profile.imageUrl,
    description: buildProfileDescription(profile),
    jobTitle: profile.position,
    affiliation: profile.school
      ? {
          '@type': 'SportsTeam',
          name: profile.school,
        }
      : undefined,
    address: profile.location
      ? {
          '@type': 'PostalAddress',
          addressLocality: profile.location,
        }
      : undefined,
  };
}

/**
 * Build JSON-LD structured data for team
 * @see https://schema.org/SportsTeam
 */
function buildTeamStructuredData(team: ShareableTeam, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.teamName,
    url,
    logo: team.logoUrl,
    image: team.imageUrl,
    sport: team.sport,
    location: team.location
      ? {
          '@type': 'Place',
          name: team.location,
        }
      : undefined,
  };
}

/**
 * Build JSON-LD structured data for video
 * @see https://schema.org/VideoObject
 */
function buildVideoStructuredData(video: ShareableVideo, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.videoTitle,
    description: video.description,
    url,
    thumbnailUrl: video.thumbnailUrl || video.imageUrl,
    duration: video.duration
      ? `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S`
      : undefined,
    interactionStatistic: video.views
      ? {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/WatchAction',
          userInteractionCount: video.views,
        }
      : undefined,
    author: video.athleteName
      ? {
          '@type': 'Person',
          name: video.athleteName,
        }
      : undefined,
  };
}

/**
 * Truncate text to a maximum length for meta descriptions
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default: 160 for meta descriptions)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateDescription(text: string, maxLength: number = 160): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Sanitize text for use in meta tags
 * Removes HTML, excessive whitespace, and special characters
 *
 * @param text - Text to sanitize
 * @returns Sanitized text safe for meta tags
 */
export function sanitizeMetaText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/["\n\r]/g, '') // Remove quotes and newlines
    .trim();
}
