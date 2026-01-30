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

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Available explore tabs with display configuration.
 * Order determines display order in tab bar.
 */
export const EXPLORE_TABS: readonly ExploreTab[] = [
  {
    id: 'colleges',
    label: 'Colleges',
    icon: 'school-outline',
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: 'play-circle-outline',
  },
  {
    id: 'athletes',
    label: 'Athletes',
    icon: 'person-outline',
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: 'people-outline',
  },
] as const;

/**
 * Default selected tab.
 */
export const EXPLORE_DEFAULT_TAB: ExploreTabId = 'colleges';

// ============================================
// SORT OPTIONS
// ============================================

/**
 * Available sort options per tab.
 */
export const EXPLORE_SORT_OPTIONS: Record<ExploreTabId, readonly ExploreSortOption[]> = {
  colleges: ['relevance', 'alphabetical', 'rating', 'distance'],
  videos: ['relevance', 'recent', 'popular'],
  athletes: ['relevance', 'recent', 'popular', 'alphabetical'],
  teams: ['relevance', 'alphabetical', 'distance', 'popular'],
} as const;

/**
 * Default sort option per tab.
 */
export const EXPLORE_DEFAULT_SORT: Record<ExploreTabId, ExploreSortOption> = {
  colleges: 'relevance',
  videos: 'popular',
  athletes: 'relevance',
  teams: 'relevance',
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
  placeholder: 'Search athletes, teams, colleges...',
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
  colleges: {
    title: 'No colleges found',
    message: 'Try adjusting your search or filters',
    icon: 'school-outline',
  },
  videos: {
    title: 'No videos found',
    message: 'Be the first to upload a highlight!',
    icon: 'videocam-outline',
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
  colleges: {
    title: 'Discover Colleges',
    message: 'Search for colleges by name, state, or division',
  },
  videos: {
    title: 'Watch Highlights',
    message: 'Search for videos by athlete, sport, or team',
  },
  athletes: {
    title: 'Find Athletes',
    message: 'Search by name, sport, position, or location',
  },
  teams: {
    title: 'Explore Teams',
    message: 'Search for teams by name, sport, or location',
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
  /** Video detail */
  videoDetail: '/api/v1/videos',
  /** Athlete detail */
  athleteDetail: '/api/v1/athletes',
  /** Team detail */
  teamDetail: '/api/v1/teams',
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
  colleges: 0,
  videos: 0,
  athletes: 0,
  teams: 0,
};
