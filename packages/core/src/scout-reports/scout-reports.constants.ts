/**
 * @fileoverview Scout Reports Constants
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Configuration constants for Scout Reports feature.
 * 100% portable - no platform dependencies.
 * Uses design tokens for theme-aware styling.
 */

import type {
  ScoutReportCategory,
  ScoutReportCategoryId,
  RatingTier,
  AthleteSport,
  ScoutReportXpReward,
  ScoutReportMilestone,
  ScoutReportSortBy,
  ScoutReportLayoutConfig,
} from './scout-reports.types';

// ============================================
// CATEGORY CONFIGURATION
// ============================================

/**
 * Available report categories with display configuration.
 * Order determines display order in tab bar.
 */
export const SCOUT_REPORT_CATEGORIES: readonly ScoutReportCategory[] = [
  {
    id: 'all',
    label: 'All',
    icon: 'layers-outline',
  },
  {
    id: 'trending',
    label: 'Trending',
    icon: 'trending-up-outline',
  },
  {
    id: 'top-rated',
    label: 'Top Rated',
    icon: 'star-outline',
  },
  {
    id: 'recent',
    label: 'Recent',
    icon: 'time-outline',
  },
  {
    id: 'by-sport',
    label: 'By Sport',
    icon: 'football-outline',
  },
  {
    id: 'class-2026',
    label: 'Class 2026',
    icon: 'school-outline',
  },
  {
    id: 'class-2027',
    label: 'Class 2027',
    icon: 'school-outline',
  },
  {
    id: 'class-2028',
    label: 'Class 2028',
    icon: 'school-outline',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: 'bookmark-outline',
  },
  {
    id: 'premium',
    label: 'Premium',
    icon: 'diamond-outline',
    isPremium: true,
  },
] as const;

/**
 * Default selected category.
 */
export const SCOUT_REPORT_DEFAULT_CATEGORY: ScoutReportCategoryId = 'trending';

// ============================================
// RATING TIER CONFIGURATION
// ============================================

/**
 * Rating tier thresholds.
 * Determines which tier a rating falls into.
 */
export const RATING_TIER_THRESHOLDS: Record<RatingTier, { min: number; max: number }> = {
  elite: { min: 4.5, max: 5.0 },
  excellent: { min: 4.0, max: 4.49 },
  good: { min: 3.5, max: 3.99 },
  average: { min: 3.0, max: 3.49 },
  developing: { min: 0, max: 2.99 },
} as const;

/**
 * Rating tier colors using CSS custom properties (design tokens).
 * 100% theme-aware - works in light and dark mode.
 */
export const RATING_TIER_COLORS: Record<RatingTier, string> = {
  elite: 'var(--nxt1-color-rating-elite, #FFD700)', // Gold
  excellent: 'var(--nxt1-color-rating-excellent, #60A5FA)', // Blue
  good: 'var(--nxt1-color-rating-good, #34D399)', // Green
  average: 'var(--nxt1-color-rating-average, #9CA3AF)', // Gray
  developing: 'var(--nxt1-color-rating-developing, #FB923C)', // Orange
} as const;

/**
 * Rating tier labels for display.
 */
export const RATING_TIER_LABELS: Record<RatingTier, string> = {
  elite: 'Elite',
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  developing: 'Developing',
} as const;

/**
 * Rating tier icons.
 */
export const RATING_TIER_ICONS: Record<RatingTier, string> = {
  elite: 'diamond',
  excellent: 'star',
  good: 'thumbs-up',
  average: 'remove',
  developing: 'trending-up',
} as const;

// ============================================
// SPORT CONFIGURATION
// ============================================

/**
 * Sport icons using Ionicons.
 */
export const SPORT_ICONS: Record<AthleteSport, string> = {
  football: 'football-outline',
  basketball: 'basketball-outline',
  baseball: 'baseball-outline',
  softball: 'baseball-outline',
  soccer: 'football-outline', // Using football as soccer ball
  volleyball: 'tennisball-outline',
  track: 'walk-outline',
  swimming: 'water-outline',
  wrestling: 'body-outline',
  lacrosse: 'tennisball-outline',
  hockey: 'snow-outline',
  tennis: 'tennisball-outline',
  golf: 'golf-outline',
  gymnastics: 'fitness-outline',
  other: 'help-circle-outline',
} as const;

/**
 * Sport display names.
 */
export const SPORT_LABELS: Record<AthleteSport, string> = {
  football: 'Football',
  basketball: 'Basketball',
  baseball: 'Baseball',
  softball: 'Softball',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  track: 'Track & Field',
  swimming: 'Swimming',
  wrestling: 'Wrestling',
  lacrosse: 'Lacrosse',
  hockey: 'Hockey',
  tennis: 'Tennis',
  golf: 'Golf',
  gymnastics: 'Gymnastics',
  other: 'Other',
} as const;

