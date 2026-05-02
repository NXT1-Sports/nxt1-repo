import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { Storage } from 'firebase-admin/storage';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { logger } from '../../../../utils/logger.js';
import type { ToolExecutionContext } from '../base.tool.js';
import { validateUrl } from '../integrations/firecrawl/scraping/url-validator.js';

const DEFAULT_SIGNED_URL_TTL_MINUTES = 60;
const MAX_SIGNED_URL_TTL_MINUTES = 24 * 60;
const DEFAULT_FETCH_TIMEOUT_MS = 180_000;
const MAX_MEDIA_SIZE_BYTES = 512 * 1024 * 1024;
const DEFAULT_USER_AGENT = 'NXT1-AgentX/2026.1';

const SAFE_HEADER_ALLOWLIST = new Set([
  'accept',
  'authorization',
  'cookie',
  'origin',
  'range',
  'referer',
  'user-agent',
  // Internal service token for FFmpeg MCP — avoids Cloud Run platform auth conflicts.
  // Only forwarded to internal Cloud Run services; sourceUrl is validated before use.
  'x-ffmpeg-mcp-token',
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'video/mp2t': 'ts',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

export type StagedMediaKind = 'audio' | 'document' | 'image' | 'other' | 'video';

export interface StageRemoteMediaRequest {
  readonly sourceUrl: string;
  readonly staging: {
    readonly userId: string;
    readonly threadId: string;
  };
  readonly environment?: ToolExecutionContext['environment'];
  readonly fileName?: string | null;
  readonly mediaKind?: StagedMediaKind | 'auto';
  readonly contentType?: string | null;
  readonly expiresInMinutes?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface StagedMediaResult {
  readonly signedUrl: string;
  readonly expiresAt: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly sourceUrl: string;
  readonly sourceHost: string;
  readonly mediaKind: StagedMediaKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export class MediaStagingService {
  async stageFromUrl(request: StageRemoteMediaRequest): Promise<StagedMediaResult> {
    const validatedUrl = validateUrl(request.sourceUrl);
    const parsedSourceUrl = new URL(validatedUrl);
    const bucket = this.resolveStorage(request.environment).bucket();
    const sanitizedHeaders = this.sanitizeHeaders(request.headers);
    const fetchTimeout = AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS);

    const response = await fetch(validatedUrl, {
      headers: {
        Accept: '*/*',
        'User-Agent': DEFAULT_USER_AGENT,
        ...sanitizedHeaders,
      },
      redirect: 'follow',
      signal: fetchTimeout,
    });

    if (!response.ok) {
      throw new Error(`Media fetch failed with status ${response.status}`);
    }

    const mimeType = this.resolveMimeType(response.headers.get('content-type'), request);
    const mediaKind = this.resolveMediaKind(mimeType, request.mediaKind);
    const fileName = this.resolveFileName(parsedSourceUrl, request.fileName, mimeType, mediaKind);
    const hash = createHash('sha256')
      .update(`${validatedUrl}:${Date.now()}:${randomUUID()}`)
      .digest('hex')
      .slice(0, 16);
    const storagePath = [
      'Users',
      request.staging.userId,
      'threads',
      request.staging.threadId,
      'media',
      'staged',
      mediaKind,
      `${Date.now()}-${hash}-${fileName}`,
    ].join('/');

    const file = bucket.file(storagePath);
    const sizeBytes = await this.streamToStorage(file, response, mimeType, request, mediaKind);
    const expiresInMinutes = this.resolveExpiryMinutes(request.expiresInMinutes);
    const expiresAtDate = new Date(Date.now() + expiresInMinutes * 60_000);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAtDate,
      version: 'v4',
    });

    logger.info('[MediaStagingService] Staged media', {
      sourceHost: parsedSourceUrl.hostname,
      mediaKind,
      mimeType,
      sizeBytes,
      storagePath,
      threadId: request.staging.threadId,
      userId: request.staging.userId,
    });

    return {
      signedUrl,
      expiresAt: expiresAtDate.toISOString(),
      storagePath,
      fileName,
      sourceUrl: validatedUrl,
      sourceHost: parsedSourceUrl.hostname,
      mediaKind,
      mimeType,
      sizeBytes,
    };
  }

  private resolveStorage(environment?: ToolExecutionContext['environment']): Storage {
    if (environment === 'staging') return stagingStorage;
    if (environment === 'production') return defaultStorage;
    return process.env['NODE_ENV'] === 'staging' ? stagingStorage : defaultStorage;
  }

  private sanitizeHeaders(headers?: Readonly<Record<string, string>>): Record<string, string> {
    if (!headers) return {};

    const sanitized: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(headers)) {
      const key = rawKey.trim().toLowerCase();
      const value = rawValue.trim();

      if (!SAFE_HEADER_ALLOWLIST.has(key) || value.length === 0) {
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  }

  private resolveMimeType(
    headerContentType: string | null,
    request: StageRemoteMediaRequest
  ): string {
    const normalizedHeader = headerContentType?.split(';')[0]?.trim().toLowerCase() ?? '';
    const normalizedOverride = request.contentType?.trim().toLowerCase() ?? '';
    const candidate = normalizedOverride || normalizedHeader || 'application/octet-stream';

    if (
      candidate.startsWith('image/') ||
      candidate.startsWith('video/') ||
      candidate.startsWith('audio/') ||
      candidate === 'application/pdf' ||
      candidate === 'application/json' ||
      candidate === 'text/plain' ||
      candidate === 'application/octet-stream'
    ) {
      return candidate;
    }

    return 'application/octet-stream';
  }

  private resolveMediaKind(
    mimeType: string,
    requestedKind?: StagedMediaKind | 'auto'
  ): StagedMediaKind {
    if (requestedKind && requestedKind !== 'auto') {
      return requestedKind;
    }
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf' || mimeType === 'text/plain') return 'document';
    return 'other';
  }

  private resolveFileName(
    parsedSourceUrl: URL,
    requestedFileName: string | null | undefined,
    mimeType: string,
    mediaKind: StagedMediaKind
  ): string {
    const preferred =
      requestedFileName?.trim() || parsedSourceUrl.pathname.split('/').pop() || 'asset';
    const sanitizedBase = preferred.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
    const normalizedBase = sanitizedBase.length > 0 ? sanitizedBase : 'asset';
    const hasExtension = /\.[a-zA-Z0-9]{1,10}$/.test(normalizedBase);

    if (hasExtension) {
      return normalizedBase;
    }

    const ext = MIME_EXTENSION_MAP[mimeType] ?? this.fallbackExtension(mediaKind);
    return `${normalizedBase}.${ext}`;
  }

  private fallbackExtension(mediaKind: StagedMediaKind): string {
    switch (mediaKind) {
      case 'audio':
        return 'mp3';
      case 'document':
        return 'pdf';
      case 'image':
        return 'jpg';
      case 'video':
        return 'mp4';
      default:
        return 'bin';
    }
  }

  private resolveExpiryMinutes(expiresInMinutes?: number): number {
    if (!Number.isFinite(expiresInMinutes)) {
      return DEFAULT_SIGNED_URL_TTL_MINUTES;
    }

    return Math.max(1, Math.min(Math.trunc(expiresInMinutes ?? 0), MAX_SIGNED_URL_TTL_MINUTES));
  }

  private async streamToStorage(
    file: ReturnType<ReturnType<Storage['bucket']>['file']>,
    response: Response,
    mimeType: string,
    request: StageRemoteMediaRequest,
    mediaKind: StagedMediaKind
  ): Promise<number> {
    const writeStream = file.createWriteStream({
      resumable: false,
      metadata: {
        contentType: mimeType,
        cacheControl: 'private, max-age=3600',
        metadata: {
          expiresAt: new Date(
            Date.now() + this.resolveExpiryMinutes(request.expiresInMinutes) * 60_000
          ).toISOString(),
          mediaKind,
          sourceHost: new URL(request.sourceUrl).hostname,
          stagedBy: 'agent_x',
        },
      },
    });

    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
        throw new Error(`Media exceeds max staging size of ${MAX_MEDIA_SIZE_BYTES} bytes`);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        writeStream.end(buffer);
      });
      return buffer.length;
    }

    let totalBytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        totalBytes += Buffer.byteLength(chunk);
        if (totalBytes > MAX_MEDIA_SIZE_BYTES) {
          callback(new Error(`Media exceeds max staging size of ${MAX_MEDIA_SIZE_BYTES} bytes`));
          return;
        }

        callback(null, chunk);
      },
    });

    await pipeline(Readable.fromWeb(response.body as NodeReadableStream), limiter, writeStream);
    return totalBytes;
  }
}
