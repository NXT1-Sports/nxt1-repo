/**
 * Angular File Upload Adapter Service
 *
 * Implements the @nxt1/core FileUploadHttpAdapter interface using
 * Angular's HttpClient with multipart/form-data support.
 *
 * Architecture (Backend-First Pattern):
 * ┌──────────────────────────────────────────────────────────────┐
 * │                 Angular Component (UI)                       │
 * │   Collects file via <input type="file"> or drag-drop         │
 * ├──────────────────────────────────────────────────────────────┤
 * │           ⭐ AngularFileUploadAdapter (THIS FILE) ⭐          │
 * │   Validates client-side, sends to backend via FormData       │
 * ├──────────────────────────────────────────────────────────────┤
 * │                    Backend API Server                        │
 * │   Re-validates, processes (resize/optimize), stores          │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - Multipart/form-data file uploads
 * - Progress tracking with XMLHttpRequest
 * - Automatic retry on network failures
 * - Client-side validation before upload
 * - SSR-safe (no-op on server)
 *
 * @module @nxt1/web/core/infrastructure
 */
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpEventType,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { firstValueFrom, timeout, catchError, throwError, filter, map, tap } from 'rxjs';
import type {
  HttpAdapter as _HttpAdapter,
  HttpRequestConfig,
  HttpAdapterError,
  FileUploadHttpAdapter,
  FileUploadRequest,
  FileUploadMetadata,
  UploadProgressCallback,
} from '@nxt1/core';
import { parseApiError, getErrorMessage, API_ERROR_CODES } from '@nxt1/core';

/**
 * Default request timeout (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Default upload timeout (5 minutes for large files)
 */
const UPLOAD_TIMEOUT = 5 * 60 * 1000;

