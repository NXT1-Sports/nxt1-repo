/**
 * @fileoverview Scraper Media Service — Download & Persist External Media
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Shared utility for downloading external media (images/videos) from scraped
 * social media URLs and uploading them to Firebase Storage for persistent,
 * CDN-backed delivery.
 *
 * Why this exists:
 * - Instagram/Twitter CDN URLs are temporary and signed. They expire within
 *   hours or days, making them unreliable for in-app display.
 * - By re-hosting media in Firebase Storage tmp staging with signed URLs,
 *   scraped content becomes stable for in-flow processing and can be promoted
 *   to permanent destinations when the user commits it.
 *
 * Architecture:
 * - Downloads media via native `fetch()` with strict size + timeout limits.
 * - Uploads to Firebase Storage at thread-scoped tmp path:
 *     `Users/{userId}/threads/{threadId}/tmp/{type}/{timestamp}_{name}`
 * - A valid `MediaStagingContext` (userId + threadId) is always required.
 * - Generates v4 signed URLs with 7-day read-only expiry.
 * - Processes media in parallel with concurrency cap (default 5).
 * - Error-tolerant: failed downloads are skipped, never crash the tool.
 * - Supports "promotion" — copying media from thread staging to a permanent
 *   path (e.g., `users/{userId}/posts/{postId}/`) when content is published.
 *
 * Security:
 * - URL validation prevents SSRF (only HTTPS, no private IPs).
 * - Content-Type verification prevents uploading disguised payloads.
 * - File size capped at 50 MB per item.
 * - Storage paths are deterministic (content-hashed) to prevent path traversal.
 */

import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../../../../utils/logger.js';
import { parallelBatch, type BatchFulfilled } from '../../../utils/parallel-batch.js';
import { AgentMediaLifecycleService } from '../../media/agent-media-lifecycle.service.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of media items to persist per tool call. */
const MAX_MEDIA_PER_CALL = 10;

/** Maximum concurrent downloads. */
const MAX_CONCURRENT_DOWNLOADS = 5;

/** Maximum file size per download (50 MB). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Download timeout per item (30 seconds). */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Allowed MIME type prefixes for persisted media. */
const ALLOWED_MIME_PREFIXES = ['image/', 'video/'] as const;

/** Map MIME types to file extensions. */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** Cache-Control header for staged media files. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Read URL TTL for tmp-staged scrape media (7 days). */
const TMP_SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported source platforms for media persistence. */
export type MediaPlatform = 'instagram' | 'twitter' | 'web';

/** A scraped media item to be persisted. */
export interface MediaInput {
  /** The external URL to download from (Instagram CDN, Twitter CDN, etc.). */
  readonly url: string;
  /** Media type hint: 'image' or 'video'. Used for fallback extension. */
  readonly type: 'image' | 'video';
  /** Source platform for storage path organization. */
  readonly platform: MediaPlatform;
  /** Original post/item URL for attribution tracking. */
  readonly sourceUrl?: string;
}

/** A successfully persisted media item. */
export interface PersistedMedia {
  /** Firebase Storage signed URL (7-day read-only expiry for tmp staging). */
  readonly url: string;
  /** Firebase Storage path. */
  readonly storagePath: string;
  /** Detected MIME type. */
  readonly mimeType: string;
  /** Media type: 'image' or 'video'. */
  readonly type: 'image' | 'video';
  /** Source platform. */
  readonly platform: MediaPlatform;
  /** The original external URL that was downloaded (input URL). */
  readonly originalUrl: string;
  /** Original post URL for attribution. */
  readonly sourceUrl?: string;
  /** File size in bytes. */
  readonly sizeBytes: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Thread-scoped staging context — always required.
 * Media is stored under the user's thread folder so it shares
 * the thread lifecycle.
 */
export interface MediaThreadContext {
  /** Firestore UID of the owning user. */
  readonly userId: string;
  /** MongoDB thread ID for the current conversation. */
  readonly threadId: string;
}

export class ScraperMediaService {
  /**
   * Persist a batch of external media URLs to Firebase Storage.
   *
   * Downloads and re-hosts up to MAX_MEDIA_PER_CALL items in parallel.
   * Failed downloads are logged and skipped — never throws.
   *
   * @param items - Array of media items to persist.
   * @param staging - Thread-scoped staging context (userId + threadId). Required.
   *   Media is stored at `Users/{userId}/threads/{threadId}/media/`.
   * @returns Array of successfully persisted media (may be fewer than input).
   */
  async persistBatch(
    items: readonly MediaInput[],
    staging: MediaThreadContext
  ): Promise<PersistedMedia[]> {
    if (items.length === 0) return [];

    const capped = items.slice(0, MAX_MEDIA_PER_CALL);

    const batchResults = await parallelBatch(capped, (item) => this.persistOne(item, staging), {
      concurrency: MAX_CONCURRENT_DOWNLOADS,
    });

    const results = batchResults
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as BatchFulfilled<PersistedMedia | null>).value!);

    if (results.length > 0) {
      logger.info('[ScraperMediaService] Batch complete', {
        requested: capped.length,
        persisted: results.length,
      });
    }

