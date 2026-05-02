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
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });

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
    const [signedUrl] = await destFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });

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
    try {
      const url = new URL(urlInput);
      const pathname = url.pathname;

      const objectIndex = pathname.indexOf('/o/');
      if (objectIndex !== -1) {
        const encoded = pathname.slice(objectIndex + 3);
        return decodeURIComponent(encoded);
      }

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

  static async promoteSignedUrlsToDestination(params: {
    readonly bucket: StorageBucketRef;
    readonly signedUrls: readonly string[];
    readonly userId: string;
    readonly destinationPrefix: string;
  }): Promise<string[]> {
    if (params.signedUrls.length === 0) return [];

    const promotedUrls: string[] = [];
    const threadPrefix = `Users/${params.userId}/threads/`;

    for (const signedUrl of params.signedUrls) {
      try {
        const storagePath = this.extractStoragePathFromUrl(signedUrl);
        if (!storagePath || !storagePath.startsWith(threadPrefix)) {
          promotedUrls.push(signedUrl);
          continue;
        }

        const fileName = storagePath.split('/').pop();
        if (!fileName) {
          promotedUrls.push(signedUrl);
          continue;
        }

        const destinationPath = `${params.destinationPrefix}/${fileName}`;
        const sourceFile = params.bucket.file(storagePath) as {
          copy: (destination: unknown) => Promise<unknown>;
        };
        const destinationFile = params.bucket.file(destinationPath) as {
          makePublic: () => Promise<unknown>;
        };

        await sourceFile.copy(destinationFile);
        await destinationFile.makePublic();

        promotedUrls.push(
          `https://storage.googleapis.com/${params.bucket.name}/${destinationPath}`
        );
      } catch {
        promotedUrls.push(signedUrl);
      }
    }

    return promotedUrls;
  }
}
