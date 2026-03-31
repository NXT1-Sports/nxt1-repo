/**
 * @fileoverview Team Profile API Service — Web Angular Adapter
 * @module @nxt1/web/features/team/services
 * @version 1.0.0
 *
 * Wraps @nxt1/core team profile API for Angular with in-memory caching.
 * Mirrors the pattern from ProfileService.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  createTeamProfileApi,
  type TeamProfileApi,
  type TeamProfileApiResponse,
  type TeamProfilePageData,
  TEAM_PROFILE_CACHE_KEYS,
} from '@nxt1/core';
import { CACHE_CONFIG } from '@nxt1/core/cache';
import { AngularHttpAdapter } from '../../../core/infrastructure';

/**
 * In-memory cache entry for team profile responses.
 */
interface TeamCacheEntry<T = TeamProfilePageData> {
  data: TeamProfileApiResponse<T>;
  expiresAt: number;
}

/**
 * Angular Team Profile Service
 *
 * Wraps @nxt1/core team profile API for use in Angular with RxJS Observables.
 * Uses shared core logic to avoid code duplication between platforms.
 *
 * Caching strategy:
 * - Service-level: in-memory Map keyed by TEAM_PROFILE_CACHE_KEYS with MEDIUM_TTL (15 min)
 * - HTTP-level: httpCacheInterceptor matches /teams/* with MEDIUM_TTL
 */
@Injectable({
  providedIn: 'root',
})
export class TeamProfileApiService {
  private readonly api: TeamProfileApi;

  /** Service-level in-memory cache */
  private readonly cache = new Map<string, TeamCacheEntry>();

  constructor() {
    const httpAdapter = inject(AngularHttpAdapter);
    this.api = createTeamProfileApi(httpAdapter, environment.apiURL);
  }

  /**
   * Build a cache key using the shared TEAM_PROFILE_CACHE_KEYS constant.
   */
  private cacheKey(prefix: string, id: string): string {
    return `${prefix}${id}`;
  }

  /**
   * Return a cached entry if it's still within MEDIUM_TTL, otherwise null.
   */
  private getFromCache<T>(key: string): TeamProfileApiResponse<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as TeamProfileApiResponse<T>;
  }

  /**
   * Store a response in the in-memory cache with MEDIUM_TTL expiry.
   */
  private setCache<T>(key: string, data: TeamProfileApiResponse<T>): void {
    this.cache.set(key, {
      data: data as TeamProfileApiResponse<TeamProfilePageData>,
      expiresAt: Date.now() + CACHE_CONFIG.MEDIUM_TTL,
    });
  }

  /**
   * Fetch full team profile data by slug.
   * Returns Observable for Angular template compatibility.
   */
  getTeamBySlug(slug: string): Observable<TeamProfileApiResponse<TeamProfilePageData>> {
    const key = this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_SLUG, slug);
    const cached = this.getFromCache<TeamProfilePageData>(key);
    if (cached) return of(cached);

    return from(this.api.getTeamBySlug(slug)).pipe(
      tap((response) => {
        if (response.success) {
          this.setCache(key, response);
        }
      })
    );
  }

  /**
   * Fetch team profile data by ID.
   */
  getTeamById(id: string): Observable<TeamProfileApiResponse<TeamProfilePageData>> {
    const key = this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_ID, id);
    const cached = this.getFromCache<TeamProfilePageData>(key);
    if (cached) return of(cached);

    return from(this.api.getTeamById(id)).pipe(
      tap((response) => {
        if (response.success) {
          this.setCache(key, response);
        }
      })
    );
  }

  /**
   * Track a page view.
   */
  trackPageView(teamId: string, viewerId?: string): Observable<TeamProfileApiResponse<void>> {
    return from(this.api.trackPageView(teamId, viewerId));
  }

  /**
   * Invalidate cache for a specific team slug.
   */
  invalidateTeamCache(slug: string): void {
    const key = this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_SLUG, slug);
    this.cache.delete(key);
  }

  /**
   * Clear all cached team data.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
