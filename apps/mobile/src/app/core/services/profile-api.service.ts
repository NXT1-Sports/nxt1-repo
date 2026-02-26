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
import { type User, type SportProfile } from '@nxt1/core/models';
import { CACHE_CONFIG } from '@nxt1/core/cache';
import { CapacitorHttpAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';

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
  // FOLLOW
  // ============================================

  /**
   * Follow a user
   * @param userId - Current user's ID
   * @param targetUserId - User to follow
   */
  async follow(userId: string, targetUserId: string) {
    return this.api.follow(userId, targetUserId);
  }

  /**
   * Unfollow a user
   * @param userId - Current user's ID
   * @param targetUserId - User to unfollow
   */
  async unfollow(userId: string, targetUserId: string) {
    return this.api.unfollow(userId, targetUserId);
  }

  /**
   * Get followers list
   */
  async getFollowers(userId: string, page?: number, limit?: number) {
    return this.api.getFollowers(userId, page, limit);
  }

  /**
   * Get following list
   */
  async getFollowing(userId: string, page?: number, limit?: number) {
    return this.api.getFollowing(userId, page, limit);
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
