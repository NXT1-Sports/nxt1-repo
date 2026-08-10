import { describe, expect, it, vi } from 'vitest';
import { AgentMediaLifecycleService } from '../agent-media-lifecycle.service.js';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

type MockFile = {
  copy?: ReturnType<typeof vi.fn>;
  exists?: ReturnType<typeof vi.fn>;
  getMetadata?: ReturnType<typeof vi.fn>;
  getSignedUrl?: ReturnType<typeof vi.fn>;
  save?: ReturnType<typeof vi.fn>;
  setMetadata?: ReturnType<typeof vi.fn>;
};

function createBucket(files: Record<string, MockFile>) {
  return {
    name: 'test-bucket',
    file: vi.fn((path: string) => files[path] ?? {}),
  };
}

describe('AgentMediaLifecycleService.saveBufferAndMakePublic', () => {
  it('returns a Firebase download-token URL for generated graphics', async () => {
    const storagePath = 'Users/user-1/threads/thread-1/media/123_graphic.png';
    const file = {
      save: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = createBucket({ [storagePath]: file });

    const result = await AgentMediaLifecycleService.saveBufferAndMakePublic({
      bucket,
      storagePath,
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    expect(file.save).toHaveBeenCalledWith(Buffer.from('image-bytes'), {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          ),
        },
      },
    });
    expect(result).toMatchObject({
      storagePath,
      kind: 'firebase-download-token',
      durable: true,
    });
    expect(result.url).toContain('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/');
    expect(result.url).toContain(encodeURIComponent(storagePath));
    expect(result.url).toContain('?alt=media&token=');
    expect(result.url).not.toContain('X-Goog-Signature');
    expect(result.expiresAt).toBeUndefined();
  });

  it('falls back to signed PUT when direct generated graphic upload fails integrity checks', async () => {
    const storagePath = 'Users/user-1/threads/thread-1/media/123_graphic.png';
    const file = {
      save: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'The uploaded data did not match the data from the server. As a precaution, the file has been deleted.'
          )
        ),
      getSignedUrl: vi.fn().mockResolvedValueOnce(['https://signed.example/file.png?upload=1']),
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([{ metadata: {} }]),
      setMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = createBucket({ [storagePath]: file });
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await AgentMediaLifecycleService.saveBufferAndMakePublic({
      bucket,
      storagePath,
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    expect(file.save).toHaveBeenCalledOnce();
    expect(file.getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'write',
      expires: expect.any(Number),
      contentType: 'image/png',
    });
    expect(mockFetch).toHaveBeenCalledWith('https://signed.example/file.png?upload=1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: new Uint8Array(Buffer.from('image-bytes')),
    });
    expect(file.setMetadata).toHaveBeenCalledWith({
      cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ),
      },
    });
    expect(result).toMatchObject({
      storagePath,
      kind: 'firebase-download-token',
      durable: true,
    });
    expect(result.url).toContain('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/');
    expect(result.url).toContain(encodeURIComponent(storagePath));
    expect(result.url).toContain('?alt=media&token=');
  });
});

