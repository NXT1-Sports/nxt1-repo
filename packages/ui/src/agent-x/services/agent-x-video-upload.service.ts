/**
 * @fileoverview Agent X Video Upload Service — Firebase Storage Direct Upload
 * @module @nxt1/ui/agent-x
 *
 * Uploads Agent X chat video attachments directly to Firebase Storage via a
 * GCS v4 signed URL provisioned by the backend. The browser PUTs the file
 * directly to GCS (no backend buffering, handles up to 500 MB), then the
 * returned signed read URL is immediately usable by the AI — MediaTransportResolver
 * already treats Firebase Storage URLs as isDirectlyPortable (no Cloudflare
 * re-encoding wait needed).
 *
 * Flow:
 *   1. POST /agent-x/upload/video  → { uploadUrl, readUrl, storagePath }
 *   2. XHR PUT uploadUrl (direct to GCS)  → 200 on completion
 *   3. readUrl is the signed Firebase Storage URL passed to the AI tools
 *
 * Progress is emitted via Observable<VideoUploadProgress> using XHR upload
 * progress events (fetch API does not expose upload progress).
 *
 * NOTE: Cloudflare Stream is still used for highlight POST uploads
 * (FileUploadService). This service handles Agent X chat video only.
 */

import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AGENT_X_ENDPOINTS, AGENT_X_RUNTIME_CONFIG } from '@nxt1/core/ai';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance/performance-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

// ============================================
// TYPES
// ============================================

/** Phases of a Firebase Storage direct video upload. */
export type VideoUploadPhase = 'provisioning' | 'uploading' | 'complete' | 'error';

/** Progress event emitted during a video upload. */
export interface VideoUploadProgress {
  readonly phase: VideoUploadPhase;
  /** Upload percentage 0–100. */
  readonly percent: number;
  /**
   * Firebase Storage signed read URL. Present only when phase === 'complete'.
   * Treated as isDirectlyPortable by MediaTransportResolver — no re-encoding wait.
   */
  readonly streamUrl?: string;
  /** Firebase Storage path (e.g. Users/{uid}/threads/{tid}/media/video/...). */
  readonly storagePath?: string;
  /**
   * @deprecated No longer populated — videos go directly to Firebase Storage.
   * Retained as optional for backward compatibility with the facade's type checks.
   */
  readonly cloudflareVideoId?: string;
  /** Error message. Present only when phase === 'error'. */
  readonly errorMessage?: string;
}

/** Response from the backend video upload provisioning endpoint. */
interface VideoProvisionResponse {
  readonly success: boolean;
  readonly data?: {
    readonly uploadUrl: string;
    readonly readUrl: string;
    readonly storagePath: string;
    readonly expiresAt: string;
  };
  readonly error?: string;
}

interface VideoProxyUploadResponse {
  readonly success: boolean;
  readonly data?: {
    readonly readUrl: string;
    readonly storagePath: string;
    readonly expiresAt: string;
  };
  readonly error?: string;
}

interface VideoUploadOptions {
  readonly threadId?: string | null;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class AgentXVideoUploadService {
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly logger = inject(NxtLoggingService).child('AgentXVideoUploadService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });

  /**
   * Upload a video file directly to Firebase Storage via a GCS signed URL.
   *
   * @param file  The browser File object (video/*).
   * @param authToken  Firebase ID token for the provisioning request.
   * @returns Observable that emits progress events and completes on success or error.
   */
  uploadVideo(
    file: File,
    authToken: string,
    options?: VideoUploadOptions
  ): Observable<VideoUploadProgress> {
    const subject = new Subject<VideoUploadProgress>();
    const threadId = options?.threadId?.trim() ? options.threadId.trim() : null;

    this._doUpload(file, authToken, subject, threadId).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Video upload failed';
      this.logger.error('Unhandled video upload error', err, { name: file.name });
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
    });

    return subject.asObservable();
  }

  // ---------------------------------------------------------------
  // PRIVATE
  // ---------------------------------------------------------------

