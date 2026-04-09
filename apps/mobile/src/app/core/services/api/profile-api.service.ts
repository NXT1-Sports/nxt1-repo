/**
 * @fileoverview Profile API Service - Angular Wrapper
 * @module @nxt1/mobile/core/services
 *
 * Wraps the @nxt1/core Profile API for use in the mobile application.
 * Uses CapacitorHttpAdapter for native HTTP calls.
 *
 * Returns `User` type from @nxt1/core/models - the single source of truth.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */
import { Injectable, inject } from '@angular/core';
import {
  createProfileApi,
  type ProfileApi,
  type ApiResponse,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
} from '@nxt1/core/api';
import { PROFILE_CACHE_KEYS } from '@nxt1/core/profile';
import { type ProfilePost, type ProfileSeasonGameLog } from '@nxt1/core/profile';
import {
  type User,
  type SportProfile,
  type VerifiedStat,
  type VerifiedMetric,
} from '@nxt1/core/models';
import { type ScoutReport } from '@nxt1/core/scout-reports';
import { type NewsArticle } from '@nxt1/core/news';
import { CACHE_CONFIG } from '@nxt1/core/cache';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * In-memory cache entry for profile responses.
 * Mobile has no HTTP interceptor cache layer (CapacitorHttp bypasses Angular),
 * so service-level cache is the only cache available.
 */
interface ProfileCacheEntry {
  data: ApiResponse<User>;
  expiresAt: number;
}

