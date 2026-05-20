import { describe, expect, it, vi } from 'vitest';
import { AgentMediaLifecycleService } from '../agent-media-lifecycle.service.js';

type MockFile = {
  copy?: ReturnType<typeof vi.fn>;
  exists?: ReturnType<typeof vi.fn>;
  setMetadata?: ReturnType<typeof vi.fn>;
};

function createBucket(files: Record<string, MockFile>) {
  return {
    name: 'test-bucket',
    file: vi.fn((path: string) => files[path] ?? {}),
  };
}

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
});