    return results;
  }

  /**
   * Persist a single external media URL to Firebase Storage.
   * Returns null if the download or upload fails.
   */
  private async persistOne(
    item: MediaInput,
    staging: MediaThreadContext
  ): Promise<PersistedMedia | null> {
    try {
      // ── Validate URL ─────────────────────────────────────────────
      if (!this.isValidMediaUrl(item.url)) {
        logger.warn('[ScraperMediaService] Invalid URL skipped', {
          url: item.url.slice(0, 100),
        });
        return null;
      }

      // ── Download ─────────────────────────────────────────────────
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(item.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'NXT1-AgentX/1.0',
            Accept: 'image/*,video/*',
          },
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        logger.warn('[ScraperMediaService] Download failed', {
          url: item.url.slice(0, 100),
          status: response.status,
        });
        return null;
      }

      // ── Validate Content-Type ────────────────────────────────────
      const contentType = response.headers.get('content-type') ?? '';
      const mimeType = contentType.split(';')[0].trim().toLowerCase();

      if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
        logger.warn('[ScraperMediaService] Invalid MIME type', {
          mimeType,
          url: item.url.slice(0, 100),
        });
        return null;
      }

      // ── Read body with size limit ────────────────────────────────
      const buffer = await this.readWithSizeLimit(response);
      if (buffer === null) {
        logger.warn('[ScraperMediaService] File too large, skipped', {
          url: item.url.slice(0, 100),
          limit: MAX_FILE_SIZE_BYTES,
        });
        return null;
      }

      // ── Upload to Firebase Storage tmp staging ───────────────────
      const ext = MIME_TO_EXT[mimeType] ?? this.fallbackExtension(item.type);
      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
      const filePath = AgentMediaLifecycleService.buildStoragePath({
        userId: staging.userId,
        threadId: staging.threadId,
        mimeType,
        fileName: `${hash}.${ext}`,
        zone: 'tmp',
      });

      const bucket = getStorage().bucket();
      const { url: signedUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath: filePath,
        buffer,
        mimeType,
        cacheControl: CACHE_CONTROL,
        signedUrlTtlMs: TMP_SIGNED_URL_TTL_MS,
      });

      const mediaType: 'image' | 'video' = mimeType.startsWith('video/') ? 'video' : 'image';

      return {
        url: signedUrl,
        storagePath: filePath,
        mimeType,
        type: mediaType,
        platform: item.platform,
        originalUrl: item.url,
        sourceUrl: item.sourceUrl,
        sizeBytes: buffer.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // AbortError is expected for timeouts — log at warn, not error
      const level = message.includes('abort') ? 'warn' : 'error';
      logger[level]('[ScraperMediaService] Failed to persist media', {
        url: item.url.slice(0, 100),
        error: message,
      });
      return null;
    }
  }

  /**
   * Read a response body into a Buffer, aborting if size exceeds the limit.
   */
  private async readWithSizeLimit(response: Response): Promise<Buffer | null> {
    // Check Content-Length header first for early reject
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE_BYTES) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return null;
    }

    return Buffer.from(arrayBuffer);
  }

  /**
   * Validate a media URL to prevent SSRF attacks.
   * Only allows HTTPS URLs from non-private hosts.
   */
  private isValidMediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;

      const host = parsed.hostname.toLowerCase();
      // Block private/reserved ranges
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host.startsWith('10.') ||
        host.startsWith('172.') ||
        host.startsWith('192.168.') ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fallback file extension when MIME type is not in our map.
   */
  private fallbackExtension(type: 'image' | 'video'): string {
    return type === 'video' ? 'mp4' : 'jpg';
  }

  // ─── Media Promotion (Thread Staging → Permanent) ──────────────────────

  /**
   * Promote media from a thread staging path to a permanent location.
   *
   * Copies files from `users/{userId}/threads/{threadId}/media/` to
   * `users/{userId}/posts/{postId}/` so published posts are decoupled
   * from the thread lifecycle. The originals remain in the thread folder
   * (they'll be cleaned up when the thread is deleted).
   *
   * Returns permanent signed URLs for the promoted files.
   * Gracefully skips any files that fail to copy (non-fatal).
   */
  static async promoteMedia(
    signedUrls: readonly string[],
    userId: string,
    destinationPrefix: string
  ): Promise<string[]> {
    if (signedUrls.length === 0) return [];

    const bucket = getStorage().bucket();
    return AgentMediaLifecycleService.promoteSignedUrlsToDestination({
      bucket,
      signedUrls,
      userId,
      destinationPrefix,
    });
  }

  /**
   * Delete all media files from a thread's staging folder.
   * Called when a thread document is deleted (e.g., by a Firestore trigger).
   *
   * Uses prefix-based deletion so the entire `media/` folder is removed
   * in one bulk operation — no individual file tracking needed.
   */
  static async deleteThreadMedia(userId: string, threadId: string): Promise<number> {
    const bucket = getStorage().bucket();
    const prefixes = [
      `Users/${userId}/threads/${threadId}/media/`,
      `Users/${userId}/threads/${threadId}/tmp/`,
    ];

    try {
      let deletedCount = 0;

      for (const prefix of prefixes) {
        const [files] = await bucket.getFiles({ prefix });
        if (files.length === 0) continue;

        await Promise.all(
          files.map((file) =>
            file.delete().catch(() => {
              /* ignore individual failures */
            })
          )
        );
        deletedCount += files.length;
      }

      logger.info('[ScraperMediaService] Thread media deleted', {
        userId,
        threadId,
        filesDeleted: deletedCount,
      });
      return deletedCount;
    } catch (err) {
      logger.error('[ScraperMediaService] Failed to delete thread media', {
        userId,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}
