/**
 * File Upload Service - Angular Wrapper
 *
 * Wraps the @nxt1/core File Upload API for use in Angular applications.
 * Provides singleton access to the file upload API with proper dependency injection.
 *
 * Architecture (Backend-First Pattern - 2026 Best Practice):
 * ┌────────────────────────────────────────────────────────────────┐
 * │                    Components (UI Layer)                       │
 * │  OnboardingComponent, ProfileEditComponent, SettingsComponent  │
 * ├────────────────────────────────────────────────────────────────┤
 * │              ⭐ FileUploadService (THIS FILE) ⭐                │
 * │      Angular DI wrapper - creates @nxt1/core API instance      │
 * ├────────────────────────────────────────────────────────────────┤
 * │              createFileUploadApi() from @nxt1/core             │
 * │           Pure TypeScript - portable to mobile app             │
 * ├────────────────────────────────────────────────────────────────┤
 * │                 AngularFileUploadAdapter                       │
 * │           HttpClient + FormData multipart uploads              │
 * ├────────────────────────────────────────────────────────────────┤
 * │                     Backend API Server                         │
 * │   Validates, optimizes images, uploads to Firebase Storage     │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Why this architecture:
 * 1. Frontend NEVER directly accesses Firebase Storage (security)
 * 2. Backend handles image optimization (performance)
 * 3. Same API code works on web and mobile (portability)
 * 4. Single source of truth for upload logic (consistency)
 *
 * @module @nxt1/web/core/services
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import {
  createFileUploadApi,
  type FileUploadApi,
  type FileUploadResult,
  type FileCategory,
  type UploadProgressCallback,
  validateFileForUpload,
  FILE_UPLOAD_RULES,
  formatFileSize,
} from '@nxt1/core';
import { AngularFileUploadAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';
import { NxtLoggingService, NxtToastService } from '@nxt1/ui/services';
import type { ILogger } from '@nxt1/core/logging';

// ============================================
// UPLOAD STATE TYPES
// ============================================

export type UploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

export interface UploadState {
  status: UploadStatus;
  progress: number;
  error: string | null;
  result: FileUploadResult | null;
}

const INITIAL_UPLOAD_STATE: UploadState = {
  status: 'idle',
  progress: 0,
  error: null,
  result: null,
};

// ============================================
// FILE UPLOAD SERVICE
// ============================================

/**
 * Angular service wrapper for @nxt1/core File Upload API
 *
 * Provides reactive upload state via signals and handles all file upload
 * operations through the backend API.
 *
 * @example
 * ```typescript
 * export class ProfileComponent {
 *   private uploadService = inject(FileUploadService);
 *
 *   // Reactive state
 *   readonly isUploading = this.uploadService.isUploading;
 *   readonly progress = this.uploadService.progress;
 *   readonly error = this.uploadService.error;
 *
 *   async onFileSelected(file: File): Promise<void> {
 *     const result = await this.uploadService.uploadProfilePhoto(userId, file);
 *     if (result) {
 *       console.log('Uploaded:', result.url);
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(AngularFileUploadAdapter);
  private readonly logger: ILogger = inject(NxtLoggingService).child('FileUploadService');
  private readonly toast = inject(NxtToastService);

  /** Lazy-initialized API instance */
  private _api: FileUploadApi | null = null;

  // ============================================
  // REACTIVE STATE (Signals)
  // ============================================

  /** Internal upload state */
  private readonly _state = signal<UploadState>(INITIAL_UPLOAD_STATE);

  /** Current upload status */
  readonly status = computed(() => this._state().status);

  /** Upload progress (0-100) */
  readonly progress = computed(() => this._state().progress);

  /** Last error message */
  readonly error = computed(() => this._state().error);

  /** Last upload result */
  readonly result = computed(() => this._state().result);

  /** Whether upload is in progress */
  readonly isUploading = computed(() => this._state().status === 'uploading');

  /** Whether upload completed successfully */
  readonly isSuccess = computed(() => this._state().status === 'success');

  // ============================================
  // API ACCESSOR
  // ============================================

  /** Get or create API instance */
  private get api(): FileUploadApi {
    if (!this._api) {
      this._api = createFileUploadApi(this.http, environment.apiURL);
    }
    return this._api;
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Upload profile photo
   *
   * Backend will:
   * - Validate file type and size
   * - Resize to optimal dimensions
   * - Generate thumbnail
   * - Store in Firebase Storage
   * - Return CDN URL
   *
   * @param userId - User's Firebase UID
   * @param file - Image file to upload
   * @returns Upload result with URL, or null on failure
   */
  async uploadProfilePhoto(userId: string, file: File): Promise<FileUploadResult | null> {
    return this.uploadFile(userId, file, 'profile-photo');
  }

  /**
   * Upload cover photo
   *
   * @param userId - User's Firebase UID
   * @param file - Image file to upload
   * @returns Upload result with URL, or null on failure
   */
  async uploadCoverPhoto(userId: string, file: File): Promise<FileUploadResult | null> {
    return this.uploadFile(userId, file, 'cover-photo');
  }

  /**
   * Upload document (PDF, transcript, etc.)
   *
   * @param userId - User's Firebase UID
   * @param file - Document file to upload
   * @returns Upload result with URL, or null on failure
   */
  async uploadDocument(userId: string, file: File): Promise<FileUploadResult | null> {
    return this.uploadFile(userId, file, 'document');
  }

  /**
   * Delete uploaded file
   *
   * @param userId - User's Firebase UID
   * @param storagePath - Storage path or URL of file to delete
   */
  async deleteFile(userId: string, storagePath: string): Promise<boolean> {
    try {
      await this.api.deleteFile(userId, storagePath);
      this.logger.info('File deleted', { storagePath });
      return true;
    } catch (err) {
      this.logger.error('Failed to delete file', err);
      return false;
    }
  }

  /**
   * Validate file before upload (client-side)
   * Call this to check if file is valid without uploading
   *
   * @param file - File to validate
   * @param category - File category for validation rules
   * @returns Error message or null if valid
   */
  validateFile(file: File, category: FileCategory): string | null {
    const validation = validateFileForUpload({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      category,
    });

    return validation?.message ?? null;
  }

  /**
   * Get upload rules for a category
   * Use to display limits to user
   */
  getUploadRules(category: FileCategory): {
    maxSize: string;
    allowedTypes: readonly string[];
  } {
    const rules = FILE_UPLOAD_RULES[category];
    return {
      maxSize: formatFileSize(rules.maxSize),
      allowedTypes: rules.allowedTypes,
    };
  }

  /**
   * Reset upload state
   * Call after handling upload result
   */
  reset(): void {
    this._state.set(INITIAL_UPLOAD_STATE);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Generic file upload with state management
   */
  private async uploadFile(
    userId: string,
    file: File,
    category: FileCategory
  ): Promise<FileUploadResult | null> {
    // Reset state
    this._state.set({
      status: 'validating',
      progress: 0,
      error: null,
      result: null,
    });

    // Client-side validation
    const validationError = this.validateFile(file, category);
    if (validationError) {
      this._state.set({
        status: 'error',
        progress: 0,
        error: validationError,
        result: null,
      });
      this.toast.error(validationError);
      return null;
    }

    // Start upload
    this._state.update((s) => ({ ...s, status: 'uploading', progress: 0 }));

    this.logger.debug('Starting upload', {
      category,
      fileName: file.name,
      size: formatFileSize(file.size),
      mimeType: file.type,
    });

    // Progress callback
    const onProgress: UploadProgressCallback = (progress) => {
      this._state.update((s) => ({ ...s, progress }));
    };

    try {
      let result: FileUploadResult;

      switch (category) {
        case 'profile-photo':
          result = await this.api.uploadProfilePhoto(
            userId,
            file,
            file.name,
            file.type,
            onProgress
          );
          break;
        case 'cover-photo':
          result = await this.api.uploadCoverPhoto(userId, file, file.name, file.type, onProgress);
          break;
        case 'document':
          result = await this.api.uploadDocument(userId, file, file.name, file.type, onProgress);
          break;
        default:
          throw new Error(`Unsupported category: ${category}`);
      }

      this._state.set({
        status: 'success',
        progress: 100,
        error: null,
        result,
      });

      this.logger.info('Upload successful', {
        category,
        url: result.url,
        size: formatFileSize(result.size),
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';

      this._state.set({
        status: 'error',
        progress: 0,
        error: message,
        result: null,
      });

      this.logger.error('Upload failed', err);
      this.toast.error(message);

      return null;
    }
  }
}
