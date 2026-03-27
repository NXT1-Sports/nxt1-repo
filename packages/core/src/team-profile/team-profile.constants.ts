/**
 * @fileoverview Team Profile Constants
 * @module @nxt1/core/team-profile
 * @version 1.0.0
 *
 * Configuration constants for the public-facing Team Profile feature.
 * 100% portable — no platform dependencies.
 *
 * @description Defines tabs, icons, empty states, and UI configuration
 * for the enterprise-grade team profile system. Mirrors the athlete
 * Profile constants architecture.
 */

import type {
  TeamProfileTab,
  TeamProfileTabId,
  TeamProfilePostType,
  TeamProfileHeaderAction,
  TeamProfileRecruitingCategory,
} from './team-profile.types';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Team profile content tabs — 4-tab Intelligence layout.
 * Order determines display order in tab bar.
 *
 * Intel, Timeline, Roster, Connect
 */
export const TEAM_PROFILE_TABS: readonly TeamProfileTab[] = [
  {
    id: 'intel',
    label: 'Intel',
    icon: 'radar',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: 'newspaper',
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: 'people',
  },
  {
    id: 'connect',
    label: 'Connect',
    icon: 'paper-plane',
  },
] as const;

/**
 * Default selected tab.
 */
export const TEAM_PROFILE_DEFAULT_TAB: TeamProfileTabId = 'intel';

/**
 * Tabs where the verification banner is hidden.
 */
export const TEAM_PROFILE_VERIFICATION_HIDDEN_TABS: ReadonlySet<TeamProfileTabId> = new Set([]);

// ============================================
// POST TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for team post types.
 */
export const TEAM_PROFILE_POST_TYPE_ICONS: Record<TeamProfilePostType, string> = {
  video: 'videocam',
  image: 'image',
  text: 'document-text',
  highlight: 'star',
  news: 'newspaper',
  announcement: 'megaphone',
} as const;

/**
 * Label mapping for team post types.
 */
export const TEAM_PROFILE_POST_TYPE_LABELS: Record<TeamProfilePostType, string> = {
  video: 'Video',
  image: 'Photo',
  text: 'Post',
  highlight: 'Highlight',
  news: 'News',
  announcement: 'Announcement',
} as const;

// ============================================
// ROSTER SORT CONFIGURATION
// ============================================

/**
 * Roster sort option labels.
 */
export const TEAM_PROFILE_ROSTER_SORT_LABELS: Record<string, string> = {
  name: 'Name',
  number: 'Number',
  position: 'Position',
  class: 'Class Year',
  recent: 'Recently Added',
} as const;

// ============================================
// TEAM TYPE CONFIGURATION
// ============================================

/**
 * Team type display labels.
 */
export const TEAM_PROFILE_TYPE_LABELS: Record<string, string> = {
  'high-school': 'High School',
  club: 'Club',
  college: 'College',
  juco: 'JUCO',
  academy: 'Academy',
  travel: 'Travel',
  'middle-school': 'Middle School',
  organization: 'Organization',
  other: 'Other',
} as const;

/**
 * Team type icons.
 */
export const TEAM_PROFILE_TYPE_ICONS: Record<string, string> = {
  'high-school': 'school',
  club: 'shield',
  college: 'library',
  juco: 'library',
  academy: 'ribbon',
  travel: 'airplane',
  'middle-school': 'school',
  organization: 'business',
  other: 'people',
} as const;

// ============================================
// QUICK STATS CONFIGURATION
// ============================================

/**
 * Quick stat display configuration for team profile.
 */
export const TEAM_PROFILE_QUICK_STATS_CONFIG = {
  pageViews: {
    key: 'pageViews',
    label: 'Page Views',
    icon: 'eye',
  },
  rosterCount: {
    key: 'rosterCount',
    label: 'Athletes',
    icon: 'people',
  },
  totalPosts: {
    key: 'totalPosts',
    label: 'Posts',
    icon: 'newspaper',
  },
  highlightCount: {
    key: 'highlightCount',
    label: 'Highlights',
    icon: 'videocam',
  },
  eventCount: {
    key: 'eventCount',
    label: 'Events',
    icon: 'calendar',
  },
  shareCount: {
    key: 'shareCount',
    label: 'Shares',
    icon: 'share-social',
  },
} as const;

