/**
 * @fileoverview Agent X Video Upload Service — Hybrid Firebase / Cloudflare Upload
 * @module @nxt1/ui/agent-x
 *
 * Uploads Agent X chat video attachments through a size-aware transport:
 * small clips use Firebase Storage signed URLs for instant AI access, while
 * large game film uses Cloudflare Stream TUS for resumable chunked upload.
 *
 * Flow:
 *   1. POST /agent-x/upload/video  → { uploadUrl, readUrl, storagePath }
 *   2. XHR PUT uploadUrl  → 200 on completion
 *   3. readUrl is the signed Firebase/GCS URL passed to the AI tools
 *
 * Progress is emitted via Observable<VideoUploadProgress> using XHR upload
 * progress events (fetch API does not expose upload progress).
 *
 * Large-file flow:
 *   1. POST /upload/cloudflare/direct-url → { uploadUrl, cloudflareVideoId }
 *   2. TUS upload chunks directly to Cloudflare Stream
 *   3. POST /upload/cloudflare/finalize → playback/thumbnail metadata
 */

import { Injectable, inject } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Observable, Subject } from 'rxjs';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import {
  AGENT_X_CLOUDFLARE_UPLOAD_CONTEXT,
  AGENT_X_ENDPOINTS,
  AGENT_X_RUNTIME_CONFIG,
  AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES,
} from '@nxt1/core/ai';
import { type FinalizedHighlightVideoUpload } from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance/performance-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

// ============================================
// TYPES
// ============================================

/** Phases of an Agent X video upload. */
export type VideoUploadPhase = 'provisioning' | 'uploading' | 'complete' | 'error';

/** Progress event emitted during a video upload. */
export interface VideoUploadProgress {
  readonly phase: VideoUploadPhase;
  /** Upload percentage 0–100. */
  readonly percent: number;
  /**
   * Playback/read URL. Firebase returns a signed read URL; Cloudflare returns a
   * watch URL so the media viewer can render the Stream iframe and backend tools
   * can resolve the downloadable MP4 via cloudflareVideoId.
   */
  readonly streamUrl?: string;
  /** Firebase Storage path (e.g. Users/{uid}/threads/{tid}/media/video/...). */
  readonly storagePath?: string;
  /** Cloudflare Stream video ID for large uploads routed through TUS. */
  readonly cloudflareVideoId?: string;
  /** Cloudflare Stream processing state for large uploads. */
  readonly cloudflareStatus?: string;
  /** True only once Cloudflare has generated playable manifests. */
  readonly readyToStream?: boolean;
  /** Optional poster image returned by Cloudflare Stream. */
  readonly thumbnailUrl?: string;
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
  readonly error?:
    | string
    | {
        readonly code?: string;
        readonly message?: string;
      };
}

interface CloudflareFinalizeResponse {
  readonly success: boolean;
  readonly data?: FinalizedHighlightVideoUpload;
  readonly error?: string;
}

type VideoUploadTransport = 'auto' | 'firebase';

interface VideoUploadOptions {
  readonly threadId?: string | null;
  readonly transport?: VideoUploadTransport;
  readonly nativeUri?: string;
  readonly nativeWebPath?: string;
  readonly sizeBytes?: number;
}

interface NativeFirebaseUploadEvent {
  readonly progress?: number;
  readonly bytesTransferred?: number;
  readonly totalBytes?: number;
  readonly completed?: boolean;
}

interface NativeFirebaseStorageApi {
  uploadFile(
    options: {
      readonly path: string;
      readonly uri: string;
      readonly metadata?: { readonly contentType?: string };
    },
    callback: (event?: NativeFirebaseUploadEvent, error?: unknown) => void
  ): Promise<string>;
}

const NATIVE_BASE64_FALLBACK_MAX_BYTES = 32 * 1024 * 1024;
const NATIVE_UPLOAD_MAX_ATTEMPTS = 2;
const NATIVE_UPLOAD_RETRY_DELAY_MS = 900;
const NATIVE_UPLOAD_START_TIMEOUT_MS = 45_000;
const NATIVE_WEB_PATH_FALLBACK_MAX_ATTEMPTS = 3;
const NATIVE_WEB_PATH_FALLBACK_RETRY_DELAY_MS = 700;
const NATIVE_UPLOAD_PROGRESS_FLOOR_PERCENT = 5;
const NATIVE_UPLOAD_PROGRESS_SOFT_CAP_PERCENT = 98;
const NATIVE_UPLOAD_PROGRESS_TICK_MS = 180;
const FAST_UPLOAD_MIN_VISIBLE_MS = 650;

const RETRYABLE_VIDEO_PROVISION_ERROR_CODES = new Set([
  'REQUEST_TIMEOUT',
  'STORAGE_TIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
]);

export function isRetryableVideoProvisionFailure(input: {
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}): boolean {
  const { httpStatus, errorCode, errorMessage } = input;

  if (
    typeof httpStatus === 'number' &&
    (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500)
  ) {
    return true;
  }

  const normalizedErrorCode = errorCode?.trim().toUpperCase();
  if (normalizedErrorCode && RETRYABLE_VIDEO_PROVISION_ERROR_CODES.has(normalizedErrorCode)) {
    return true;
  }

  const normalizedMessage = (errorMessage ?? '').trim().toLowerCase();
  return (
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('temporary') ||
    normalizedMessage.includes('temporarily unavailable') ||
    normalizedMessage.includes('try again') ||
    normalizedMessage.includes('network error')
  );
}

interface VideoProvisionResult {
  readonly uploadUrl: string;
  readonly readUrl: string;
  readonly storagePath: string;
}

export function shouldUseCloudflareUpload(fileSize: number): boolean {
  return fileSize >= AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES;
}

