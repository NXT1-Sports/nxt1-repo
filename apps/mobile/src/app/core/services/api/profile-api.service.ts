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
  type AddSportResponse,
  type AddSportRequest,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
} from '@nxt1/core/api';
import { CACHE_KEYS } from '@nxt1/core/cache';
import { type ProfilePost, type ProfileSeasonGameLog } from '@nxt1/core/profile';
import { type User, type SportProfile, type VerifiedMetric } from '@nxt1/core/models';
import { type FeedItemResponse } from '@nxt1/core/posts';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { MobileCacheService } from '../infrastructure/cache.service';
import { environment } from '../../../../environments/environment';

/**
 * ProfileApiService - Angular wrapper for @nxt1/core Profile API
 *
 * All methods return `User` type for consistency.
 *
 * Caching strategy:
 * - Handled uniformly at the transport layer by CapacitorHttpAdapter
 *   delivering true L1 (memory) and L2 (disk) network-level caching.
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
  private readonly mobileCache = inject(MobileCacheService);
  private _api: ProfileApi | null = null;
  private readonly httpCacheKeyPrefix = `${CACHE_KEYS.API_RESPONSE}mobile-http:`;

  private get api(): ProfileApi {
    if (!this._api) {
      this._api = createProfileApi(this.http, environment.apiUrl);
    }
    return this._api;
  }

  async invalidateCache(userId: string): Promise<void> {
    await Promise.all([
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*auth/profile*${userId}*`),
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*profile*${userId}*`),
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*auth/profile/me*`),
    ]);
  }

  // ============================================
  // PROFILE READS
  // ============================================

  /**
   * Get user profile by ID.
   */
  async getProfile(userId: string): Promise<ApiResponse<User>> {
    return this.api.getProfile(userId);
  }

  /**
   * Get user profile by numeric unicode.
   */
  async getProfileByUnicode(unicode: string): Promise<ApiResponse<User>> {
    return this.api.getProfileByUnicode(unicode);
  }

  async getMe(): Promise<ApiResponse<User>> {
    return this.api.getMe();
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user profile.
   * Transport-layer cache invalidation is handled automatically on mutation.
   */
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<ApiResponse<User>> {
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
  async addSport(userId: string, sport: AddSportRequest): Promise<ApiResponse<AddSportResponse>> {
    return this.api.addSport(userId, sport);
  }

  /**
   * Remove sport from profile
   */
  async removeSport(userId: string, sportIndex: number): Promise<ApiResponse<void>> {
    return this.api.removeSport(userId, sportIndex);
  }

  async pinPost(
    userId: string,
    postId: string,
    isPinned: boolean
  ): Promise<ApiResponse<{ postId: string; isPinned: boolean }>> {
    return this.api.pinPost(userId, postId, isPinned);
  }

  async deletePost(userId: string, postId: string): Promise<ApiResponse<{ postId: string }>> {
    return this.api.deletePost(userId, postId);
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
      shareCount: stats['shares'] ?? 0,
      viewCount: stats['views'],
      duration: raw['duration'] as number | undefined,
      isPinned: (raw['isPinned'] as boolean | undefined) ?? false,
      createdAt: (raw['createdAt'] as string | undefined) ?? new Date().toISOString(),
    };
  }

  /**
   * GET /auth/profile/:userId/timeline — returns all polymorphic FeedItem types.
   * Optionally filter by sportId so each sport has its own cache key/result
   * (matches the web implementation).
   */
  async getProfileTimeline(
    userId: string,
    sportId?: string,
    cursor?: string
  ): Promise<FeedItemResponse> {
    try {
      const params = new URLSearchParams();
      if (sportId) params.set('sportId', sportId);
      if (cursor) params.set('cursor', cursor);
      const queryString = params.toString();
      const url = `${environment.apiUrl}/auth/profile/${userId}/timeline${
        queryString ? `?${queryString}` : ''
      }`;
      const resp = await this.http.get<FeedItemResponse>(url);
      return resp;
    } catch {
      return { success: false, data: [], hasMore: false };
    }
  }

  /** GET /auth/profile/:userId/sports/:sportId/metrics — cached MEDIUM_TTL */
  async getProfileMetrics(
    userId: string,
    sportId: string
  ): Promise<{ success: boolean; data: VerifiedMetric[] }> {
    try {
      const resp = await this.http.get<{ success: boolean; data: VerifiedMetric[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/metrics`
      );
      return resp;
    } catch {
      return { success: false, data: [] };
    }
  }

  /** GET /auth/profile/:userId/sports/:sportId/game-logs — cached MEDIUM_TTL */
  async getProfileGameLogs(
    userId: string,
    sportId: string
  ): Promise<{ success: boolean; data: ProfileSeasonGameLog[] }> {
    try {
      const resp = await this.http.get<{ success: boolean; data: ProfileSeasonGameLog[] }>(
        `${environment.apiUrl}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/game-logs`
      );
      return resp;
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
