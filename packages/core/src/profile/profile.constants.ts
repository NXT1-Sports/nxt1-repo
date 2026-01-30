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
  OfferType,
  EventType,
  ProfileHeaderAction,
} from './profile.types';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Profile content tabs with display configuration.
 * Order determines display order in tab bar.
 */
export const PROFILE_TABS: readonly ProfileTab[] = [
  {
    id: 'timeline',
    label: 'Timeline',
    icon: 'newspaper-outline',
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: 'videocam-outline',
  },
  {
    id: 'offers',
    label: 'Offers',
    icon: 'trophy-outline',
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: 'stats-chart-outline',
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'calendar-outline',
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: 'mail-outline',
  },
] as const;

/**
 * Default selected tab.
 * 'timeline' provides the best overview experience on first load.
 */
export const PROFILE_DEFAULT_TAB: ProfileTabId = 'timeline';

// ============================================
// POST TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for post types.
 */
export const PROFILE_POST_TYPE_ICONS: Record<ProfilePostType, string> = {
  video: 'videocam-outline',
  image: 'image-outline',
  text: 'document-text-outline',
  highlight: 'star-outline',
  news: 'newspaper-outline',
  stat: 'stats-chart-outline',
  offer: 'trophy-outline',
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
// OFFER TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for offer types.
 */
export const OFFER_TYPE_ICONS: Record<OfferType, string> = {
  scholarship: 'school-outline',
  preferred_walk_on: 'walk-outline',
  camp_invite: 'flag-outline',
  visit: 'location-outline',
  interest: 'heart-outline',
} as const;

/**
 * Label mapping for offer types.
 */
export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  scholarship: 'Scholarship Offer',
  preferred_walk_on: 'Preferred Walk-On',
  camp_invite: 'Camp Invite',
  visit: 'Visit Invite',
  interest: 'Interest',
} as const;

/**
 * Color mapping for offer types (CSS variable names).
 */
export const OFFER_TYPE_COLORS: Record<OfferType, string> = {
  scholarship: 'var(--nxt1-color-success)',
  preferred_walk_on: 'var(--nxt1-color-primary)',
  camp_invite: 'var(--nxt1-color-warning)',
  visit: 'var(--nxt1-color-info)',
  interest: 'var(--nxt1-color-secondary)',
} as const;

// ============================================
// EVENT TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for event types.
 */
export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  game: 'american-football-outline',
  camp: 'flag-outline',
  combine: 'barbell-outline',
  showcase: 'star-outline',
  visit: 'school-outline',
  practice: 'fitness-outline',
  other: 'calendar-outline',
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
    icon: 'eye-outline',
  },
  videoViews: {
    key: 'videoViews',
    label: 'Video Views',
    icon: 'play-circle-outline',
  },
  totalPosts: {
    key: 'totalPosts',
    label: 'Posts',
    icon: 'newspaper-outline',
  },
  highlightCount: {
    key: 'highlightCount',
    label: 'Highlights',
    icon: 'videocam-outline',
  },
  offerCount: {
    key: 'offerCount',
    label: 'Offers',
    icon: 'trophy-outline',
  },
  eventCount: {
    key: 'eventCount',
    label: 'Events',
    icon: 'calendar-outline',
  },
  collegeInterestCount: {
    key: 'collegeInterestCount',
    label: 'College Interest',
    icon: 'school-outline',
  },
  shareCount: {
    key: 'shareCount',
    label: 'Shares',
    icon: 'share-social-outline',
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
    icon: 'add-circle-outline',
    primary: true,
  },
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code-outline',
  },
  {
    id: 'share',
    label: 'Share Profile',
    icon: 'share-social-outline',
  },
] as const;

/**
 * Profile header actions for other profiles.
 */
export const PROFILE_OTHER_HEADER_ACTIONS: readonly ProfileHeaderAction[] = [
  {
    id: 'ai-summary',
    label: 'AI Summary',
    icon: 'sparkles-outline',
  },
  {
    id: 'qr-code',
    label: 'QR Code',
    icon: 'qr-code-outline',
  },
  {
    id: 'share',
    label: 'Share Profile',
    icon: 'share-social-outline',
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
  timeline: {
    title: 'No posts yet',
    message: 'Start sharing your journey and connect with coaches and scouts.',
    icon: 'newspaper-outline',
    ctaLabel: 'Create First Post',
  },
  videos: {
    title: 'No videos yet',
    message: 'Upload highlights and game footage to showcase your skills.',
    icon: 'videocam-outline',
    ctaLabel: 'Upload Video',
  },
  offers: {
    title: 'No offers yet',
    message: 'Your recruiting journey is just getting started. Keep working!',
    icon: 'trophy-outline',
    ctaLabel: 'Add Offer',
  },
  stats: {
    title: 'No stats recorded',
    message: 'Add your athletic and academic stats to complete your profile.',
    icon: 'stats-chart-outline',
    ctaLabel: 'Add Stats',
  },
  events: {
    title: 'No events scheduled',
    message: 'Add upcoming games, camps, and showcases to your calendar.',
    icon: 'calendar-outline',
    ctaLabel: 'Add Event',
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
