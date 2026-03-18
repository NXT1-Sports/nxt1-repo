/**
 * @fileoverview Profile Constants
 * @module @nxt1/core/profile
 * @version 2.0.0
 *
 * Configuration constants for Profile feature.
 * 100% portable - no platform dependencies.
 *
 * @description Defines tabs, icons, empty states, and UI configuration
 * for the enterprise-grade profile system.
 */

import type {
  ProfileTab,
  ProfileTabId,
  ProfilePostType,
  ProfileTimelineFilter,
  ProfileTimelineFilterId,
  ProfileRecruitingCategory,
  OfferType,
  EventType,
  ProfileHeaderAction,
  ProfileUser,
} from './profile.types';
import type { VerificationScope } from '../models/user.model';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Profile content tabs with display configuration.
 * Order determines display order in tab bar.
 */
export const PROFILE_TABS: readonly ProfileTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'grid',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: 'newspaper',
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: 'videocam',
  },
  {
    id: 'news',
    label: 'News',
    icon: 'newspaper-outline',
  },
  {
    id: 'offers',
    label: 'Recruit',
    icon: 'trophy',
    visibleFor: ['athlete'],
  },
  {
    id: 'metrics',
    label: 'Metrics',
    icon: 'barbell',
    visibleFor: ['athlete'],
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: 'stats-chart',
    visibleFor: ['athlete'],
  },
  {
    id: 'academic',
    label: 'Academic',
    icon: 'school',
    visibleFor: ['athlete'],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: 'calendar-clear',
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'calendar',
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: 'mail',
  },
] as const;

/**
 * Default selected tab.
 * 'timeline' provides the best overview experience on first load.
 */
export const PROFILE_DEFAULT_TAB: ProfileTabId = 'overview';

// ============================================
// ROLE-AWARE TAB HELPERS (Source of Truth)
// ============================================

/**
 * Returns profile tabs filtered for the given user.
 *
 * - Strips `contact` and `academic` from the tab bar (shown inline on overview).
 * - Respects `visibleFor` metadata: athlete-only tabs (offers, metrics, stats)
 *   are hidden for team managers; team-only tabs are hidden for athletes.
 *
 * @pure — no side effects, safe for computed().
 */
export function getProfileTabsForUser(user: ProfileUser | null): readonly ProfileTab[] {
  const roleCategory: 'athlete' | 'team' = user?.isTeamManager ? 'team' : 'athlete';

  return PROFILE_TABS.filter((tab) => {
    // Contact and academic are always shown inline on the overview tab
    if (tab.id === 'contact' || tab.id === 'academic') return false;
    // If no visibleFor constraint, tab is visible for all roles
    if (!tab.visibleFor) return true;
    return tab.visibleFor.includes(roleCategory);
  });
}

/**
 * Returns overview section nav labels appropriate for the user's role.
 * Coaches/directors see "Team Profile / About / History" instead of athlete-specific labels.
 */
export function getOverviewSectionLabels(user: ProfileUser | null): {
  readonly profile: string;
  readonly bio: string;
  readonly history: string;
} {
  if (user?.isTeamManager) {
    return { profile: 'Team Profile', bio: 'About', history: 'History' };
  }
  return { profile: 'Player Info', bio: 'Player Bio', history: 'Player History' };
}

/**
 * Tabs where the shared verification banner is hidden by default.
 * Override by providing a custom set via input if needed.
 */
export const PROFILE_VERIFICATION_HIDDEN_TABS: ReadonlySet<ProfileTabId> = new Set(['contact']);

// ── Verification scope lookup tables (module-level for zero allocation) ──

const TAB_SCOPES: Readonly<Record<string, readonly VerificationScope[]>> = {
  metrics: ['measurables'],
  stats: ['stats'],
  roster: ['stats'],
  schedule: ['schedule'],
  academic: ['academics'],
};