// ============================================
// HEADER ACTIONS
// ============================================

/**
 * Team profile header actions for team admins (own team).
 */
export const TEAM_PROFILE_ADMIN_HEADER_ACTIONS: readonly TeamProfileHeaderAction[] = [
  {
    id: 'manage-team',
    label: 'Manage Team',
    icon: 'settings',
    primary: true,
  },
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code',
  },
  {
    id: 'share',
    label: 'Share Team',
    icon: 'share-social',
  },
] as const;

/**
 * Team profile header actions for visitors.
 */
export const TEAM_PROFILE_VISITOR_HEADER_ACTIONS: readonly TeamProfileHeaderAction[] = [
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code',
  },
  {
    id: 'share',
    label: 'Share Team',
    icon: 'share-social',
  },
] as const;

// ============================================
// EMPTY STATES
// ============================================

/**
 * Empty state configuration for team profile tabs.
 */
export const TEAM_PROFILE_EMPTY_STATES: Record<
  TeamProfileTabId,
  {
    readonly title: string;
    readonly message: string;
    readonly icon: string;
    readonly ctaLabel?: string;
  }
> = {
  intel: {
    title: 'Team intel not available',
    message: 'The Agent X team intelligence brief will appear here once generated.',
    icon: 'radar',
  },
  timeline: {
    title: 'No updates yet',
    message: 'Team updates, announcements, and highlights will appear here.',
    icon: 'newspaper',
    ctaLabel: 'Add Update',
  },
  roster: {
    title: 'No roster members',
    message: 'Athletes and staff will appear here when they join the team.',
    icon: 'people',
    ctaLabel: 'Invite Athletes',
  },
  connect: {
    title: 'No contact info yet',
    message: 'Add team contact details so athletes and coaches can reach you.',
    icon: 'paper-plane',
    ctaLabel: 'Add Contact Info',
  },
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration constants for team profile feature.
 */
export const TEAM_PROFILE_UI_CONFIG = {
  /** Number of skeleton items to show while loading */
  skeletonCount: 6,
  /** Number of posts to load per page */
  postsPerPage: 20,
  /** Maximum roster members shown before "Show All" */
  rosterPreviewCount: 12,
  /** Maximum staff shown before "Show All" */
  staffPreviewCount: 6,
  /** Maximum schedule items shown before "Show All" */
  schedulePreviewCount: 10,
  /** Default banner aspect ratio */
  bannerAspectRatio: 3 / 1,
  /** Logo sizes */
  logoSizes: {
    small: 48,
    medium: 80,
    large: 120,
    xlarge: 160,
  },
  /** Animation durations (ms) */
  animations: {
    tabSwitch: 200,
    contentFade: 300,
    headerCollapse: 250,
  },
} as const;

// ============================================
// CACHE KEYS
// ============================================

/**
 * Cache key prefixes for the team profile feature.
 */
export const TEAM_PROFILE_CACHE_KEYS = {
  /** Team profile data keyed by slug — MEDIUM_TTL (15 min) */
  BY_SLUG: 'team:profile:slug:',
  /** Team profile data keyed by ID — MEDIUM_TTL (15 min) */
  BY_ID: 'team:profile:id:',
  /** Team roster — MEDIUM_TTL (15 min) */
  ROSTER: 'team:profile:roster:',
  /** Team schedule — SHORT_TTL (1 min) */
  SCHEDULE: 'team:profile:schedule:',
} as const;

// ============================================
// TEAM RECRUITING CATEGORY MAPPING
// ============================================

/**
 * Icon mapping for team recruiting activity categories.
 * Maps each team-perspective category to an Ionicon name.
 */
export const TEAM_RECRUITING_CATEGORY_ICONS: Record<TeamProfileRecruitingCategory, string> = {
  'offer-sent': 'school',
  'commitment-received': 'checkmark-circle',
  'visit-hosted': 'location',
  'camp-hosted': 'flag',
  contact: 'call',
} as const;

/**
 * Human-readable label mapping for team recruiting activity categories.
 */
export const TEAM_RECRUITING_CATEGORY_LABELS: Record<TeamProfileRecruitingCategory, string> = {
  'offer-sent': 'Offer Sent',
  'commitment-received': 'Committed',
  'visit-hosted': 'Visit',
  'camp-hosted': 'Camp',
  contact: 'Contact',
} as const;