/**
 * Sport-specific color tokens (CSS custom properties).
 */
export const SPORT_COLORS: Record<AthleteSport, string> = {
  football: 'var(--nxt1-color-sport-football, #8B4513)',
  basketball: 'var(--nxt1-color-sport-basketball, #FF6B00)',
  baseball: 'var(--nxt1-color-sport-baseball, #C41E3A)',
  softball: 'var(--nxt1-color-sport-softball, #FFD700)',
  soccer: 'var(--nxt1-color-sport-soccer, #00A651)',
  volleyball: 'var(--nxt1-color-sport-volleyball, #FFD700)',
  track: 'var(--nxt1-color-sport-track, #FF4500)',
  swimming: 'var(--nxt1-color-sport-swimming, #00BFFF)',
  wrestling: 'var(--nxt1-color-sport-wrestling, #8B0000)',
  lacrosse: 'var(--nxt1-color-sport-lacrosse, #4169E1)',
  hockey: 'var(--nxt1-color-sport-hockey, #0047AB)',
  tennis: 'var(--nxt1-color-sport-tennis, #ADFF2F)',
  golf: 'var(--nxt1-color-sport-golf, #228B22)',
  gymnastics: 'var(--nxt1-color-sport-gymnastics, #FF1493)',
  other: 'var(--nxt1-color-sport-other, #6B7280)',
} as const;

// ============================================
// POSITION CONFIGURATION
// ============================================

/**
 * Football positions with colors.
 */
export const FOOTBALL_POSITIONS: Record<string, { label: string; color: string }> = {
  QB: { label: 'Quarterback', color: 'var(--nxt1-color-position-qb, #8B5CF6)' },
  RB: { label: 'Running Back', color: 'var(--nxt1-color-position-rb, #10B981)' },
  FB: { label: 'Full Back', color: 'var(--nxt1-color-position-fb, #10B981)' },
  WR: { label: 'Wide Receiver', color: 'var(--nxt1-color-position-wr, #3B82F6)' },
  TE: { label: 'Tight End', color: 'var(--nxt1-color-position-te, #F59E0B)' },
  C: { label: 'Center', color: 'var(--nxt1-color-position-c, #6B7280)' },
  OL: { label: 'Offensive Line', color: 'var(--nxt1-color-position-ol, #6B7280)' },
  G: { label: 'Guard', color: 'var(--nxt1-color-position-g, #6B7280)' },
  LG: { label: 'Left Guard', color: 'var(--nxt1-color-position-g, #6B7280)' },
  RG: { label: 'Right Guard', color: 'var(--nxt1-color-position-g, #6B7280)' },
  T: { label: 'Tackle', color: 'var(--nxt1-color-position-t, #6B7280)' },
  LT: { label: 'Left Tackle', color: 'var(--nxt1-color-position-t, #6B7280)' },
  RT: { label: 'Right Tackle', color: 'var(--nxt1-color-position-t, #6B7280)' },
  DL: { label: 'Defensive Line', color: 'var(--nxt1-color-position-dl, #EF4444)' },
  DT: { label: 'Defensive Tackle', color: 'var(--nxt1-color-position-dt, #EF4444)' },
  DE: { label: 'Defensive End', color: 'var(--nxt1-color-position-de, #EF4444)' },
  LB: { label: 'Linebacker', color: 'var(--nxt1-color-position-lb, #F97316)' },
  MLB: { label: 'Middle Linebacker', color: 'var(--nxt1-color-position-mlb, #F97316)' },
  OLB: { label: 'Outside Linebacker', color: 'var(--nxt1-color-position-olb, #F97316)' },
  CB: { label: 'Cornerback', color: 'var(--nxt1-color-position-cb, #06B6D4)' },
  S: { label: 'Safety', color: 'var(--nxt1-color-position-s, #6366F1)' },
  FS: { label: 'Free Safety', color: 'var(--nxt1-color-position-fs, #6366F1)' },
  SS: { label: 'Strong Safety', color: 'var(--nxt1-color-position-ss, #6366F1)' },
  K: { label: 'Kicker', color: 'var(--nxt1-color-position-k, #84CC16)' },
  P: { label: 'Punter', color: 'var(--nxt1-color-position-p, #84CC16)' },
  LS: { label: 'Long Snapper', color: 'var(--nxt1-color-position-ls, #84CC16)' },
  ATH: { label: 'Athlete', color: 'var(--nxt1-color-position-ath, #EC4899)' },
} as const;

/**
 * Basketball positions with colors.
 */