const OVERVIEW_SIDE_TAB_SCOPES: Readonly<Record<string, readonly VerificationScope[]>> = {
  'player-profile': ['measurables'],
  'player-info': ['measurables'],
  'player-history': ['recruiting'],
  awards: ['stats'],
  academic: ['academics'],
};

const OFFERS_SIDE_TAB_SCOPES: Readonly<Record<string, readonly VerificationScope[]>> = {
  timeline: ['recruiting'],
  committed: ['recruiting'],
  'all-offers': ['recruiting'],
  interests: ['recruiting'],
  rankings: ['recruiting'],
};

const EMPTY_SCOPES: readonly VerificationScope[] = [];

/**
 * Maps a profile tab (and optional side-tab) to the `VerificationScope`(s)
 * that apply. Returns an empty array when no scopes are relevant,
 * which means the verification banner should be hidden.
 *
 * @pure — no side effects, zero allocations, safe for computed().
 */
export function getVerificationScopesForTab(
  tabId: string,
  sideTabId?: string
): readonly VerificationScope[] {
  if (tabId === 'overview' && sideTabId) {
    return OVERVIEW_SIDE_TAB_SCOPES[sideTabId] ?? EMPTY_SCOPES;
  }

  if (tabId === 'offers' && sideTabId) {
    return OFFERS_SIDE_TAB_SCOPES[sideTabId] ?? EMPTY_SCOPES;
  }

  return TAB_SCOPES[tabId] ?? EMPTY_SCOPES;
}

// ============================================
// TIMELINE FILTER CONFIGURATION
// ============================================

/**
 * Sub-filters within the Timeline tab.
 * Allows users to quickly filter by activity type.
 */
export const PROFILE_TIMELINE_FILTERS: readonly ProfileTimelineFilter[] = [
  {
    id: 'all',
    label: 'All Activity',
    icon: 'newspaper',
    emptyTitle: 'No activity yet',
    emptyMessage: 'Start sharing your journey',
  },
  {
    id: 'pinned',
    label: 'Pinned',
    icon: 'pin',
    emptyTitle: 'No pinned posts',
    emptyMessage: 'Pin your best content to the top of your profile',
  },
  {
    id: 'media',
    label: 'Media',
    icon: 'image',
    emptyTitle: 'No media posts',
    emptyMessage: 'Share photos and videos to showcase your talent',
  },
  {
    id: 'offers',
    label: 'Offers',
    icon: 'trophy',
    emptyTitle: 'No offers yet',
    emptyMessage: 'Recruiting offers and interest will appear here',
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'calendar',
    emptyTitle: 'No events yet',
    emptyMessage: 'Visits, camps, and showcases will appear here',
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: 'stats-chart',
    emptyTitle: 'No stat updates',
    emptyMessage: 'Game stats and performance updates will appear here',
  },
  {
    id: 'news',
    label: 'News',
    icon: 'newspaper-outline',
    emptyTitle: 'No news mentions',
    emptyMessage: 'News articles and media mentions will appear here',
  },
] as const;

/**
 * Default timeline filter.
 */
export const PROFILE_TIMELINE_DEFAULT_FILTER: ProfileTimelineFilterId = 'all';

// ============================================
// POST TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for post types.
 */
export const PROFILE_POST_TYPE_ICONS: Record<ProfilePostType, string> = {
  video: 'videocam',
  image: 'image',
  text: 'document-text',
  highlight: 'star',
  news: 'newspaper',
  stat: 'stats-chart',
  offer: 'trophy',
} as const;

/**
 * Label mapping for post types.
 */
export const PROFILE_POST_TYPE_LABELS: Record<ProfilePostType, string> = {
  video: 'Video',
  image: 'Photo',
  text: 'Post',
  highlight: 'Highlight',
  news: 'News',
  stat: 'Stat Update',
  offer: 'Offer',
} as const;

// ============================================
// RECRUITING CATEGORY CONFIGURATION
// ============================================

/**
 * Icon mapping for recruiting activity categories.
 */
