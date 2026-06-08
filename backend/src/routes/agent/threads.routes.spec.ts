import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileMock = vi.fn();
const bucketMock = vi.fn(() => ({ file: fileMock }));
const getStorageMock = vi.fn(() => ({ bucket: bucketMock }));
const getSignedUrlWithTimeoutMock = vi.fn();
const extractStoragePathFromUrlMock = vi.fn();

vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('./shared.js', () => ({
  chatService: null,
  isValidObjectId: vi.fn(() => true),
  VALID_THREAD_CATEGORIES: new Set<string>(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/gcs-signed-url.js', () => ({
  getSignedUrlWithTimeout: getSignedUrlWithTimeoutMock,
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: getStorageMock,
}));

vi.mock('../../modules/agent/tools/media/agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    extractStoragePathFromUrl: extractStoragePathFromUrlMock,
  },
}));

const { refreshAttachmentUrl, refreshMessageResultDataMedia } = await import('./threads.routes.js');

describe('threads.routes media refresh helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSignedUrlWithTimeoutMock.mockImplementation(async (fn: () => Promise<string[]>) => fn());
  });

  it('refreshes both attachment url and thumbnailUrl when they point to storage media', async () => {
    extractStoragePathFromUrlMock
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight.mp4')
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight-thumb.jpg');

    fileMock
      .mockReturnValueOnce({
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/highlight.mp4']),
      })
      .mockReturnValueOnce({
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/highlight-thumb.jpg']),
      });

    const refreshed = await refreshAttachmentUrl(
      {
        id: 'att-1',
        url: 'https://storage.googleapis.com/bucket/highlight.mp4?expired=true',
        name: 'highlight.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 4096,
        thumbnailUrl: 'https://storage.googleapis.com/bucket/highlight-thumb.jpg?expired=true',
      },
      'bucket-name'
    );

    expect(refreshed.url).toBe('https://signed.example.com/highlight.mp4');
    expect(refreshed.thumbnailUrl).toBe('https://signed.example.com/highlight-thumb.jpg');
  });

  it('refreshes thumbnail urls nested in resultData', async () => {
    extractStoragePathFromUrlMock
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight-thumb.jpg')
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight-inline-thumb.jpg');

    fileMock
      .mockReturnValueOnce({
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/result-thumb.jpg']),
      })
      .mockReturnValueOnce({
        getSignedUrl: vi
          .fn()
          .mockResolvedValue(['https://signed.example.com/result-file-thumb.jpg']),
      });

    const refreshed = await refreshMessageResultDataMedia(
      {
        thumbnailUrl: 'https://storage.googleapis.com/bucket/highlight-thumb.jpg?expired=true',
        files: [
          {
            thumbnailUrl:
              'https://storage.googleapis.com/bucket/highlight-inline-thumb.jpg?expired=true',
          },
        ],
      },
      'bucket-name'
    );

    expect(refreshed).toEqual({
      thumbnailUrl: 'https://signed.example.com/result-thumb.jpg',
      files: [
        {
          thumbnailUrl: 'https://signed.example.com/result-file-thumb.jpg',
        },
      ],
    });
  });
});
