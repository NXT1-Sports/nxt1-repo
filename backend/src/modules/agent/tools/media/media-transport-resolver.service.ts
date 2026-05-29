import { logger } from '../../../../utils/logger.js';
import { getSignedUrlWithTimeout } from '../../../../utils/gcs-signed-url.js';
import { CloudflareMcpBridgeService } from '../integrations/cloudflare-stream/cloudflare-mcp-bridge.service.js';
import { MediaStagingService } from './media-staging.service.js';
import type { ToolExecutionContext } from '../base.tool.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';

const DIRECT_MP4_PATTERN = /\.mp4(?:$|[?#])/i;
/** Matches any Firebase / GCS storage URL (signed or unsigned). */
const FIREBASE_STORAGE_PATTERN =
  /^https?:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i;
const STAGING_BUCKET_PATTERN = /staging/i;
const CLOUDFLARE_HOST_PATTERN =
  /(watch\.cloudflarestream\.com|\.cloudflarestream\.com|videodelivery\.net)$/i;
const CLOUDFLARE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const CLOUDFLARE_STAGED_FILENAME_PATTERN = /-([a-f0-9]{32})\.[a-z0-9]{1,10}$/i;

export type ResolvedProcessingSource =
  | 'direct'
  | 'cloudflare_download'
  | 'firebase_staged'
  | 'unchanged';

export interface ResolveProcessingUrlInput {
  readonly sourceUrl: string;
  readonly cloudflareVideoId?: string;
  readonly fallbackToFirebaseStaging?: boolean;
  /**
   * When true, prefer generating a fresh short-lived V4 signed URL for
   * in-scope Firebase Storage objects before trusting caller-provided tokens.
   * This helps recover from stale Firebase download tokens that return 403.
   */
  readonly preferFreshFirebaseSignedUrl?: boolean;
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

    // Legacy compatibility: only attempt Cloudflare download flow when a Cloudflare
    // video ID is explicitly provided or the source URL is a Cloudflare URL.
    const explicitCloudflareVideoId = this.normalizeVideoId(input.cloudflareVideoId);
    const extractedCloudflareVideoId = this.extractCloudflareVideoId(normalizedUrl);
    const cloudflareVideoId = explicitCloudflareVideoId ?? extractedCloudflareVideoId;
    const isFirebaseStorageUrl = FIREBASE_STORAGE_PATTERN.test(normalizedUrl);

    if (isFirebaseStorageUrl) {
      const firebaseScope = this.getFirebaseUrlScope(normalizedUrl);
      const isAuthorized = firebaseScope
        ? this.isAuthorizedFirebaseScope(firebaseScope, input.executionContext)
        : false;

      if (!isAuthorized) {
        logger.warn('[MediaTransportResolver] Refused out-of-scope Firebase media URL', {
          sourceUrl: normalizedUrl.slice(0, 180),
          bucketName: firebaseScope?.bucketName,
          userId: input.executionContext?.userId,
          threadId: input.executionContext?.threadId,
          environment: input.executionContext?.environment,
        });
        return {
          url: normalizedUrl,
          source: 'unchanged',
          ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
        };
      }
    }

    const shouldTryCloudflare =
      !!cloudflareVideoId &&
      (!!explicitCloudflareVideoId ||
        this.isCloudflareUrl(normalizedUrl) ||
        this.isCloudflareStagedPlaceholder(normalizedUrl));

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

    if (isFirebaseStorageUrl) {
      if (input.preferFreshFirebaseSignedUrl) {
        const refreshedSignedUrl = await this.trySignOwnBucketUrl(
          normalizedUrl,
          input.executionContext
        );
        if (refreshedSignedUrl) {
          return { url: refreshedSignedUrl, source: 'direct' };
        }
      }

      if (this.isActuallySignedFirebaseUrl(normalizedUrl)) {
        return {
          url: normalizedUrl,
          source: 'direct',
          ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
        };
      }

      const signedUrl = await this.trySignOwnBucketUrl(normalizedUrl, input.executionContext);
      if (signedUrl) {
        return { url: signedUrl, source: 'direct' };
      }

      const firebaseScope = this.getFirebaseUrlScope(normalizedUrl);
      logger.warn('[MediaTransportResolver] Refused unsigned Firebase media URL', {
        sourceUrl: normalizedUrl.slice(0, 180),
        bucketName: firebaseScope?.bucketName,
        userId: input.executionContext?.userId,
        threadId: input.executionContext?.threadId,
        environment: input.executionContext?.environment,
      });
      return {
        url: normalizedUrl,
        source: 'unchanged',
        ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
      };
    }

    if (this.isDirectlyPortable(normalizedUrl)) {
      return {
        url: normalizedUrl,
        source: 'direct',
        ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
      };
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
    if (FIREBASE_STORAGE_PATTERN.test(url)) return false;
    if (DIRECT_MP4_PATTERN.test(url)) return true;
    return false;
  }

  private isActuallySignedFirebaseUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const params = parsed.searchParams;
      if (params.has('token')) {
        return true;
      }

      if (params.has('X-Goog-Signature')) {
        const rawDate = params.get('X-Goog-Date');
        const rawExpires = params.get('X-Goog-Expires');
        if (!rawDate || !rawExpires) {
          return false;
        }

        const issuedAt = this.parseGoogDate(rawDate);
        const expiresSec = Number.parseInt(rawExpires, 10);
        if (!issuedAt || !Number.isFinite(expiresSec) || expiresSec <= 0) {
          return false;
        }

        const expiresAtMs = issuedAt.getTime() + expiresSec * 1000;
        const nowWithSkewMs = Date.now() + 30_000;
        return expiresAtMs > nowWithSkewMs;
      }

      return false;
    } catch {
      return false;
    }
  }

  private parseGoogDate(raw: string): Date | null {
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u);
    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const hour = Number.parseInt(match[4], 10);
    const minute = Number.parseInt(match[5], 10);
    const second = Number.parseInt(match[6], 10);

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return Number.isNaN(date.getTime()) ? null : date;
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
    return trimmed && CLOUDFLARE_ID_PATTERN.test(trimmed) ? trimmed : null;
  }

  private extractCloudflareVideoId(urlRaw: string): string | null {
    try {
      const parsed = new URL(urlRaw);
      if (!CLOUDFLARE_HOST_PATTERN.test(parsed.hostname)) {
        return this.extractCloudflareVideoIdFromStagedFilename(urlRaw);
      }
      const firstPathSegment = parsed.pathname.split('/').filter(Boolean)[0];
      return this.normalizeVideoId(firstPathSegment);
    } catch {
      return this.extractCloudflareVideoIdFromStagedFilename(urlRaw);
    }
  }

  private extractCloudflareVideoIdFromStagedFilename(urlRaw: string): string | null {
    try {
      const parsed = new URL(urlRaw);
      const decodedPath = decodeURIComponent(parsed.pathname);
      const match = decodedPath.match(CLOUDFLARE_STAGED_FILENAME_PATTERN);
      return this.normalizeVideoId(match?.[1]);
    } catch {
      const match = urlRaw.match(CLOUDFLARE_STAGED_FILENAME_PATTERN);
      return this.normalizeVideoId(match?.[1]);
    }
  }

  private isCloudflareStagedPlaceholder(urlRaw: string): boolean {
    return this.extractCloudflareVideoIdFromStagedFilename(urlRaw) !== null;
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
    executionContext?: ToolExecutionContext
  ): Promise<string | null> {
    try {
      const scope = this.getFirebaseUrlScope(url);
      if (!scope) return null;

      if (!this.isAuthorizedFirebaseScope(scope, executionContext)) {
        logger.warn('[MediaTransportResolver] Refused to sign Firebase Storage URL out of scope', {
          bucketName: scope.bucketName,
          storagePath: scope.storagePath.slice(0, 120),
          userId: executionContext?.userId,
          threadId: executionContext?.threadId,
          environment: executionContext?.environment,
        });
        return null;
      }

      const isStaging =
        executionContext?.environment === 'staging' ||
        STAGING_BUCKET_PATTERN.test(scope.bucketName.toLowerCase());
      const storageInstance = isStaging ? stagingStorage : defaultStorage;

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const [signedUrl] = await getSignedUrlWithTimeout(() =>
        storageInstance.bucket(scope.bucketName).file(scope.storagePath).getSignedUrl({
          action: 'read',
          expires: expiresAt,
          version: 'v4',
        })
      );

      logger.info('[MediaTransportResolver] Generated signed URL for own Firebase Storage file', {
        bucketName: scope.bucketName,
        storagePath: scope.storagePath.slice(0, 120),
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

  private isAuthorizedStoragePath(
    storagePath: string,
    executionContext?: ToolExecutionContext
  ): boolean {
    if (!executionContext?.userId) return true;

    const normalizedPath = storagePath.replace(/^\/+/, '');
    if (!normalizedPath.startsWith(`Users/${executionContext.userId}/`)) {
      return false;
    }

    if (executionContext.threadId && normalizedPath.includes('/threads/')) {
      return normalizedPath.includes(`/threads/${executionContext.threadId}/`);
    }

    return true;
  }

  private isAuthorizedFirebaseScope(
    scope: { readonly bucketName: string; readonly storagePath: string },
    executionContext?: ToolExecutionContext
  ): boolean {
    return (
      this.isAuthorizedBucket(scope.bucketName, executionContext) &&
      this.isAuthorizedStoragePath(scope.storagePath, executionContext)
    );
  }

  private isAuthorizedBucket(bucketName: string, executionContext?: ToolExecutionContext): boolean {
    const environment = executionContext?.environment;
    if (!environment) return true;

    const isStagingBucket = STAGING_BUCKET_PATTERN.test(bucketName.toLowerCase());
    if (environment === 'staging') return isStagingBucket;
    if (environment === 'production') return !isStagingBucket;
    return true;
  }

  private getFirebaseUrlScope(
    url: string
  ): { readonly bucketName: string; readonly storagePath: string } | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'storage.googleapis.com') {
        const pathWithoutLeadingSlash = parsed.pathname.slice(1);
        const slashIdx = pathWithoutLeadingSlash.indexOf('/');
        if (slashIdx === -1) return null;
        return {
          bucketName: pathWithoutLeadingSlash.slice(0, slashIdx),
          storagePath: decodeURIComponent(pathWithoutLeadingSlash.slice(slashIdx + 1)),
        };
      }

      if (parsed.hostname === 'firebasestorage.googleapis.com') {
        const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        return match
          ? {
              bucketName: match[1],
              storagePath: decodeURIComponent(match[2]),
            }
          : null;
      }

      return null;
    } catch {
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