export const RECRUITING_CATEGORY_ICONS: Record<ProfileRecruitingCategory, string> = {
  offer: 'school',
  interest: 'heart',
  visit: 'location',
  camp: 'flag',
  commitment: 'checkmark-circle',
  contact: 'call',
} as const;

/**
 * Label mapping for recruiting activity categories.
 */
export const RECRUITING_CATEGORY_LABELS: Record<ProfileRecruitingCategory, string> = {
  offer: 'Offer',
  interest: 'Interest',
  visit: 'Visit',
  camp: 'Camp',
  commitment: 'Committed',
  contact: 'Contact',
} as const;

// ============================================
// OFFER TYPE CONFIGURATION (DEPRECATED)
// ============================================

/** @deprecated Use RECRUITING_CATEGORY_ICONS instead. */
/**
 * Icon mapping for offer types.
 */
export const OFFER_TYPE_ICONS: Record<OfferType, string> = {
  scholarship: 'school',
  preferred_walk_on: 'walk',
  interest: 'heart',
} as const;

/**
 * Label mapping for offer types.
 */
export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  scholarship: 'Scholarship Offer',
  preferred_walk_on: 'Preferred Walk-On',
  interest: 'Interest',
} as const;

/**
 * Color mapping for offer types (CSS variable names).
 */
export const OFFER_TYPE_COLORS: Record<OfferType, string> = {
  scholarship: 'var(--nxt1-color-success)',
  preferred_walk_on: 'var(--nxt1-color-primary)',
  interest: 'var(--nxt1-color-secondary)',
} as const;

// ============================================
// EVENT TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for event types.
 */
export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  game: 'american-football',
  camp: 'flag',
  combine: 'barbell',
  showcase: 'star',
  visit: 'school',
  practice: 'fitness',
  other: 'calendar',
} as const;

/**
 * Label mapping for event types.
 */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  game: 'Game',
  camp: 'Camp',
  combine: 'Combine',
  showcase: 'Showcase',
  visit: 'College Visit',
  practice: 'Practice',
  other: 'Event',
} as const;

// ============================================
// QUICK STATS CONFIGURATION
// ============================================

/**
 * Quick stat display configuration.
 */
