import { randomUUID } from 'node:crypto';
import { getSignedUrlWithTimeout } from '../../../../utils/gcs-signed-url.js';

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

export class AgentMediaLifecycleService {
  static readonly DEFAULT_SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000;
  static readonly POST_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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
      save: (
        buffer: Buffer,
        options: { metadata: { contentType: string; cacheControl: string } }
      ) => Promise<unknown>;
      getSignedUrl: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };
    await file.save(params.buffer, {
      metadata: {
        contentType: params.mimeType,
        cacheControl: params.cacheControl ?? 'private, max-age=0',
      },
    });

    const ttlMs = params.signedUrlTtlMs ?? this.DEFAULT_SIGNED_URL_TTL_MS;
    const expiresAt = Date.now() + ttlMs;

    const [signedUrl] = await getSignedUrlWithTimeout(() =>
      file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
    );

    return { url: signedUrl, expiresAt };
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

  private static async issueFirebaseDownloadUrl(params: {
    readonly bucket: StorageBucketRef;
    readonly storagePath: string;
  }): Promise<string> {
    const downloadToken = randomUUID();
    const file = params.bucket.file(params.storagePath) as {
      exists: () => Promise<[boolean]>;
      setMetadata: (metadata: {
        cacheControl?: string;
        metadata?: Record<string, string>;
      }) => Promise<unknown>;
    };

    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('Promoted media object was not found in storage');
    }

    await file.setMetadata({
      cacheControl: this.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    });

    return this.buildFirebaseDownloadUrl(params.bucket.name, params.storagePath, downloadToken);
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
          promotedUrls.push(
            await this.issueFirebaseDownloadUrl({
              bucket: params.bucket,
              storagePath,
            })
          );
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
        promotedUrls.push(
          await this.issueFirebaseDownloadUrl({
            bucket: params.bucket,
            storagePath: destinationPath,
          })
        );
      } catch {
        continue;
      }
    }

    return promotedUrls;
  }
}
