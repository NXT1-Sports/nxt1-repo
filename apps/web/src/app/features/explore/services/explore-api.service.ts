/**
 * @fileoverview Explore API Service - Angular HTTP Adapter
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Angular HTTP adapter for Explore API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createExploreApi,
  type ExploreApi,
  type ExploreSearchQuery,
  type ExploreSearchResponse,
  type ExploreItem,
  type ExploreTabCounts,
  type ExploreCollegeItem,
  type ExploreVideoItem,
  type ExploreAthleteItem,
  type ExploreTeamItem,
} from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Injection token for API base URL.
 * Apps can provide custom URL:
 *
 * ```typescript
 * { provide: EXPLORE_API_BASE_URL, useValue: environment.apiURL }
 * ```
 */
export const EXPLORE_API_BASE_URL = new InjectionToken<string>('EXPLORE_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiURL,
});

/**
 * Explore API Service.
 * Angular adapter for the pure TypeScript Explore API.
 */
@Injectable({ providedIn: 'root' })
export class ExploreApiService implements ExploreApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(EXPLORE_API_BASE_URL);
  private readonly performance = inject(PerformanceService);

  private readonly api = createExploreApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ============================================
  // DELEGATE TO PURE API WITH PERFORMANCE TRACING
  // ============================================

  search<T extends ExploreItem = ExploreItem>(
    query: ExploreSearchQuery
  ): Promise<ExploreSearchResponse<T>> {
    return this.performance.trace(TRACE_NAMES.SEARCH_EXECUTE, () => this.api.search<T>(query), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'explore_search',
        search_query: query.query || '',
        search_tab: query.tab || 'all',
      },
      onSuccess: async (results, trace) => {
        await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, results.items?.length || 0);
      },
    });
  }

  getSuggestions(query: string, limit?: number): Promise<string[]> {
    return this.performance.trace(
      TRACE_NAMES.SEARCH_SUGGESTIONS,
      () => this.api.getSuggestions(query, limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'search_suggestions',
          query_length: query.length.toString(),
        },
        onSuccess: async (suggestions, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, suggestions.length);
        },
      }
    );
  }

  getTrendingSearches(limit?: number): Promise<string[]> {
    return this.performance.trace(
      TRACE_NAMES.TRENDING_SEARCHES_LOAD,
      () => this.api.getTrendingSearches(limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'trending_searches',
        },
        onSuccess: async (trending, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, trending.length);
        },
      }
    );
  }

  getTabCounts(query: string): Promise<ExploreTabCounts> {
    return this.performance.trace(
      TRACE_NAMES.SEARCH_TAB_COUNTS,
      () => this.api.getTabCounts(query),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'explore_search',
        },
      }
    );
  }

  getCollege(id: string): Promise<ExploreCollegeItem | null> {
    return this.performance.trace(TRACE_NAMES.COLLEGE_DETAIL_LOAD, () => this.api.getCollege(id), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'college_detail',
        college_id: id,
      },
    });
  }

  getVideo(id: string): Promise<ExploreVideoItem | null> {
    return this.performance.trace(TRACE_NAMES.VIDEO_DETAIL_LOAD, () => this.api.getVideo(id), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'video_detail',
        video_id: id,
      },
    });
  }

  getAthlete(id: string): Promise<ExploreAthleteItem | null> {
    return this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getAthlete(id), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'athlete_detail',
        athlete_id: id,
      },
    });
  }

  getTeam(id: string): Promise<ExploreTeamItem | null> {
    return this.performance.trace(TRACE_NAMES.TEAM_LOAD, () => this.api.getTeam(id), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'team_detail',
        team_id: id,
      },
    });
  }
}