describe('AgentMediaLifecycleService.extractStoragePathFromUrl', () => {
  it('recovers the storage path from a relative Firebase object URL', () => {
    const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(
      '/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fexports%2Fgame-report.pdf?alt=media&token=abc123'
    );

    expect(storagePath).toBe('Users/user-1/threads/thread-1/exports/game-report.pdf');
  });

  it('accepts a bare storage path', () => {
    const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(
      'Users/user-1/threads/thread-1/exports/game-report.pdf'
    );

    expect(storagePath).toBe('Users/user-1/threads/thread-1/exports/game-report.pdf');
  });

  it('recognizes only Firebase download-token URLs as durable access URLs', () => {
    const storagePath = 'Organizations/org-1/logo';
    const tokenUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Organizations%2Forg-1%2Flogo?alt=media&token=download-token';

    expect(AgentMediaLifecycleService.isFirebaseDownloadTokenUrl(tokenUrl, storagePath)).toBe(true);
    expect(
      AgentMediaLifecycleService.isFirebaseDownloadTokenUrl(
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Organizations%2Forg-1%2Flogo?alt=media',
        storagePath
      )
    ).toBe(false);
    expect(
      AgentMediaLifecycleService.isFirebaseDownloadTokenUrl(
        'https://storage.googleapis.com/test-bucket/Organizations/org-1/logo',
        storagePath
      )
    ).toBe(false);
  });

  it('accepts only canonical tokenized organization and team logo URLs', () => {
    const organizationLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Organizations%2Forg-1%2Flogo?alt=media&token=organization-token';
    const teamLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Teams%2Fteam-1%2Flogo%2Fupload.png?alt=media&token=team-token';

    expect(AgentMediaLifecycleService.isCanonicalBrandLogoUrl(organizationLogoUrl)).toBe(true);
    expect(AgentMediaLifecycleService.isCanonicalBrandLogoUrl(teamLogoUrl)).toBe(true);
    expect(
      AgentMediaLifecycleService.isCanonicalBrandLogoUrl(
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Ftmp%2Fimage%2Flogo.png?alt=media&token=thread-token'
      )
    ).toBe(false);
    expect(
      AgentMediaLifecycleService.isCanonicalBrandLogoUrl(
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Organizations%2Forg-1%2Flogo?alt=media'
      )
    ).toBe(false);
    expect(
      AgentMediaLifecycleService.isCanonicalBrandLogoUrl(
        'https://storage.googleapis.com/test-bucket/Organizations/org-1/logo?X-Goog-Algorithm=GOOG4-RSA-SHA256'
      )
    ).toBe(false);
    expect(
      AgentMediaLifecycleService.isCanonicalBrandLogoUrl('https://cdn.example.com/logo.png')
    ).toBe(false);
  });
});

