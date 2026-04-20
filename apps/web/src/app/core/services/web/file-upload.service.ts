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
  type FinalizedHighlightVideoUpload,
  type FileUploadResult,
  type FileCategory,
  type HighlightVideoUploadProvisionOptions,
  type PersistHighlightVideoPostRequest,
  type PersistedHighlightVideoPost,
  type UploadProgressCallback,
  validateFileForUpload,
  FILE_UPLOAD_RULES,
  formatFileSize,
} from '@nxt1/core';
import { AngularFileUploadAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';
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
  result: FileUploadResult | FinalizedHighlightVideoUpload | null;
}

export type HighlightVideoUploadOptions = HighlightVideoUploadProvisionOptions;
export type HighlightVideoPostOptions = Omit<PersistHighlightVideoPostRequest, 'cloudflareVideoId'>;

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
   * Upload a highlight video via Cloudflare Stream direct TUS upload.
   * The backend provisions the upload session and the browser streams bytes directly to Cloudflare.
   */
  async uploadHighlightVideo(
    userId: string,
    file: File,
    options?: HighlightVideoUploadOptions
  ): Promise<FinalizedHighlightVideoUpload | null> {
    this._state.set({
      status: 'validating',
      progress: 0,
      error: null,
      result: null,
    });

    const validationError = this.validateFile(file, 'highlight-video');
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

    this._state.update((state) => ({ ...state, status: 'uploading', progress: 0 }));

    this.logger.debug('Starting direct highlight video upload', {
      fileName: file.name,
      size: formatFileSize(file.size),
      mimeType: file.type,
      context: options?.context ?? 'general',
    });

    try {
      const session = await this.api.provisionHighlightVideoUpload(
        userId,
        file.name,
        file.type,
        file.size,
        options
      );

      const { Upload } = await import('tus-js-client');

      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          uploadUrl: session.uploadUrl,
          headers: {
            'Tus-Resumable': session.tusResumable,
          },
          retryDelays: [0, 1_000, 3_000, 5_000],
          chunkSize: 8 * 1024 * 1024,
          removeFingerprintOnSuccess: true,
          onError: (error) => reject(error),
          onProgress: (bytesUploaded, bytesTotal) => {
            const progress = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
            this._state.update((state) => ({ ...state, progress }));
          },
          onSuccess: () => resolve(),
        });

        upload.start();
      });

      this._state.update((state) => ({ ...state, progress: 100 }));

      const finalizedVideo = await this.api.finalizeHighlightVideoUpload(session.cloudflareVideoId);

      this._state.set({
        status: 'success',
        progress: 100,
        error: null,
        result: finalizedVideo,
      });

      this.logger.info('Direct highlight video upload completed', {
        cloudflareVideoId: finalizedVideo.cloudflareVideoId,
        context: finalizedVideo.metadata.context,
        readyToStream: finalizedVideo.readyToStream,
      });

      return finalizedVideo;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video upload failed. Please try again.';

      this._state.set({
        status: 'error',
        progress: 0,
        error: message,
        result: null,
      });

      this.logger.error('Direct highlight video upload failed', err);
      this.toast.error(message);

      return null;
    }
  }

  /**
   * Persist a finalized Cloudflare highlight into the backend Posts collection.
   */
  async persistHighlightVideoPost(
    cloudflareVideoId: string,
    options?: HighlightVideoPostOptions
  ): Promise<PersistedHighlightVideoPost | null> {
    try {
      const result = await this.api.persistHighlightVideoPost({
        cloudflareVideoId,
        ...options,
      });

      this.logger.info('Persisted Cloudflare highlight post', {
        cloudflareVideoId,
        postId: result.postId,
        readyToStream: result.readyToStream,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to persist highlight video post';

      this.logger.error('Failed to persist Cloudflare highlight post', err);
      this.toast.error(message);

      return null;
    }
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
      maxSize: 'maxSize' in rules ? formatFileSize((rules as { maxSize: number }).maxSize) : '',
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
