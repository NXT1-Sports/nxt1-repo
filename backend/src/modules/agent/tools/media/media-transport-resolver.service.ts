import { logger } from '../../../../utils/logger.js';
import { CloudflareMcpBridgeService } from '../integrations/cloudflare-stream/cloudflare-mcp-bridge.service.js';
import { MediaStagingService } from './media-staging.service.js';
import type { ToolExecutionContext } from '../base.tool.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';

const DIRECT_MP4_PATTERN = /\.mp4(?:$|[?#])/i;
/** Matches any Firebase / GCS storage URL (signed or unsigned). */
const FIREBASE_STORAGE_PATTERN =
  /^https?:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i;
/** A URL is only directly portable if it carries an actual GCS signature or Firebase download token. */
const FIREBASE_SIGNED_PARAMS = new Set(['X-Goog-Signature', 'token']);
const CLOUDFLARE_HOST_PATTERN =
  /(watch\.cloudflarestream\.com|\.cloudflarestream\.com|videodelivery\.net)$/i;

export type ResolvedProcessingSource =
  | 'direct'
  | 'cloudflare_download'
  | 'firebase_staged'
  | 'unchanged';

export interface ResolveProcessingUrlInput {
  readonly sourceUrl: string;
  readonly cloudflareVideoId?: string;
  readonly fallbackToFirebaseStaging?: boolean;
  readonly stageMediaKind?: 'video' | 'audio' | 'image' | 'document' | 'other';
  readonly executionContext?: ToolExecutionContext;
}

export interface ResolveProcessingUrlResult {
  readonly url: string;
  readonly source: ResolvedProcessingSource;
  readonly cloudflareVideoId?: string;
  readonly stagedStoragePath?: string;
  readonly expiresAt?: string;
}

export class MediaTransportResolverService {
  private readonly staging = new MediaStagingService();
  private readonly cloudflareBridge: CloudflareMcpBridgeService | null;

  constructor(cloudflareBridge?: CloudflareMcpBridgeService | null) {
    this.cloudflareBridge = cloudflareBridge ?? this.buildCloudflareBridge();
  }

  async resolveProcessingUrl(
    input: ResolveProcessingUrlInput
  ): Promise<ResolveProcessingUrlResult> {
    const normalizedUrl = input.sourceUrl.trim();
    if (!normalizedUrl) {
      return { url: input.sourceUrl, source: 'unchanged' };
    }

    if (this.isDirectlyPortable(normalizedUrl)) {
      return { url: normalizedUrl, source: 'direct' };
    }

    // Legacy compatibility: only attempt Cloudflare download flow when a Cloudflare
    // video ID is explicitly provided or the source URL is a Cloudflare URL.
    const explicitCloudflareVideoId = this.normalizeVideoId(input.cloudflareVideoId);
    const extractedCloudflareVideoId = this.extractCloudflareVideoId(normalizedUrl);
    const cloudflareVideoId = explicitCloudflareVideoId ?? extractedCloudflareVideoId;
    const shouldTryCloudflare =
      !!cloudflareVideoId && (!!explicitCloudflareVideoId || this.isCloudflareUrl(normalizedUrl));

    if (shouldTryCloudflare && this.cloudflareBridge) {
      const downloadUrl = await this.resolveCloudflareDownloadUrl(cloudflareVideoId);
      if (downloadUrl) {
        return {
          url: downloadUrl,
          source: 'cloudflare_download',
          cloudflareVideoId,
        };
      }
    }

    // For files already in our own Firebase Storage bucket, generate a signed URL
    // directly — no download/re-upload needed.
    if (FIREBASE_STORAGE_PATTERN.test(normalizedUrl)) {
      const signedUrl = await this.trySignOwnBucketUrl(
        normalizedUrl,
        input.executionContext?.environment
      );
      if (signedUrl) {
        return { url: signedUrl, source: 'direct' };
      }
    }

    if (input.fallbackToFirebaseStaging) {
      const staged = await this.tryStageToFirebase(normalizedUrl, input);
      if (staged) {
        return {
          url: staged.signedUrl,
          source: 'firebase_staged',
          ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
          stagedStoragePath: staged.storagePath,
          expiresAt: staged.expiresAt,
        };
      }
    }

    return {
      url: normalizedUrl,
      source: 'unchanged',
      ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
    };
  }

  private buildCloudflareBridge(): CloudflareMcpBridgeService | null {
    try {
      return new CloudflareMcpBridgeService();
    } catch {
      return null;
    }
  }

  private isDirectlyPortable(url: string): boolean {
    if (DIRECT_MP4_PATTERN.test(url)) return true;
    // Firebase Storage URLs are only directly portable when they carry a real
    // signature or download token — otherwise Gemini gets a 403.
    if (FIREBASE_STORAGE_PATTERN.test(url) && this.isActuallySignedFirebaseUrl(url)) return true;
    return false;
  }

  private isActuallySignedFirebaseUrl(url: string): boolean {
    try {
      const params = new URL(url).searchParams;
      for (const key of FIREBASE_SIGNED_PARAMS) {
        if (params.has(key)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private isCloudflareUrl(urlRaw: string): boolean {
    try {
      const parsed = new URL(urlRaw);
      return CLOUDFLARE_HOST_PATTERN.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  private normalizeVideoId(videoId: string | undefined): string | null {
    const trimmed = videoId?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  private extractCloudflareVideoId(urlRaw: string): string | null {
    try {
      const parsed = new URL(urlRaw);
      if (!CLOUDFLARE_HOST_PATTERN.test(parsed.hostname)) return null;
      const firstPathSegment = parsed.pathname.split('/').filter(Boolean)[0];
      return firstPathSegment && firstPathSegment.length > 0 ? firstPathSegment : null;
    } catch {
      return null;
    }
  }

  private async resolveCloudflareDownloadUrl(videoId: string): Promise<string | null> {
    if (!this.cloudflareBridge) return null;

    // Check for an existing ready download link first
    try {
      const existing = await this.cloudflareBridge.getDownloadLinks(videoId);
      const existingUrl = existing.default?.url?.trim();
      if (existingUrl && existing.default?.status === 'ready') return existingUrl;
    } catch (error) {
      logger.warn('[MediaTransportResolver] Failed to read existing Cloudflare download URL', {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Enable download rendering
    try {
      const enabled = await this.cloudflareBridge.enableDownload(videoId, 'video');
      const enabledUrl = enabled.default?.url?.trim();
      if (enabledUrl && enabled.default?.status === 'ready') return enabledUrl;
    } catch (error) {
      logger.warn('[MediaTransportResolver] Failed to enable Cloudflare download', {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    // Poll for up to ~90 seconds (9 × 10 s) until status === 'ready'
    const MAX_POLL_ATTEMPTS = 9;
    const POLL_INTERVAL_MS = 10_000;

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const polled = await this.cloudflareBridge.getDownloadLinks(videoId);
        const polledUrl = polled.default?.url?.trim();
        const polledStatus = polled.default?.status;

        logger.info('[MediaTransportResolver] Polling Cloudflare download readiness', {
          videoId,
          attempt,
          status: polledStatus,
          percentComplete: polled.default?.percentComplete,
        });

        if (polledUrl && polledStatus === 'ready') return polledUrl;
        if (polledStatus === 'error') {
          logger.warn('[MediaTransportResolver] Cloudflare download encoding failed', { videoId });
          return null;
        }
      } catch (error) {
        logger.warn('[MediaTransportResolver] Poll attempt failed', {
          videoId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.warn('[MediaTransportResolver] Cloudflare download not ready after polling', {
      videoId,
    });
    return null;
  }

  private async trySignOwnBucketUrl(
    url: string,
    environment?: ToolExecutionContext['environment']
  ): Promise<string | null> {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'storage.googleapis.com') return null;

      const pathWithoutLeadingSlash = parsed.pathname.slice(1);
      const slashIdx = pathWithoutLeadingSlash.indexOf('/');
      if (slashIdx === -1) return null;

      const bucketName = pathWithoutLeadingSlash.slice(0, slashIdx);
      const storagePath = decodeURIComponent(pathWithoutLeadingSlash.slice(slashIdx + 1));
      if (!bucketName || !storagePath) return null;

      const isStaging = environment === 'staging' || bucketName.toLowerCase().includes('staging');
      const storageInstance = isStaging ? stagingStorage : defaultStorage;

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const [signedUrl] = await storageInstance.bucket(bucketName).file(storagePath).getSignedUrl({
        action: 'read',
        expires: expiresAt,
        version: 'v4',
      });

      logger.info('[MediaTransportResolver] Generated signed URL for own Firebase Storage file', {
        bucketName,
        storagePath: storagePath.slice(0, 120),
        isStaging,
      });

      return signedUrl;
    } catch (error) {
      logger.warn('[MediaTransportResolver] Failed to sign own Firebase Storage URL', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async tryStageToFirebase(
    sourceUrl: string,
    input: ResolveProcessingUrlInput
  ): Promise<Awaited<ReturnType<MediaStagingService['stageFromUrl']>> | null> {
    const executionContext = input.executionContext;
    if (!executionContext?.userId || !executionContext.threadId) {
      return null;
    }

    try {
      return await this.staging.stageFromUrl({
        sourceUrl,
        staging: {
          userId: executionContext.userId,
          threadId: executionContext.threadId,
        },
        environment: executionContext.environment,
        mediaKind: input.stageMediaKind ?? 'video',
        expiresInMinutes: 120,
      });
    } catch (error) {
      logger.warn('[MediaTransportResolver] Firebase staging fallback failed', {
        sourceUrl: sourceUrl.slice(0, 180),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
