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
import { type User, type SportProfile } from '@nxt1/core/models';
import { CapacitorHttpAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';

/**
 * ProfileApiService - Angular wrapper for @nxt1/core Profile API
 *
 * All methods return `User` type for consistency.
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

  // ============================================
  // PROFILE READS
  // ============================================

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<ApiResponse<User>> {
    return this.api.getProfile(userId);
  }

  /**
   * Get user profile by username
   */
  async getProfileByUsername(username: string): Promise<ApiResponse<User>> {
    return this.api.getProfileByUsername(username);
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user profile
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