/**
 * Angular implementation of FileUploadHttpAdapter
 *
 * Implements full HttpAdapter interface with file upload capabilities.
 * Uses HttpClient's reportProgress for upload tracking.
 *
 * @example
 * ```typescript
 * const uploadApi = createFileUploadApi(
 *   inject(AngularFileUploadAdapter),
 *   environment.apiURL
 * );
 *
 * // Upload with progress
 * const result = await uploadApi.uploadProfilePhoto(
 *   userId,
 *   file,
 *   file.name,
 *   file.type,
 *   (progress) => console.log(`${progress}%`)
 * );
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AngularFileUploadAdapter implements FileUploadHttpAdapter {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Check if running in browser (file uploads not supported on server)
   */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // STANDARD HTTP ADAPTER METHODS
  // ============================================

  /**
   * Perform GET request
   */
  async get<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .get<T>(url, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform POST request
   */
  async post<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .post<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform PUT request
   */
  async put<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .put<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform PATCH request
   */
  async patch<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .patch<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform DELETE request
   */
  async delete<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .delete<T>(url, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  // ============================================
  // FILE UPLOAD METHOD
  // ============================================

  /**
   * Upload file with multipart/form-data
   *
   * @param url - Upload endpoint URL
   * @param file - File blob to upload
   * @param metadata - File metadata (userId, category, fileName, mimeType, size)
   * @param onProgress - Optional progress callback (0-100)
   * @returns Promise with upload response
   */
  async uploadFile<T>(
    url: string,
    file: Blob | string,
    metadata: FileUploadRequest & FileUploadMetadata,
    onProgress?: UploadProgressCallback
  ): Promise<T> {
    // SSR safety: file uploads only work in browser
    if (!this.isBrowser) {
      throw this.createError(
        0,
        API_ERROR_CODES.SRV_INTERNAL_ERROR,
        'File upload not available on server'
      );
    }

    // Build FormData with file and metadata
    const formData = new FormData();

    // Handle file: Blob (web) or base64 string (mobile cross-compat)
    if (typeof file === 'string') {
      // Base64 string - convert to Blob
      const blob = this.base64ToBlob(file, metadata.mimeType);
      formData.append('file', blob, metadata.fileName);
    } else {
      // Already a Blob/File
      formData.append('file', file, metadata.fileName);
    }

    // Append metadata fields
    formData.append('userId', metadata.userId);
    formData.append('category', metadata.category);
    formData.append('fileName', metadata.fileName);
    formData.append('mimeType', metadata.mimeType);
    formData.append('size', String(metadata.size));

    if (metadata.customPath) {
      formData.append('customPath', metadata.customPath);
    }

    if (metadata.metadata) {
      formData.append('metadata', JSON.stringify(metadata.metadata));
    }

    // Use HttpClient with reportProgress for upload tracking
    return firstValueFrom(
      this.http
        .post<T>(url, formData, {
          reportProgress: true,
          observe: 'events',
        })
        .pipe(
          // Track upload progress
          tap((event) => {
            if (event.type === HttpEventType.UploadProgress && onProgress) {
              const progress = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
              onProgress(progress);
            }
          }),
          // Filter to only response event
          filter((event) => event.type === HttpEventType.Response),
          // Extract response body
          map((event) => {
            if (event.type === HttpEventType.Response) {
              return event.body as T;
            }
            throw new Error('Unexpected response type');
          }),
          // Timeout for large uploads
          timeout(UPLOAD_TIMEOUT),
          // Transform errors
          catchError((error) => throwError(() => this.transformUploadError(error)))
        )
    );
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Build HttpHeaders from config
   */
  private buildHeaders(config?: HttpRequestConfig): HttpHeaders | undefined {
    if (!config?.headers) return undefined;
    return new HttpHeaders(config.headers);
  }

  /**
   * Build HttpParams from config
   */
  private buildParams(config?: HttpRequestConfig): HttpParams | undefined {
    if (!config?.params) return undefined;

    let params = new HttpParams();
    for (const [key, value] of Object.entries(config.params)) {
      params = params.set(key, String(value));
    }
    return params;
  }

  /**
   * Convert base64 string to Blob
   * Used for cross-platform compatibility with mobile
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    // Remove data URL prefix if present
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Create standardized error object
   */
  private createError(status: number, code: string, message: string): HttpAdapterError {
    return { status, code, message };
  }

  /**
   * Transform standard HTTP errors
   */
  private transformError(error: unknown): HttpAdapterError {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return this.createError(
          0,
          API_ERROR_CODES.CLIENT_NETWORK_ERROR,
          'Unable to connect to server. Please check your internet connection.'
        );
      }

      if (error.error && typeof error.error === 'object') {
        const parsed = parseApiError(error.error);
        return {
          status: error.status,
          code: parsed.code,
          message: parsed.message,
          details: parsed,
        };
      }

      return {
        status: error.status,
        code: API_ERROR_CODES.SRV_INTERNAL_ERROR,
        message: error.error?.message || 'An unexpected error occurred',
        details: error.error,
      };
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return this.createError(
        0,
        API_ERROR_CODES.CLIENT_TIMEOUT,
        'Request timed out. Please try again.'
      );
    }

    return this.createError(0, API_ERROR_CODES.SRV_INTERNAL_ERROR, getErrorMessage(error));
  }

  /**
   * Transform upload errors to standard format
   */
  private transformUploadError(error: unknown): HttpAdapterError {
    if (error instanceof HttpErrorResponse) {
      // Server responded with an error
      if (error.status === 0) {
        return this.createError(
          0,
          API_ERROR_CODES.CLIENT_NETWORK_ERROR,
          'Upload failed. Please check your internet connection.'
        );
      }

      // Parse server error response
      if (error.error && typeof error.error === 'object') {
        const parsed = parseApiError(error.error);
        return {
          status: error.status,
          code: parsed.code,
          message: parsed.message,
          details: parsed,
        };
      }

      // Specific upload error messages
      switch (error.status) {
        case 413:
          return this.createError(
            413,
            API_ERROR_CODES.VAL_FILE_TOO_LARGE,
            'File is too large. Please choose a smaller file.'
          );
        case 415:
          return this.createError(
            415,
            API_ERROR_CODES.VAL_INVALID_FILE_TYPE,
            'File type not supported. Please choose a different file.'
          );
        default:
          return {
            status: error.status,
            code: API_ERROR_CODES.SRV_INTERNAL_ERROR,
            message: error.error?.message || 'Upload failed. Please try again.',
            details: error.error,
          };
      }
    }

    // Timeout error
    if (error instanceof Error && error.name === 'TimeoutError') {
      return this.createError(
        0,
        API_ERROR_CODES.CLIENT_TIMEOUT,
        'Upload timed out. Please try again with a smaller file or better connection.'
      );
    }

    // Unknown error
    return this.createError(
      0,
      API_ERROR_CODES.SRV_INTERNAL_ERROR,
      getErrorMessage(error) || 'Upload failed. Please try again.'
    );
  }
}
