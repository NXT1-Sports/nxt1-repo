/**
 * @fileoverview Edit Profile API Service for Mobile
 * @module @nxt1/mobile/services/edit-profile-api
 *
 * Wraps @nxt1/core edit profile API for native HTTP calls via CapacitorHttpAdapter.
 * Provides edit profile data fetching and update operations.
 */

import { Injectable, inject } from '@angular/core';
import { CACHE_KEYS } from '@nxt1/core/cache';
import { createEditProfileApi, type EditProfileApi } from '@nxt1/core/edit-profile';
import { createFileUploadApi } from '@nxt1/core';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileUpdateResponse,
} from '@nxt1/core/edit-profile';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { normalizeImageFileForUpload } from '@nxt1/ui';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { MobileCacheService } from '../infrastructure/cache.service';
import { environment } from '../../../../environments/environment';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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
  private readonly mobileCache = inject(MobileCacheService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileApiService');
  private readonly api: EditProfileApi;
  private readonly uploadApi = createFileUploadApi(this.http as never, environment.apiUrl);
  private readonly httpCacheKeyPrefix = `${CACHE_KEYS.API_RESPONSE}mobile-http:`;

  constructor() {
    this.api = createEditProfileApi(this.http, environment.apiUrl);
  }

  async invalidateCache(userId: string): Promise<void> {
    await Promise.all([
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*profile*${userId}*`),
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*auth/profile*${userId}*`),
      this.mobileCache.clear(`${this.httpCacheKeyPrefix}*auth/profile/me*`),
      this.mobileCache.clear(`*profile*${userId}*`),
      this.mobileCache.clear(`*auth/profile/me*`),
    ]);
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
      const params: Record<string, string | number> = { _: Date.now() };
      if (sportIndex !== undefined) {
        params['sportIndex'] = sportIndex;
      }

      const response = await this.http.get<ApiResponse<EditProfileData>>(
        `${environment.apiUrl}/profile/${encodeURIComponent(userId)}/edit`,
        {
          params,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            'X-No-Cache': '1',
          },
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load profile');
      }

      const data = response.data;
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
      await this.invalidateCache(userId);
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
      await this.invalidateCache(userId);
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
      await this.invalidateCache(userId);
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
      await this.invalidateCache(userId);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload photo',
      };
    }
  }

  /** Upload a normalized team logo through the backend multipart endpoint. */
  async uploadTeamLogo(userId: string, teamId: string, file: File): Promise<string | null> {
    try {
      const normalizedFile = await normalizeImageFileForUpload(file);
      const mimeType = normalizedFile.type || 'image/jpeg';

      this.logger.info('Uploading team logo through backend', {
        teamId,
        mimeType,
        fileName: normalizedFile.name,
      });

      const uploaded = await this.uploadApi.uploadTeamLogo(
        userId,
        teamId,
        normalizedFile,
        normalizedFile.name,
        mimeType
      );

      this.logger.info('Team logo upload complete', {
        teamId,
        storagePath: uploaded.storagePath,
      });
      return uploaded.url;
    } catch (err) {
      this.logger.error('uploadTeamLogo failed', err, {
        teamId,
        fileName: file.name,
        fileType: file.type,
      });
      return null;
    }
  }
}
