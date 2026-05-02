/**
 * @fileoverview Profile API - Pure TypeScript
 * @module @nxt1/core/profile
 *
 * Pure functions for profile-related backend API calls.
 * 100% portable - NO platform dependencies.
 *
 * @version 2.0.0
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  User,
  UserSummary,
  SportProfile,
  // Removing SocialLink from imports
  Location,
  UserContact,
  TeamHistoryEntry,
  UserAward,
  ConnectedSource,
  AcademicInfo,
  CoachData,
  DirectorData,
  UserPreferences,
} from '../models/user';
import type { TeamSelectionFormData } from '../onboarding/onboarding-navigation.api';

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

export interface AddSportResponse {
  readonly sport: string;
  readonly teamId?: string;
  readonly scrapeJobId?: string;
  readonly scrapeThreadId?: string;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

/**
 * Full profile update request — accepts all writable User model fields.
 * Backend whitelists these fields server-side to prevent mass-assignment
 * of system/read-only fields (id, _counters, etc.).
 */
export interface UpdateProfileRequest {
  // ── Core Identity ──────────────────────────────────────────────────────
  firstName?: string;
  lastName?: string;
  /** Preferred display name (overrides firstName + lastName in UI) */
  displayName?: string;
  username?: string;
  aboutMe?: string;
  profileImg?: string;

  profileImgs?: string[];
  gender?: string;

  // ── Physical / Class ───────────────────────────────────────────────────
  /** Height string e.g. "6'2\"" */
  height?: string;
  /** Weight string e.g. "185 lbs" */
  weight?: string;
  /** Graduation year e.g. 2027 */
  classOf?: number;

  // ── Location & Contact ─────────────────────────────────────────────────
  location?: Partial<Location>;
  contact?: Partial<UserContact>;

  // ── Connected Sources ──────────────────────────────────────────────────
  /** All connected accounts/links are inside connectedSources (agnostic array) */
  connectedSources?: ConnectedSource[];

  // ── Sports ─────────────────────────────────────────────────────────────
  /** Full sports array replacement */
  sports?: SportProfile[];
  activeSportIndex?: number;

  // ── Team History & Awards ──────────────────────────────────────────────
  teamHistory?: TeamHistoryEntry[];
  awards?: UserAward[];
  academics?: Partial<AcademicInfo>;

  // ── Role-specific Data ─────────────────────────────────────────────────
  coach?: Partial<CoachData>;
  director?: Partial<DirectorData>;

  // ── Preferences ────────────────────────────────────────────────────────
  preferences?: Partial<UserPreferences>;
}

export interface UpdateSportProfileRequest {
  sportIndex: number;
  updates: Partial<SportProfile>;
}

export interface AddSportRequest extends Partial<SportProfile> {
  teamSelection?: TeamSelectionFormData;
  connectedSources?: readonly ConnectedSource[];
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

export interface ProfileAnalytics {
  profileViews: number;
  videoViews: number;
  shares: number;
  engagement: number;
  topViewers: Array<{ state: string; count: number }>;
  viewsOverTime: Array<{ date: string; views: number }>;
}

export interface SetProfilePostPinRequest {
  readonly isPinned: boolean;
}

export interface ProfilePostMutationResponse {
  readonly postId: string;
  readonly isPinned: boolean;
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
      return http.get<ApiResponse<User>>(`${baseUrl}/auth/profile/${userId}`);
    },

    /**
     * Get current authenticated user's own profile
     */
    async getMe(): Promise<ApiResponse<User>> {
      return http.get<ApiResponse<User>>(`${baseUrl}/auth/profile/me`);
    },

    /**
     * Get user profile by unicode (shareable profile code)
     */
    async getProfileByUnicode(unicode: string): Promise<ApiResponse<User>> {
      return http.get<ApiResponse<User>>(`${baseUrl}/auth/profile/unicode/${unicode}`);
    },

    /**
     * Update user profile
     */
    async updateProfile(userId: string, data: UpdateProfileRequest): Promise<ApiResponse<User>> {
      return http.put<ApiResponse<User>>(`${baseUrl}/auth/profile/${userId}`, data);
    },

    /**
     * Update sport profile
     */
    async updateSportProfile(
      userId: string,
      data: UpdateSportProfileRequest
    ): Promise<ApiResponse<SportProfile>> {
      return http.put<ApiResponse<SportProfile>>(`${baseUrl}/auth/profile/${userId}/sport`, data);
    },

    /**
     * Add new sport to profile
     */
    async addSport(userId: string, sport: AddSportRequest): Promise<ApiResponse<AddSportResponse>> {
      return http.post<ApiResponse<AddSportResponse>>(
        `${baseUrl}/auth/profile/${userId}/sport`,
        sport
      );
    },

    /**
     * Remove sport from profile
     */
    async removeSport(userId: string, sportIndex: number): Promise<ApiResponse<void>> {
      return http.delete<ApiResponse<void>>(
        `${baseUrl}/auth/profile/${userId}/sport/${sportIndex}`
      );
    },

    /**
     * Search profiles
     */
    async searchProfiles(params: ProfileSearchParams): Promise<PaginatedResponse<UserSummary>> {
      return http.get<PaginatedResponse<UserSummary>>(`${baseUrl}/auth/profile/search`, {
        params: params as Record<string, string | number | boolean>,
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
      return http.post<ApiResponse<{ url: string }>>(`${baseUrl}/auth/profile/${userId}/image`, {
        imageData,
      });
    },

    /**
     * Pin or unpin a profile post.
     */
    async pinPost(
      userId: string,
      postId: string,
      isPinned: boolean
    ): Promise<ApiResponse<ProfilePostMutationResponse>> {
      return http.patch<ApiResponse<ProfilePostMutationResponse>>(
        `${baseUrl}/auth/profile/${userId}/posts/${postId}/pin`,
        { isPinned } satisfies SetProfilePostPinRequest
      );
    },

    /**
     * Delete a profile post.
     */
    async deletePost(
      userId: string,
      postId: string
    ): Promise<ApiResponse<ProfilePostMutationResponse>> {
      return http.delete<ApiResponse<ProfilePostMutationResponse>>(
        `${baseUrl}/auth/profile/${userId}/posts/${postId}`
      );
    },
  };
}
