import { randomUUID } from 'node:crypto';
import { getSignedUrlWithTimeout } from '../../../../utils/gcs-signed-url.js';
import { logger } from '../../../../utils/logger.js';

type StorageBucketRef = {
  name: string;
  file: (path: string) => unknown;
};

export type AgentMediaSubfolder = 'image' | 'pdf' | 'csv' | 'doc' | 'video';

export interface BuildStoragePathInput {
  readonly userId: string;
  readonly threadId?: string | null;
  readonly mimeType: string;
  readonly fileName: string;
  readonly zone: 'media' | 'tmp';
  readonly timestamp?: number;
}

export type AgentMediaAccessUrlKind = 'firebase-download-token' | 'gcs-signed-read-fallback';

export interface AgentMediaAccessUrl {
  readonly url: string;
  readonly storagePath: string;
  readonly kind: AgentMediaAccessUrlKind;
  readonly durable: boolean;
  readonly expiresAt?: number;
}

export class AgentMediaLifecycleService {
  static readonly DEFAULT_SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000;
  static readonly DEFAULT_PUBLIC_FALLBACK_SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  static readonly POST_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

  private static readonly KNOWN_METADATA_PARSE_ERROR = 'parse error';
  static isOwnedByUser(storagePath: string, userId: string): boolean {
    return storagePath.startsWith(`Users/${userId}/`) && !storagePath.includes('..');
  }

  static requiresDurablePromotion(storagePath: string, userId: string): boolean {
    if (!this.isOwnedByUser(storagePath, userId)) {
      return false;
    }

    return storagePath.startsWith(`Users/${userId}/threads/`) || storagePath.includes('/tmp/');
  }

