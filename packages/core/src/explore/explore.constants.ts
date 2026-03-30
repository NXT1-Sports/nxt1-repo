/**
 * @fileoverview Explore Constants
 * @module @nxt1/core/explore
 * @version 1.0.0
 *
 * Configuration constants for Explore/Search feature.
 * 100% portable - no platform dependencies.
 */

import type {
  ExploreTab,
  ExploreTabId,
  ExploreSortOption,
  ExploreTabCounts,
} from './explore.types';
import { US_STATES } from '../constants/location.constants';
import { DEFAULT_SPORTS, formatSportDisplayName } from '../constants/sport.constants';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Feed tab IDs — content tabs that replaced the standalone /home route.
 * Used to distinguish feed-style tabs from discovery/search tabs.
 */
export const EXPLORE_FEED_TAB_IDS: readonly ExploreTabId[] = ['feed', 'following', 'news'] as const;

/**
 * Check whether a tab ID is a feed-style tab (feed, following, news)
 * as opposed to a discovery/search tab (colleges, athletes, etc.).
 */
export function isFeedTab(tabId: ExploreTabId): boolean {
  return (EXPLORE_FEED_TAB_IDS as readonly string[]).includes(tabId);
}

/**
 * Available explore tabs with display configuration.
 * Order determines display order in tab bar.
 *
 * 'For You' is the first tab — a curated multi-category overview
 * that displays personalized content from all categories without
 * pre-selecting any single content section.
 *
 * Feed tabs (Feed, Following, News) appear second — they replaced
 * the former standalone /home page (2026 strategy: everything lives
 * under /explore).
 */
export const EXPLORE_TABS: readonly ExploreTab[] = [
  {
    id: 'for-you',
    label: 'For You',
    icon: 'sparkles-outline',
  },
  {
    id: 'feed',
    label: 'Feed',
    icon: 'home-outline',
  },
  {
    id: 'following',
    label: 'Following',
    icon: 'people-outline',
  },
  {
    id: 'news',
    label: 'News',
    icon: 'newspaper-outline',
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: 'play-circle-outline',
  },
  {
    id: 'leaderboards',
    label: 'Leaderboards',
    icon: 'trophy-outline',
  },
] as const;

/**
 * Default selected tab.
 * 'for-you' is the default so Explore lands on Discover first.
 */
export const EXPLORE_DEFAULT_TAB: ExploreTabId = 'news';

// ============================================
// SORT OPTIONS
// ============================================

/**
 * Available sort options per tab.
 */
export const EXPLORE_SORT_OPTIONS: Record<ExploreTabId, readonly ExploreSortOption[]> = {
  'for-you': ['relevance', 'popular'],
  feed: ['relevance', 'recent', 'popular'],
  following: ['recent', 'popular'],
  news: ['recent', 'popular', 'relevance'],
  colleges: ['relevance', 'alphabetical', 'rating', 'distance'],
  athletes: ['relevance', 'recent', 'popular', 'alphabetical'],
  teams: ['relevance', 'alphabetical', 'distance', 'popular'],
  videos: ['relevance', 'recent', 'popular'],
  leaderboards: ['relevance', 'recent', 'popular'],
  'scout-reports': ['relevance', 'recent', 'popular', 'rating'],
  camps: ['relevance', 'recent', 'distance'],
  events: ['relevance', 'recent', 'distance'],
} as const;

/**
 * Default sort option per tab.
 */
export const EXPLORE_DEFAULT_SORT: Record<ExploreTabId, ExploreSortOption> = {
  'for-you': 'popular',
  feed: 'relevance',
  following: 'recent',
  news: 'recent',
  colleges: 'relevance',
  athletes: 'relevance',
  teams: 'relevance',
  videos: 'popular',
  leaderboards: 'popular',
  'scout-reports': 'recent',
  camps: 'recent',
  events: 'recent',
} as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Pagination configuration.
 */