describe('AgentMediaLifecycleService.saveBufferAndSignRead', () => {
  it('uploads buffers with signed puts before signing reads', async () => {
    const storagePath = 'Users/user-1/uploads/image/unbound/123_graphic.png';
    const file = {
      getSignedUrl: vi
        .fn()
        .mockResolvedValueOnce(['https://signed.example/file.png?upload=1'])
        .mockResolvedValueOnce(['https://signed.example/file.png']),
    };
    const bucket = createBucket({ [storagePath]: file });
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await AgentMediaLifecycleService.saveBufferAndSignRead({
      bucket,
      storagePath,
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/png',
    });

    expect(file.getSignedUrl).toHaveBeenNthCalledWith(1, {
      version: 'v4',
      action: 'write',
      expires: expect.any(Number),
      contentType: 'image/png',
    });
    expect(mockFetch).toHaveBeenCalledWith('https://signed.example/file.png?upload=1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=0',
      },
      body: new Uint8Array(Buffer.from('image-bytes')),
    });
    expect(file.getSignedUrl).toHaveBeenNthCalledWith(2, {
      version: 'v4',
      action: 'read',
      expires: expect.any(Number),
    });
    expect(result.url).toBe('https://signed.example/file.png');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('AgentMediaLifecycleService.promoteSignedUrlsToDestination', () => {
  it('copies thread-staged media and returns a Firebase download-token URL', async () => {
    const sourcePath = 'Users/user-1/threads/thread-1/tmp/image/123_image.jpg';
    const destinationPath = 'Users/user-1/posts/post-1/123_image.jpg';
    const sourceFile = { copy: vi.fn().mockResolvedValue(undefined) };
    const destinationFile = {
      exists: vi.fn().mockResolvedValue([true]),
      setMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = createBucket({
      [sourcePath]: sourceFile,
      [destinationPath]: destinationFile,
    });

    const result = await AgentMediaLifecycleService.promoteSignedUrlsToDestination({
      bucket,
      signedUrls: [`https://storage.googleapis.com/test-bucket/${sourcePath}?X-Goog-Signature=abc`],
      userId: 'user-1',
      destinationPrefix: 'Users/user-1/posts/post-1',
    });

    expect(sourceFile.copy).toHaveBeenCalledWith(destinationFile);
    expect(destinationFile.setMetadata).toHaveBeenCalledWith({
      cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ),
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/');
    expect(result[0]).toContain(encodeURIComponent(destinationPath));
    expect(result[0]).toContain('?alt=media&token=');
  });

  it('does not leak the original signed staging URL when promotion fails', async () => {
    const sourcePath = 'Users/user-1/threads/thread-1/tmp/image/123_image.jpg';
    const sourceFile = { copy: vi.fn().mockRejectedValue(new Error('copy failed')) };
    const bucket = createBucket({ [sourcePath]: sourceFile });
    const signedUrl = `https://storage.googleapis.com/test-bucket/${sourcePath}?X-Goog-Signature=abc`;

    const result = await AgentMediaLifecycleService.promoteSignedUrlsToDestination({
      bucket,
      signedUrls: [signedUrl],
      userId: 'user-1',
      destinationPrefix: 'Users/user-1/posts/post-1',
    });

    expect(result).toEqual([]);
  });

  it('canonicalizes existing owned Firebase media to a token URL', async () => {
    const storagePath = 'Users/user-1/uploads/image/unbound/123_graphic.png';
    const file = {
      exists: vi.fn().mockResolvedValue([true]),
      setMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = createBucket({ [storagePath]: file });

    const result = await AgentMediaLifecycleService.promoteSignedUrlsToDestination({
      bucket,
      signedUrls: [`https://storage.googleapis.com/test-bucket/${storagePath}`],
      userId: 'user-1',
      destinationPrefix: 'Users/user-1/posts/post-1',
    });

    expect(file.setMetadata).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/');
    expect(result[0]).toContain(encodeURIComponent(storagePath));
  });

  it('promotes owned uploads tmp media into the post destination', async () => {
    const sourcePath = 'Users/user-1/uploads/tmp/image/unbound/123_graphic.png';
    const destinationPath = 'Users/user-1/posts/post-1/123_graphic.png';
    const sourceFile = { copy: vi.fn().mockResolvedValue(undefined) };
    const destinationFile = {
      exists: vi.fn().mockResolvedValue([true]),
      setMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = createBucket({
      [sourcePath]: sourceFile,
      [destinationPath]: destinationFile,
    });

    const result = await AgentMediaLifecycleService.promoteSignedUrlsToDestination({
      bucket,
      signedUrls: [`https://storage.googleapis.com/test-bucket/${sourcePath}?X-Goog-Signature=abc`],
      userId: 'user-1',
      destinationPrefix: 'Users/user-1/posts/post-1',
    });

    expect(sourceFile.copy).toHaveBeenCalledWith(destinationFile);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(encodeURIComponent(destinationPath));
  });

  it('rejects strict promotion when Firebase token issuance falls back to a signed URL', async () => {
    const sourcePath = 'Users/user-1/threads/thread-1/tmp/image/123_image.jpg';
    const destinationPath = 'Organizations/org-1/logo';
    const sourceFile = { copy: vi.fn().mockResolvedValue(undefined) };
    const destinationFile = {
      exists: vi.fn().mockResolvedValue([true]),
      setMetadata: vi.fn().mockRejectedValue(new Error('metadata parse error')),
      getMetadata: vi.fn().mockResolvedValue([{ metadata: {} }]),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue(['https://storage.googleapis.com/test-bucket/signed']),
    };
    const bucket = createBucket({
      [sourcePath]: sourceFile,
      [destinationPath]: destinationFile,
    });

    await expect(
      AgentMediaLifecycleService.promoteOwnedUrlToDurableDestination({
        bucket,
        sourceUrl: `https://storage.googleapis.com/test-bucket/${sourcePath}?X-Goog-Signature=abc`,
        userId: 'user-1',
        destinationPath,
      })
    ).rejects.toThrow('Unable to issue a durable Firebase download URL');
  });
});
