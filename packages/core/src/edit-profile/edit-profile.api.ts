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
  ProfileCompletionData,
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
     */
    async getProfile(userId: string): Promise<EditProfileData> {
      const response = await http.get<ApiResponse<EditProfileData>>(`${endpoint}/${userId}/edit`);
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
      data: Record<string, unknown>
    ): Promise<EditProfileUpdateResponse> {
      const response = await http.put<ApiResponse<EditProfileUpdateResponse>>(
        `${endpoint}/${userId}/section/${sectionId}`,
        data
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update section');
      }
      return response.data ?? { success: true };
    },

    /**
     * Get profile completion data.
     */
    async getCompletion(userId: string): Promise<ProfileCompletionData> {
      const response = await http.get<ApiResponse<ProfileCompletionData>>(
        `${endpoint}/${userId}/completion`
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load completion data');
      }
      return response.data;
    },

    /**
     * Upload profile photo.
     */
    async uploadPhoto(
      userId: string,
      type: 'profile' | 'banner',
      file: File | Blob
    ): Promise<{ url: string; xpAwarded?: number }> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await http.post<ApiResponse<{ url: string; xpAwarded?: number }>>(
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
  } as const;
}

export type EditProfileApi = ReturnType<typeof createEditProfileApi>;
