/**
 * @fileoverview Edit Profile API Factory
 * @module @nxt1/core/edit-profile
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Edit Profile feature.
 * 100% portable - works with any HTTP adapter.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileUpdateResponse,
} from './edit-profile.types';

// ============================================
// API RESPONSE TYPES
// ============================================

/** Standard API response wrapper */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates an Edit Profile API instance.
 *
 * @param http - HTTP adapter for making requests
 * @param baseUrl - Base URL for API endpoints
 * @returns Edit Profile API methods
 *
 * @example
 * ```typescript
 * const api = createEditProfileApi(httpAdapter, '/api/v1');
 * const profile = await api.getProfile('user-123');
 * await api.updateProfile('user-123', formData);
 * ```
 */
export function createEditProfileApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/profile`;

  return {
    /**
     * Get profile data for editing.
     * @param userId - User ID
     * @param sportIndex - Optional sport index to load (defaults to activeSportIndex)
     */
    async getProfile(userId: string, sportIndex?: number): Promise<EditProfileData> {
      const url =
        sportIndex !== undefined
          ? `${endpoint}/${userId}/edit?sportIndex=${sportIndex}`
          : `${endpoint}/${userId}/edit`;
      const response = await http.get<ApiResponse<EditProfileData>>(url);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load profile');
      }
      return response.data;
    },

    /**
     * Update profile data.
     */
    async updateProfile(
      userId: string,
      data: Partial<EditProfileFormData>
    ): Promise<EditProfileUpdateResponse> {
      const response = await http.put<ApiResponse<EditProfileUpdateResponse>>(
        `${endpoint}/${userId}`,
        data
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update profile');
      }
      return response.data ?? { success: true };
    },

    /**
     * Update a single section.
     */
    async updateSection(
      userId: string,
      sectionId: string,
      data: Record<string, unknown>,
      sportIndex?: number
    ): Promise<EditProfileUpdateResponse> {
      const url =
        sportIndex !== undefined
          ? `${endpoint}/${userId}/section/${sectionId}?sportIndex=${sportIndex}`
          : `${endpoint}/${userId}/section/${sectionId}`;

      const response = await http.put<ApiResponse<EditProfileUpdateResponse>>(url, data);
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update section');
      }
      return response.data ?? { success: true };
    },

    /**
     * Upload profile photo.
     */
    async uploadPhoto(userId: string, file: File | Blob): Promise<{ url: string }> {
      const formData = new FormData();

      // Append file with explicit filename (important for multer detection)
      const filename = file instanceof File ? file.name : 'profile_photo.jpg';
      formData.append('file', file, filename);

      const response = await http.post<ApiResponse<{ url: string }>>(
        `${endpoint}/${userId}/photo`,
        formData
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to upload photo');
      }
      return response.data;
    },

    /**
     * Delete profile photo.
     */
    async deletePhoto(userId: string, type: 'profile' | 'banner'): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(`${endpoint}/${userId}/photo/${type}`);
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete photo');
      }
    },

    /**
     * Update active sport index.
     */
    async updateActiveSportIndex(
      userId: string,
      activeSportIndex: number
    ): Promise<{ activeSportIndex: number; sportName: string }> {
      const response = await http.put<ApiResponse<{ activeSportIndex: number; sportName: string }>>(
        `${endpoint}/${userId}/active-sport-index`,
        { activeSportIndex }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update active sport index');
      }
      return response.data;
    },
  } as const;
}

export type EditProfileApi = ReturnType<typeof createEditProfileApi>;
