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

import { formatSportDisplayName } from '../constants/sport.constants';
import { buildCanonicalProfilePath, buildCanonicalTeamPath } from '../helpers/formatters';

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
  type: 'profile' | 'team' | 'video' | 'post' | 'highlight' | 'article';

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

  /** Legacy/public-facing profile code used in canonical URLs */
  unicode?: string;

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

  /** Athlete's first name (for og:profile:first_name) */
  firstName?: string;

  /** Athlete's last name (for og:profile:last_name) */
  lastName?: string;

  /** Username / profile handle (for og:profile:username) */
  username?: string;
}

/**
 * Team shareable content
 */
export interface ShareableTeam extends ShareableContent {
  type: 'team';

  /** Public team code used in canonical URLs */
  teamCode?: string;

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

  /** Route owner identifier used in canonical post path: /post/:userUnicode/:postId */
  userUnicode?: string;

  /** Optional post subtype used for keyword enrichment */
  postType?: string;

  /** Author name */
  authorName: string;

  /** Author avatar URL */
  authorAvatar?: string;

  /** Post timestamp */
  createdAt: string;

  /** Like count */
  likes?: number;
}

/**
 * Pulse news article shareable content
 */
export interface ShareableArticle extends ShareableContent {
  type: 'article';

  /** Feed/source label (for example ESPN, Rivals, MaxPreps) */
  source?: string;

  /** Short article excerpt */
  excerpt?: string;

  /** Sport bucket */
  sport?: string;

  /** State bucket */
  state?: string;
}

// ============================================
// SHARE COPY
// ============================================

export * from './share-copy';

// ============================================
// UTM TRACKING
// ============================================

