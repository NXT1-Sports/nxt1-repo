import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { AgentQueueService } from '../queue/queue.service.js';
import { AgentMediaLifecycleService } from '../tools/media/agent-media-lifecycle.service.js';
import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { logger } from '../../../utils/logger.js';

const MEDIA_PROXY_TEMP_DIR = path.join(os.tmpdir(), 'nxt1-agent-media-proxy');
const MEDIA_PROXY_UPLOAD_TTL_S = 15 * 60;
const MEDIA_PROXY_READY_TTL_S = 60 * 60;
const ATTACHMENT_WAIT_TTL_S = 2 * 60;
const DEV_MEDIA_PROXY_SECRET = 'agent-media-proxy-dev-secret-change-me';

function isLocalHostname(hostnameRaw: string | undefined): boolean {
  const hostname = (hostnameRaw ?? '').replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export interface MediaProxyUploadRecord {
  readonly uploadId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly safeFileName: string;
  readonly mimeType: string;
  readonly declaredSizeBytes: number;
  readonly actualSizeBytes: number | null;
  readonly storagePath: string;
  readonly threadId: string | null;
  readonly ready: boolean;
  readonly tempFilePath: string | null;
  readonly createdAt: string;
}

export interface ProvisionMediaProxyUploadInput {
  readonly userId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly threadId?: string | null;
  readonly routeBase: string;
}

export interface ProvisionMediaProxyUploadResult {
  readonly uploadUrl: string;
  readonly readUrl: string;
  readonly storagePath: string;
  readonly expiresAt: string;
  readonly uploadId: string;
}

export class AgentEphemeralStateService {
  private static redis: Redis | null = null;
  private static cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static warnedAboutDevSecret = false;

  private static uploadKey(uploadId: string): string {
    return `agent:ephemeral:${getRuntimeEnvironment()}:media-upload:${uploadId}`;
  }

  private static attachmentWaitKey(operationId: string): string {
    return `agent:ephemeral:${getRuntimeEnvironment()}:attachment-wait:${operationId}`;
  }

  private static getRedis(): Redis {
    if (!this.redis) {
      const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
      this.redis = new Redis({
        ...AgentQueueService.parseRedisUrl(redisUrl),
        lazyConnect: false,
        enableOfflineQueue: true,
      });
      this.redis.on('error', (error) => {
        logger.warn('AgentEphemeralStateService Redis error', {
          error: error.message,
        });
      });
    }

    return this.redis;
  }

  private static getSigningSecret(): string {
    const configured = process.env['MEDIA_PROXY_HMAC_SECRET']?.trim();
    if (configured && configured.length > 0) {
      return configured;
    }

    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('MEDIA_PROXY_HMAC_SECRET is required in production');
    }

    if (!this.warnedAboutDevSecret) {
      this.warnedAboutDevSecret = true;
      logger.warn('Using development fallback MEDIA_PROXY_HMAC_SECRET');
    }

    return DEV_MEDIA_PROXY_SECRET;
  }

  private static signUploadToken(uploadId: string, expiresAtMs: number): string {
    return createHmac('sha256', this.getSigningSecret())
      .update(`${uploadId}:${expiresAtMs}`)
      .digest('hex');
  }

  private static normalizeRouteBase(routeBase: string): string {
    return routeBase.replace(/\/+$/, '');
  }

  private static buildTempFilePath(uploadId: string, safeFileName: string): string {
    return path.join(MEDIA_PROXY_TEMP_DIR, `${uploadId}-${safeFileName}`);
  }

  private static async setUploadRecord(
    record: MediaProxyUploadRecord,
    ttlSeconds: number
  ): Promise<void> {
    await this.getRedis().set(
      this.uploadKey(record.uploadId),
      JSON.stringify(record),
      'EX',
      ttlSeconds
    );
  }

  static async getUploadRecord(uploadId: string): Promise<MediaProxyUploadRecord | null> {
    const raw = await this.getRedis().get(this.uploadKey(uploadId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as MediaProxyUploadRecord;
    } catch {
      return null;
    }
  }

  static resolveExternalOrigin(req: Request): string {
    const host = req.get('host')?.trim() || 'localhost:3000';
    const requestOrigin = `${req.protocol}://${host}`.replace(/\/+$/, '');
    const publicBase = process.env['MEDIA_PROXY_PUBLIC_BASE_URL']?.trim();
    if (publicBase && publicBase.length > 0) {
      return publicBase.replace(/\/+$/, '');
    }

    const hostname = host.split(':')[0];
    if (!isLocalHostname(hostname)) {
      return requestOrigin;
    }

    const configured = process.env['BACKEND_URL']?.trim();
    if (configured && configured.length > 0) {
      return configured.replace(/\/+$/, '');
    }

    return requestOrigin;
  }

  static canServeMediaProxyPublicly(req: Request): boolean {
    const publicBase = process.env['MEDIA_PROXY_PUBLIC_BASE_URL']?.trim();
    if (publicBase && publicBase.length > 0) {
      return true;
    }

    const host = req.get('host')?.trim() || 'localhost:3000';
    const hostname = host.split(':')[0];
    return !isLocalHostname(hostname);
  }

  static isPubliclyReachableUrl(urlInput: string): boolean {
    try {
      const parsed = new URL(urlInput);
      const hostname = parsed.hostname.trim().toLowerCase();
      if (isLocalHostname(hostname)) {
        return false;
      }
      return hostname !== 'host.docker.internal';
    } catch {
      return false;
    }
  }

  static extractUploadIdFromMediaProxyUrl(urlInput: string): string | null {
    try {
      const parsed = new URL(urlInput);
      const match = parsed.pathname.match(/\/media-proxy\/temp\/([^/]+)\//i);
      return match?.[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  static resolveAgentRouteBase(req: Request): string {
    return `${this.resolveExternalOrigin(req)}${req.baseUrl}`;
  }

  static buildSignedReadUrl(params: {
    readonly uploadId: string;
    readonly fileName: string;
    readonly routeBase: string;
    readonly ttlMs?: number;
  }): { url: string; expiresAt: string } {
    const expiresAtMs = Date.now() + (params.ttlMs ?? MEDIA_PROXY_READY_TTL_S * 1000);
    const signature = this.signUploadToken(params.uploadId, expiresAtMs);
    const normalizedRouteBase = this.normalizeRouteBase(params.routeBase);
    const safeFileName = AgentMediaLifecycleService.sanitizeFileName(params.fileName);
    const encodedFileName = encodeURIComponent(safeFileName);
    const url = `${normalizedRouteBase}/media-proxy/temp/${params.uploadId}/${encodedFileName}?exp=${expiresAtMs}&sig=${signature}`;
    return {
      url,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  static validateSignedReadRequest(uploadId: string, expRaw: unknown, sigRaw: unknown): boolean {
    const expiresAtMs = Number(expRaw);
    const provided = typeof sigRaw === 'string' ? sigRaw.trim() : '';
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() || !provided) {
      return false;
    }

    const expected = this.signUploadToken(uploadId, expiresAtMs);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(provided, 'hex');
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    try {
      return timingSafeEqual(expectedBuffer, providedBuffer);
    } catch {
      return false;
    }
  }

  static async provisionUpload(
    input: ProvisionMediaProxyUploadInput
  ): Promise<ProvisionMediaProxyUploadResult> {
    const uploadId = crypto.randomUUID();
    const safeFileName = AgentMediaLifecycleService.sanitizeFileName(input.fileName);
    const storagePath = AgentMediaLifecycleService.buildStoragePath({
      userId: input.userId,
      threadId: input.threadId,
      mimeType: input.mimeType,
      fileName: `${uploadId}-${safeFileName}`,
      zone: 'tmp',
    });
    const record: MediaProxyUploadRecord = {
      uploadId,
      userId: input.userId,
      fileName: input.fileName,
      safeFileName,
      mimeType: input.mimeType,
      declaredSizeBytes: input.fileSize,
      actualSizeBytes: null,
      storagePath,
      threadId: input.threadId?.trim() ? input.threadId.trim() : null,
      ready: false,
      tempFilePath: this.buildTempFilePath(uploadId, safeFileName),
      createdAt: new Date().toISOString(),
    };

    await mkdir(MEDIA_PROXY_TEMP_DIR, { recursive: true });
    await this.setUploadRecord(record, MEDIA_PROXY_UPLOAD_TTL_S);

    const read = this.buildSignedReadUrl({
      uploadId,
      fileName: safeFileName,
      routeBase: input.routeBase,
    });

    return {
      uploadId,
      uploadUrl: `${this.normalizeRouteBase(input.routeBase)}/media-proxy/upload/${uploadId}`,
      readUrl: read.url,
      storagePath,
      expiresAt: read.expiresAt,
    };
  }

  static async createReadyUploadFromProxy(params: {
    readonly userId: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly fileSize: number;
    readonly threadId?: string | null;
    readonly routeBase: string;
    readonly tempFilePath: string;
  }): Promise<Omit<ProvisionMediaProxyUploadResult, 'uploadUrl'>> {
    const provisional = await this.provisionUpload({
      userId: params.userId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      threadId: params.threadId,
      routeBase: params.routeBase,
    });

    await this.finalizeUploadFromExistingFile(provisional.uploadId, params.tempFilePath);
    return {
      uploadId: provisional.uploadId,
      readUrl: provisional.readUrl,
      storagePath: provisional.storagePath,
      expiresAt: provisional.expiresAt,
    };
  }

  static async finalizeUploadFromExistingFile(
    uploadId: string,
    sourceTempFilePath: string
  ): Promise<MediaProxyUploadRecord> {
    const record = await this.getUploadRecord(uploadId);
    if (!record || !record.tempFilePath) {
      throw new Error('Upload provision not found');
    }

    await mkdir(MEDIA_PROXY_TEMP_DIR, { recursive: true });
    if (path.resolve(sourceTempFilePath) !== path.resolve(record.tempFilePath)) {
      await rename(sourceTempFilePath, record.tempFilePath);
    }
    const fileStats = await stat(record.tempFilePath);

    const updated: MediaProxyUploadRecord = {
      ...record,
      actualSizeBytes: fileStats.size,
      ready: true,
      tempFilePath: record.tempFilePath,
    };
    await this.setUploadRecord(updated, MEDIA_PROXY_READY_TTL_S);
    this.scheduleCleanup(updated.uploadId);
    return updated;
  }

  static async writeRequestBodyToProvisionedUpload(
    uploadId: string,
    req: Request,
    maxBytes: number
  ): Promise<MediaProxyUploadRecord> {
    const record = await this.getUploadRecord(uploadId);
    if (!record || !record.tempFilePath) {
      throw new Error('Upload provision not found');
    }
    if (record.ready) {
      throw new Error('Upload already completed');
    }

    await mkdir(MEDIA_PROXY_TEMP_DIR, { recursive: true });

    let totalBytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        totalBytes += chunkBytes;
        if (totalBytes > maxBytes) {
          callback(
            new Error(
              `File exceeds maximum video size limit (${Math.round(maxBytes / (1024 * 1024))} MB)`
            )
          );
          return;
        }
        callback(null, chunk);
      },
    });

    const writeStream = createWriteStream(record.tempFilePath);
    try {
      await pipeline(req, limiter, writeStream);
    } catch (error) {
      await rm(record.tempFilePath, { force: true }).catch(() => undefined);
      throw error;
    }

    const updated: MediaProxyUploadRecord = {
      ...record,
      actualSizeBytes: totalBytes,
      ready: true,
    };
    await this.setUploadRecord(updated, MEDIA_PROXY_READY_TTL_S);
    this.scheduleCleanup(updated.uploadId);
    return updated;
  }

  static async streamUploadToResponse(uploadId: string, res: Response): Promise<boolean> {
    const record = await this.getUploadRecord(uploadId);
    if (!record?.ready || !record.tempFilePath) {
      return false;
    }

    const fileStats = await stat(record.tempFilePath).catch(() => null);
    if (!fileStats) {
      return false;
    }

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Length', String(fileStats.size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    const readStream = createReadStream(record.tempFilePath);
    await new Promise<void>((resolve, reject) => {
      readStream.on('error', reject);
      res.on('close', resolve);
      readStream.on('end', resolve);
      readStream.pipe(res);
    });
    return true;
  }

  static async stageUploadToSignedStorageUrl(
    uploadId: string,
    bucket: { file: (path: string) => unknown }
  ): Promise<{ url: string; storagePath: string; mimeType: string; sizeBytes: number } | null> {
    const record = await this.getUploadRecord(uploadId);
    if (!record?.ready || !record.tempFilePath) {
      return null;
    }

    const fileStats = await stat(record.tempFilePath).catch(() => null);
    if (!fileStats) {
      return null;
    }

    const destinationFile = bucket.file(record.storagePath) as {
      createWriteStream: (options: {
        metadata: { contentType: string; cacheControl: string };
      }) => NodeJS.WritableStream;
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };

    const tempFilePath = record.tempFilePath;

    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(tempFilePath);
      const writeStream = destinationFile.createWriteStream({
        metadata: {
          contentType: record.mimeType,
          cacheControl: 'private, max-age=0',
        },
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      readStream.pipe(writeStream);
    });

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const [signedUrl] = await destinationFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });

    return {
      url: signedUrl,
      storagePath: record.storagePath,
      mimeType: record.mimeType,
      sizeBytes: fileStats.size,
    };
  }

  static async cleanupUpload(uploadId: string): Promise<void> {
    const timer = this.cleanupTimers.get(uploadId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(uploadId);
    }

    const record = await this.getUploadRecord(uploadId);
    if (record?.tempFilePath) {
      await rm(record.tempFilePath, { force: true }).catch(() => undefined);
    }
    await this.getRedis().del(this.uploadKey(uploadId));
  }

  /**
   * Explicit cleanup for callers that know an upload is finished with (e.g.
   * a tool that just consumed it). Equivalent to {@link cleanupUpload} — use
   * whichever name reads better at the call site.
   */
  static async cleanupTempProxyFile(uploadId: string): Promise<void> {
    await this.cleanupUpload(uploadId);
  }

  /**
   * Sweep the on-disk media-proxy temp directory for orphaned files older
   * than the ready-TTL. Used by the daily cron to recover any tmpfiles that
   * were not removed by their per-upload setTimeout (e.g. Node process
   * restarted between provisionUpload and the scheduled cleanup).
   *
   * Returns the number of files deleted.
   */
  static async sweepOrphanedTempFiles(maxAgeMs?: number): Promise<{
    scanned: number;
    deleted: number;
  }> {
    const cutoff = Date.now() - (maxAgeMs ?? MEDIA_PROXY_READY_TTL_S * 1000);
    let scanned = 0;
    let deleted = 0;
    let entries: string[];
    try {
      entries = await readdir(MEDIA_PROXY_TEMP_DIR);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { scanned: 0, deleted: 0 };
      }
      throw err;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(MEDIA_PROXY_TEMP_DIR, entry);
        scanned += 1;
        try {
          const fileStats = await stat(fullPath);
          if (!fileStats.isFile()) return;
          if (fileStats.mtimeMs > cutoff) return;
          await rm(fullPath, { force: true });
          deleted += 1;
        } catch (err) {
          logger.warn('Failed to evaluate media-proxy temp file during sweep', {
            path: fullPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    return { scanned, deleted };
  }

  private static scheduleCleanup(uploadId: string): void {
    const existingTimer = this.cleanupTimers.get(uploadId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      void this.cleanupUpload(uploadId).catch((error) => {
        logger.warn('Failed to cleanup media proxy upload', {
          uploadId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, MEDIA_PROXY_READY_TTL_S * 1000);
    timer.unref();
    this.cleanupTimers.set(uploadId, timer);
  }

  static async setAttachmentWaitOwner(operationId: string, userId: string): Promise<void> {
    await this.getRedis().set(
      this.attachmentWaitKey(operationId),
      userId,
      'EX',
      ATTACHMENT_WAIT_TTL_S
    );
  }

  static async getAttachmentWaitOwner(operationId: string): Promise<string | null> {
    return this.getRedis().get(this.attachmentWaitKey(operationId));
  }

  static async clearAttachmentWaitOwner(operationId: string): Promise<void> {
    await this.getRedis().del(this.attachmentWaitKey(operationId));
  }
}