  private static async uploadBufferViaSignedPut(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly cacheControl: string;
  }): Promise<void> {
    const file = params.bucket.file(params.storagePath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'write';
        expires: number;
        contentType: string;
      }) => Promise<[string]>;
    };

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const [writeUrl] = await getSignedUrlWithTimeout(() =>
      file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
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
      throw new Error(`Failed to upload media buffer: signed PUT returned ${response.status}`);
    }
  }

  private static async saveBufferWithMetadata(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly cacheControl: string;
    readonly metadata: Record<string, string>;
  }): Promise<void> {
    const file = params.bucket.file(params.storagePath) as {
      save: (
        buffer: Buffer,
        options: {
          resumable: boolean;
          metadata: {
            contentType: string;
            cacheControl: string;
            metadata: Record<string, string>;
          };
        }
      ) => Promise<unknown>;
    };

    await file.save(params.buffer, {
      resumable: false,
      metadata: {
        contentType: params.mimeType,
        cacheControl: params.cacheControl,
        metadata: params.metadata,
      },
    });
  }

  private static extractStoragePathFromFirebaseObjectPath(pathname: string): string | null {
    const objectIndex = pathname.indexOf('/o/');
    if (objectIndex === -1) return null;

    const encoded = pathname.slice(objectIndex + 3);
    return encoded.length > 0 ? decodeURIComponent(encoded) : null;
  }

  static resolveSubfolder(mimeType: string): AgentMediaSubfolder {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (
      mimeType === 'text/csv' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return 'csv';
    }
    return 'doc';
  }

  static sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  static buildStoragePath(input: BuildStoragePathInput): string {
    const timestamp = input.timestamp ?? Date.now();
    const safeName = this.sanitizeFileName(input.fileName);
    const subfolder = this.resolveSubfolder(input.mimeType);
    const threadId = input.threadId?.trim() ?? '';

    if (threadId.length > 0) {
      return `Users/${input.userId}/threads/${threadId}/${input.zone}/${subfolder}/${timestamp}_${safeName}`;
    }

    if (input.zone === 'tmp') {
      return `Users/${input.userId}/uploads/tmp/${subfolder}/unbound/${timestamp}_${safeName}`;
    }

    return `Users/${input.userId}/uploads/${subfolder}/unbound/${timestamp}_${safeName}`;
  }

  static async saveBufferAndSignRead(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly cacheControl?: string;
    readonly signedUrlTtlMs?: number;
  }): Promise<{ url: string; expiresAt: number }> {
    const file = params.bucket.file(params.storagePath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };
    const cacheControl = params.cacheControl ?? 'private, max-age=0';

    await this.uploadBufferViaSignedPut({
      bucket: params.bucket,
      storagePath: params.storagePath,
      buffer: params.buffer,
      mimeType: params.mimeType,
      cacheControl,
    });

    const ttlMs = params.signedUrlTtlMs ?? this.DEFAULT_SIGNED_URL_TTL_MS;
    const expiresAt = Date.now() + ttlMs;

    const [signedUrl] = await getSignedUrlWithTimeout(() =>
      file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
    );

    return { url: signedUrl, expiresAt };
  }

  static async saveBufferAndMakePublic(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly cacheControl?: string;
    readonly signedUrlTtlMs?: number;
  }): Promise<AgentMediaAccessUrl> {
    const cacheControl = params.cacheControl ?? this.POST_MEDIA_CACHE_CONTROL;
    const downloadToken = randomUUID();

    await this.saveBufferWithMetadata({
      bucket: params.bucket,
      storagePath: params.storagePath,
      buffer: params.buffer,
      mimeType: params.mimeType,
      cacheControl,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    });

    return {
      url: this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, downloadToken),
      storagePath: params.storagePath,
      kind: 'firebase-download-token',
      durable: true,
    };
  }

  static promoteTmpPathToMediaPath(storagePath: string, userId: string): string {
    const ownedPrefix = `Users/${userId}/`;
    if (!storagePath.startsWith(ownedPrefix)) {
      throw new Error('Forbidden: file does not belong to this user');
    }
    if (storagePath.includes('..')) {
      throw new Error('Invalid storagePath');
    }
    if (!/\/tmp\//.test(storagePath)) {
      throw new Error('storagePath must reference a tmp/ folder');
    }

    return storagePath.replace('/tmp/', '/media/');
  }

  static async promoteTmpObject(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly userId: string;
    readonly signedUrlTtlMs?: number;
  }): Promise<{ url: string; storagePath: string; mimeType: string; sizeBytes: number }> {
    const promotedPath = this.promoteTmpPathToMediaPath(params.storagePath, params.userId);

    const srcFile = params.bucket.file(params.storagePath) as {
      exists: () => Promise<[boolean]>;
      getMetadata: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      copy: (destination: unknown) => Promise<unknown>;
      delete: () => Promise<unknown>;
    };
    const destFile = params.bucket.file(promotedPath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };

    const [exists] = await srcFile.exists();
    if (!exists) {
      throw new Error('Source file not found');
    }

    const [srcMetadata] = await srcFile.getMetadata();
    await srcFile.copy(destFile);
    await srcFile.delete();

    const ttlMs = params.signedUrlTtlMs ?? this.DEFAULT_SIGNED_URL_TTL_MS;
    const expiresAt = Date.now() + ttlMs;
    const [signedUrl] = await getSignedUrlWithTimeout(() =>
      destFile.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
    );

    return {
      url: signedUrl,
      storagePath: promotedPath,
      mimeType:
        typeof srcMetadata['contentType'] === 'string'
          ? srcMetadata['contentType']
          : 'application/octet-stream',
      sizeBytes: Number(srcMetadata['size'] ?? 0),
    };
  }

  static async promoteOwnedObjectToDurableUploadPath(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly userId: string;
    readonly mimeType?: string;
    readonly fileName?: string;
    readonly signedUrlTtlMs?: number;
  }): Promise<{ url: string; storagePath: string; mimeType: string; sizeBytes: number }> {
    if (!this.isOwnedByUser(params.storagePath, params.userId)) {
      throw new Error('Forbidden: file does not belong to this user');
    }

    const sourceFile = params.bucket.file(params.storagePath) as {
      exists: () => Promise<[boolean]>;
      getMetadata: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      copy: (destination: unknown) => Promise<unknown>;
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };

    const [exists] = await sourceFile.exists();
    if (!exists) {
      throw new Error('Source file not found');
    }

    const [sourceMetadata] = await sourceFile.getMetadata();
    const resolvedMimeType =
      typeof params.mimeType === 'string' && params.mimeType.trim().length > 0
        ? params.mimeType.trim()
        : typeof sourceMetadata['contentType'] === 'string'
          ? sourceMetadata['contentType']
          : 'application/octet-stream';
    const sourceFileName = params.storagePath.split('/').pop() ?? 'file';
    const resolvedFileName =
      typeof params.fileName === 'string' && params.fileName.trim().length > 0
        ? params.fileName.trim()
        : sourceFileName;

    const destinationPath = this.requiresDurablePromotion(params.storagePath, params.userId)
      ? this.buildStoragePath({
          userId: params.userId,
          mimeType: resolvedMimeType,
          fileName: resolvedFileName,
          zone: 'media',
        })
      : params.storagePath;

    const destinationFile = params.bucket.file(destinationPath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };

    if (destinationPath !== params.storagePath) {
      try {
        await sourceFile.copy(destinationFile);
      } catch {
        const downloadableSourceFile = sourceFile as typeof sourceFile & {
          download: () => Promise<[Buffer]>;
        };
        const [sourceBuffer] = await downloadableSourceFile.download();

        await this.saveBufferAndSignRead({
          bucket: params.bucket,
          storagePath: destinationPath,
          buffer: sourceBuffer,
          mimeType: resolvedMimeType,
          cacheControl: this.POST_MEDIA_CACHE_CONTROL,
          signedUrlTtlMs: params.signedUrlTtlMs,
        });
      }
    }

    const ttlMs = params.signedUrlTtlMs ?? this.DEFAULT_SIGNED_URL_TTL_MS;
    const expiresAt = Date.now() + ttlMs;
    const [signedUrl] = await getSignedUrlWithTimeout(() =>
      destinationFile.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
    );

    return {
      url: signedUrl,
      storagePath: destinationPath,
      mimeType: resolvedMimeType,
      sizeBytes: Number(sourceMetadata['size'] ?? 0),
    };
  }

  static extractStoragePathFromUrl(urlInput: string): string | null {
    const normalizedInput = urlInput.trim();
    if (!normalizedInput) return null;

    const bareStoragePath = normalizedInput.replace(/^\/+/, '');
    if (bareStoragePath.startsWith('Users/')) {
      return bareStoragePath;
    }

    const relativePath = normalizedInput.split(/[?#]/, 1)[0] ?? normalizedInput;
    const recoveredRelativePath = this.extractStoragePathFromFirebaseObjectPath(relativePath);
    if (recoveredRelativePath) {
      return recoveredRelativePath;
    }

    try {
      const url = new URL(normalizedInput);
      const pathname = url.pathname;

      const firebaseObjectPath = this.extractStoragePathFromFirebaseObjectPath(pathname);
      if (firebaseObjectPath) return firebaseObjectPath;

      if (url.hostname === 'storage.googleapis.com') {
        const withoutLeadingSlash = pathname.slice(1);
        const slashIdx = withoutLeadingSlash.indexOf('/');
        if (slashIdx === -1) return null;
        const objectPath = withoutLeadingSlash.slice(slashIdx + 1);
        return decodeURIComponent(objectPath);
      }

      return null;
    } catch {
      return null;
    }
  }

  static buildFirebaseDownloadUrl(bucketName: string, storagePath: string, token: string): string {
    return (
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${token}`
    );
  }

  static async ensureFirebaseDownloadUrl(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
  }): Promise<string> {
    const accessUrl = await this.issueFirebaseDownloadUrl(params);
    return accessUrl.url;
  }

  private static async issueFirebaseDownloadUrl(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly signedUrlTtlMs?: number;
  }): Promise<AgentMediaAccessUrl> {
    const file = params.bucket.file(params.storagePath) as {
      exists: () => Promise<[boolean]>;
      getMetadata?: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
      setMetadata: (metadata: {
        cacheControl?: string;
        metadata?: Record<string, string>;
      }) => Promise<unknown>;
    };

    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('Promoted media object was not found in storage');
    }

    const existingDownloadToken = await this.getExistingDownloadToken(file);
    if (existingDownloadToken) {
      return {
        url: this.buildFirebaseDownloadUrl(
          params.bucket.name,
          params.storagePath,
          existingDownloadToken
        ),
        storagePath: params.storagePath,
        kind: 'firebase-download-token',
        durable: true,
      };
    }

    const downloadToken = randomUUID();
    const tokenMetadataApplied = await this.applyDownloadTokenMetadata(file, {
      storagePath: params.storagePath,
      downloadToken,
    });

    if (!tokenMetadataApplied) {
      const ttlMs = params.signedUrlTtlMs ?? this.DEFAULT_PUBLIC_FALLBACK_SIGNED_URL_TTL_MS;
      const expiresAt = Date.now() + ttlMs;
      const [signedUrl] = await getSignedUrlWithTimeout(() =>
        file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
      );

      logger.warn(
        '[AgentMediaLifecycleService] Falling back to signed read URL after download-token metadata parse errors',
        {
          storagePath: params.storagePath,
          expiresAt,
        }
      );

      return {
        url: signedUrl,
        storagePath: params.storagePath,
        kind: 'gcs-signed-read-fallback',
        durable: false,
        expiresAt,
      };
    }

    return {
      url: this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, downloadToken),
      storagePath: params.storagePath,
      kind: 'firebase-download-token',
      durable: true,
    };
  }

  private static isKnownMetadataParseError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes(this.KNOWN_METADATA_PARSE_ERROR);
  }

  private static async applyDownloadTokenMetadata(
    file: {
      getMetadata?: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      setMetadata: (metadata: {
        cacheControl?: string;
        metadata?: Record<string, string>;
      }) => Promise<unknown>;
    },
    params: {
      readonly storagePath: string;
      readonly downloadToken: string;
    }
  ): Promise<boolean> {
    const metadata = {
      cacheControl: this.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: params.downloadToken,
      },
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await file.setMetadata(metadata);
        return true;
      } catch (error) {
        if (!this.isKnownMetadataParseError(error)) {
          throw error;
        }

        const verified = await this.hasDownloadToken(file, params.downloadToken);
        if (verified) {
          logger.info(
            '[AgentMediaLifecycleService] Download token metadata verified after parse-error response',
            {
              storagePath: params.storagePath,
              attempt,
            }
          );
          return true;
        }

        logger.warn(
          '[AgentMediaLifecycleService] Download token metadata parse-error path encountered',
          {
            storagePath: params.storagePath,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    return false;
  }

  private static async hasDownloadToken(
    file: {
      getMetadata?: () => Promise<[Record<string, unknown>, ...unknown[]]>;
    },
    expectedToken: string
  ): Promise<boolean> {
    const existingDownloadToken = await this.getExistingDownloadToken(file);
    return existingDownloadToken === expectedToken;
  }

  private static async getExistingDownloadToken(file: {
    getMetadata?: () => Promise<[Record<string, unknown>, ...unknown[]]>;
  }): Promise<string | null> {
    if (!file.getMetadata) {
      return null;
    }

    try {
      const [metadata] = await file.getMetadata();
      const rawTokens = metadata['metadata'];
      if (!rawTokens || typeof rawTokens !== 'object') {
        return null;
      }

      const tokenValue = (rawTokens as Record<string, unknown>)['firebaseStorageDownloadTokens'];
      if (typeof tokenValue !== 'string') {
        return null;
      }

      const normalizedToken = tokenValue
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .at(0);

      return normalizedToken ?? null;
    } catch (error) {
      logger.warn(
        '[AgentMediaLifecycleService] Failed to verify download token after parse error',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return null;
    }
  }

  static async promoteSignedUrlsToDestination(params: {
    readonly bucket: StorageBucketRef;
    readonly signedUrls: readonly string[];
    readonly userId: string;
    readonly destinationPrefix: string;
  }): Promise<string[]> {
    if (params.signedUrls.length === 0) return [];

    const promotedUrls: string[] = [];
    const ownedPrefix = `Users/${params.userId}/`;
    const threadPrefix = `${ownedPrefix}threads/`;

    for (const signedUrl of params.signedUrls) {
      try {
        const storagePath = this.extractStoragePathFromUrl(signedUrl);

        if (!storagePath) {
          promotedUrls.push(signedUrl);
          continue;
        }

        if (!storagePath.startsWith(ownedPrefix)) {
          promotedUrls.push(signedUrl);
          continue;
        }

        const shouldPromoteToPost =
          storagePath.startsWith(threadPrefix) || storagePath.includes('/tmp/');
        if (!shouldPromoteToPost) {
          const accessUrl = await this.issueFirebaseDownloadUrl({
            bucket: params.bucket,
            storagePath,
          });
          promotedUrls.push(accessUrl.url);
          continue;
        }

        const fileName = storagePath.split('/').pop();
        if (!fileName) {
          continue;
        }

        const destinationPath = `${params.destinationPrefix}/${fileName}`;
        const sourceFile = params.bucket.file(storagePath) as {
          copy: (destination: unknown) => Promise<unknown>;
        };
        const destinationFile = params.bucket.file(destinationPath);

        await sourceFile.copy(destinationFile);
        const accessUrl = await this.issueFirebaseDownloadUrl({
          bucket: params.bucket,
          storagePath: destinationPath,
        });
        promotedUrls.push(accessUrl.url);
      } catch {
        continue;
      }
    }

    return promotedUrls;
  }
}
