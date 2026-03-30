/**
 * @fileoverview Explore Module - Barrel Export
 * @module @nxt1/core/explore
 * @version 1.0.0
 */

// Types
export type {
  ExploreTabId,
  ExploreTab,
  ExploreSearchQuery,
  ExploreSortOption,
  ExploreFilters,
  ExploreItemBase,
  ExploreCollegeItem,
  ExploreVideoItem,
  ExploreAthleteItem,
  ExploreTeamItem,
  ExploreItem,
  ExplorePagination,
  ExploreSearchResponse,
  ExploreTabCounts,
  ExploreState,
} from './explore.types';

// Constants
export {
  EXPLORE_TABS,
  EXPLORE_FEED_TAB_IDS,
  isFeedTab,
  EXPLORE_DEFAULT_TAB,
  EXPLORE_SORT_OPTIONS,
  EXPLORE_DEFAULT_SORT,
  EXPLORE_PAGINATION_DEFAULTS,
  EXPLORE_CACHE_KEYS,
  EXPLORE_CACHE_TTL,
  EXPLORE_SEARCH_CONFIG,
  EXPLORE_EMPTY_STATES,
  EXPLORE_INITIAL_STATES,
  EXPLORE_API_ENDPOINTS,
  EXPLORE_UI_CONFIG,
  EXPLORE_INITIAL_TAB_COUNTS,
  EXPLORE_FILTER_SPORT_OPTIONS,
  EXPLORE_FILTER_DIVISION_OPTIONS,
  EXPLORE_FILTER_STATE_OPTIONS,
  resolveStateToAbbreviation,
  EXPLORE_FILTER_RADIUS_CONFIG,
  EXPLORE_FILTER_CLASS_YEAR_SPAN,
  getExploreFilterClassYearOptions,
  EXPLORE_TAB_FILTER_FIELDS,
} from './explore.constants';

// API
export { createExploreApi, type ExploreApi } from './explore.api';
