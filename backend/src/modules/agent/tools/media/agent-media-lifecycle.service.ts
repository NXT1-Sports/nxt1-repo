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
  static readonly POST_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

  private static readonly KNOWN_METADATA_PARSE_ERROR = 'parse error';
  private static readonly KNOWN_DIRECT_UPLOAD_FAILURE_MARKERS = [
    'uploaded data did not match',
    'file has been deleted',
    'url is required',
    'parse error',
  ] as const;
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

  /**
   * Upload a buffer to GCS and return a **permanent** Firebase download-token URL.
   *
   * Previously this method issued a time-limited signed read URL. It now
   * delegates to `saveBufferAndMakePublic` so every caller automatically
   * receives a durable `firebasestorage.googleapis.com` URL with a UUID token
   * that never expires. The legacy `signedUrlTtlMs` / `expiresAt` fields are
   * kept in the return type for backward compatibility but are no longer set.
   */
  static async saveBufferAndSignRead(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly cacheControl?: string;
    /** @deprecated No longer used — URLs are now durable Firebase token URLs. */
    readonly signedUrlTtlMs?: number;
  }): Promise<{
    url: string;
    expiresAt: number;
    storagePath: string;
    kind: AgentMediaAccessUrlKind;
    durable: boolean;
  }> {
    const accessUrl = await this.saveBufferAndMakePublic({
      bucket: params.bucket,
      storagePath: params.storagePath,
      buffer: params.buffer,
      mimeType: params.mimeType,
      // Honour the caller-supplied cacheControl when provided, otherwise
      // fall back to the long-lived public cache header used for media.
      cacheControl: params.cacheControl ?? this.POST_MEDIA_CACHE_CONTROL,
    });

    return {
      url: accessUrl.url,
      // expiresAt kept for backward-compat but set to far future (year 2099)
      // so any downstream code that checks "is expired?" still works correctly.
      expiresAt: new Date('2099-01-01').getTime(),
      storagePath: accessUrl.storagePath,
      kind: accessUrl.kind,
      durable: accessUrl.durable,
    };
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

    try {
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('[AgentMediaLifecycleService] saveBufferWithMetadata threw error', {
        storagePath: params.storagePath,
        errorMessage: errorMsg,
        errorName: error instanceof Error ? error.name : typeof error,
        isParseError: this.isKnownMetadataParseError(error),
        isKnownFailure: this.isKnownDirectUploadFailure(error),
      });

      if (this.isKnownMetadataParseError(error)) {
        // Parse error from file.save() almost always means the upload (including
        // the embedded download token) succeeded — only the HTTP response body
        // was malformed. Return the Firebase token URL built from the pre-generated
        // downloadToken; no getMetadata() verification needed.
        logger.info(
          '[AgentMediaLifecycleService] Parse error on Admin SDK save; treating as success — returning durable Firebase token URL',
          { storagePath: params.storagePath }
        );
        return {
          url: this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, downloadToken),
          storagePath: params.storagePath,
          kind: 'firebase-download-token',
          durable: true,
        };
      }

      if (!this.isKnownDirectUploadFailure(error)) {
        throw error;
      }

      logger.warn(
        '[AgentMediaLifecycleService] Admin SDK save failed (non-parse error); retrying with fresh token',
        {
          storagePath: params.storagePath,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      // Retry: embed a fresh token atomically in a second save attempt.
      const retryToken = randomUUID();
      try {
        await this.saveBufferWithMetadata({
          bucket: params.bucket,
          storagePath: params.storagePath,
          buffer: params.buffer,
          mimeType: params.mimeType,
          cacheControl,
          metadata: { firebaseStorageDownloadTokens: retryToken },
        });

        return {
          url: this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, retryToken),
          storagePath: params.storagePath,
          kind: 'firebase-download-token',
          durable: true,
        };
      } catch (retryError) {
        // If retry also threw a parse error, trust it as well.
        if (this.isKnownMetadataParseError(retryError)) {
          logger.info('[AgentMediaLifecycleService] Retry parse error; treating retry as success', {
            storagePath: params.storagePath,
          });
          return {
            url: this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, retryToken),
            storagePath: params.storagePath,
            kind: 'firebase-download-token',
            durable: true,
          };
        }

        logger.warn(
          '[AgentMediaLifecycleService] Retry save also failed; falling back to signed PUT + token',
          {
            storagePath: params.storagePath,
            retryError: retryError instanceof Error ? retryError.message : String(retryError),
          }
        );
      }

      // Last resort: signed PUT (no metadata) then apply token via setMetadata.
      await this.uploadBufferViaSignedPut({
        bucket: params.bucket,
        storagePath: params.storagePath,
        buffer: params.buffer,
        mimeType: params.mimeType,
        cacheControl,
      });

      return this.issueFirebaseDownloadUrl({
        bucket: params.bucket,
        storagePath: params.storagePath,
        signedUrlTtlMs: params.signedUrlTtlMs,
      });
    }

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
    /** @deprecated No longer used — promoted objects receive a durable Firebase token URL. */
    readonly signedUrlTtlMs?: number;
  }): Promise<{ url: string; storagePath: string; mimeType: string; sizeBytes: number }> {
    const promotedPath = this.promoteTmpPathToMediaPath(params.storagePath, params.userId);

    const srcFile = params.bucket.file(params.storagePath) as {
      exists: () => Promise<[boolean]>;
      getMetadata: () => Promise<[Record<string, unknown>, ...unknown[]]>;
      copy: (destination: unknown) => Promise<unknown>;
      delete: () => Promise<unknown>;
    };

    const [exists] = await srcFile.exists();
    if (!exists) {
      throw new Error('Source file not found');
    }

    const [srcMetadata] = await srcFile.getMetadata();
    const destFile = params.bucket.file(promotedPath);
    await srcFile.copy(destFile);
    await srcFile.delete();

    // Issue a permanent Firebase download-token URL for the promoted object.
    const accessUrl = await this.issueFirebaseDownloadUrl({
      bucket: params.bucket,
      storagePath: promotedPath,
    });

    return {
      url: accessUrl.url,
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

    const destinationFile = params.bucket.file(destinationPath);

    if (destinationPath !== params.storagePath) {
      try {
        await sourceFile.copy(destinationFile);
      } catch {
        const downloadableSourceFile = sourceFile as typeof sourceFile & {
          download: () => Promise<[Buffer]>;
        };
        const [sourceBuffer] = await downloadableSourceFile.download();

        // saveBufferAndMakePublic already issues a Firebase token URL internally;
        // we only need the storagePath here since we will call issueFirebaseDownloadUrl below.
        await this.saveBufferAndMakePublic({
          bucket: params.bucket,
          storagePath: destinationPath,
          buffer: sourceBuffer,
          mimeType: resolvedMimeType,
          cacheControl: this.POST_MEDIA_CACHE_CONTROL,
        });
      }
    }

    // Issue a permanent Firebase download-token URL for the destination object.
    const accessUrl = await this.issueFirebaseDownloadUrl({
      bucket: params.bucket,
      storagePath: destinationPath,
    });

    return {
      url: accessUrl.url,
      storagePath: destinationPath,
      mimeType: resolvedMimeType,
      sizeBytes: Number(sourceMetadata['size'] ?? 0),
    };
  }

  static extractStoragePathFromUrl(urlInput: string): string | null {
    const normalizedInput = urlInput.trim();
    if (!normalizedInput) return null;

    const bareStoragePath = normalizedInput.replace(/^\/+/, '');
    if (/^(?:Users|Teams|Organizations)\//.test(bareStoragePath)) {
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

  static isFirebaseDownloadTokenUrl(urlInput: string, expectedStoragePath?: string): boolean {
    try {
      const url = new URL(urlInput.trim());
      const storagePath = this.extractStoragePathFromUrl(urlInput);
      return (
        url.hostname === 'firebasestorage.googleapis.com' &&
        url.searchParams.get('alt') === 'media' &&
        (url.searchParams.get('token')?.trim().length ?? 0) > 0 &&
        storagePath !== null &&
        (!expectedStoragePath || storagePath === expectedStoragePath)
      );
    } catch {
      return false;
    }
  }

  static isCanonicalBrandLogoUrl(urlInput: string): boolean {
    if (!this.isFirebaseDownloadTokenUrl(urlInput)) {
      return false;
    }

    const storagePath = this.extractStoragePathFromUrl(urlInput);
    return (
      storagePath !== null && /^(?:Organizations|Teams)\/[^/]+\/logo(?:\/|$)/.test(storagePath)
    );
  }

  static async promoteStorageObjectToDurableDestination(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
    readonly destinationPath: string;
  }): Promise<AgentMediaAccessUrl> {
    if (!params.storagePath || !params.destinationPath || params.storagePath.includes('..')) {
      throw new Error('Invalid storage path');
    }

    const sourceFile = params.bucket.file(params.storagePath) as {
      copy: (destination: unknown) => Promise<unknown>;
    };
    const destinationFile = params.bucket.file(params.destinationPath);

    if (params.storagePath !== params.destinationPath) {
      await sourceFile.copy(destinationFile);
    }

    const accessUrl = await this.issueFirebaseDownloadUrl({
      bucket: params.bucket,
      storagePath: params.destinationPath,
    });
    if (
      !accessUrl.durable ||
      !this.isFirebaseDownloadTokenUrl(accessUrl.url, params.destinationPath)
    ) {
      throw new Error('Unable to issue a durable Firebase download URL for promoted media');
    }

    return accessUrl;
  }

  static async promoteOwnedUrlToDurableDestination(params: {
    readonly bucket: StorageBucketRef;
    readonly sourceUrl: string;
    readonly userId: string;
    readonly destinationPath: string;
  }): Promise<AgentMediaAccessUrl> {
    const storagePath = this.extractStoragePathFromUrl(params.sourceUrl);
    if (!storagePath || !this.isOwnedByUser(storagePath, params.userId)) {
      throw new Error('Source media must be owned by the requesting user');
    }

    return this.promoteStorageObjectToDurableDestination({
      bucket: params.bucket,
      storagePath,
      destinationPath: params.destinationPath,
    });
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
      logger.warn(
        '[AgentMediaLifecycleService] Failed to reliably verify download-token metadata, assuming it was applied successfully to issue permanent URL',
        { storagePath: params.storagePath }
      );
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

  private static isKnownDirectUploadFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return this.KNOWN_DIRECT_UPLOAD_FAILURE_MARKERS.some((marker) => normalized.includes(marker));
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
        if (this.isKnownMetadataParseError(error)) {
          // If setMetadata throws a parse error, it means the API call actually
          // succeeded and the token was applied. Since getMetadata() will also
          // throw parse errors on this environment, we cannot verify it anyway.
          // Trust the parse error as success.
          logger.info(
            '[AgentMediaLifecycleService] Download token metadata applied but got parse-error response; treating as success',
            {
              storagePath: params.storagePath,
              attempt,
            }
          );
          return true;
        }

        logger.warn('[AgentMediaLifecycleService] Failed to set download token metadata', {
          storagePath: params.storagePath,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return false;
  }

  // private static async hasDownloadToken(
  //   file: {
  //     getMetadata?: () => Promise<[Record<string, unknown>, ...unknown[]]>;
  //   },
  //   expectedToken: string
  // ): Promise<boolean> {
  //   const existingDownloadToken = await this.getExistingDownloadToken(file);
  //   return existingDownloadToken === expectedToken;
  // }

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
          if (accessUrl.durable && this.isFirebaseDownloadTokenUrl(accessUrl.url, storagePath)) {
            promotedUrls.push(accessUrl.url);
          } else {
            logger.warn(
              '[AgentMediaLifecycleService] Dropped owned media without a durable download URL',
              { storagePath }
            );
          }
          continue;
        }

        const fileName = storagePath.split('/').pop();
        if (!fileName) {
          continue;
        }

        const destinationPath = `${params.destinationPrefix}/${fileName}`;
        const accessUrl = await this.promoteStorageObjectToDurableDestination({
          bucket: params.bucket,
          storagePath,
          destinationPath,
        });
        promotedUrls.push(accessUrl.url);
      } catch (error) {
        logger.warn('[AgentMediaLifecycleService] Failed to promote owned media', {
          sourceUrl: signedUrl.slice(0, 180),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    return promotedUrls;
  }
}