export const EXPLORE_PAGINATION_DEFAULTS = {
  /** Items per page */
  pageSize: 20,
  /** Maximum pages to cache */
  maxCachedPages: 5,
  /** Infinite scroll threshold (px from bottom) */
  infiniteScrollThreshold: 200,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache key prefixes for explore feature.
 */
export const EXPLORE_CACHE_KEYS = {
  /** Search results cache prefix */
  searchResults: 'explore:search:',
  /** Recent searches */
  recentSearches: 'explore:recent',
  /** Trending searches */
  trendingSearches: 'explore:trending',
  /** Tab counts */
  tabCounts: 'explore:counts:',
  /** Item details */
  itemDetails: 'explore:item:',
} as const;

/**
 * Cache TTL values (milliseconds).
 */
export const EXPLORE_CACHE_TTL = {
  /** Search results - short lived */
  searchResults: 5 * 60 * 1000, // 5 minutes
  /** Trending searches - medium */
  trendingSearches: 30 * 60 * 1000, // 30 minutes
  /** Tab counts - short */
  tabCounts: 60 * 1000, // 1 minute
  /** Item details - medium */
  itemDetails: 15 * 60 * 1000, // 15 minutes
} as const;

// ============================================
// SEARCH CONFIGURATION
// ============================================

/**
 * Search input configuration.
 */
export const EXPLORE_SEARCH_CONFIG = {
  /** Minimum query length */
  minQueryLength: 2,
  /** Debounce time (ms) */
  debounceMs: 300,
  /** Maximum recent searches to store */
  maxRecentSearches: 10,
  /** Maximum suggestions to show */
  maxSuggestions: 8,
  /** Search input placeholder */
  placeholder: 'Search anything (athletes, videos, colleges, teams, and more)',
} as const;

// ============================================
// EMPTY STATE CONFIGURATION
// ============================================

/**
 * Empty state messages for each tab.
 */
export const EXPLORE_EMPTY_STATES: Record<
  ExploreTabId,
  {
    readonly title: string;
    readonly message: string;
    readonly icon: string;
  }
> = {
  'for-you': {
    title: 'Personalizing your experience',
    message: 'Discover athletes, colleges, teams, camps, and more all in one place',
    icon: 'sparkles-outline',
  },
  feed: {
    title: 'Your feed is empty',
    message: 'Follow athletes, teams, and coaches to build your personalized feed',
    icon: 'home-outline',
  },
  following: {
    title: 'No posts from people you follow',
    message: 'Follow athletes, teams, and coaches to see their latest content here',
    icon: 'people-outline',
  },
  news: {
    title: 'No news yet',
    message: 'Check back soon for the latest sports news and updates',
    icon: 'newspaper-outline',
  },
  colleges: {
    title: 'No colleges found',
    message: 'Try adjusting your search or filters',
    icon: 'school-outline',
  },
  athletes: {
    title: 'No athletes found',
    message: 'Try searching with different keywords',
    icon: 'person-outline',
  },
  teams: {
    title: 'No teams found',
    message: 'Expand your search criteria',
    icon: 'people-outline',
  },
  videos: {
    title: 'No videos found',
    message: 'Be the first to upload a highlight!',
    icon: 'videocam-outline',
  },
  leaderboards: {
    title: 'No leaderboards found',
    message: 'Check back soon for updated rankings',
    icon: 'trophy-outline',
  },
  'scout-reports': {
    title: 'No scout reports found',
    message: 'Try searching for a specific athlete or event',
    icon: 'clipboard-outline',
  },
  camps: {
    title: 'No camps found',
    message: 'Try adjusting your location or date filters',
    icon: 'calendar-outline',
  },
  events: {
    title: 'No events found',
    message: 'Check back soon for upcoming events',
    icon: 'ticket-outline',
  },
} as const;

/**
 * Initial search state empty messages.
 */
export const EXPLORE_INITIAL_STATES: Record<
  ExploreTabId,
  {
    readonly title: string;
    readonly message: string;
  }
> = {
  'for-you': {
    title: 'Discover Everything',
    message: 'Your personalized hub for athletes, colleges, teams, camps, and more',
  },
  feed: {
    title: 'Your Feed',
    message: 'Personalized content from athletes, teams, and coaches you care about',
  },
  following: {
    title: 'Following',
    message: 'Posts from people you follow appear here',
  },
  news: {
    title: 'News',
    message: 'Latest sports news, commits, and updates',
  },
  colleges: {
    title: 'Discover Colleges',
    message: 'Search for colleges by name, state, or division',
  },
  athletes: {
    title: 'Find Athletes',
    message: 'Search by name, sport, position, or location',
  },
  teams: {
    title: 'Explore Teams',
    message: 'Search for teams by name, sport, or location',
  },
  videos: {
    title: 'Watch Highlights',
    message: 'Search for videos by athlete, sport, or team',
  },
  leaderboards: {
    title: 'View Leaderboards',
    message: 'Browse rankings by sport, position, or region',
  },
  'scout-reports': {
    title: 'Scout Reports',
    message: 'Search for evaluations by athlete or event',
  },
  camps: {
    title: 'Find Camps',
    message: 'Search for camps by sport, location, or date',
  },
  events: {
    title: 'Upcoming Events',
    message: 'Search for showcases, combines, and tournaments',
  },
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoint paths.
 */
export const EXPLORE_API_ENDPOINTS = {
  /** Search endpoint */
  search: '/api/v1/explore/search',
  /** Suggestions endpoint */
  suggestions: '/api/v1/explore/suggestions',
  /** Trending endpoint */
  trending: '/api/v1/explore/trending',
  /** Tab counts endpoint */
  counts: '/api/v1/explore/counts',
  /** College detail */
  collegeDetail: '/api/v1/colleges',
  /** Athlete detail */
  athleteDetail: '/api/v1/athletes',
  /** Team detail */
  teamDetail: '/api/v1/teams',
  /** Video detail */
  videoDetail: '/api/v1/videos',
  /** Leaderboard detail */
  leaderboardDetail: '/api/v1/leaderboards',
  /** Scout report detail */
  scoutReportDetail: '/api/v1/scout-reports',
  /** Camp detail */
  campDetail: '/api/v1/camps',
  /** Event detail */
  eventDetail: '/api/v1/events',
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration constants.
 */
export const EXPLORE_UI_CONFIG = {
  /** Search bar height (px) */
  searchBarHeight: 44,
  /** Result card height (px) */
  cardHeight: 80,
  /** Skeleton count for loading */
  skeletonCount: 6,
  /** Animation duration (ms) */
  animationDuration: 200,
} as const;

// ============================================
// INITIAL TAB COUNTS
// ============================================

/**
 * Initial/default tab counts.
 */
export const EXPLORE_INITIAL_TAB_COUNTS: ExploreTabCounts = {
  'for-you': 0,
  feed: 0,
  following: 0,
  news: 0,
  colleges: 0,
  athletes: 0,
  teams: 0,
  videos: 0,
  leaderboards: 0,
  'scout-reports': 0,
  camps: 0,
  events: 0,
};

// ============================================
// FILTER UI CONFIGURATION
// ============================================

/**
 * Shared sport filter options for Explore filter panel.
 * Derived from the canonical DEFAULT_SPORTS constant (single source of truth).
 * De-duplicated by base sport name so gendered variants collapse into one chip.
 */
export const EXPLORE_FILTER_SPORT_OPTIONS: readonly string[] = (() => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sport of DEFAULT_SPORTS) {
    const display = formatSportDisplayName(sport.name);
    // Strip gender prefix to get base sport for de-duplication
    const base = display.replace(/^(Men's|Women's)\s+/i, '');
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
})();

/**
 * Shared division filter options for Explore filter panel.
 */
export const EXPLORE_FILTER_DIVISION_OPTIONS: readonly string[] = [
  'D1',
  'D2',
  'D3',
  'NAIA',
  'JUCO',
] as const;

/**
 * Shared state options for Explore filter panel.
 */
export const EXPLORE_FILTER_STATE_OPTIONS: readonly string[] = US_STATES.map(
  (state) => state.abbreviation
);

/**
 * Resolve a state string (full name like "Texas" or abbreviation like "TX")
 * to a 2-letter uppercase abbreviation. Returns undefined if unresolved.
 */
export function resolveStateToAbbreviation(value: string | undefined | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();

  // Already a valid 2-letter abbreviation?
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && US_STATES.some((s) => s.abbreviation === upper)) {
    return upper;
  }

  // Try matching by full name (case-insensitive)
  const byName = US_STATES.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  return byName?.abbreviation;
}

/**
 * Radius filter configuration.
 */
export const EXPLORE_FILTER_RADIUS_CONFIG = {
  min: 10,
  max: 250,
  step: 10,
  default: 50,
} as const;

/**
 * Number of class years to display from the current year.
 */
export const EXPLORE_FILTER_CLASS_YEAR_SPAN = 5;

/**
 * Returns rolling class year options beginning from provided base year.
 */
export function getExploreFilterClassYearOptions(
  baseYear = new Date().getFullYear()
): readonly number[] {
  return Array.from({ length: EXPLORE_FILTER_CLASS_YEAR_SPAN }, (_, index) => baseYear + index);
}

/**
 * Field visibility matrix for tab-aware Explore filters.
 */
export const EXPLORE_TAB_FILTER_FIELDS: Record<
  ExploreTabId,
  {
    readonly sport: boolean;
    readonly state: boolean;
    readonly division: boolean;
    readonly position: boolean;
    readonly classYear: boolean;
    readonly radius: boolean;
  }
> = {
  'for-you': {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: false,
    radius: false,
  },
  feed: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: false,
    radius: false,
  },
  following: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: false,
    radius: false,
  },
  news: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: false,
    radius: false,
  },
  colleges: {
    sport: true,
    state: true,
    division: true,
    position: false,
    classYear: false,
    radius: true,
  },
  athletes: {
    sport: true,
    state: true,
    division: false,
    position: true,
    classYear: true,
    radius: true,
  },
  teams: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: false,
    radius: true,
  },
  videos: {
    sport: true,
    state: true,
    division: false,
    position: true,
    classYear: false,
    radius: false,
  },
  leaderboards: {
    sport: true,
    state: true,
    division: false,
    position: true,
    classYear: true,
    radius: false,
  },
  'scout-reports': {
    sport: true,
    state: true,
    division: false,
    position: true,
    classYear: true,
    radius: false,
  },
  camps: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: true,
    radius: true,
  },
  events: {
    sport: true,
    state: true,
    division: false,
    position: false,
    classYear: true,
    radius: true,
  },
} as const;
