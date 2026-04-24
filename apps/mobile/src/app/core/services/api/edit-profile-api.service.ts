/**
 * @fileoverview Edit Profile API Service for Mobile
 * @module @nxt1/mobile/services/edit-profile-api
 *
 * Wraps @nxt1/core edit profile API for native HTTP calls via CapacitorHttpAdapter.
 * Provides edit profile data fetching and update operations.
 */

import { Injectable, inject } from '@angular/core';
import { createEditProfileApi, type EditProfileApi } from '@nxt1/core/edit-profile';
import { createFileUploadApi } from '@nxt1/core';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileUpdateResponse,
} from '@nxt1/core/edit-profile';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

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
  private readonly uploadApi = createFileUploadApi(this.http as never, environment.apiUrl);

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
   * @param file - Image file to upload
   */
  async uploadPhoto(
    userId: string,
    file: File | Blob
  ): Promise<{
    success: boolean;
    data?: { url: string };
    error?: string;
  }> {
    try {
      const data = await this.api.uploadPhoto(userId, file);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload photo',
      };
    }
  }

  /**
   * Upload team logo via signed URL (direct-to-storage).
   */
  async uploadTeamLogo(userId: string, teamId: string, file: File): Promise<string | null> {
    try {
      const signed = await this.uploadApi.getSignedUploadUrl(
        userId,
        'team-logo',
        file.name,
        file.type,
        teamId
      );

      const putResponse = await fetch(signed.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!putResponse.ok) return null;

      const bucket = environment.firebase.storageBucket;
      const encodedPath = encodeURIComponent(signed.storagePath);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
    } catch {
      return null;
    }
  }
}