/**
 * ProfileApiService - Angular wrapper for @nxt1/core Profile API
 *
 * All methods return `User` type for consistency.
 *
 * Caching strategy:
 * - Service-level in-memory Map keyed by PROFILE_CACHE_KEYS with MEDIUM_TTL (15 min)
 * - CapacitorHttp bypasses Angular interceptors, so this is the only cache layer
 *   (unlike web which also has httpCacheInterceptor)
 *
 * @example
 * ```typescript
 * const response = await profileApi.getProfile(uid);
 * if (response.success && response.data) {
 *   const user: User = response.data;
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(CapacitorHttpAdapter);
  private _api: ProfileApi | null = null;

  private get api(): ProfileApi {
    if (!this._api) {
      this._api = createProfileApi(this.http, environment.apiUrl);
    }
    return this._api;
  }

  /** Service-level in-memory cache — keyed by PROFILE_CACHE_KEYS prefix + id */
  private readonly profileCache = new Map<string, ProfileCacheEntry>();

  private cacheKey(prefix: string, id: string): string {
    return `${prefix}${id}`;
  }

  private getFromCache(key: string): ApiResponse<User> | null {
    const entry = this.profileCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.profileCache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: ApiResponse<User>): void {
    this.profileCache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_CONFIG.MEDIUM_TTL,
    });
  }

  /**
   * Invalidate cached data for a specific user id.
   * Call after profile updates so the next fetch reflects changes.
   */
  invalidateCache(userId: string): void {
    this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, userId));
    this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_USERNAME, userId));
  }

  // ============================================
  // PROFILE READS
  // ============================================

  /**
   * Get user profile by ID.
   * Checks service-level cache (MEDIUM_TTL) before making a network request.
   */
  async getProfile(userId: string): Promise<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, userId);
    const cached = this.getFromCache(key);
    if (cached) return cached;

    const response = await this.api.getProfile(userId);
    if (response.success) this.setCache(key, response);
    return response;
  }

  /**
   * Get user profile by username.
   * Checks service-level cache (MEDIUM_TTL) before making a network request.
   */
  async getProfileByUsername(username: string): Promise<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_USERNAME, username);
    const cached = this.getFromCache(key);
    if (cached) return cached;

    const response = await this.api.getProfileByUsername(username);
    if (response.success) this.setCache(key, response);
    return response;
  }

  /**
   * Get user profile by numeric unicode.
   * Checks service-level cache (MEDIUM_TTL) before making a network request.
   */
  async getProfileByUnicode(unicode: string): Promise<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_UNICODE, unicode);
    const cached = this.getFromCache(key);
    if (cached) return cached;

    const response = await this.api.getProfileByUnicode(unicode);
    if (response.success) this.setCache(key, response);
    return response;
  }

  async getMe(): Promise<ApiResponse<User>> {
    const response = await this.api.getMe();
    if (response.success && response.data?.id) {
      this.setCache(this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, response.data.id), response);
    }
    return response;
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user profile.
   * Invalidates cache so the next getProfile() fetch returns fresh data.
   */
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<ApiResponse<User>> {
    this.invalidateCache(userId);
    return this.api.updateProfile(userId, data);
  }

  /**
   * Update sport profile
   */
  async updateSportProfile(
    userId: string,
    data: UpdateSportProfileRequest
  ): Promise<ApiResponse<SportProfile>> {
    return this.api.updateSportProfile(userId, data);
  }

  /**
   * Add new sport to profile
   */
  async addSport(userId: string, sport: Partial<SportProfile>): Promise<ApiResponse<SportProfile>> {
    return this.api.addSport(userId, sport);
  }

  /**
   * Remove sport from profile
   */
  async removeSport(userId: string, sportIndex: number): Promise<ApiResponse<void>> {
    return this.api.removeSport(userId, sportIndex);
  }

  // ============================================
  // SUB-COLLECTIONS (Timeline, Rankings, Scout Reports, Videos)
  // ============================================

  /**
   * Map a raw Firestore timeline/video document to ProfilePost.
   */
  private mapTimelineDoc(raw: Record<string, unknown>): ProfilePost {
    const stats = (raw['stats'] as Record<string, number> | undefined) ?? {};
    return {
      id: (raw['id'] as string | undefined) ?? String(raw['_id'] ?? ''),
      type: (raw['type'] as ProfilePost['type']) ?? 'text',
      title: raw['title'] as string | undefined,
      body: (raw['content'] as string | undefined) ?? '',
      thumbnailUrl: raw['thumbnailUrl'] as string | undefined,
      mediaUrl: raw['mediaUrl'] as string | undefined,
      likeCount: stats['likes'] ?? 0,
      commentCount: stats['comments'] ?? 0,
      shareCount: stats['shares'] ?? 0,
      viewCount: stats['views'],
      duration: raw['duration'] as number | undefined,
      isPinned: (raw['isPinned'] as boolean | undefined) ?? false,
      createdAt: (raw['createdAt'] as string | undefined) ?? new Date().toISOString(),
    };
  }

  /** GET /auth/profile/:userId/schedule?sportId=football */
  async getProfileSchedule(
    userId: string,
    sportId?: string
  ): Promise<{ success: boolean; data: Record<string, unknown>[] }> {
    try {
      const queryParams = sportId ? `?sportId=${encodeURIComponent(sportId)}` : '';
      return await this.http.get<{ success: boolean; data: Record<string, unknown>[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/schedule${queryParams}`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/timeline */
  async getProfileTimeline(userId: string): Promise<{ success: boolean; data: ProfilePost[] }> {
    try {
      const resp = await this.http.get<{ success: boolean; data: Record<string, unknown>[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/timeline`
      );
      return { success: resp.success, data: (resp.data ?? []).map((d) => this.mapTimelineDoc(d)) };
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/rankings */
  async getProfileRankings(
    userId: string
  ): Promise<{ success: boolean; data: Record<string, unknown>[] }> {
    try {
      return await this.http.get<{ success: boolean; data: Record<string, unknown>[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/rankings`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/scout-reports */
  async getProfileScoutReports(userId: string): Promise<{ success: boolean; data: ScoutReport[] }> {
    try {
      return await this.http.get<{ success: boolean; data: ScoutReport[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/scout-reports`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/videos */
  async getProfileVideos(userId: string): Promise<{ success: boolean; data: ProfilePost[] }> {
    try {
      const resp = await this.http.get<{ success: boolean; data: Record<string, unknown>[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/videos`
      );
      return { success: resp.success, data: (resp.data ?? []).map((d) => this.mapTimelineDoc(d)) };
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/news */
  async getProfileNews(userId: string): Promise<{ success: boolean; data: NewsArticle[] }> {
    try {
      const resp = await this.http.get<{ success: boolean; data: NewsArticle[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/news`
      );
      return { success: resp.success, data: resp.data ?? [] };
    } catch {
      return { success: false, data: [] };
    }
  }

  async getProfileStats(
    userId: string,
    sportId: string
  ): Promise<{ success: boolean; data: VerifiedStat[] }> {
    try {
      return await this.http.get<{ success: boolean; data: VerifiedStat[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/stats`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  async getProfileMetrics(
    userId: string,
    sportId: string
  ): Promise<{ success: boolean; data: VerifiedMetric[] }> {
    try {
      return await this.http.get<{ success: boolean; data: VerifiedMetric[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/metrics`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/sports/:sportId/game-logs */
  async getProfileGameLogs(
    userId: string,
    sportId: string
  ): Promise<{ success: boolean; data: ProfileSeasonGameLog[] }> {
    try {
      return await this.http.get<{ success: boolean; data: ProfileSeasonGameLog[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/game-logs`
      );
    } catch {
      return { success: false, data: [] };
    }
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Get profile analytics
   */
  async getAnalytics(userId: string) {
    return this.api.getAnalytics(userId);
  }
}