export * from './utm';

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
export function buildShareUrl(content: ShareableContent, baseUrl: string = BASE_URL): string {
  const identifier = content.slug || content.id;
  const resolvedBaseUrl = (baseUrl || BASE_URL).replace(/\/+$/, '');

  switch (content.type) {
    case 'profile': {
      const profile = content as ShareableProfile;
      return `${resolvedBaseUrl}${buildCanonicalProfilePath({
        athleteName: profile.athleteName,
        title: profile.title,
        sport: profile.sport,
        unicode: profile.unicode,
        id: profile.id,
      })}`;
    }
    case 'team': {
      const team = content as ShareableTeam;
      return `${resolvedBaseUrl}${buildCanonicalTeamPath({
        slug: team.slug,
        teamName: team.teamName,
        title: team.title,
        teamCode: team.teamCode,
        id: team.id,
      })}`;
    }
    case 'video':
    case 'highlight':
      return `${resolvedBaseUrl}/video/${identifier}`;
    case 'post':
      return `${resolvedBaseUrl}/post/${identifier}`;
    case 'article':
      return `${resolvedBaseUrl}/explore/pulse/${content.id}`;
    default:
      return `${resolvedBaseUrl}/${content.type}/${identifier}`;
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
  const title = `${team.teamName}${team.sport ? ` ${formatSportDisplayName(team.sport)}` : ''} | NXT1 Sports`;
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
      title: team.teamName,
      description,
      image: team.imageUrl || team.logoUrl || DEFAULT_OG_IMAGE,
      imageAlt: `${team.teamName} team profile`,
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

/**
 * Build SEO configuration from shareable post content
 *
 * @param post - Shareable post data
 * @param baseUrl - Canonical base URL (defaults to NXT1 production URL)
 * @returns Complete SEO configuration
 */
export function buildPostSeoConfig(post: ShareablePost, baseUrl: string = BASE_URL): SeoConfig {
  const resolvedBaseUrl = (baseUrl || BASE_URL).replace(/\/+$/, '');
  const canonicalPath = post.userUnicode
    ? `/post/${encodeURIComponent(post.userUnicode)}/${encodeURIComponent(post.id)}`
    : `/post/${encodeURIComponent(post.id)}`;
  const canonicalUrl = `${resolvedBaseUrl}${canonicalPath}`;
  const postTitle = post.title || 'Post';
  const title = `${postTitle} | ${post.authorName} | NXT1 Sports`;
  const description =
    post.description ||
    `${post.authorName} shared an update on NXT1 Sports. View this post and discover more athlete and team content.`;
  const image = post.imageUrl || post.authorAvatar || DEFAULT_OG_IMAGE;
  const keywords = [post.authorName, post.postType, 'sports post', 'athlete update', 'NXT1'].filter(
    (value): value is string => Boolean(value)
  );

  return {
    page: {
      title,
      description,
      canonicalUrl,
      image,
      keywords,
    },
    openGraph: {
      type: 'article',
      title: postTitle,
      description,
      image,
      imageWidth: 1200,
      imageHeight: 630,
      url: canonicalUrl,
      siteName: 'NXT1 Sports',
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      title: postTitle,
      description,
      image,
      imageAlt: `Post by ${post.authorName}`,
    },
    structuredData: buildPostStructuredData(post, canonicalUrl),
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
    parts.push(`${profile.position} in ${formatSportDisplayName(profile.sport)}`);
  } else if (profile.position) {
    parts.push(profile.position);
  } else if (profile.sport) {
    parts.push(`${formatSportDisplayName(profile.sport)} athlete`);
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

  if (profile.sport)
    keywords.push(
      formatSportDisplayName(profile.sport),
      `${formatSportDisplayName(profile.sport)} recruiting`
    );
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
  const BASE_URL = 'https://nxt1sports.com';
  const breadcrumbs: Array<{ name: string; url: string }> = [
    { name: 'NXT1 Sports', url: BASE_URL },
    { name: 'Athletes', url: `${BASE_URL}/athletes` },
  ];
  if (profile.sport) {
    breadcrumbs.push({
      name: formatSportDisplayName(profile.sport),
      url: `${BASE_URL}/athletes?sport=${encodeURIComponent(profile.sport)}`,
    });
  }
  breadcrumbs.push({ name: profile.athleteName, url });

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.athleteName,
    url,
    image: profile.imageUrl || undefined,
    description: buildProfileDescription(profile),
    jobTitle: profile.position || undefined,
    identifier: profile.id,
    knowsAbout: profile.sport ? formatSportDisplayName(profile.sport) : undefined,
    alumniOf: profile.school
      ? { '@type': 'EducationalOrganization', name: profile.school }
      : undefined,
    affiliation: profile.school ? { '@type': 'SportsTeam', name: profile.school } : undefined,
    address: profile.location
      ? { '@type': 'PostalAddress', addressLocality: profile.location }
      : undefined,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    },
  };
}

/**
 * Build JSON-LD structured data for team
 * @see https://schema.org/SportsTeam
 */
function buildTeamStructuredData(team: ShareableTeam, url: string): Record<string, unknown> {
  const BASE_URL = 'https://nxt1sports.com';
  const breadcrumbs: Array<{ name: string; url: string }> = [
    { name: 'NXT1 Sports', url: BASE_URL },
    { name: 'Teams', url: `${BASE_URL}/athletes` },
  ];
  if (team.sport) {
    breadcrumbs.push({
      name: formatSportDisplayName(team.sport),
      url: `${BASE_URL}/athletes?sport=${encodeURIComponent(team.sport)}`,
    });
  }
  breadcrumbs.push({ name: team.teamName, url });

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.teamName,
    url,
    logo: team.logoUrl ? { '@type': 'ImageObject', url: team.logoUrl } : undefined,
    image: team.imageUrl || team.logoUrl || undefined,
    sport: team.sport ? formatSportDisplayName(team.sport) : undefined,
    location: team.location ? { '@type': 'Place', name: team.location } : undefined,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    },
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
 * Build JSON-LD structured data for social post
 * @see https://schema.org/SocialMediaPosting
 */
function buildPostStructuredData(post: ShareablePost, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: post.title || 'Post',
    articleBody: post.description || undefined,
    datePublished: post.createdAt,
    dateModified: post.createdAt,
    url,
    image: post.imageUrl || post.authorAvatar || undefined,
    author: {
      '@type': 'Person',
      name: post.authorName,
      image: post.authorAvatar || undefined,
    },
    publisher: {
      '@type': 'Organization',
      name: 'NXT1 Sports',
      url: BASE_URL,
    },
    interactionStatistic:
      typeof post.likes === 'number'
        ? {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/LikeAction',
            userInteractionCount: post.likes,
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
