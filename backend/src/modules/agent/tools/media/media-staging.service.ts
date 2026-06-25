import { createHash, randomUUID } from 'node:crypto';
import type { Storage } from 'firebase-admin/storage';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { getSignedUrlWithTimeout } from '../../../../utils/gcs-signed-url.js';
import { logger } from '../../../../utils/logger.js';
import type { ToolExecutionContext } from '../base.tool.js';
import { AgentMediaLifecycleService } from './agent-media-lifecycle.service.js';
import { validateUrl } from '../integrations/firecrawl/scraping/url-validator.js';

const DEFAULT_SIGNED_URL_TTL_MINUTES = 60;
const MAX_SIGNED_URL_TTL_MINUTES = 24 * 60;
const DEFAULT_FETCH_TIMEOUT_MS = 180_000;
const MAX_MEDIA_SIZE_BYTES = 512 * 1024 * 1024;
const MIN_STAGED_VIDEO_BYTES = 16 * 1024;
const VIDEO_SIGNATURE_SAMPLE_BYTES = 8192;
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
    const directOwnedStage = await this.tryStageOwnedFirebaseObject({
      bucket,
      validatedUrl,
      parsedSourceUrl,
      request,
    });
    if (directOwnedStage) {
      return directOwnedStage;
    }
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
    this.assertStageableResponse(mimeType, mediaKind);
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
    let sizeBytes: number;
    try {
      sizeBytes = await this.streamToStorage(file, response, mimeType, request, mediaKind);
    } catch (error) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
    if (mediaKind === 'video' && sizeBytes < MIN_STAGED_VIDEO_BYTES) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw new Error(
        `Staged video payload is too small (${sizeBytes} bytes). ` +
          'Resolve the provider source to a downloadable video file before staging.'
      );
    }
    const expiresInMinutes = this.resolveExpiryMinutes(request.expiresInMinutes);
    const expiresAtDate = new Date(Date.now() + expiresInMinutes * 60_000);
    const [signedUrl] = await getSignedUrlWithTimeout(() =>
      file.getSignedUrl({ action: 'read', expires: expiresAtDate, version: 'v4' })
    );

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

  private isIgnorableMetadataUpdateError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('parse error');
  }

  private async applyObjectMetadataBestEffort(params: {
    readonly file: {
      setMetadata: (metadata: {
        contentType: string;
        cacheControl: string;
        metadata: Record<string, string>;
      }) => Promise<unknown>;
    };
    readonly contentType: string;
    readonly cacheControl: string;
    readonly metadata: Record<string, string>;
    readonly storagePath: string;
  }): Promise<void> {
    try {
      await params.file.setMetadata({
        contentType: params.contentType,
        cacheControl: params.cacheControl,
        metadata: params.metadata,
      });
    } catch (error) {
      if (!this.isIgnorableMetadataUpdateError(error)) {
        throw error;
      }

      logger.info(
        '[MediaStagingService] Metadata update skipped after successful upload due to known parse-error path',
        {
          storagePath: params.storagePath,
          metadataError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async tryStageOwnedFirebaseObject(params: {
    readonly bucket: ReturnType<Storage['bucket']>;
    readonly validatedUrl: string;
    readonly parsedSourceUrl: URL;
    readonly request: StageRemoteMediaRequest;
  }): Promise<StagedMediaResult | null> {
    const firebaseScope = this.getFirebaseUrlScope(params.validatedUrl);
    if (!firebaseScope) {
      return null;
    }

    if (firebaseScope.bucketName !== params.bucket.name) {
      return null;
    }

    if (!firebaseScope.storagePath.startsWith(`Users/${params.request.staging.userId}/`)) {
      return null;
    }

    const sourceFile = params.bucket.file(firebaseScope.storagePath) as {
      exists: () => Promise<[boolean]>;
      getMetadata: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      copy: (destination: unknown) => Promise<unknown>;
    };

    const [exists] = await sourceFile.exists();
    if (!exists) {
      throw new Error('Source file not found');
    }

    const [sourceMetadata] = await sourceFile.getMetadata();
    const mimeType = this.resolveMimeType(
      typeof sourceMetadata['contentType'] === 'string' ? sourceMetadata['contentType'] : null,
      params.request
    );
    const mediaKind = this.resolveMediaKind(mimeType, params.request.mediaKind);
    this.assertStageableResponse(mimeType, mediaKind);
    const fileName = this.resolveFileName(
      params.parsedSourceUrl,
      params.request.fileName,
      mimeType,
      mediaKind
    );
    const hash = createHash('sha256')
      .update(`${params.validatedUrl}:${Date.now()}:${randomUUID()}`)
      .digest('hex')
      .slice(0, 16);
    const storagePath = [
      'Users',
      params.request.staging.userId,
      'threads',
      params.request.staging.threadId,
      'media',
      'staged',
      mediaKind,
      `${Date.now()}-${hash}-${fileName}`,
    ].join('/');
    const stagedFile = params.bucket.file(storagePath) as {
      getSignedUrl: (options: {
        action: 'read';
        expires: Date;
        version: 'v4';
      }) => Promise<[string]>;
      setMetadata: (metadata: {
        contentType: string;
        cacheControl: string;
        metadata: Record<string, string>;
      }) => Promise<unknown>;
      delete: (options: { ignoreNotFound: true }) => Promise<unknown>;
    };

    try {
      await sourceFile.copy(stagedFile);
      await this.applyObjectMetadataBestEffort({
        file: stagedFile,
        contentType: mimeType,
        cacheControl: 'private, max-age=3600',
        metadata: {
          expiresAt: new Date(
            Date.now() + this.resolveExpiryMinutes(params.request.expiresInMinutes) * 60_000
          ).toISOString(),
          mediaKind,
          sourceHost: params.parsedSourceUrl.hostname,
          stagedBy: 'agent_x',
        },
        storagePath,
      });

      const sizeBytes = Number(sourceMetadata['size'] ?? 0);
      if (mediaKind === 'video' && sizeBytes < MIN_STAGED_VIDEO_BYTES) {
        await stagedFile.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw new Error(
          `Staged video payload is too small (${sizeBytes} bytes). ` +
            'Resolve the provider source to a downloadable video file before staging.'
        );
      }

      const expiresInMinutes = this.resolveExpiryMinutes(params.request.expiresInMinutes);
      const expiresAtDate = new Date(Date.now() + expiresInMinutes * 60_000);
      const [signedUrl] = await getSignedUrlWithTimeout(() =>
        stagedFile.getSignedUrl({ action: 'read', expires: expiresAtDate, version: 'v4' })
      );

      logger.info('[MediaStagingService] Staged owned Firebase media by storage copy', {
        sourceHost: params.parsedSourceUrl.hostname,
        mediaKind,
        mimeType,
        sizeBytes,
        sourceStoragePath: firebaseScope.storagePath,
        storagePath,
        threadId: params.request.staging.threadId,
        userId: params.request.staging.userId,
      });

      return {
        signedUrl,
        expiresAt: expiresAtDate.toISOString(),
        storagePath,
        fileName,
        sourceUrl: params.validatedUrl,
        sourceHost: params.parsedSourceUrl.hostname,
        mediaKind,
        mimeType,
        sizeBytes,
      };
    } catch (error) {
      await stagedFile.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  }

  private async uploadBufferViaSignedPut(params: {
    readonly file: ReturnType<ReturnType<Storage['bucket']>['file']>;
    readonly mimeType: string;
    readonly cacheControl: string;
    readonly buffer: Buffer;
  }): Promise<void> {
    const [writeUrl] = await getSignedUrlWithTimeout(() =>
      params.file.getSignedUrl({
        action: 'write',
        expires: new Date(Date.now() + 5 * 60_000),
        version: 'v4',
        contentType: params.mimeType,
      })
    );

    const response = await fetch(writeUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': params.mimeType,
        'Cache-Control': params.cacheControl,
      },
      body: new Uint8Array(params.buffer),
    });

    if (!response.ok) {
      throw new Error(`Signed PUT staging upload failed with status ${response.status}`);
    }
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

  private assertStageableResponse(mimeType: string, mediaKind: StagedMediaKind): void {
    if (mediaKind !== 'video') return;

    if (
      mimeType.startsWith('video/') ||
      mimeType === 'application/octet-stream' ||
      mimeType === 'application/vnd.apple.mpegurl'
    ) {
      return;
    }

    throw new Error(
      `Cannot stage response as video because the source returned ${mimeType}. ` +
        'Use the media classifier/provider-specific resolver to obtain real video bytes first.'
    );
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

  private getFirebaseUrlScope(
    urlInput: string
  ): { readonly bucketName: string; readonly storagePath: string } | null {
    const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(urlInput);
    if (!storagePath) {
      return null;
    }

    try {
      const parsed = new URL(urlInput);
      if (parsed.hostname === 'storage.googleapis.com') {
        const withoutLeadingSlash = parsed.pathname.slice(1);
        const slashIdx = withoutLeadingSlash.indexOf('/');
        if (slashIdx === -1) return null;
        return {
          bucketName: withoutLeadingSlash.slice(0, slashIdx),
          storagePath,
        };
      }

      if (parsed.hostname === 'firebasestorage.googleapis.com') {
        const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\//);
        return match ? { bucketName: match[1], storagePath } : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async streamToStorage(
    file: ReturnType<ReturnType<Storage['bucket']>['file']>,
    response: Response,
    mimeType: string,
    request: StageRemoteMediaRequest,
    mediaKind: StagedMediaKind
  ): Promise<number> {
    const cacheControl = 'private, max-age=3600';
    const metadata = {
      expiresAt: new Date(
        Date.now() + this.resolveExpiryMinutes(request.expiresInMinutes) * 60_000
      ).toISOString(),
      mediaKind,
      sourceHost: new URL(request.sourceUrl).hostname,
      stagedBy: 'agent_x',
    };

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
      throw new Error(`Media exceeds max staging size of ${MAX_MEDIA_SIZE_BYTES} bytes`);
    }

    this.assertPlausibleVideoPayload(buffer.subarray(0, VIDEO_SIGNATURE_SAMPLE_BYTES), mediaKind);
    await this.uploadBufferViaSignedPut({
      file,
      mimeType,
      cacheControl,
      buffer,
    });
    await this.applyObjectMetadataBestEffort({
      file: file as {
        setMetadata: (metadata: {
          contentType: string;
          cacheControl: string;
          metadata: Record<string, string>;
        }) => Promise<unknown>;
      },
      contentType: mimeType,
      cacheControl,
      metadata,
      storagePath: (file as { name?: string }).name ?? '[unknown-storage-path]',
    });

    return buffer.length;
  }

  private assertPlausibleVideoPayload(sample: Buffer, mediaKind: StagedMediaKind): void {
    if (mediaKind !== 'video' || sample.length === 0) return;

    if (this.isPlausibleVideoPayload(sample)) return;

    throw new Error(
      'Staged video payload is not a recognizable playable video file. ' +
        'Resolve the provider source to a direct downloadable video before staging.'
    );
  }

  private isPlausibleVideoPayload(sample: Buffer): boolean {
    const ascii = sample.subarray(0, Math.min(sample.length, 512)).toString('ascii').trimStart();
    const lowerAscii = ascii.toLowerCase();

    if (
      lowerAscii.startsWith('<!doctype') ||
      lowerAscii.startsWith('<html') ||
      lowerAscii.startsWith('{') ||
      lowerAscii.startsWith('[')
    ) {
      return false;
    }

    if (ascii.startsWith('#EXTM3U')) return true;
    if (sample.includes(Buffer.from('ftyp'), 4)) return true;
    if (sample[0] === 0x1a && sample[1] === 0x45 && sample[2] === 0xdf && sample[3] === 0xa3) {
      return true;
    }
    if (sample[0] === 0x47 && (sample[188] === 0x47 || sample[376] === 0x47)) return true;

    return false;
  }
}