export const BASKETBALL_POSITIONS: Record<string, { label: string; color: string }> = {
  PG: { label: 'Point Guard', color: 'var(--nxt1-color-position-pg, #8B5CF6)' },
  SG: { label: 'Shooting Guard', color: 'var(--nxt1-color-position-sg, #3B82F6)' },
  SF: { label: 'Small Forward', color: 'var(--nxt1-color-position-sf, #10B981)' },
  PF: { label: 'Power Forward', color: 'var(--nxt1-color-position-pf, #F59E0B)' },
  C: { label: 'Center', color: 'var(--nxt1-color-position-c, #EF4444)' },
} as const;

/**
 * Baseball positions with colors.
 */
export const BASEBALL_POSITIONS: Record<string, { label: string; color: string }> = {
  P: { label: 'Pitcher', color: 'var(--nxt1-color-position-pitcher, #EF4444)' },
  C: { label: 'Catcher', color: 'var(--nxt1-color-position-catcher, #8B5CF6)' },
  '1B': { label: 'First Base', color: 'var(--nxt1-color-position-1b, #F59E0B)' },
  '2B': { label: 'Second Base', color: 'var(--nxt1-color-position-2b, #10B981)' },
  SS: { label: 'Shortstop', color: 'var(--nxt1-color-position-ss, #3B82F6)' },
  '3B': { label: 'Third Base', color: 'var(--nxt1-color-position-3b, #F97316)' },
  LF: { label: 'Left Field', color: 'var(--nxt1-color-position-lf, #06B6D4)' },
  CF: { label: 'Center Field', color: 'var(--nxt1-color-position-cf, #6366F1)' },
  RF: { label: 'Right Field', color: 'var(--nxt1-color-position-rf, #EC4899)' },
  DH: { label: 'Designated Hitter', color: 'var(--nxt1-color-position-dh, #84CC16)' },
  UTL: { label: 'Utility', color: 'var(--nxt1-color-position-utl, #6B7280)' },
} as const;

/**
 * All positions by sport.
 */
export const POSITIONS_BY_SPORT: Record<
  AthleteSport,
  Record<string, { label: string; color: string }>
> = {
  football: FOOTBALL_POSITIONS,
  basketball: BASKETBALL_POSITIONS,
  baseball: BASEBALL_POSITIONS,
  softball: BASEBALL_POSITIONS,
  soccer: {
    GK: { label: 'Goalkeeper', color: 'var(--nxt1-color-position-gk, #EF4444)' },
    DEF: { label: 'Defender', color: 'var(--nxt1-color-position-def, #3B82F6)' },
    MID: { label: 'Midfielder', color: 'var(--nxt1-color-position-mid, #10B981)' },
    FWD: { label: 'Forward', color: 'var(--nxt1-color-position-fwd, #F59E0B)' },
  },
  volleyball: {
    S: { label: 'Setter', color: 'var(--nxt1-color-position-setter, #8B5CF6)' },
    OH: { label: 'Outside Hitter', color: 'var(--nxt1-color-position-oh, #3B82F6)' },
    MB: { label: 'Middle Blocker', color: 'var(--nxt1-color-position-mb, #F59E0B)' },
    OPP: { label: 'Opposite', color: 'var(--nxt1-color-position-opp, #EF4444)' },
    L: { label: 'Libero', color: 'var(--nxt1-color-position-libero, #10B981)' },
  },
  track: {},
  swimming: {},
  wrestling: {},
  lacrosse: {},
  hockey: {},
  tennis: {},
  golf: {},
  gymnastics: {},
  other: {},
} as const;

// ============================================
// GRADUATION YEARS
// ============================================

/**
 * Available graduation years for filtering.
 */
export const GRADUATION_YEARS: readonly number[] = [2025, 2026, 2027, 2028, 2029, 2030] as const;

// ============================================
// SORT OPTIONS
// ============================================

/**
 * Sort options for scout reports.
 */
export const SCOUT_REPORT_SORT_OPTIONS: readonly {
  id: ScoutReportSortBy;
  label: string;
  icon: string;
}[] = [
  { id: 'rating', label: 'Rating (High-Low)', icon: 'star-outline' },
  { id: 'recent', label: 'Most Recent', icon: 'time-outline' },
  { id: 'trending', label: 'Trending', icon: 'trending-up-outline' },
  { id: 'views', label: 'Most Viewed', icon: 'eye-outline' },
  { id: 'name', label: 'Name (A-Z)', icon: 'text-outline' },
  { id: 'gradYear', label: 'Graduation Year', icon: 'school-outline' },
] as const;

// ============================================
// XP & GAMIFICATION
// ============================================

/**
 * XP rewards for scout report actions.
 */