  private async _doUpload(
    file: File,
    authToken: string,
    subject: Subject<VideoUploadProgress>,
    threadId: string | null
  ): Promise<void> {
    // ── Step 1: Provision signed upload URL from backend ──────────────────
    this.logger.info('Provisioning Firebase Storage video upload URL', {
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
    });
    this.breadcrumb.trackStateChange('agent-x-video-upload:provisioning', {
      name: file.name,
      sizeBytes: file.size,
    });
    subject.next({ phase: 'provisioning', percent: 0 });

    if (this._shouldUseProxyFirst()) {
      subject.next({ phase: 'uploading', percent: 0 });
      this.breadcrumb.trackStateChange('agent-x-video-upload:uploading-proxy', {
        name: file.name,
      });

      try {
        const fallback = await this._uploadViaProxy(file, authToken, threadId);
        this.logger.info('Video uploaded via backend proxy (localhost mode)', {
          name: file.name,
          storagePath: fallback.storagePath,
          expiresAt: fallback.expiresAt,
          hasThreadId: !!threadId,
        });
        this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
          source: 'agent-x-chat',
          mimeType: file.type,
          sizeBytes: file.size,
          storageBackend: 'firebase-proxy',
        });
        subject.next({
          phase: 'complete',
          percent: 100,
          streamUrl: fallback.readUrl,
          storagePath: fallback.storagePath,
        });
        subject.complete();
        return;
      } catch (proxyErr) {
        this.logger.warn(
          'Backend proxy upload failed in localhost mode; falling back to direct signed URL upload',
          {
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type,
            error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
          }
        );
      }
    }

    let uploadUrl: string;
    let readUrl: string;
    let storagePath: string;

    try {
      const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.VIDEO_UPLOAD_PROVISION}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          ...(threadId ? { threadId } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Provisioning failed: ${errText}`);
      }

      const provision = (await response.json()) as VideoProvisionResponse;

      if (!provision.success || !provision.data) {
        throw new Error(provision.error ?? 'Failed to provision video upload URL');
      }

      uploadUrl = provision.data.uploadUrl;
      readUrl = provision.data.readUrl;
      storagePath = provision.data.storagePath;

      this.logger.info('Firebase Storage video upload URL provisioned', {
        storagePath,
        name: file.name,
        hasThreadId: !!threadId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to provision upload URL';
      this.logger.error('Failed to provision video upload URL', err, { name: file.name });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'provisioning',
      });
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
      return;
    }

    // ── Step 2: PUT directly to GCS signed URL ────────────────────────────
    // XHR is used instead of fetch because it exposes upload.onprogress events.
    subject.next({ phase: 'uploading', percent: 0 });
    this.breadcrumb.trackStateChange('agent-x-video-upload:uploading', {
      name: file.name,
      storagePath,
    });

    try {
      await (this.performance?.trace(
        TRACE_NAMES.VIDEO_UPLOAD,
        () =>
          this._xhrPutWithRetry(file, uploadUrl, (percent) => {
            subject.next({ phase: 'uploading', percent });
          }),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent-x-video-upload',
            [ATTRIBUTE_NAMES.CONTENT_TYPE]: file.type,
          },
        }
      ) ??
        this._xhrPutWithRetry(file, uploadUrl, (percent) => {
          subject.next({ phase: 'uploading', percent });
        }));

      this.logger.info('Video uploaded to Firebase Storage', {
        storagePath,
        name: file.name,
        sizeBytes: file.size,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:complete', {
        name: file.name,
        storagePath,
      });
      this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
        source: 'agent-x-chat',
        mimeType: file.type,
        sizeBytes: file.size,
        storageBackend: 'firebase',
      });

      subject.next({
        phase: 'complete',
        percent: 100,
        streamUrl: readUrl,
        storagePath,
      });
      subject.complete();
    } catch (err) {
      this.logger.error('Firebase Storage PUT failed', err, {
        name: file.name,
        storagePath,
      });

      // CORS-safe fallback: proxy upload through backend for local-dev and
      // environments where bucket CORS has not yet been configured.
      try {
        this.logger.warn('Falling back to backend video proxy upload', {
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
        });

        const fallback = await this._uploadViaProxy(file, authToken, threadId);

        this.logger.info('Video uploaded via backend proxy fallback', {
          name: file.name,
          storagePath: fallback.storagePath,
          expiresAt: fallback.expiresAt,
        });

        this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
          source: 'agent-x-chat',
          mimeType: file.type,
          sizeBytes: file.size,
          storageBackend: 'firebase-proxy',
        });

        subject.next({
          phase: 'complete',
          percent: 100,
          streamUrl: fallback.readUrl,
          storagePath: fallback.storagePath,
        });
        subject.complete();
        return;
      } catch (fallbackErr) {
        const msg =
          fallbackErr instanceof Error ? fallbackErr.message : 'Video upload to storage failed';
        this.logger.error(
          'Backend proxy upload fallback failed after direct PUT error',
          fallbackErr,
          {
            name: file.name,
            storagePath,
            sizeBytes: file.size,
            mimeType: file.type,
          }
        );
        this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
          name: file.name,
          phase: 'uploading',
          storagePath,
        });
        subject.next({ phase: 'error', percent: 0, errorMessage: msg });
        subject.complete();
      }
    }
  }

  private async _uploadViaProxy(
    file: File,
    authToken: string,
    threadId: string | null
  ): Promise<{ readUrl: string; storagePath: string; expiresAt: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (threadId) {
      formData.append('threadId', threadId);
    }

    const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.VIDEO_UPLOAD_PROXY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Proxy upload failed: ${errText}`);
    }

    const payload = (await response.json()) as VideoProxyUploadResponse;
    if (!payload.success || !payload.data) {
      throw new Error(payload.error ?? 'Proxy upload failed');
    }

    return payload.data;
  }

  private _shouldUseProxyFirst(): boolean {
    const host = globalThis.location?.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  /**
   * Retry direct PUT once for transient network/browser failures.
   */
  private async _xhrPutWithRetry(
    file: File,
    uploadUrl: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    const maxAttempts = AGENT_X_RUNTIME_CONFIG.videoUpload.directPutMaxAttempts;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this._xhrPut(file, uploadUrl, onProgress);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          this.logger.warn('Retrying direct Firebase video PUT after transient failure', {
            name: file.name,
            attempt,
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          });
          await new Promise((resolve) =>
            setTimeout(resolve, AGENT_X_RUNTIME_CONFIG.videoUpload.directPutRetryDelayMs)
          );
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Video upload failed after retry');
  }

  /**
   * PUT the file directly to the GCS signed URL via XMLHttpRequest.
   * XHR is used (not fetch) because it exposes granular upload progress events.
   */
  private _xhrPut(
    file: File,
    uploadUrl: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = AGENT_X_RUNTIME_CONFIG.videoUpload.directPutTimeoutMs;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(Math.min(percent, 99)); // hold at 99 until complete fires
        }
      });

      xhr.addEventListener('load', () => {
        // GCS returns 200 for signed URL PUTs
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`GCS upload failed: HTTP ${xhr.status} — ${xhr.responseText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during video upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Video upload was aborted'));
      });

      xhr.addEventListener('timeout', () => {
        reject(
          new Error(
            `Video upload timed out after ${Math.round(
              AGENT_X_RUNTIME_CONFIG.videoUpload.directPutTimeoutMs / 1000
            )} seconds`
          )
        );
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }
}
