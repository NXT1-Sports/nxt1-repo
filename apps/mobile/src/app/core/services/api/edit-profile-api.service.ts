/**
 * @fileoverview Edit Profile API Service for Mobile
 * @module @nxt1/mobile/services/edit-profile-api
 *
 * Wraps @nxt1/core edit profile API for native HTTP calls via CapacitorHttpAdapter.
 * Provides edit profile data fetching and update operations.
 */

import { Injectable, inject } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
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
import { environment } from '../../../../environments/environment';

/** Convert a File or Blob to a base64 data URL (data:mime;base64,...). */
function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  private readonly logger = inject(NxtLoggingService).child('EditProfileApiService');
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
   * Upload team logo / gallery image via signed URL (direct-to-storage).
   *
   * On iOS, photos from the library are often HEIC (image/heic) which the
   * backend doesn't accept. We normalize to JPEG/PNG/WebP first to ensure
   * the MIME type is always in the allowed list.
   */
  async uploadTeamLogo(userId: string, teamId: string, file: File): Promise<string | null> {
    try {
      // Normalize converts HEIC → JPEG and resizes large images. This also
      // ensures file.type is a supported MIME type before requesting the URL.
      const normalizedFile = await normalizeImageFileForUpload(file);

      // Fallback: if normalization somehow produced an empty type, use JPEG.
      const mimeType = normalizedFile.type || 'image/jpeg';

      this.logger.info('Requesting signed upload URL', {
        teamId,
        mimeType,
        fileName: normalizedFile.name,
      });

      const signed = await this.uploadApi.getSignedUploadUrl(
        userId,
        'team-logo',
        normalizedFile.name,
        mimeType,
        teamId
      );

      this.logger.info('Uploading to GCS via signed URL', {
        teamId,
        storagePath: signed.storagePath,
      });

      // On iOS native, fetch() to cross-origin URLs (e.g. storage.googleapis.com)
      // fails with "Load failed" because WKWebView blocks the request.
      // Fix: use CapacitorHttp with dataType: 'file' + raw base64 (no prefix).
      // Per Capacitor 8 docs, dataType:'file' expects a raw base64 string —
      // Capacitor decodes it to binary bytes and sends via NSURLSession, which
      // has no WKWebView cross-origin restrictions.
      //
      // ⚠️  Do NOT pass a data URL (data:image/png;base64,...) — the prefix chars
      //     are valid base64 and get decoded into garbage binary data.
      // ⚠️  Do NOT pass a file:// URI — Capacitor sends the URI text as the body.
      if (Capacitor.isNativePlatform()) {
        const dataUrl = await fileToDataUrl(normalizedFile);
        // Strip 'data:image/xxx;base64,' prefix → raw base64 only
        const rawBase64 = dataUrl.split(',')[1];
        if (!rawBase64) {
          this.logger.error('Failed to extract base64 from normalized file', null, { teamId });
          return null;
        }

        const nativeResponse = await CapacitorHttp.request({
          method: 'PUT',
          url: signed.uploadUrl,
          headers: { 'Content-Type': mimeType },
          data: rawBase64, // raw base64 string (no data: prefix)
          dataType: 'file', // Capacitor decodes base64 → binary before sending
        });

        if (nativeResponse.status < 200 || nativeResponse.status >= 300) {
          this.logger.error('GCS signed URL PUT failed (native)', null, {
            teamId,
            status: nativeResponse.status,
          });
          return null;
        }
      } else {
        const putResponse = await fetch(signed.uploadUrl, {
          method: 'PUT',
          body: normalizedFile,
          headers: { 'Content-Type': mimeType },
        });

        if (!putResponse.ok) {
          const body = await putResponse.text().catch(() => '');
          this.logger.error('GCS signed URL PUT failed', null, {
            teamId,
            status: putResponse.status,
            body: body.substring(0, 300),
          });
          return null;
        }
      }

      const bucket = environment.firebase.storageBucket;
      const encodedPath = encodeURIComponent(signed.storagePath);
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
      this.logger.info('Team logo upload complete', { teamId, url });
      return url;
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
