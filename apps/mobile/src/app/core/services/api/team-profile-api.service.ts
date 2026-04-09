/**
 * @fileoverview Team Profile API Service — Mobile Capacitor Adapter
 * @module @nxt1/mobile/core/services
 * @version 1.0.0
 *
 * Wraps @nxt1/core team profile API for native HTTP calls via CapacitorHttpAdapter.
 * Mirrors ProfileApiService pattern with service-level in-memory caching.
 *
 * CapacitorHttp bypasses Angular interceptors, so this service provides
 * the only cache layer for team profile data on mobile.
 */
import { Injectable, inject } from '@angular/core';
import {
  createTeamProfileApi,
  type TeamProfileApi,
  type TeamProfileApiResponse,
  type TeamProfilePageData,
  TEAM_PROFILE_CACHE_KEYS,
} from '@nxt1/core';
import { CACHE_CONFIG } from '@nxt1/core/cache';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * In-memory cache entry for team profile responses.
 */
interface TeamCacheEntry<T = TeamProfilePageData> {
  readonly data: TeamProfileApiResponse<T>;
  readonly expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class TeamProfileApiService {
  private readonly api: TeamProfileApi;
  private readonly cache = new Map<string, TeamCacheEntry>();

  constructor() {
    const http = inject(CapacitorHttpAdapter);
    this.api = createTeamProfileApi(http, environment.apiUrl);
  }

  // ============================================
  // CACHE HELPERS
  // ============================================

  private cacheKey(prefix: string, id: string): string {
    return `${prefix}${id}`;
  }

  private getFromCache<T>(key: string): TeamProfileApiResponse<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as TeamProfileApiResponse<T>;
  }

  private setCache<T>(key: string, data: TeamProfileApiResponse<T>): void {
    this.cache.set(key, {
      data: data as TeamProfileApiResponse<TeamProfilePageData>,
      expiresAt: Date.now() + CACHE_CONFIG.MEDIUM_TTL,
    });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Fetch full team profile data by slug.
   */
  async getTeamBySlug(slug: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
    const key = this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_SLUG, slug);
    const cached = this.getFromCache<TeamProfilePageData>(key);
    if (cached) return cached;

    const response = await this.api.getTeamBySlug(slug);
    if (response.success) this.setCache(key, response);
    return response;
  }

  /**
   * Fetch team profile data by ID.
   */
  async getTeamById(id: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
    const key = this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_ID, id);
    const cached = this.getFromCache<TeamProfilePageData>(key);
    if (cached) return cached;

    const response = await this.api.getTeamById(id);
    if (response.success) this.setCache(key, response);
    return response;
  }

  /**
   * Track a page view.
   */
  async trackPageView(teamId: string, viewerId?: string): Promise<TeamProfileApiResponse<void>> {
    return this.api.trackPageView(teamId, viewerId);
  }

  /**
   * Invalidate cache for a specific team slug.
   */
  invalidateCache(slug: string): void {
    this.cache.delete(this.cacheKey(TEAM_PROFILE_CACHE_KEYS.BY_SLUG, slug));
  }
}
