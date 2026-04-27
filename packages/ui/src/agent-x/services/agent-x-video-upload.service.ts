/**
 * @fileoverview Agent X Video Upload Service — Cloudflare Stream TUS
 * @module @nxt1/ui/agent-x
 *
 * Uploads Agent X video attachments directly to Cloudflare Stream via the
 * TUS resumable-upload protocol. The NXT1 backend provisions an upload URL
 * (POST /upload/cloudflare/direct-url) and the browser sends chunks directly
 * to Cloudflare — bypassing Firebase Storage and the 20 MB Agent X limit.
 *
 * Flow:
 *   1. POST /upload/cloudflare/direct-url  → { uploadUrl, cloudflareVideoId }
 *   2. PATCH uploadUrl (5 MB chunks, TUS offsets)  → 204 on completion
 *   3. Resolve stream URL: https://customer-<hash>.cloudflarestream.com/<id>/manifest/video.m3u8
 *
 * Progress is emitted via Observable<VideoUploadProgress> so the UI can show
 * a real-time progress bar.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AGENT_X_ENDPOINTS } from '@nxt1/core/ai';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance/performance-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

// ============================================
// TYPES
// ============================================

/** Phases of a Cloudflare Stream TUS upload. */
export type VideoUploadPhase = 'provisioning' | 'uploading' | 'complete' | 'error';

/** Progress event emitted during a video upload. */
export interface VideoUploadProgress {
  readonly phase: VideoUploadPhase;
  /** Upload percentage 0–100. */
  readonly percent: number;
  /** Cloudflare Stream watch URL. Present only when phase === 'complete'. */
  readonly streamUrl?: string;
  /** Cloudflare video ID. Present only when phase === 'complete'. */
  readonly cloudflareVideoId?: string;
  /** Error message. Present only when phase === 'error'. */
  readonly errorMessage?: string;
}

