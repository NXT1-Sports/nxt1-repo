import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileMock = vi.fn();
const getFilesMock = vi.fn();
const bucketMock = vi.fn(() => ({ file: fileMock, getFiles: getFilesMock }));
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

const {
  refreshAttachmentUrl,
  refreshMessageAttachments,
  refreshMessageContentMedia,
  refreshMessagePartsMedia,
  refreshMessageResultDataMedia,
} = await import('./threads.routes.js');

describe('threads.routes media refresh helpers', () => {
  const storageInstance = getStorageMock();

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
      'bucket-name',
      storageInstance
    );

    expect(refreshed.url).toBe('https://signed.example.com/highlight.mp4');
    expect(refreshed.thumbnailUrl).toBe('https://signed.example.com/highlight-thumb.jpg');
  });

  it('infers a missing video thumbnail from sibling staged video images', async () => {
    extractStoragePathFromUrlMock
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/staged/video/highlight.mp4')
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/staged/video/highlight.mp4');

    fileMock.mockReturnValueOnce({
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/highlight.mp4']),
    });
    getFilesMock.mockResolvedValueOnce([
      [
        {
          name: 'Users/user-1/threads/thread-1/media/staged/video/highlight.mp4',
          getSignedUrl: vi.fn(),
        },
        {
          name: 'Users/user-1/threads/thread-1/media/staged/video/4b61320cbbcd425c9ad71215ab760202.jpg',
          getSignedUrl: vi
            .fn()
            .mockResolvedValue(['https://signed.example.com/hash-thumbnail.jpg']),
        },
      ],
    ]);

    const refreshed = await refreshAttachmentUrl(
      {
        id: 'att-1',
        url: 'https://storage.googleapis.com/bucket/highlight.mp4?expired=true',
        name: 'highlight.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 4096,
      },
      'bucket-name',
      storageInstance
    );

    expect(getFilesMock).toHaveBeenCalledWith({
      prefix: 'Users/user-1/threads/thread-1/media/staged/video/',
    });
    expect(refreshed.url).toBe('https://signed.example.com/highlight.mp4');
    expect(refreshed.thumbnailUrl).toBe('https://signed.example.com/hash-thumbnail.jpg');
  });

  it('adds a synthetic video attachment with sibling thumbnail for legacy markdown-only videos', async () => {
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=video';

    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/staged/video/highlight.mp4'
    );
    getFilesMock.mockResolvedValueOnce([
      [
        {
          name: 'Users/user-1/threads/thread-1/media/staged/video/0b4baca6c75643e3bc2a934a8129ddc9.jpg',
          getSignedUrl: vi
            .fn()
            .mockResolvedValue(['https://signed.example.com/content-thumbnail.jpg']),
        },
      ],
    ]);

    const refreshed = await refreshMessageAttachments(
      {
        id: 'msg-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'assistant',
        origin: 'agent_chain',
        content: `[View Video](${videoUrl})`,
        createdAt: '2026-06-24T00:00:00.000Z',
      },
      'bucket-name',
      storageInstance
    );

    expect(refreshed.attachments).toEqual([
      {
        id: 'content-video-1',
        url: videoUrl,
        storagePath: 'Users/user-1/threads/thread-1/media/staged/video/highlight.mp4',
        name: 'highlight.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 0,
        thumbnailUrl: 'https://signed.example.com/content-thumbnail.jpg',
      },
    ]);
  });

  it('does not refresh video urls embedded in markdown content', async () => {
    const videoUrl =
      'https://storage.googleapis.com/bucket/Users/user-1/threads/thread-1/media/video/highlight.mp4?X-Goog-Signature=expired';
    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/video/highlight.mp4'
    );

    const refreshed = await refreshMessageContentMedia(
      `Video:\n[View Video](${videoUrl})`,
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toBe(`Video:\n[View Video](${videoUrl})`);
    expect(fileMock).not.toHaveBeenCalled();
  });

  it('refreshes expired storage image urls embedded in raw html content', async () => {
    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/1782410758556-graphic.png'
    );

    fileMock.mockReturnValueOnce({
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/fresh-graphic.png']),
    });

    const refreshed = await refreshMessageContentMedia(
      '<img src="https://storage.googleapis.com/bucket/Users/user-1/threads/thread-1/media/1782410758556-graphic.png?X-Goog-Date=20260625T180559Z&amp;X-Goog-Signature=expired" alt="Domain Expansion Graphic">',
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toBe(
      '<img src="https://signed.example.com/fresh-graphic.png" alt="Domain Expansion Graphic">'
    );
  });

  it('refreshes expired storage image urls embedded in markdown content', async () => {
    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/1782410154759-graphic.png'
    );

    fileMock.mockReturnValueOnce({
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/fresh-markdown.png']),
    });

    const refreshed = await refreshMessageContentMedia(
      'Final graphic:\n![Generated Image](https://storage.googleapis.com/bucket/Users/user-1/threads/thread-1/media/1782410154759-graphic.png?X-Goog-Signature=expired)',
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toBe(
      'Final graphic:\n![Generated Image](https://signed.example.com/fresh-markdown.png)'
    );
  });

  it('refreshes expired storage image urls embedded in text parts', async () => {
    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/1782410154759-graphic.png'
    );

    fileMock.mockReturnValueOnce({
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/fresh-part.png']),
    });

    const refreshed = await refreshMessagePartsMedia(
      [
        {
          type: 'text',
          content:
            'Final graphic:\n![Generated Image](https://storage.googleapis.com/bucket/Users/user-1/threads/thread-1/media/1782410154759-graphic.png?X-Goog-Signature=expired)',
        },
      ],
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toEqual([
      {
        type: 'text',
        content: 'Final graphic:\n![Generated Image](https://signed.example.com/fresh-part.png)',
      },
    ]);
  });

  it('refreshes expired storage image part urls', async () => {
    extractStoragePathFromUrlMock.mockReturnValueOnce(
      'Users/user-1/threads/thread-1/media/1782410154759-graphic.png'
    );

    fileMock.mockReturnValueOnce({
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/fresh-image-part.png']),
    });

    const refreshed = await refreshMessagePartsMedia(
      [
        {
          type: 'image',
          url: 'https://storage.googleapis.com/bucket/Users/user-1/threads/thread-1/media/1782410154759-graphic.png?X-Goog-Signature=expired',
          alt: 'Generated Image',
        },
      ],
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toEqual([
      {
        type: 'image',
        url: 'https://signed.example.com/fresh-image-part.png',
        alt: 'Generated Image',
      },
    ]);
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
      'bucket-name',
      storageInstance
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

  it('refreshes nested MCP output_path and poster fields in resultData', async () => {
    extractStoragePathFromUrlMock
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight-frame.jpg')
      .mockReturnValueOnce('Users/user-1/threads/thread-1/media/video/highlight-poster.jpg');

    fileMock
      .mockReturnValueOnce({
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/highlight-frame.jpg']),
      })
      .mockReturnValueOnce({
        getSignedUrl: vi
          .fn()
          .mockResolvedValue(['https://signed.example.com/highlight-poster.jpg']),
      });

    const refreshed = await refreshMessageResultDataMedia(
      {
        taskResults: {
          thumbnail: {
            data: {
              result: {
                output_path:
                  'https://storage.googleapis.com/bucket/highlight-frame.jpg?expired=true',
                posterUrl:
                  'https://storage.googleapis.com/bucket/highlight-poster.jpg?expired=true',
              },
            },
          },
        },
      },
      'bucket-name',
      storageInstance
    );

    expect(refreshed).toEqual({
      taskResults: {
        thumbnail: {
          data: {
            result: {
              output_path: 'https://signed.example.com/highlight-frame.jpg',
              posterUrl: 'https://signed.example.com/highlight-poster.jpg',
            },
          },
        },
      },
    });
  });
});
