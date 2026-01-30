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
  // DELEGATE TO PURE API
  // ============================================

  search<T extends ExploreItem = ExploreItem>(
    query: ExploreSearchQuery
  ): Promise<ExploreSearchResponse<T>> {
    return this.api.search<T>(query);
  }

  getSuggestions(query: string, limit?: number): Promise<string[]> {
    return this.api.getSuggestions(query, limit);
  }

  getTrendingSearches(limit?: number): Promise<string[]> {
    return this.api.getTrendingSearches(limit);
  }

  getTabCounts(query: string): Promise<ExploreTabCounts> {
    return this.api.getTabCounts(query);
  }

  getCollege(id: string): Promise<ExploreCollegeItem | null> {
    return this.api.getCollege(id);
  }

  getVideo(id: string): Promise<ExploreVideoItem | null> {
    return this.api.getVideo(id);
  }

  getAthlete(id: string): Promise<ExploreAthleteItem | null> {
    return this.api.getAthlete(id);
  }

  getTeam(id: string): Promise<ExploreTeamItem | null> {
    return this.api.getTeam(id);
  }
}