export function stepNativeUploadDisplayPercent(input: {
  readonly displayedPercent: number;
  readonly actualProgress: number | null;
  readonly idleMs: number;
}): number {
  const displayedPercent = Math.max(
    0,
    Math.min(NATIVE_UPLOAD_PROGRESS_SOFT_CAP_PERCENT, Math.round(input.displayedPercent))
  );
  const actualProgress =
    typeof input.actualProgress === 'number' && Number.isFinite(input.actualProgress)
      ? Math.max(0, Math.min(1, input.actualProgress))
      : null;
  const idleMs = Math.max(0, Math.round(input.idleMs));

  const actualTargetPercent =
    actualProgress === null
      ? NATIVE_UPLOAD_PROGRESS_FLOOR_PERCENT
      : Math.round(
          NATIVE_UPLOAD_PROGRESS_FLOOR_PERCENT +
            Math.pow(actualProgress, 0.72) *
              (NATIVE_UPLOAD_PROGRESS_SOFT_CAP_PERCENT - NATIVE_UPLOAD_PROGRESS_FLOOR_PERCENT - 1)
        );

  const baseLeadPercent = actualTargetPercent < 25 ? 10 : actualTargetPercent < 60 ? 7 : 4;
  const idleLeadPercent = Math.min(actualTargetPercent < 60 ? 12 : 6, Math.floor(idleMs / 900));
  const syntheticTargetPercent = Math.min(
    NATIVE_UPLOAD_PROGRESS_SOFT_CAP_PERCENT,
    actualTargetPercent + baseLeadPercent + idleLeadPercent
  );

  if (syntheticTargetPercent <= displayedPercent) {
    return displayedPercent;
  }

  const gap = syntheticTargetPercent - displayedPercent;
  const maxStepPercent = actualTargetPercent < 25 ? 3 : actualTargetPercent < 70 ? 4 : 2;
  const nextStepPercent = Math.min(maxStepPercent, Math.max(1, Math.round(gap * 0.35)));

  return Math.min(syntheticTargetPercent, displayedPercent + nextStepPercent);
}

export function smoothFastUploadPercent(input: {
  readonly previousPercent: number;
  readonly rawPercent: number;
  readonly elapsedMs: number;
}): number {
  const previousPercent = Math.max(0, Math.min(99, Math.round(input.previousPercent)));
  const rawPercent = Math.max(0, Math.min(99, Math.round(input.rawPercent)));
  const elapsedMs = Math.max(0, Math.round(input.elapsedMs));

  const visibleCap =
    elapsedMs < 120
      ? 18
      : elapsedMs < 240
        ? 34
        : elapsedMs < 360
          ? 52
          : elapsedMs < 480
            ? 68
            : elapsedMs < 600
              ? 82
              : elapsedMs < 720
                ? 92
                : 99;

  return Math.max(previousPercent, Math.min(rawPercent, visibleCap));
}