export const SCOUT_REPORT_XP_REWARDS: readonly ScoutReportXpReward[] = [
  { action: 'view', xp: 10, description: 'View a scout report' },
  { action: 'bookmark', xp: 15, description: 'Save a report to bookmarks' },
  { action: 'share', xp: 20, description: 'Share a report' },
  { action: 'complete-category', xp: 50, description: 'View all reports in a category' },
  { action: 'milestone', xp: 100, description: 'Reach a viewing milestone' },
] as const;

/**
 * Milestones for scout report viewing achievements.
 */
export const SCOUT_REPORT_MILESTONES: readonly ScoutReportMilestone[] = [
  {
    id: 'scout-rookie',
    title: 'Scout Rookie',
    description: 'View your first 5 scout reports',
    threshold: 5,
    xpReward: 50,
    badgeIcon: 'eye-outline',
  },
  {
    id: 'scout-apprentice',
    title: 'Scout Apprentice',
    description: 'View 25 scout reports',
    threshold: 25,
    xpReward: 100,
    badgeIcon: 'search-outline',
  },
  {
    id: 'scout-expert',
    title: 'Scout Expert',
    description: 'View 50 scout reports',
    threshold: 50,
    xpReward: 200,
    badgeIcon: 'telescope-outline',
  },
  {
    id: 'scout-master',
    title: 'Scout Master',
    description: 'View 100 scout reports',
    threshold: 100,
    xpReward: 500,
    badgeIcon: 'ribbon-outline',
  },
  {
    id: 'scout-legend',
    title: 'Scout Legend',
    description: 'View 250 scout reports',
    threshold: 250,
    xpReward: 1000,
    badgeIcon: 'trophy-outline',
  },
  {
    id: 'bookworm',
    title: 'Bookworm',
    description: 'Save 25 reports to bookmarks',
    threshold: 25,
    xpReward: 150,
    badgeIcon: 'bookmark-outline',
  },
  {
    id: 'social-scout',
    title: 'Social Scout',
    description: 'Share 10 reports',
    threshold: 10,
    xpReward: 150,
    badgeIcon: 'share-social-outline',
  },
] as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Default pagination configuration.
 */
export const SCOUT_REPORT_PAGINATION_DEFAULTS = {
  pageSize: 20,
  initialPage: 1,
  maxPageSize: 50,
} as const;

// ============================================
// LAYOUT DEFAULTS
// ============================================

/**
 * Default layout configuration.
 */
export const SCOUT_REPORT_LAYOUT_DEFAULTS: ScoutReportLayoutConfig = {
  viewMode: 'grid',
  gridColumns: 2,
  showQuickStats: true,
  showRatingBreakdown: true,
  enableSwipeGestures: true,
} as const;

// ============================================
// CACHE KEYS
// ============================================

/**
 * Cache key prefixes for scout reports.
 */
export const SCOUT_REPORT_CACHE_KEYS = {
  REPORTS_LIST: 'scout-reports:list:',
  REPORT_DETAIL: 'scout-reports:detail:',
  BOOKMARKED: 'scout-reports:bookmarked',
  FILTERS: 'scout-reports:filters',
  SUMMARY: 'scout-reports:summary',
  VIEW_MODE: 'scout-reports:view-mode',
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoint paths for scout reports.
 */
export const SCOUT_REPORT_API_ENDPOINTS = {
  LIST: '/api/v1/scout-reports',
  DETAIL: '/api/v1/scout-reports',
  BOOKMARK: '/api/v1/scout-reports/bookmark',
  UNBOOKMARK: '/api/v1/scout-reports/unbookmark',
  VIEW: '/api/v1/scout-reports/view',
  SUMMARY: '/api/v1/scout-reports/summary',
  SEARCH: '/api/v1/scout-reports/search',
} as const;

// ============================================
// UI CONSTANTS
// ============================================

/**
 * Card aspect ratios.
 */
export const SCOUT_REPORT_CARD_ASPECT = {
  photo: '3/4', // Portrait athlete photo
  thumbnail: '16/9', // Video thumbnails
  avatar: '1/1', // Scout avatars
} as const;

/**
 * Animation durations in milliseconds.
 */
export const SCOUT_REPORT_ANIMATIONS = {
  cardEntrance: 200,
  staggerDelay: 50,
  bookmarkPop: 300,
  ratingFill: 500,
  filterSlide: 250,
  skeletonShimmer: 1500,
} as const;

/**
 * Skeleton card count for loading state.
 */
export const SCOUT_REPORT_SKELETON_COUNT = 6;

/**
 * Maximum summary preview length.
 */
export const SCOUT_REPORT_SUMMARY_PREVIEW_LENGTH = 120;

/**
 * Maximum highlights to show on card.
 */
export const SCOUT_REPORT_MAX_CARD_HIGHLIGHTS = 3;