/** Result returned by the backend when provisioning a TUS upload URL. */
interface ProvisionResponse {
  readonly success: boolean;
  readonly data?: {
    readonly uploadUrl: string;
    readonly cloudflareVideoId: string;
    readonly uploadMethod: string;
    readonly tusResumable: string;
    readonly expiresAt: string;
    readonly maxSize: number;
    readonly maxDurationSeconds: number;
  };
  readonly error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** TUS chunk size: 5 MB. Must be a multiple of 256 KiB per TUS spec. */
const CHUNK_SIZE = 5 * 1024 * 1024;

/** TUS protocol version string. */
const TUS_VERSION = '1.0.0';

// ============================================
// HELPERS
// ============================================

/**
 * Build a TUS `Upload-Metadata` header value using TextEncoder (SSR-safe,
 * handles Unicode filenames correctly).
 * Format: `key base64(value),key base64(value),...`
 */
function buildTusMetadata(fields: Record<string, string>): string {
  const encoder = new TextEncoder();
  return Object.entries(fields)
    .filter(([, v]) => v.length > 0)
    .map(([key, value]) => {
      const bytes = encoder.encode(value);
      const binary = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('');
      return `${key} ${btoa(binary)}`;
    })
    .join(',');
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class AgentXVideoUploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly logger = inject(NxtLoggingService).child('AgentXVideoUploadService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });

  /**
   * Upload a video file to Cloudflare Stream via TUS.
   *
   * @param file  The browser File object (video/*).
   * @param authToken  Firebase ID token for the provisioning request.
   * @returns Observable that emits progress events and completes on success or error.
   */
  uploadVideo(file: File, authToken: string): Observable<VideoUploadProgress> {
    const subject = new Subject<VideoUploadProgress>();

    // Run async work and pipe into the Subject so the caller gets a cold Observable.
    this._doUpload(file, authToken, subject).catch((err) => {
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
    subject: Subject<VideoUploadProgress>
  ): Promise<void> {
    // --- Step 1: Provision upload URL ---
    this.logger.info('Provisioning Cloudflare Stream upload URL', {
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
    let cloudflareVideoId: string;
    let streamUrl: string;

    try {
      // Build the TUS Upload-Metadata header — key base64(value),... pairs
      const uploadMetadata = buildTusMetadata({
        filename: file.name,
        filetype: file.type,
        context: 'agent-x-chat',
      });

      const provision = await firstValueFrom(
        this.http.post<ProvisionResponse>(
          `${this.baseUrl}${AGENT_X_ENDPOINTS.CLOUDFLARE_DIRECT_URL}`,
          null, // No JSON body — all data is in headers
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Tus-Resumable': TUS_VERSION,
              'Upload-Length': String(file.size),
              'Upload-Metadata': uploadMetadata,
            },
          }
        )
      );

      if (!provision.success || !provision.data) {
        throw new Error(provision.error ?? 'Failed to provision Cloudflare upload URL');
      }

      uploadUrl = provision.data.uploadUrl;
      cloudflareVideoId = provision.data.cloudflareVideoId;

      // Derive the Cloudflare Stream watch URL from the video ID.
      // The full HLS/DASH URL is resolved server-side after processing;
      // for Agent X we use the standard iframe-compatible watch URL.
      streamUrl = `https://watch.cloudflarestream.com/${cloudflareVideoId}`;

      this.logger.info('Cloudflare upload URL provisioned', {
        cloudflareVideoId,
        name: file.name,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to provision upload URL';
      this.logger.error('Failed to provision Cloudflare upload URL', err, { name: file.name });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'provisioning',
      });
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
      return;
    }

    // --- Step 2: TUS chunked upload (wrapped in performance trace) ---
    subject.next({ phase: 'uploading', percent: 0 });
    this.breadcrumb.trackStateChange('agent-x-video-upload:uploading', {
      name: file.name,
      cloudflareVideoId,
    });

    try {
      await (this.performance?.trace(
        TRACE_NAMES.VIDEO_UPLOAD,
        () =>
          this._tusUpload(file, uploadUrl, (percent) => {
            subject.next({ phase: 'uploading', percent });
          }),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent-x-video-upload',
            [ATTRIBUTE_NAMES.CONTENT_TYPE]: file.type,
          },
          onSuccess: async () => {
            /* file_size_bytes recorded via analytics */
          },
        }
      ) ??
        this._tusUpload(file, uploadUrl, (percent) => {
          subject.next({ phase: 'uploading', percent });
        }));

      this.logger.info('Video uploaded to Cloudflare Stream', {
        cloudflareVideoId,
        name: file.name,
        sizeBytes: file.size,
      });
      this.breadcrumb.trackStateChange('agent-x-video-upload:complete', {
        name: file.name,
        cloudflareVideoId,
      });
      this.analytics?.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
        source: 'agent-x-chat',
        mimeType: file.type,
        sizeBytes: file.size,
        cloudflareVideoId,
      });

      subject.next({ phase: 'complete', percent: 100, streamUrl, cloudflareVideoId });
      subject.complete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video chunk upload failed';
      this.logger.error('TUS chunk upload failed', err, { name: file.name, cloudflareVideoId });
      this.breadcrumb.trackStateChange('agent-x-video-upload:error', {
        name: file.name,
        phase: 'uploading',
        cloudflareVideoId,
      });
      subject.next({ phase: 'error', percent: 0, errorMessage: msg });
      subject.complete();
    }
  }

  /**
   * Perform the TUS resumable upload in fixed-size chunks.
   * Calls `onProgress(percent)` after each chunk completes.
   */
  private async _tusUpload(
    file: File,
    uploadUrl: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    const totalSize = file.size;
    let offset = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize);
      const chunk = file.slice(offset, end);

      const response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/offset+octet-stream',
          'Content-Length': String(end - offset),
          'Upload-Offset': String(offset),
          'Tus-Resumable': TUS_VERSION,
        },
        body: chunk,
      });

      if (response.status !== 204) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`TUS PATCH failed at offset ${offset}: ${errText}`);
      }

      offset = end;
      const percent = Math.round((offset / totalSize) * 100);
      onProgress(percent);
    }
  }
}
