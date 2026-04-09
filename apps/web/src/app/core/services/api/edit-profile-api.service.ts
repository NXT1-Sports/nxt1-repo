/**
 * @fileoverview Edit Profile API Service for Web
 * @module @nxt1/web/services/edit-profile-api
 *
 * Wraps @nxt1/core edit profile API for web HTTP calls via AngularHttpAdapter.
 * Provides edit profile data fetching and update operations.
 */

import { Injectable, inject } from '@angular/core';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { createEditProfileApi, type EditProfileApi } from '@nxt1/core/edit-profile';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileUpdateResponse,
  ProfileCompletionData,
} from '@nxt1/core/edit-profile';
import { AngularHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';
import { ProfileService as ApiProfileService } from './profile-api.service';

/**
 * Edit Profile API Service
 *
 * Provides methods to:
 * - Load profile data for editing
 * - Update profile sections
 * - Get profile completion data
 * - Upload photos
 *
 * Uses AngularHttpAdapter for web HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class EditProfileApiService {
  private readonly http = inject(AngularHttpAdapter);
  private readonly apiProfileService = inject(ApiProfileService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileApi');
  private readonly api: EditProfileApi;

  constructor() {
    this.api = createEditProfileApi(this.http, environment.apiURL);
  }

  /**
   * Get profile data for editing
   * @param userId - User ID to fetch
   * @param sportIndex - Optional sport index to load (defaults to activeSportIndex)
   */
  async getProfile(
    userId: string,
    sportIndex?: number
  ): Promise<{
    success: boolean;
    data?: EditProfileData;
    error?: string;
  }> {
    try {
      const data = await this.api.getProfile(userId, sportIndex);
      return { success: true, data };
    } catch (err) {
      this.logger.error('Failed to load profile', err, { userId, sportIndex });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load profile',
      };
    }
  }

  /**
   * Update profile data
   * @param userId - User ID to update
   * @param data - Partial profile form data
   */
  async updateProfile(
    userId: string,
    data: Partial<EditProfileFormData>
  ): Promise<{
    success: boolean;
    data?: EditProfileUpdateResponse;
    error?: string;
  }> {
    try {
      const result = await this.api.updateProfile(userId, data);

      // Invalidate profile cache after successful update
      this.apiProfileService.invalidateCache(userId);

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('Failed to update profile', err, { userId, fields: Object.keys(data) });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update profile',
      };
    }
  }

  /**
   * Update a specific profile section
   * @param userId - User ID to update
   * @param sectionId - Section identifier
   * @param data - Section data to update
   * @param sportIndex - Optional sport index for multi-sport profiles
   */
  async updateSection(
    userId: string,
    sectionId: string,
    data: Record<string, unknown>,
    sportIndex?: number
  ): Promise<{
    success: boolean;
    data?: EditProfileUpdateResponse;
    error?: string;
  }> {
    try {
      const result = await this.api.updateSection(userId, sectionId, data, sportIndex);

      // Invalidate profile cache after successful update
      // This ensures the profile page shows fresh data immediately
      this.apiProfileService.invalidateCache(userId);

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('Failed to update section', err, { userId, sectionId, sportIndex });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update section',
      };
    }
  }

  /**
   * Update active sport index
   * @param userId - User ID to update
   * @param activeSportIndex - The active sport index to set
   */
  async updateActiveSportIndex(
    userId: string,
    activeSportIndex: number
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      const result = await this.api.updateActiveSportIndex(userId, activeSportIndex);

      // Invalidate profile cache after changing active sport
      this.apiProfileService.invalidateCache(userId);

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('Failed to update active sport index', err, { userId, activeSportIndex });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update active sport index',
      };
    }
  }

  /**
   * Get profile completion data
   * @param userId - User ID to fetch
   */
  async getCompletion(userId: string): Promise<{
    success: boolean;
    data?: ProfileCompletionData;
    error?: string;
  }> {
    try {
      const data = await this.api.getCompletion(userId);
      return { success: true, data };
    } catch (err) {
      this.logger.error('Failed to load completion data', err, { userId });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load completion data',
      };
    }
  }

  /**
   * Upload profile photo
   * @param userId - User ID
   * @param type - Photo type ('profile' | 'banner')
   * @param file - Image file to upload
   */
  async uploadPhoto(
    userId: string,
    type: 'profile' | 'banner',
    file: File | Blob
  ): Promise<{
    success: boolean;
    data?: { url: string; xpAwarded?: number };
    error?: string;
  }> {
    try {
      const result = await this.api.uploadPhoto(userId, type, file);

      // Invalidate profile cache after successful photo upload
      this.apiProfileService.invalidateCache(userId);

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('Failed to upload photo', err, { userId, type });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload photo',
      };
    }
  }
}
