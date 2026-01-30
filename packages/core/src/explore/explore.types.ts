/**
 * @fileoverview Explore Type Definitions
 * @module @nxt1/core/explore
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Explore/Search feature.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// EXPLORE TAB TYPES
// ============================================

/**
 * Explore tab identifiers.
 * Each tab represents a different content category.
 */
export type ExploreTabId = 'colleges' | 'videos' | 'athletes' | 'teams';

/**
 * Configuration for an explore tab.
 */
export interface ExploreTab {
  /** Unique tab identifier */
  readonly id: ExploreTabId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Result count (for display) */
  readonly count?: number;
  /** Whether tab is currently disabled */
  readonly disabled?: boolean;
}

// ============================================
// SEARCH TYPES
// ============================================

/**
 * Search query parameters.
 */
export interface ExploreSearchQuery {
  /** Search query string */
  readonly query: string;
  /** Current tab filter */
  readonly tab: ExploreTabId;
  /** Sort order */
  readonly sortBy?: ExploreSortOption;
  /** Filter options */
  readonly filters?: ExploreFilters;
  /** Pagination */
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Sort options for explore results.
 */
export type ExploreSortOption =
  | 'relevance'
  | 'recent'
  | 'popular'
  | 'alphabetical'
  | 'distance'
  | 'rating';

/**
 * Filter options for explore.
 */
export interface ExploreFilters {
  /** Sport filter */
  readonly sport?: string;
  /** State/location filter */
  readonly state?: string;
  /** Division filter (for colleges) */
  readonly division?: string;
  /** Position filter (for athletes) */
  readonly position?: string;
  /** Class year filter */
  readonly classYear?: number;
  /** Distance radius (miles) */
  readonly radius?: number;
  /** Verified only */
  readonly verifiedOnly?: boolean;
}

// ============================================
// RESULT ITEM TYPES
// ============================================

/**
 * Base interface for all explore result items.
 */
export interface ExploreItemBase {
  /** Unique identifier */
  readonly id: string;
  /** Item type */
  readonly type: ExploreTabId;
  /** Primary name/title */
  readonly name: string;
  /** Subtitle/description */
  readonly subtitle?: string;
  /** Image URL */
  readonly imageUrl?: string;
  /** Whether this item is verified */
  readonly isVerified?: boolean;
  /** Deep link route */
  readonly route: string;
}

/**
 * College result item.
 */
export interface ExploreCollegeItem extends ExploreItemBase {
  readonly type: 'colleges';
  /** College location */
  readonly location: string;
  /** Athletic division */
  readonly division: string;
  /** Conference name */
  readonly conference?: string;
  /** Sports offered */
  readonly sports: readonly string[];
  /** School colors */
  readonly colors?: readonly string[];
  /** Ranking/rating */
  readonly ranking?: number;
}

/**
 * Video result item.
 */
export interface ExploreVideoItem extends ExploreItemBase {
  readonly type: 'videos';
  /** Video thumbnail URL */
  readonly thumbnailUrl: string;
  /** Video duration (seconds) */
  readonly duration: number;
  /** View count */
  readonly views: number;
  /** Like count */
  readonly likes: number;
  /** Creator info */
  readonly creator: {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl?: string;
  };
  /** Sport category */
  readonly sport?: string;
  /** Upload timestamp */
  readonly uploadedAt: string;
}

/**
 * Athlete result item.
 */
export interface ExploreAthleteItem extends ExploreItemBase {
  readonly type: 'athletes';
  /** Primary sport */
  readonly sport: string;
  /** Position */
  readonly position?: string;
  /** Class year */
  readonly classYear?: number;
  /** Location (city, state) */
  readonly location?: string;
  /** Team/school name */
  readonly team?: string;
  /** Commitment status */
  readonly commitment?: {
    readonly collegeName: string;
    readonly collegeLogoUrl?: string;
  };
  /** Follower count */
  readonly followers?: number;
  /** Highlight video count */
  readonly videoCount?: number;
}

/**
 * Team result item.
 */
export interface ExploreTeamItem extends ExploreItemBase {
  readonly type: 'teams';
  /** Team location */
  readonly location: string;
  /** Primary sport */
  readonly sport: string;
  /** Member count */
  readonly memberCount: number;
  /** Season record */
  readonly record?: string;
  /** Team colors */
  readonly colors?: readonly string[];
  /** Team type (high school, club, travel, etc.) */
  readonly teamType?: string;
}

/**
 * Union type for all explore items.
 */
export type ExploreItem =
  | ExploreCollegeItem
  | ExploreVideoItem
  | ExploreAthleteItem
  | ExploreTeamItem;

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Pagination info for explore results.
 */
export interface ExplorePagination {
  /** Current page */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items matching query */
  readonly total: number;
  /** Total pages */
  readonly totalPages: number;
  /** Whether more pages exist */
  readonly hasMore: boolean;
}

/**
 * Explore search response.
 */
export interface ExploreSearchResponse<T extends ExploreItem = ExploreItem> {
  /** Success status */
  readonly success: boolean;
  /** Result items */
  readonly items: readonly T[];
  /** Pagination info */
  readonly pagination: ExplorePagination;
  /** Search suggestions */
  readonly suggestions?: readonly string[];
  /** Related searches */
  readonly relatedSearches?: readonly string[];
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Tab counts response.
 */
export interface ExploreTabCounts {
  readonly colleges: number;
  readonly videos: number;
  readonly athletes: number;
  readonly teams: number;
}

// ============================================
// STATE TYPES
// ============================================

/**
 * Explore feature state.
 */
export interface ExploreState {
  /** Current search query */
  readonly query: string;
  /** Active tab */
  readonly activeTab: ExploreTabId;
  /** Current results */
  readonly items: readonly ExploreItem[];
  /** Tab counts */
  readonly tabCounts: ExploreTabCounts;
  /** Loading state */
  readonly isLoading: boolean;
  /** Loading more state */
  readonly isLoadingMore: boolean;
  /** Search focused state */
  readonly isSearchFocused: boolean;
  /** Error message */
  readonly error: string | null;
  /** Pagination */
  readonly pagination: ExplorePagination | null;
  /** Recent searches */
  readonly recentSearches: readonly string[];
  /** Trending searches */
  readonly trendingSearches: readonly string[];
}
