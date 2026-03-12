/**
 * @fileoverview Edit Profile API Service for Mobile
 * @module @nxt1/mobile/services/edit-profile-api
 *
 * Wraps @nxt1/core edit profile API for native HTTP calls via CapacitorHttpAdapter.
 * Provides edit profile data fetching and update operations.
 */

import { Injectable, inject } from '@angular/core';
import { createEditProfileApi, type EditProfileApi } from '@nxt1/core/edit-profile';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileUpdateResponse,
  ProfileCompletionData,
} from '@nxt1/core/edit-profile';
import { CapacitorHttpAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';

/**
 * Edit Profile API Service
 *
 * Provides methods to:
 * - Load profile data for editing
 * - Update profile sections
 * - Get profile completion data
 * - Upload photos
 *
 * Uses CapacitorHttpAdapter for native HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class EditProfileApiService {
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly api: EditProfileApi;

  constructor() {
    this.api = createEditProfileApi(this.http, environment.apiUrl);
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
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update profile',
      };
    }
  }

  /**
   * Update a single section
   * @param userId - User ID to update
   * @param sectionId - Section identifier
   * @param data - Section data
   * @param sportIndex - Optional sport index for sport-specific sections
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
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update section',
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
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load completion data',
      };
    }
  }

  /**
   * Update active sport index
   * @param userId - User ID to update
   * @param activeSportIndex - Index of the sport to make active
   */
  async updateActiveSportIndex(
    userId: string,
    activeSportIndex: number
  ): Promise<{
    success: boolean;
    data?: { activeSportIndex: number; sportName: string };
    error?: string;
  }> {
    try {
      const data = await this.api.updateActiveSportIndex(userId, activeSportIndex);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update active sport index',
      };
    }
  }

  /**
   * Upload photo to Firebase Storage
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
      const data = await this.api.uploadPhoto(userId, type, file);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload photo',
      };
    }
  }
}
