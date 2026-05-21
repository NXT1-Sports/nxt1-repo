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
  readonly error?: string;
}

interface CloudflareFinalizeResponse {
  readonly success: boolean;
  readonly data?: FinalizedHighlightVideoUpload;
  readonly error?: string;
}

interface VideoUploadOptions {
  readonly threadId?: string | null;
}

interface NativeFirebaseUploadEvent {
  readonly progress?: number;
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
    const threadId = options?.threadId?.trim() ? options.threadId.trim() : null;
    const uploadTask =
      file.size >= AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES
        ? this._doCloudflareTusUpload(file, authToken, subject, threadId)
        : this._doFirebaseUpload(file, authToken, subject, threadId);

    uploadTask.catch((err) => {
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

  private async _doFirebaseUpload(
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
          this._xhrPutWithRetry(file, uploadUrl, storagePath, (percent) => {
            subject.next({ phase: 'uploading', percent });
          }),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent-x-video-upload',
            [ATTRIBUTE_NAMES.CONTENT_TYPE]: file.type,
          },
        }
      ) ??
        this._xhrPutWithRetry(file, uploadUrl, storagePath, (percent) => {
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
      const msg = err instanceof Error ? err.message : 'Video upload to storage failed';
      this.logger.error('Firebase Storage PUT failed', err, {
        name: file.name,
        storagePath,
        sizeBytes: file.size,
        mimeType: file.type,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'uploading',
        storagePath,
      });
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
    }
  }

  private async _doCloudflareTusUpload(
    file: File,
    authToken: string,
    subject: Subject<VideoUploadProgress>,
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
    subject.next({ phase: 'provisioning', percent: 0 });

    let cloudflareVideoId: string | null = null;

    try {
      await (this.performance?.trace(
        TRACE_NAMES.VIDEO_UPLOAD,
        () =>
          this._tusUpload(file, authToken, threadId, {
            onProgress: (percent) => {
              subject.next({ phase: 'uploading', percent });
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
              subject.next({ phase: 'uploading', percent: 0 });
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
            subject.next({ phase: 'uploading', percent });
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
            subject.next({ phase: 'uploading', percent: 0 });
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

      subject.next({
        phase: 'complete',
        percent: 100,
        streamUrl,
        cloudflareVideoId,
        cloudflareStatus: finalized.status,
        readyToStream: finalized.readyToStream,
        ...(finalized.thumbnailUrl ? { thumbnailUrl: finalized.thumbnailUrl } : {}),
      });
      subject.complete();
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
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
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
   *     → `_nativeFirebasePut()` — writes the File to the Capacitor cache
   *       filesystem and uploads via `@capacitor-firebase/storage.uploadFile()`,
   *       calling `storageRef.putFile(from: URL)` on the native Firebase Storage
   *       SDK. This completely bypasses the WKWebView HTTP bridge, which cannot
   *       perform cross-origin PUT requests to `storage.googleapis.com` on iOS
   *       without the `com.apple.runningboard.assertions.webkit` entitlement.
   *
   *       Detection is behavioural, not heuristic: `_nativeFirebasePut()` probes
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
    onProgress: (percent: number) => void
  ): Promise<void> {
    // Try the native Firebase Storage SDK first. On native Capacitor (iOS/Android)
    // the Filesystem probe confirms `file://` URIs and the upload proceeds natively.
    // On web the probe returns a virtual URI → method returns false → fall through.
    const uploadedViaNative = await this._nativeFirebasePut(file, storagePath, onProgress);
    if (uploadedViaNative) return;

    // Native Firebase path did not handle the upload (returned false).
    // Falling through to the XHR path. On web this is expected. On native
    // Capacitor this may indicate plugin/config issues, and large files can
    // fail due to CapacitorHttp bridge size limits.
    this.logger.info(
      '[_xhrPutWithRetry] Using XHR upload fallback after native Firebase path returned false.',
      {
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        storagePath,
      }
    );

    // Web path: XHR with retry for granular progress events.
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
   *   2. Writes the browser `File` object (as a `Blob`) to the Capacitor cache
   *      filesystem. In Capacitor 6+, Blob data is streamed natively without
   *      base64 overhead.
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
    onProgress: (percent: number) => void
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
            sizeBytes: file.size,
          }
        );
      } else {
        this.logger.warn(
          '[_nativeFirebasePut] Failed to import native Capacitor modules; falling back to XHR upload path',
          {
            error: importErrMessage,
            name: file.name,
            sizeBytes: file.size,
          }
        );
      }
      return false;
    }

    const { Filesystem, Directory } = filesystemMod;

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
          sizeBytes: file.size,
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

    // ── Native upload ────────────────────────────────────────────────────────
    // Sanitise the file name for the temp path (strip chars unsafe on iOS/Android).
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFileName = `nxt1_video_${Date.now()}_${safeName}`;

    this.logger.info('Writing video to device cache for native Firebase upload', {
      name: file.name,
      tempFileName,
      sizeBytes: file.size,
      storagePath,
    });
    this.breadcrumb.trackStateChange('agent-x-video-upload:native-firebase-put-start', {
      name: file.name,
      sizeBytes: file.size,
      storagePath,
    });

    // Small initial ping so the UI does not appear frozen during the cache write.
    onProgress(2);

    try {
      // Attempt Blob write first (Capacitor 8 supports native Blob transfer via WKWebView binary channel).
      // If the platform does not support Blob (Capacitor emits an error), fall back to base64.
      // NOTE: base64 for large files will pass ~17 MB through the bridge on iOS which may also
      // fail — but we log the error so production crashes are visible.
      try {
        await Filesystem.writeFile({
          path: tempFileName,
          data: file as Blob,
          directory: Directory.Cache,
        });
      } catch (blobWriteErr) {
        this.logger.warn(
          '[_nativeFirebasePut] Blob writeFile failed; retrying with base64 encoding',
          {
            error: blobWriteErr instanceof Error ? blobWriteErr.message : String(blobWriteErr),
            name: file.name,
            sizeBytes: file.size,
          }
        );
        // Convert Blob → base64 string for older Capacitor / iOS configurations.
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // FileReader.readAsDataURL returns "data:<mime>;base64,<data>" — strip the prefix.
            resolve(result.substring(result.indexOf(',') + 1));
          };
          reader.onerror = () => reject(new Error('FileReader error during base64 conversion'));
          reader.readAsDataURL(file);
        });
        await Filesystem.writeFile({
          path: tempFileName,
          data: base64,
          directory: Directory.Cache,
        });
      }

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

      await new Promise<void>((resolve, reject) => {
        firebaseStorageApi
          .uploadFile(
            {
              path: storagePath,
              uri: fileUri,
              metadata: { contentType: file.type },
            },
            (event: NativeFirebaseUploadEvent | undefined, error: unknown) => {
              if (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
              }
              if (event) {
                if (typeof event.progress === 'number') {
                  // Map 0–1 Firebase progress to our 5–100 % range.
                  const percent = 5 + Math.round(event.progress * 95);
                  onProgress(Math.min(percent, event.completed ? 100 : 99));
                }
                if (event.completed) {
                  resolve();
                }
              }
            }
          )
          .catch((uploadSetupErr: unknown) => {
            // uploadFile() returns a Promise<CallbackId>. If the native plugin rejects
            // this Promise (e.g. plugin unavailable, bridge error) the rejection would
            // otherwise be swallowed inside the Promise executor and cause a hang.
            reject(
              uploadSetupErr instanceof Error
                ? uploadSetupErr
                : new Error(
                    `FirebaseStorage.uploadFile() setup rejected: ${String(uploadSetupErr)}`
                  )
            );
          });
      });

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
