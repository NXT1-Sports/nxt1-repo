/**
 * @fileoverview Profile API - Pure TypeScript
 * @module @nxt1/core/api
 *
 * Pure functions for profile-related backend API calls.
 * 100% portable - NO platform dependencies.
 *
 * @version 2.0.0
 */

import type { HttpAdapter } from './http-adapter';
import type { User, UserSummary, SportProfile } from '../models/user.model';

// ============================================
// COMMON API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  profileImg?: string;
  aboutMe?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  social?: {
    twitter?: string;
    instagram?: string;
    tiktok?: string;
    hudl?: string;
  };
}

export interface UpdateSportProfileRequest {
  sportIndex: number;
  updates: Partial<SportProfile>;
}

export interface ProfileSearchParams {
  query?: string;
  sport?: string;
  state?: string;
  classOf?: number;
  position?: string;
  page?: number;
  limit?: number;
}

export interface FollowResponse {
  success: boolean;
  isFollowing: boolean;
  followersCount: number;
}

export interface ProfileAnalytics {
  profileViews: number;
  videoViews: number;
  shares: number;
  engagement: number;
  topViewers: Array<{ state: string; count: number }>;
  viewsOverTime: Array<{ date: string; views: number }>;
}

// ============================================
// PROFILE API FACTORY
// ============================================

export type ProfileApi = ReturnType<typeof createProfileApi>;

/**
 * Create Profile API instance
 */
export function createProfileApi(http: HttpAdapter, baseUrl: string) {
  return {
    /**
     * Get user profile by ID
     */
    async getProfile(userId: string): Promise<ApiResponse<User>> {
      return http.get<ApiResponse<User>>(`${baseUrl}/profile/${userId}`);
    },

    /**
     * Get user profile by username
     */
    async getProfileByUsername(username: string): Promise<ApiResponse<User>> {
      return http.get<ApiResponse<User>>(`${baseUrl}/profile/username/${username}`);
    },

    /**
     * Update user profile
     */
    async updateProfile(userId: string, data: UpdateProfileRequest): Promise<ApiResponse<User>> {
      return http.put<ApiResponse<User>>(`${baseUrl}/profile/${userId}`, data);
    },

    /**
     * Update sport profile
     */
    async updateSportProfile(
      userId: string,
      data: UpdateSportProfileRequest
    ): Promise<ApiResponse<SportProfile>> {
      return http.put<ApiResponse<SportProfile>>(`${baseUrl}/profile/${userId}/sport`, data);
    },

    /**
     * Add new sport to profile
     */
    async addSport(
      userId: string,
      sport: Partial<SportProfile>
    ): Promise<ApiResponse<SportProfile>> {
      return http.post<ApiResponse<SportProfile>>(`${baseUrl}/profile/${userId}/sport`, sport);
    },

    /**
     * Remove sport from profile
     */
    async removeSport(userId: string, sportIndex: number): Promise<ApiResponse<void>> {
      return http.delete<ApiResponse<void>>(`${baseUrl}/profile/${userId}/sport/${sportIndex}`);
    },

    /**
     * Search profiles
     */
    async searchProfiles(params: ProfileSearchParams): Promise<PaginatedResponse<UserSummary>> {
      return http.get<PaginatedResponse<UserSummary>>(`${baseUrl}/profile/search`, {
        params: params as Record<string, string | number | boolean>,
      });
    },

    /**
     * Follow a user
     */
    async follow(userId: string, targetUserId: string): Promise<FollowResponse> {
      return http.post<FollowResponse>(`${baseUrl}/follow`, { userId, targetUserId });
    },

    /**
     * Unfollow a user
     */
    async unfollow(userId: string, targetUserId: string): Promise<FollowResponse> {
      return http.delete<FollowResponse>(`${baseUrl}/follow`, { params: { userId, targetUserId } });
    },

    /**
     * Get followers
     */
    async getFollowers(
      userId: string,
      page: number = 1,
      limit: number = 20
    ): Promise<PaginatedResponse<UserSummary>> {
      return http.get<PaginatedResponse<UserSummary>>(`${baseUrl}/follow/followers/${userId}`, {
        params: { page, limit },
      });
    },

    /**
     * Get following
     */
    async getFollowing(
      userId: string,
      page: number = 1,
      limit: number = 20
    ): Promise<PaginatedResponse<UserSummary>> {
      return http.get<PaginatedResponse<UserSummary>>(`${baseUrl}/follow/following/${userId}`, {
        params: { page, limit },
      });
    },

    /**
     * Get profile analytics
     */
    async getAnalytics(userId: string): Promise<ApiResponse<ProfileAnalytics>> {
      return http.get<ApiResponse<ProfileAnalytics>>(`${baseUrl}/analytics/${userId}`);
    },

    /**
     * Track profile view
     */
    async trackProfileView(userId: string, viewerId?: string): Promise<ApiResponse<void>> {
      return http.post<ApiResponse<void>>(`${baseUrl}/analytics/profile-view`, {
        userId,
        viewerId,
      });
    },

    /**
     * Upload profile image
     */
    async uploadProfileImage(
      userId: string,
      imageData: string
    ): Promise<ApiResponse<{ url: string }>> {
      return http.post<ApiResponse<{ url: string }>>(`${baseUrl}/profile/${userId}/image`, {
        imageData,
      });
    },
  };
}