export const PROFILE_QUICK_STATS_CONFIG = {
  profileViews: {
    key: 'profileViews',
    label: 'Profile Views',
    icon: 'eye',
  },
  videoViews: {
    key: 'videoViews',
    label: 'Video Views',
    icon: 'play-circle',
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
  offerCount: {
    key: 'offerCount',
    label: 'Offers',
    icon: 'trophy',
  },
  eventCount: {
    key: 'eventCount',
    label: 'Events',
    icon: 'calendar',
  },
  collegeInterestCount: {
    key: 'collegeInterestCount',
    label: 'College Interest',
    icon: 'school',
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
 * Profile header actions for own profile.
 */
export const PROFILE_OWN_HEADER_ACTIONS: readonly ProfileHeaderAction[] = [
  {
    id: 'create-post',
    label: 'Create Post',
    icon: 'add-circle',
    primary: true,
  },
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code',
  },
  {
    id: 'share',
    label: 'Share Profile',
    icon: 'share-social',
  },
] as const;

/**
 * Profile header actions for other profiles.
 */
export const PROFILE_OTHER_HEADER_ACTIONS: readonly ProfileHeaderAction[] = [
  {
    id: 'ai-summary',
    label: 'AI Summary',
    icon: 'sparkles',
  },
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code',
  },
  {
    id: 'share',
    label: 'Share Profile',
    icon: 'share-social',
  },
] as const;

// ============================================
// EMPTY STATES
// ============================================

/**
 * Empty state configuration for profile tabs.
 */
export const PROFILE_EMPTY_STATES: Record<
  ProfileTabId,
  {
    readonly title: string;
    readonly message: string;
    readonly icon: string;
    readonly ctaLabel?: string;
  }
> = {
  overview: {
    title: 'Overview not available',
    message: 'Player profile information will appear here once generated.',
    icon: 'pie-chart-outline',
  },
  timeline: {
    title: 'No posts yet',
    message: 'Start sharing your journey and connect with coaches and scouts.',
    icon: 'newspaper-outline',
    ctaLabel: 'Create First Post',
  },
  news: {
    title: 'No news yet',
    message: 'News updates, announcements, and media mentions will appear here.',
    icon: 'newspaper-outline',
    ctaLabel: 'Create News Post',
  },
  videos: {
    title: 'No videos yet',
    message: 'Upload highlights and game footage to showcase your skills.',
    icon: 'videocam-outline',
    ctaLabel: 'Upload Video',
  },
  offers: {
    title: 'No recruit activity yet',
    message: 'Your recruiting journey is just getting started. Keep working!',
    icon: 'trophy-outline',
    ctaLabel: 'Add Recruit Update',
  },
  metrics: {
    title: 'No metrics recorded',
    message: 'Add your combine results and measurables to showcase your athleticism.',
    icon: 'barbell-outline',
    ctaLabel: 'Add Metrics',
  },
  stats: {
    title: 'No stats recorded',
    message: 'Add your athletic and academic stats to complete your profile.',
    icon: 'stats-chart-outline',
    ctaLabel: 'Add Stats',
  },
  academic: {
    title: 'No academic info yet',
    message: 'Add GPA, test scores, and school details to strengthen your profile.',
    icon: 'school-outline',
    ctaLabel: 'Add Academic Info',
  },
  events: {
    title: 'No events scheduled',
    message: 'Add upcoming games, camps, and showcases to your calendar.',
    icon: 'calendar-outline',
    ctaLabel: 'Add Event',
  },
  schedule: {
    title: 'No schedule yet',
    message: 'Add upcoming games, camps, and showcases to your schedule.',
    icon: 'calendar-outline',
    ctaLabel: 'Add Schedule Item',
  },
  contact: {
    title: 'Contact info not set',
    message: 'Add your contact information so coaches can reach you.',
    icon: 'mail-outline',
    ctaLabel: 'Add Contact Info',
  },
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration constants for profile feature.
 */
export const PROFILE_UI_CONFIG = {
  /** Number of skeleton items to show while loading */
  skeletonCount: 6,
  /** Number of posts to load per page */
  postsPerPage: 20,
  /** Maximum pinned posts */
  maxPinnedPosts: 2,
  /** Maximum about me character length */
  maxAboutMeLength: 500,
  /** Default banner aspect ratio */
  bannerAspectRatio: 3 / 1,
  /** Avatar sizes */
  avatarSizes: {
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
 * Cache key prefixes for the profile feature.
 * Aligns with CACHE_KEYS.USER_PROFILE from @nxt1/core/cache.
 */
export const PROFILE_CACHE_KEYS = {
  /** Profile data keyed by userId — MEDIUM_TTL (15 min) */
  BY_ID: 'user:profile:',
  /** Profile data keyed by username — MEDIUM_TTL (15 min) */
  BY_USERNAME: 'user:profile:username:',
  /** Profile data keyed by unicode — MEDIUM_TTL (15 min) */
  BY_UNICODE: 'user:profile:unicode:',
  /** Full-text / filtered profile search results — SEARCH TTL (15 min) */
  SEARCH: 'user:profile:search:',
} as const;

// ============================================
// VALIDATION
// ============================================

/**
 * Profile validation rules.
 */
export const PROFILE_VALIDATION = {
  firstName: {
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z\s'-]+$/,
  },
  lastName: {
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z\s'-]+$/,
  },
  aboutMe: {
    maxLength: 500,
  },
  height: {
    pattern: /^\d{1,2}'\d{1,2}"?$/,
  },
  weight: {
    min: 50,
    max: 500,
  },
  gpa: {
    min: 0,
    max: 5,
  },
} as const;