export function resolveFastUploadCompletionDelayMs(elapsedMs: number): number {
  return Math.max(0, FAST_UPLOAD_MIN_VISIBLE_MS - Math.max(0, Math.round(elapsedMs)));
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

  /** Upload a video file using the best transport for its size. */
  uploadVideo(
    file: File,
    authToken: string,
    options?: VideoUploadOptions
  ): Observable<VideoUploadProgress> {
    const subject = new Subject<VideoUploadProgress>();
    const progressEmitter = this._createUploadProgressEmitter(subject);
    const threadId = options?.threadId?.trim() ? options.threadId.trim() : null;
    const nativeUri = options?.nativeUri?.trim() ? options.nativeUri.trim() : undefined;
    const nativeWebPath = options?.nativeWebPath?.trim() ? options.nativeWebPath.trim() : undefined;
    const sizeBytes =
      typeof options?.sizeBytes === 'number' && options.sizeBytes > 0
        ? options.sizeBytes
        : file.size;
    const uploadTask =
      options?.transport === 'firebase'
        ? this._doFirebaseUpload(
            file,
            authToken,
            progressEmitter,
            threadId,
            nativeUri,
            nativeWebPath,
            sizeBytes
          )
        : !nativeUri && shouldUseCloudflareUpload(sizeBytes)
          ? this._doCloudflareTusUpload(file, authToken, progressEmitter, threadId)
          : this._doFirebaseUpload(
              file,
              authToken,
              progressEmitter,
              threadId,
              nativeUri,
              nativeWebPath,
              sizeBytes
            );

    uploadTask.catch((err) => {
      const msg = err instanceof Error ? err.message : 'Video upload failed';
      this.logger.error('Unhandled video upload error', err, { name: file.name });
      progressEmitter.fail(msg);
    });

    return subject.asObservable();
  }

  // ---------------------------------------------------------------
  // PRIVATE
  // ---------------------------------------------------------------

  private _createUploadProgressEmitter(subject: Subject<VideoUploadProgress>): {
    provisioning(): void;
    uploading(percent: number): void;
    complete(payload: Omit<VideoUploadProgress, 'phase' | 'percent'>): Promise<void>;
    fail(message: string): void;
  } {
    let uploadStartedAt: number | null = null;
    let lastUploadPercent = 0;
    let settled = false;

    const emit = (event: VideoUploadProgress): void => {
      if (settled) {
        return;
      }
      subject.next(event);
    };

    return {
      provisioning: (): void => {
        emit({ phase: 'provisioning', percent: 0 });
      },
      uploading: (percent: number): void => {
        if (settled) {
          return;
        }
        if (uploadStartedAt === null) {
          uploadStartedAt = Date.now();
        }
        const displayPercent = smoothFastUploadPercent({
          previousPercent: lastUploadPercent,
          rawPercent: percent,
          elapsedMs: Date.now() - uploadStartedAt,
        });
        if (displayPercent <= lastUploadPercent && percent !== 100) {
          return;
        }
        lastUploadPercent = displayPercent;
        emit({ phase: 'uploading', percent: displayPercent });
      },
      complete: async (payload): Promise<void> => {
        if (settled) {
          return;
        }
        if (uploadStartedAt !== null) {
          const delayMs = resolveFastUploadCompletionDelayMs(Date.now() - uploadStartedAt);
          if (delayMs > 0) {
            const targetPercent = Math.max(lastUploadPercent, Math.min(95, lastUploadPercent + 18));
            if (targetPercent > lastUploadPercent) {
              lastUploadPercent = targetPercent;
              emit({ phase: 'uploading', percent: targetPercent });
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        if (settled) {
          return;
        }
        settled = true;
        subject.next({ phase: 'complete', percent: 100, ...payload });
        subject.complete();
      },
      fail: (message: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        subject.next({ phase: 'error', percent: 0, errorMessage: message });
        subject.complete();
      },
    };
  }

  private async _doFirebaseUpload(
    file: File,
    authToken: string,
    progressEmitter: {
      provisioning(): void;
      uploading(percent: number): void;
      complete(payload: Omit<VideoUploadProgress, 'phase' | 'percent'>): Promise<void>;
      fail(message: string): void;
    },
    threadId: string | null,
    nativeUri: string | undefined,
    nativeWebPath: string | undefined,
    sizeBytes: number
  ): Promise<void> {
    // ── Step 1: Provision signed upload URL from backend ──────────────────
    this.logger.info('Provisioning Firebase Storage video upload URL', {
      name: file.name,
      sizeBytes,
      mimeType: file.type,
    });
    this.breadcrumb.trackStateChange('agent-x-video-upload:provisioning', {
      name: file.name,
      sizeBytes,
    });
    progressEmitter.provisioning();

    let uploadUrl: string;
    let readUrl: string;
    let storagePath: string;

    try {
      const provisioned = await this._provisionVideoUploadWithRetry(file, authToken, threadId, {
        sizeBytes,
        nativeUpload: !!nativeUri,
      });
      uploadUrl = provisioned.uploadUrl;
      readUrl = provisioned.readUrl;
      storagePath = provisioned.storagePath;

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
      progressEmitter.fail(msg);
      return;
    }

    // ── Step 2: PUT directly to GCS signed URL ────────────────────────────
    // XHR is used instead of fetch because it exposes upload.onprogress events.
    progressEmitter.uploading(0);
    this.breadcrumb.trackStateChange('agent-x-video-upload:uploading', {
      name: file.name,
      storagePath,
    });

    try {
      await (this.performance?.trace(
        TRACE_NAMES.VIDEO_UPLOAD,
        () =>
          this._xhrPutWithRetry(
            file,
            uploadUrl,
            storagePath,
            (percent) => {
              progressEmitter.uploading(percent);
            },
            nativeUri,
            nativeWebPath,
            sizeBytes
          ),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent-x-video-upload',
            [ATTRIBUTE_NAMES.CONTENT_TYPE]: file.type,
          },
        }
      ) ??
        this._xhrPutWithRetry(
          file,
          uploadUrl,
          storagePath,
          (percent) => {
            progressEmitter.uploading(percent);
          },
          nativeUri,
          nativeWebPath,
          sizeBytes
        ));

      this.logger.info('Video uploaded to Firebase Storage', {
        storagePath,
        name: file.name,
        sizeBytes,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:complete', {
        name: file.name,
        storagePath,
      });
      this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
        source: 'agent-x-chat',
        mimeType: file.type,
        sizeBytes,
        storageBackend: 'firebase',
      });

      await progressEmitter.complete({
        streamUrl: readUrl,
        storagePath,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video upload to storage failed';
      this.logger.error('Firebase Storage PUT failed', err, {
        name: file.name,
        storagePath,
        sizeBytes,
        mimeType: file.type,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'uploading',
        storagePath,
      });
      progressEmitter.fail(msg);
    }
  }

  private async _provisionVideoUploadWithRetry(
    file: File,
    authToken: string,
    threadId: string | null,
    options: { readonly sizeBytes: number; readonly nativeUpload: boolean }
  ): Promise<VideoProvisionResult> {
    const runtimeVideoUploadConfig =
      AGENT_X_RUNTIME_CONFIG.videoUpload as typeof AGENT_X_RUNTIME_CONFIG.videoUpload & {
        readonly provisionMaxAttempts?: number;
        readonly provisionRetryDelayMs?: number;
      };
    const maxAttempts = runtimeVideoUploadConfig.provisionMaxAttempts ?? 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this._requestVideoProvision(file, authToken, threadId, options);
      } catch (error) {
        lastError = error;
        const retryable = this._isRetryableProvisioningError(error);

        if (!retryable || attempt >= maxAttempts) {
          throw error;
        }

        this.logger.warn(
          'Retrying Firebase Storage video upload provisioning after transient failure',
          {
            name: file.name,
            attempt,
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          }
        );

        await new Promise((resolve) =>
          setTimeout(resolve, (runtimeVideoUploadConfig.provisionRetryDelayMs ?? 900) * attempt)
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to provision Firebase Storage video upload URL');
  }

  private async _requestVideoProvision(
    file: File,
    authToken: string,
    threadId: string | null,
    options: { readonly sizeBytes: number; readonly nativeUpload: boolean }
  ): Promise<VideoProvisionResult> {
    const controller = new AbortController();
    const runtimeVideoUploadConfig =
      AGENT_X_RUNTIME_CONFIG.videoUpload as typeof AGENT_X_RUNTIME_CONFIG.videoUpload & {
        readonly provisionRequestTimeoutMs?: number;
      };
    const timeoutMs = runtimeVideoUploadConfig.provisionRequestTimeoutMs ?? 12_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.VIDEO_UPLOAD_PROVISION}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          fileSize: options.sizeBytes,
          ...(options.nativeUpload ? { nativeUpload: true } : {}),
          ...(threadId ? { threadId } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this._toProvisioningError(
          `Provisioning request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
          true
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      throw this._toProvisioningError(`Provisioning request failed: ${message}`, true);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      const retryable = isRetryableVideoProvisionFailure({
        httpStatus: response.status,
        errorMessage: errText,
      });
      throw this._toProvisioningError(`Provisioning failed: ${errText}`, retryable);
    }

    const provision = (await response.json()) as VideoProvisionResponse;
    if (!provision.success || !provision.data) {
      const details = this._extractProvisionErrorDetails(provision.error);
      const retryable = isRetryableVideoProvisionFailure({
        httpStatus: response.status,
        errorCode: details.code,
        errorMessage: details.message,
      });
      throw this._toProvisioningError(details.message, retryable);
    }

    return {
      uploadUrl: provision.data.uploadUrl,
      readUrl: provision.data.readUrl,
      storagePath: provision.data.storagePath,
    };
  }

  private _toProvisioningError(message: string, retryable: boolean): Error {
    const error = new Error(message) as Error & { retryable?: boolean };
    error.retryable = retryable;
    return error;
  }

  private _isRetryableProvisioningError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const typed = error as { retryable?: unknown; message?: unknown };
      if (typed.retryable === true) {
        return true;
      }
      if (typeof typed.message === 'string') {
        return isRetryableVideoProvisionFailure({ errorMessage: typed.message });
      }
    }
    return false;
  }

  private _extractProvisionErrorDetails(error: VideoProvisionResponse['error']): {
    readonly code?: string;
    readonly message: string;
  } {
    if (!error) {
      return { message: 'Failed to provision video upload URL' };
    }

    if (typeof error === 'string') {
      return { message: error };
    }

    const code = error.code?.trim();
    const message = error.message?.trim();
    if (code && message) {
      return { code, message: `${code}: ${message}` };
    }
    if (message) {
      return { code, message };
    }
    if (code) {
      return { code, message: code };
    }

    return { message: 'Failed to provision video upload URL' };
  }

  private async _doCloudflareTusUpload(
    file: File,
    authToken: string,
    progressEmitter: {
      provisioning(): void;
      uploading(percent: number): void;
      complete(payload: Omit<VideoUploadProgress, 'phase' | 'percent'>): Promise<void>;
      fail(message: string): void;
    },
    threadId: string | null
  ): Promise<void> {
    this.logger.info('Provisioning Cloudflare Stream TUS upload for Agent X video', {
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      thresholdBytes: AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES,
    });
    this.breadcrumb.trackStateChange('agent-x-video-upload:cloudflare-provisioning', {
      name: file.name,
      sizeBytes: file.size,
    });
    progressEmitter.provisioning();

    let cloudflareVideoId: string | null = null;

    try {
      await (this.performance?.trace(
        TRACE_NAMES.VIDEO_UPLOAD,
        () =>
          this._tusUpload(file, authToken, threadId, {
            onProgress: (percent) => {
              progressEmitter.uploading(percent);
            },
            onProvisioned: (nextCloudflareVideoId) => {
              cloudflareVideoId = nextCloudflareVideoId;
              this.logger.info('Cloudflare Stream TUS upload provisioned', {
                cloudflareVideoId: nextCloudflareVideoId,
                name: file.name,
                hasThreadId: !!threadId,
              });
              this.breadcrumb.trackStateChange('agent-x-video-upload:cloudflare-uploading', {
                name: file.name,
                cloudflareVideoId: nextCloudflareVideoId,
              });
              progressEmitter.uploading(0);
            },
          }),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent-x-video-upload',
            [ATTRIBUTE_NAMES.CONTENT_TYPE]: file.type,
          },
        }
      ) ??
        this._tusUpload(file, authToken, threadId, {
          onProgress: (percent) => {
            progressEmitter.uploading(percent);
          },
          onProvisioned: (nextCloudflareVideoId) => {
            cloudflareVideoId = nextCloudflareVideoId;
            this.logger.info('Cloudflare Stream TUS upload provisioned', {
              cloudflareVideoId: nextCloudflareVideoId,
              name: file.name,
              hasThreadId: !!threadId,
            });
            this.breadcrumb.trackStateChange('agent-x-video-upload:cloudflare-uploading', {
              name: file.name,
              cloudflareVideoId: nextCloudflareVideoId,
            });
            progressEmitter.uploading(0);
          },
        }));

      if (!cloudflareVideoId) {
        throw new Error('Cloudflare upload did not return a video ID');
      }

      const finalized = await this._finalizeCloudflareUpload(cloudflareVideoId, authToken);
      const streamUrl = `https://watch.cloudflarestream.com/${cloudflareVideoId}`;

      this.logger.info('Video uploaded to Cloudflare Stream for Agent X', {
        cloudflareVideoId,
        name: file.name,
        sizeBytes: file.size,
        readyToStream: finalized.readyToStream,
        status: finalized.status,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:cloudflare-complete', {
        name: file.name,
        cloudflareVideoId,
        readyToStream: finalized.readyToStream,
      });
      this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
        source: 'agent-x-chat',
        mimeType: file.type,
        sizeBytes: file.size,
        storageBackend: 'cloudflare',
      });

      await progressEmitter.complete({
        streamUrl,
        cloudflareVideoId,
        cloudflareStatus: finalized.status,
        readyToStream: finalized.readyToStream,
        ...(finalized.thumbnailUrl ? { thumbnailUrl: finalized.thumbnailUrl } : {}),
      });
    } catch (err) {
      const msg = this._extractTusErrorMessage(err);
      this.logger.error('Cloudflare Stream upload failed', err, {
        name: file.name,
        ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
        sizeBytes: file.size,
        mimeType: file.type,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'cloudflare-uploading',
        ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
      });
      progressEmitter.fail(msg);
    }
  }

  private async _tusUpload(
    file: File,
    authToken: string,
    threadId: string | null | undefined,
    options: {
      readonly onProgress: (percent: number) => void;
      readonly onProvisioned: (cloudflareVideoId: string) => void;
    }
  ): Promise<void> {
    const { Upload } = await import('tus-js-client');
    const endpoint = `${this.baseUrl}${AGENT_X_ENDPOINTS.CLOUDFLARE_DIRECT_URL}`;
    const backendOrigin = this._getOrigin(endpoint);

    await new Promise<void>((resolve, reject) => {
      let provisioned = false;
      const upload = new Upload(file, {
        endpoint,
        metadata: {
          filename: file.name,
          filetype: file.type,
          context: AGENT_X_CLOUDFLARE_UPLOAD_CONTEXT,
          ...(threadId ? { threadId } : {}),
        },
        storeFingerprintForResuming: false,
        retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
        chunkSize: 8 * 1024 * 1024,
        onBeforeRequest: (req) => {
          if (this._getOrigin(req.getURL()) === backendOrigin) {
            req.setHeader('Authorization', `Bearer ${authToken}`);
          }
        },
        onAfterResponse: (req, res) => {
          if (req.getMethod() !== 'POST' || provisioned) return;

          const headerVideoId = res.getHeader('Stream-Media-Id')?.trim();
          const urlVideoId = this._extractCloudflareVideoIdFromUrl(res.getHeader('Location'));
          const cloudflareVideoId = headerVideoId || urlVideoId;

          if (!cloudflareVideoId) {
            throw new Error('Cloudflare upload endpoint did not return a video ID');
          }

          provisioned = true;
          options.onProvisioned(cloudflareVideoId);
        },
        onError: (error) => reject(error),
        onProgress: (bytesUploaded, bytesTotal) => {
          const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          options.onProgress(Math.min(percent, 99));
        },
        onSuccess: () => {
          options.onProgress(100);
          resolve();
        },
      });

      upload.start();
    });
  }

  private _getOrigin(url: string): string | null {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  private _extractCloudflareVideoIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const candidate = segments.length > 0 ? segments[segments.length - 1]?.trim() : undefined;
      return candidate || null;
    } catch {
      return null;
    }
  }

  private _extractTusErrorMessage(err: unknown): string {
    if (!err || typeof err !== 'object') {
      return 'Cloudflare video upload failed';
    }

    const tusResponse = (
      err as {
        readonly originalResponse?: { getBody?: () => string; getStatus?: () => number };
      }
    ).originalResponse;

    const responseBody = tusResponse?.getBody?.();
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody) as { error?: string };
        if (parsed.error?.trim()) {
          return parsed.error.trim();
        }
      } catch {
        if (responseBody.trim()) {
          return responseBody.trim();
        }
      }
    }

    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }

    const status = tusResponse?.getStatus?.();
    if (typeof status === 'number') {
      return `Cloudflare video upload failed with status ${status}`;
    }

    return 'Cloudflare video upload failed';
  }

  private async _finalizeCloudflareUpload(
    cloudflareVideoId: string,
    authToken: string
  ): Promise<FinalizedHighlightVideoUpload> {
    const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.CLOUDFLARE_FINALIZE}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cloudflareVideoId }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Cloudflare finalize failed: ${errText}`);
    }

    const finalized = (await response.json()) as CloudflareFinalizeResponse;
    if (!finalized.success || !finalized.data) {
      throw new Error(finalized.error ?? 'Failed to finalize Cloudflare video upload');
    }

    return finalized.data;
  }
  /**
   * PUT the video to Firebase Storage, selecting the upload channel at runtime.
   *
   *   Native Capacitor (iOS / Android)
   *     → `_nativeIosSignedPut()` — uploads to the backend-issued signed URL
   *       through CapacitorHttp first. This bypasses Firebase Storage client
   *       rules/auth state, which can drift from the app's API auth token.
   *
   *       If that cannot handle the selected media, `_nativeFirebasePut()` probes
   *       the Capacitor Filesystem plugin to check whether it returns a native
   *       `file://` URI. On web the plugin returns a virtual URI and the method
   *       returns `false`, falling through to the XHR path below. This approach
   *       is immune to Angular build optimisations and bridge initialisation races
   *       that defeat `Capacitor.isNativePlatform()` and URL-scheme heuristics.
   *
   *   Desktop web
   *     → `_xhrPut()` for granular upload-progress events, with retry.
   */
  private async _xhrPutWithRetry(
    file: File,
    uploadUrl: string,
    storagePath: string,
    onProgress: (percent: number) => void,
    nativeUri: string | undefined,
    nativeWebPath: string | undefined,
    sizeBytes: number
  ): Promise<void> {
    let nativeSignedPutFile: File | null = file.size > 0 ? file : null;
    let nativeSignedPutRawBase64: string | null = null;

    if (!nativeSignedPutFile) {
      if (nativeUri) {
        nativeSignedPutRawBase64 = await this._tryReadNativeUriRawBase64(
          nativeUri,
          file.name,
          file.type,
          sizeBytes
        );
      }

      if (!nativeSignedPutRawBase64) {
        nativeSignedPutFile = await this._tryCreateNativeWebPathFallbackFile(
          file,
          nativeWebPath,
          sizeBytes
        );
      }
    }

    // Prefer the backend-issued signed URL on iOS. It avoids Firebase Storage
    // client auth/rules entirely, eliminating "Missing or insufficient permissions"
    // from the primary upload path.
    if (nativeSignedPutFile || nativeSignedPutRawBase64) {
      try {
        const uploadedViaNativeSignedPut = nativeSignedPutRawBase64
          ? await this._nativeIosSignedPutRawBase64(
              nativeSignedPutRawBase64,
              uploadUrl,
              onProgress,
              sizeBytes,
              file.type || 'video/mp4',
              file.name,
              'native-uri'
            )
          : await this._nativeIosSignedPut(nativeSignedPutFile!, uploadUrl, onProgress, sizeBytes);
        if (uploadedViaNativeSignedPut) return;
      } catch (signedPutErr) {
        this.logger.warn('Native signed PUT failed; falling back to Firebase/native web paths', {
          name: file.name,
          sizeBytes,
          mimeType: file.type,
          storagePath,
          error: signedPutErr instanceof Error ? signedPutErr.message : String(signedPutErr),
        });
        onProgress(0);
      }
    }

    // Fallback: try the native Firebase Storage SDK. This keeps Android/native
    // URI support available when a local File cannot be materialized.
    const uploadedViaNative = await this._nativeFirebasePut(
      file,
      storagePath,
      onProgress,
      nativeUri,
      nativeWebPath,
      sizeBytes
    );
    if (uploadedViaNative) return;

    if (nativeUri && file.size === 0) {
      throw new Error(
        'Native video upload failed before fallback; selected media is only available through the device URI. Please retry the upload.'
      );
    }

    if (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'ios' &&
      !nativeSignedPutFile &&
      !nativeSignedPutRawBase64
    ) {
      throw new Error(
        'iOS video upload could not use either native Firebase Storage or native signed PUT'
      );
    }

    // Native Firebase path did not handle the upload (returned false).
    // Falling through to the XHR path. On web this is expected. On native
    // Capacitor this may indicate plugin/config issues, and large files can
    // fail due to CapacitorHttp bridge size limits.
    this.logger.info(
      '[_xhrPutWithRetry] Using XHR upload fallback after native Firebase path returned false.',
      {
        name: file.name,
        sizeBytes,
        mimeType: file.type,
        storagePath,
      }
    );

    // Web path: XHR with retry for granular progress events.
    const xhrFile = nativeSignedPutFile ?? file;
    const maxAttempts = AGENT_X_RUNTIME_CONFIG.videoUpload.directPutMaxAttempts;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this._xhrPut(xhrFile, uploadUrl, onProgress);
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

  private async _nativeIosSignedPut(
    file: File,
    uploadUrl: string,
    onProgress: (percent: number) => void,
    sizeBytes: number
  ): Promise<boolean> {
    if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
      return false;
    }

    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return false;
    }

    this.logger.info('Using native iOS signed PUT path for Agent X video upload', {
      name: file.name,
      sizeBytes,
      mimeType: file.type,
    });

    onProgress(5);
    const rawBase64 = await this._fileToRawBase64(file);

    return this._nativeIosSignedPutRawBase64(
      rawBase64,
      uploadUrl,
      onProgress,
      sizeBytes,
      file.type || 'video/mp4',
      file.name,
      'file'
    );
  }

  private async _nativeIosSignedPutRawBase64(
    rawBase64: string,
    uploadUrl: string,
    onProgress: (percent: number) => void,
    sizeBytes: number,
    mimeType: string,
    fileName: string,
    source: 'file' | 'native-uri'
  ): Promise<boolean> {
    if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
      return false;
    }

    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return false;
    }

    if (source === 'native-uri') {
      this.logger.info(
        'Using native iOS signed PUT path for Agent X video upload from native URI',
        {
          name: fileName,
          sizeBytes,
          mimeType,
        }
      );
    }

    onProgress(20);

    const response = await CapacitorHttp.request({
      method: 'PUT',
      url: uploadUrl,
      headers: { 'Content-Type': mimeType || 'video/mp4' },
      data: rawBase64,
      dataType: 'file',
      readTimeout: AGENT_X_RUNTIME_CONFIG.videoUpload.directPutTimeoutMs,
      connectTimeout: 30_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Native iOS signed PUT failed with status ${response.status}`);
    }

    onProgress(100);
    return true;
  }

  /**
   * Upload a video file to Firebase Storage via the native Capacitor SDK.
   *
   * Avoids the WKWebView HTTP bridge entirely. iOS WKWebView cannot perform
   * cross-origin PUT requests to `storage.googleapis.com` without the
   * `com.apple.runningboard.assertions.webkit` entitlement, which third-party
   * apps do not hold. Instead this method:
   *
   *   1. Probes `Filesystem.getUri()` to confirm we are on native Capacitor.
   *      On native (iOS/Android), the Capacitor Filesystem plugin returns a
   *      `file://` URI. On web it returns a virtual URI. This behavioural check
   *      is the sole platform discriminator — it cannot be defeated by Angular
   *      build optimisations or bridge initialisation timing races.
   *
   *   2. Writes the browser `File` object to the Capacitor cache filesystem as
   *      base64. Native Capacitor Filesystem only accepts Blob data on web.
   *
   *   3. Uploads from the local `file://` URI via
   *      `@capacitor-firebase/storage.uploadFile()`, which calls
   *      `storageRef.putFile(from: URL)` — the native Firebase Storage SDK
   *      path that handles large files correctly via native stream I/O.
   *
   *   4. Cleans up the temp cache file after success or failure.
   *
   * Both packages are dynamically imported to keep the web app bundle clean.
   *
   * @returns `true` if the upload was handled by the native SDK;
   *          `false` if not running on native Capacitor (web / SSR).
   */
  private async _nativeFirebasePut(
    file: File,
    storagePath: string,
    onProgress: (percent: number) => void,
    nativeUri: string | undefined,
    nativeWebPath: string | undefined,
    sizeBytes: number
  ): Promise<boolean> {
    // Dynamic imports — present on native Capacitor (hoisted to root node_modules).
    let filesystemMod: typeof import('@capacitor/filesystem');
    let firebaseStorageApi: NativeFirebaseStorageApi;

    try {
      // String-literal imports are required for esbuild (Angular's build tool) to
      // include the modules in the app bundle. A variable-based import() is NOT
      // statically analysable by esbuild and the module would be absent at runtime,
      // causing the native upload path to silently fail and fall through to XHR.
      const [filesystemLoadedMod, firebaseStorageLoadedMod] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor-firebase/storage'),
      ]);
      filesystemMod = filesystemLoadedMod;

      const maybeApi = (firebaseStorageLoadedMod as { FirebaseStorage?: NativeFirebaseStorageApi })
        .FirebaseStorage;
      if (!maybeApi || typeof maybeApi.uploadFile !== 'function') {
        throw new Error('FirebaseStorage API unavailable');
      }
      firebaseStorageApi = maybeApi;
    } catch (importErr) {
      const importErrMessage = importErr instanceof Error ? importErr.message : String(importErr);
      const isExpectedWebFallback =
        /@capacitor-firebase\/storage/i.test(importErrMessage) ||
        /Failed to resolve module specifier/i.test(importErrMessage) ||
        /Cannot find module/i.test(importErrMessage) ||
        /FirebaseStorage API unavailable/i.test(importErrMessage);

      if (isExpectedWebFallback) {
        this.logger.info(
          '[_nativeFirebasePut] Native Capacitor Firebase module not available in web build; using XHR upload path',
          {
            error: importErrMessage,
            name: file.name,
            sizeBytes,
          }
        );
      } else {
        this.logger.warn(
          '[_nativeFirebasePut] Failed to import native Capacitor modules; falling back to XHR upload path',
          {
            error: importErrMessage,
            name: file.name,
            sizeBytes,
          }
        );
      }
      return false;
    }

    const { Filesystem, Directory } = filesystemMod;

    if (nativeUri && Capacitor.isNativePlatform()) {
      const uploadUri = this._normalizeNativeFileUri(nativeUri);
      try {
        this.logger.info('Uploading native media URI via Firebase Storage SDK', {
          name: file.name,
          nativeUri: uploadUri,
          sizeBytes,
          storagePath,
        });
        this.breadcrumb.trackStateChange('agent-x-video-upload:native-uri-put-start', {
          name: file.name,
          sizeBytes,
          storagePath,
        });
        onProgress(2);
        await this._uploadNativeFirebaseUriWithRetry(
          firebaseStorageApi,
          storagePath,
          uploadUri,
          file.type,
          onProgress
        );
        return true;
      } catch (nativeUriErr) {
        this.logger.warn('Native media URI upload failed; falling back to cache-file upload', {
          name: file.name,
          nativeUri: uploadUri,
          sizeBytes,
          storagePath,
          error: nativeUriErr instanceof Error ? nativeUriErr.message : String(nativeUriErr),
        });
        this.breadcrumb.trackStateChange('agent-x-video-upload:native-uri-put-fallback', {
          name: file.name,
          sizeBytes,
          storagePath,
        });
        onProgress(0);
        if (file.size === 0) {
          const webPathFallbackFile = await this._tryCreateNativeWebPathFallbackFile(
            file,
            nativeWebPath,
            sizeBytes
          );
          if (webPathFallbackFile) {
            this.logger.info('Retrying native Firebase upload from WebView-readable media path', {
              name: file.name,
              sizeBytes,
              storagePath,
            });
            return this._nativeFirebasePut(
              webPathFallbackFile,
              storagePath,
              onProgress,
              undefined,
              undefined,
              sizeBytes
            );
          }
          return false;
        }
        if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
          return false;
        }
      }
    }

    // ── Native environment probe ─────────────────────────────────────────────
    // On native Capacitor, `Filesystem.getUri()` returns a `file://` URI
    // (e.g. `file:///var/mobile/...` on iOS, `file:///data/user/0/...` on Android).
    // On web, the Filesystem plugin returns a virtual URI
    // (e.g. `_capacitor_file_://localhost/...`). Checking this before writing
    // the large file prevents filling browser storage on web.
    let cacheProbeUri: string;
    try {
      const probe = await Filesystem.getUri({ path: '_nxt1_probe', directory: Directory.Cache });
      cacheProbeUri = probe.uri;
    } catch (probeErr) {
      // Plugin not functional in this environment (SSR or stripped build).
      this.logger.warn(
        '[_nativeFirebasePut] Filesystem.getUri probe threw; native Capacitor environment not detected',
        {
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
          name: file.name,
          sizeBytes,
        }
      );
      return false;
    }

    if (!cacheProbeUri.startsWith('file://')) {
      this.logger.info('Filesystem probe returned non-native URI; using web XHR upload path', {
        name: file.name,
        cacheProbeUri,
      });
      return false;
    }

    if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
      this.logger.warn('Skipping native cache-file upload fallback for large video', {
        name: file.name,
        sizeBytes,
        maxBytes: NATIVE_BASE64_FALLBACK_MAX_BYTES,
        storagePath,
      });
      return false;
    }

    // ── Native upload ────────────────────────────────────────────────────────
    // Sanitise the file name for the temp path (strip chars unsafe on iOS/Android).
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFileName = `nxt1_video_${Date.now()}_${safeName}`;

    this.logger.info('Writing video to device cache for native Firebase upload', {
      name: file.name,
      tempFileName,
      sizeBytes,
      storagePath,
    });
    this.breadcrumb.trackStateChange('agent-x-video-upload:native-firebase-put-start', {
      name: file.name,
      sizeBytes,
      storagePath,
    });

    // Small initial ping so the UI does not appear frozen during the cache write.
    onProgress(2);

    try {
      await Filesystem.writeFile({
        path: tempFileName,
        data: await this._fileToRawBase64(file),
        directory: Directory.Cache,
      });

      const { uri: fileUri } = await Filesystem.getUri({
        path: tempFileName,
        directory: Directory.Cache,
      });

      this.logger.info('Video written to cache; uploading via native Firebase Storage SDK', {
        name: file.name,
        fileUri,
        storagePath,
      });

      // 5 % reserved for the cache-write phase; 5–100 % for the upload itself.
      onProgress(5);

      await this._uploadNativeFirebaseUriWithRetry(
        firebaseStorageApi,
        storagePath,
        fileUri,
        file.type,
        onProgress
      );

      return true;
    } finally {
      // Best-effort cleanup of the temporary cache file.
      await Filesystem.deleteFile({
        path: tempFileName,
        directory: Directory.Cache,
      }).catch((cleanupErr) => {
        this.logger.warn('Failed to clean up temp video cache file', {
          tempFileName,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      });
    }
  }

  private async _uploadNativeFirebaseUriWithRetry(
    firebaseStorageApi: NativeFirebaseStorageApi,
    storagePath: string,
    fileUri: string,
    contentType: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    let lastError: unknown = null;
    const maxAttempts = Capacitor.isNativePlatform() ? NATIVE_UPLOAD_MAX_ATTEMPTS : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this._uploadNativeFirebaseUriOnce(
          firebaseStorageApi,
          storagePath,
          fileUri,
          contentType,
          onProgress
        );
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }

        this.logger.warn(
          'Retrying native Firebase Storage video upload after first-attempt failure',
          {
            storagePath,
            attempt,
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        onProgress(0);
        await new Promise((resolve) => setTimeout(resolve, NATIVE_UPLOAD_RETRY_DELAY_MS * attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Native Firebase video upload failed');
  }

  private _uploadNativeFirebaseUriOnce(
    firebaseStorageApi: NativeFirebaseStorageApi,
    storagePath: string,
    fileUri: string,
    contentType: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let sawNativeEvent = false;
      const progressSmoother = this._createNativeUploadProgressSmoother(onProgress);
      const startupTimer = setTimeout(() => {
        if (!sawNativeEvent && !settled) {
          settled = true;
          progressSmoother.destroy();
          reject(new Error('Native Firebase upload did not start'));
        }
      }, NATIVE_UPLOAD_START_TIMEOUT_MS);
      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(startupTimer);
        progressSmoother.destroy();
        callback();
      };

      firebaseStorageApi
        .uploadFile(
          {
            path: storagePath,
            uri: fileUri,
            metadata: { contentType },
          },
          (event: NativeFirebaseUploadEvent | undefined, error: unknown) => {
            if (error) {
              settle(() => reject(error instanceof Error ? error : new Error(String(error))));
              return;
            }
            if (event) {
              sawNativeEvent = true;
              const progress = this._resolveNativeUploadProgress(event);
              if (typeof progress === 'number') {
                progressSmoother.report(progress);
              }
              if (event.completed) {
                settle(() => resolve());
              }
            }
          }
        )
        .catch((uploadSetupErr: unknown) => {
          settle(() =>
            reject(
              uploadSetupErr instanceof Error
                ? uploadSetupErr
                : new Error(
                    `FirebaseStorage.uploadFile() setup rejected: ${String(uploadSetupErr)}`
                  )
            )
          );
        });
    });
  }

  private _createNativeUploadProgressSmoother(onProgress: (percent: number) => void): {
    report(actualProgress: number): void;
    destroy(): void;
  } {
    let displayedPercent = NATIVE_UPLOAD_PROGRESS_FLOOR_PERCENT;
    let actualProgress: number | null = null;
    let lastActualUpdateAt = Date.now();
    let lastEmittedPercent = -1;

    const emitPercent = (percent: number): void => {
      const normalizedPercent = Math.max(
        0,
        Math.min(NATIVE_UPLOAD_PROGRESS_SOFT_CAP_PERCENT, Math.round(percent))
      );
      if (normalizedPercent <= lastEmittedPercent) {
        return;
      }
      lastEmittedPercent = normalizedPercent;
      onProgress(normalizedPercent);
    };

    emitPercent(displayedPercent);

    const tick = (): void => {
      const nextPercent = stepNativeUploadDisplayPercent({
        displayedPercent,
        actualProgress,
        idleMs: Date.now() - lastActualUpdateAt,
      });
      if (nextPercent <= displayedPercent) {
        return;
      }
      displayedPercent = nextPercent;
      emitPercent(displayedPercent);
    };

    const interval = setInterval(tick, NATIVE_UPLOAD_PROGRESS_TICK_MS);

    return {
      report(nextActualProgress: number): void {
        actualProgress = Math.max(0, Math.min(1, nextActualProgress));
        lastActualUpdateAt = Date.now();
        tick();
      },
      destroy(): void {
        clearInterval(interval);
      },
    };
  }

  private _resolveNativeUploadProgress(event: NativeFirebaseUploadEvent): number | null {
    if (
      typeof event.bytesTransferred === 'number' &&
      typeof event.totalBytes === 'number' &&
      Number.isFinite(event.bytesTransferred) &&
      Number.isFinite(event.totalBytes) &&
      event.totalBytes > 0
    ) {
      return Math.max(0, Math.min(1, event.bytesTransferred / event.totalBytes));
    }

    return typeof event.progress === 'number' && Number.isFinite(event.progress)
      ? Math.max(0, Math.min(1, event.progress))
      : null;
  }

  private async _tryCreateNativeWebPathFallbackFile(
    originalFile: File,
    nativeWebPath: string | undefined,
    sizeBytes: number
  ): Promise<File | null> {
    if (!nativeWebPath) {
      return null;
    }
    if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
      this.logger.warn('Skipping native webPath fallback for large video', {
        name: originalFile.name,
        sizeBytes,
        maxBytes: NATIVE_BASE64_FALLBACK_MAX_BYTES,
      });
      return null;
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= NATIVE_WEB_PATH_FALLBACK_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(nativeWebPath);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (blob.size <= 0) {
          throw new Error('webPath returned an empty video blob');
        }
        return new File([blob], originalFile.name, {
          type: originalFile.type || blob.type || 'video/mp4',
          lastModified: originalFile.lastModified,
        });
      } catch (error) {
        lastError = error;
        if (attempt < NATIVE_WEB_PATH_FALLBACK_MAX_ATTEMPTS) {
          await new Promise((resolve) =>
            setTimeout(resolve, NATIVE_WEB_PATH_FALLBACK_RETRY_DELAY_MS * attempt)
          );
        }
      }
    }

    this.logger.warn('Native webPath fallback file creation failed', {
      name: originalFile.name,
      sizeBytes,
      attempts: NATIVE_WEB_PATH_FALLBACK_MAX_ATTEMPTS,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return null;
  }

  private async _tryReadNativeUriRawBase64(
    nativeUri: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<string | null> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return null;
    }
    if (sizeBytes > NATIVE_BASE64_FALLBACK_MAX_BYTES) {
      this.logger.warn('Skipping native URI signed PUT fallback for large video', {
        name: fileName,
        sizeBytes,
        maxBytes: NATIVE_BASE64_FALLBACK_MAX_BYTES,
      });
      return null;
    }

    try {
      const { Filesystem } = await import('@capacitor/filesystem');
      const normalizedUri = this._normalizeNativeFileUri(nativeUri);
      const result = await Filesystem.readFile({ path: normalizedUri });
      const data = result.data;
      if (typeof data !== 'string' || data.trim().length === 0) {
        throw new Error('Filesystem.readFile returned empty data');
      }

      return data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
    } catch (error) {
      this.logger.warn('Native URI base64 fallback preparation failed', {
        name: fileName,
        sizeBytes,
        mimeType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private _normalizeNativeFileUri(uri: string): string {
    const trimmed = uri.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return encodeURI(trimmed);
    }
    if (trimmed.startsWith('/')) {
      return encodeURI(`file://${trimmed}`);
    }
    return trimmed;
  }

  private _fileToRawBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to convert file to base64'));
          return;
        }
        const separatorIndex = result.indexOf(',');
        resolve(separatorIndex >= 0 ? result.substring(separatorIndex + 1) : result);
      };
      reader.onerror = () => reject(new Error('FileReader error during base64 conversion'));
      reader.readAsDataURL(file);
    });
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
      // Bypass the Angular NGSW service worker for this request.
      // The SW intercepts ALL fetch/XHR events (including PUT) and proxies them
      // via its own scope.fetch() passthrough. For large video uploads that take
      // several minutes, Chrome may kill the idle SW mid-upload, aborting the
      // in-flight passthrough and returning a synthetic 504 Gateway Timeout.
      // The `ngsw-bypass` header tells the SW to skip this request entirely and
      // let the browser send it directly to the network.
      // GCS signed URLs only sign 'content-type' and 'host' headers, so adding
      // this extra header does NOT invalidate the signature.
      xhr.setRequestHeader('ngsw-bypass', '1');
      xhr.send(file);
    });
  }
}
