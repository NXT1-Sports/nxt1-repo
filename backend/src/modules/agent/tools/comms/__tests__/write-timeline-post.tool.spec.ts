/**
 * @fileoverview Unit Tests — WriteTimelinePostTool
 * @module @nxt1/backend/modules/agent/tools/comms
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede tool import) ─────────────────────────────────────────

vi.mock('../../../../../services/cache.service.js', () => ({
  getCacheService: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { WriteTimelinePostTool } from '../write-timeline-post.tool.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface MockDocRef {
  id: string;
  set: ReturnType<typeof vi.fn>;
}

interface MockCollection {
  add: ReturnType<typeof vi.fn>;
  doc: ReturnType<typeof vi.fn>;
}

interface MockFirestore {
  collection: ReturnType<typeof vi.fn>;
}

function createMockFirestore(opts?: { addError?: unknown }): {
  db: MockFirestore;
  collection: MockCollection;
  docRef: MockDocRef;
} {
  const docRef: MockDocRef = {
    id: 'post_abc123',
    set: opts?.addError
      ? vi.fn().mockRejectedValue(opts.addError)
      : vi.fn().mockResolvedValue(undefined),
  };
  const collection: MockCollection = {
    add: opts?.addError
      ? vi.fn().mockRejectedValue(opts.addError)
      : vi.fn().mockResolvedValue(docRef),
    doc: vi.fn().mockReturnValue(docRef),
  };
  const db: MockFirestore = {
    collection: vi.fn().mockReturnValue(collection),
  };

  return { db, collection, docRef };
}

function validInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    userId: 'user_123',
    content: 'Just dropped a new highlight reel! #football @coach_smith',
    type: 'photo',
    visibility: 'public',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WriteTimelinePostTool', () => {
  let tool: WriteTimelinePostTool;
  let mockDb: MockFirestore;
  let _mockCollection: MockCollection;
  let mockDocRef: MockDocRef;

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockFirestore();
    mockDb = mocks.db;
    _mockCollection = mocks.collection;
    mockDocRef = mocks.docRef;
    tool = new WriteTimelinePostTool(mockDb as never);
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      expect(tool.name).toBe('write_timeline_post');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('communication');
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('brand_media_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('general');
    });
  });

  // ── Input Validation ─────────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await tool.execute(validInput({ userId: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when content is missing', async () => {
      const result = await tool.execute(validInput({ content: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    it('should return error when type is invalid', async () => {
      const result = await tool.execute(validInput({ type: 'invalid_type' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should return error when visibility is invalid', async () => {
      const result = await tool.execute(validInput({ visibility: 'everyone' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('visibility');
    });

    it('should return error when content exceeds max length', async () => {
      const longContent = 'a'.repeat(5001);
      const result = await tool.execute(validInput({ content: longContent }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('5000');
    });
  });

  // ── Post Creation ────────────────────────────────────────────────────────

  describe('post creation', () => {
    it('should create a text post with sanitized content', async () => {
      const result = await tool.execute(
        validInput({ content: 'Hello <script>alert("xss")</script>', type: 'text' })
      );

      expect(result.success).toBe(true);
      expect(mockDb.collection).toHaveBeenCalledWith('Posts');
      expect(mockDocRef.set).toHaveBeenCalledTimes(1);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['content']).not.toContain('<script>');
      expect(postDoc['content']).toContain('&lt;script&gt;');
    });

    it('should auto-extract hashtags and mentions from content', async () => {
      const result = await tool.execute(
        validInput({ content: 'Big win today! #football #gameday @coach_jones @teammate' })
      );

      expect(result.success).toBe(true);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['hashtags']).toEqual(['football', 'gameday']);
      expect(postDoc['mentions']).toEqual(['coach_jones', 'teammate']);
    });

    it('should map visibility string to PostVisibility enum', async () => {
      const result = await tool.execute(validInput({ visibility: 'team' }));

      expect(result.success).toBe(true);
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['visibility']).toBe('TEAM');
    });

    it('should initialize stats to zero', async () => {
      const result = await tool.execute(validInput());
      expect(result.success).toBe(true);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['stats']).toEqual({ likes: 0, shares: 0, views: 0 });
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const result = await tool.execute(validInput());
      expect(result.success).toBe(true);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['createdAt']).toBeDefined();
      expect(postDoc['updatedAt']).toBeDefined();
    });

    it('should return postId in response data', async () => {
      const result = await tool.execute(validInput());
      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data['postId']).toBe('post_abc123');
      expect(data['userId']).toBe('user_123');
      expect(data['type']).toBe('photo');
      expect(data['visibility']).toBe('public');
    });

    it('should include teamId when provided', async () => {
      const result = await tool.execute(validInput({ teamId: 'team_456' }));
      expect(result.success).toBe(true);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['teamId']).toBe('team_456');
    });
  });

  // ── Image Support ────────────────────────────────────────────────────────

  describe('image support', () => {
    it('should accept valid HTTPS image URLs', async () => {
      const images = [
        'https://storage.googleapis.com/nxt1-bucket/agent-scraping/image1.jpg',
        'https://firebasestorage.googleapis.com/v0/b/nxt1/o/image2.png',
      ];
      const result = await tool.execute(validInput({ images }));

      expect(result.success).toBe(true);
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['images']).toEqual(images);

      const data = result.data as Record<string, unknown>;
      expect(data['imageCount']).toBe(2);
    });

    it('should reject non-HTTPS image URLs', async () => {
      const images = ['http://insecure.com/image.jpg'];
      const result = await tool.execute(validInput({ images }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject localhost image URLs', async () => {
      const images = ['https://localhost:3000/image.jpg'];
      const result = await tool.execute(validInput({ images }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('localhost');
    });

    it('should reject private network image URLs', async () => {
      const images = ['https://192.168.1.1/image.jpg'];
      const result = await tool.execute(validInput({ images }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('private');
    });

    it('should reject more than 10 images', async () => {
      const images = Array.from(
        { length: 11 },
        (_, i) => `https://storage.googleapis.com/bucket/img${i}.jpg`
      );
      const result = await tool.execute(validInput({ images }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('10');
    });

    it('should reject images parameter that is not an array', async () => {
      const result = await tool.execute(validInput({ images: 'not-an-array' }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('array');
    });

    it('should store empty images array when no images provided', async () => {
      const result = await tool.execute(validInput());
      expect(result.success).toBe(true);

      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['images']).toEqual([]);
    });
  });

  // ── Video Support ────────────────────────────────────────────────────────

  describe('video support', () => {
    it('should accept a valid HTTPS video URL', async () => {
      const videoUrl = 'https://storage.googleapis.com/nxt1-bucket/agent-scraping/video.mp4';
      const result = await tool.execute(validInput({ videoUrl, type: 'video' }));

      expect(result.success).toBe(true);
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['videoUrl']).toBe(videoUrl);

      const data = result.data as Record<string, unknown>;
      expect(data['videoUrl']).toBe(videoUrl);
    });

    it('should reject non-HTTPS video URL', async () => {
      const result = await tool.execute(validInput({ videoUrl: 'http://insecure.com/video.mp4' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject localhost video URL', async () => {
      const result = await tool.execute(validInput({ videoUrl: 'https://127.0.0.1/video.mp4' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('localhost');
    });
  });

  // ── Combined Media ───────────────────────────────────────────────────────

  describe('combined media', () => {
    it('should handle both images and videoUrl together', async () => {
      const result = await tool.execute(
        validInput({
          images: ['https://storage.googleapis.com/bucket/img.jpg'],
          videoUrl: 'https://storage.googleapis.com/bucket/vid.mp4',
        })
      );

      expect(result.success).toBe(true);
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['images']).toEqual(['https://storage.googleapis.com/bucket/img.jpg']);
      expect(postDoc['videoUrl']).toBe('https://storage.googleapis.com/bucket/vid.mp4');
    });
  });

  // ── Error Handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should surface Firestore error messages', async () => {
      const errorMocks = createMockFirestore({
        addError: new Error('Firestore quota exceeded'),
      });
      const errorTool = new WriteTimelinePostTool(errorMocks.db as never);

      const result = await errorTool.execute(validInput());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Firestore quota exceeded');
    });

    it('should normalize non-Error throws to a generic message', async () => {
      const errorMocks = createMockFirestore({ addError: 'raw string error' });
      const errorTool = new WriteTimelinePostTool(errorMocks.db as never);

      const result = await errorTool.execute(validInput());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create post');
    });
  });

  // ── Post Types ───────────────────────────────────────────────────────────

  describe('post types', () => {
    const validTypes = [
      'text',
      'photo',
      'video',
      'highlight',
      'stats',
      'achievement',
      'announcement',
    ];

    for (const postType of validTypes) {
      it(`should accept post type "${postType}"`, async () => {
        const result = await tool.execute(validInput({ type: postType }));
        expect(result.success).toBe(true);

        const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
        expect(postDoc['type']).toBe(postType);
      });
    }

    it('should reject "poll" post type (not supported via agent)', async () => {
      const result = await tool.execute(validInput({ type: 'poll' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });
  });

  // ── Visibility Modes ─────────────────────────────────────────────────────

  describe('visibility modes', () => {
    it('should map "public" to PostVisibility.PUBLIC', async () => {
      await tool.execute(validInput({ visibility: 'public' }));
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['visibility']).toBe('PUBLIC');
    });

    it('should map "team" to PostVisibility.TEAM', async () => {
      await tool.execute(validInput({ visibility: 'team' }));
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['visibility']).toBe('TEAM');
    });

    it('should map "private" to PostVisibility.PRIVATE', async () => {
      await tool.execute(validInput({ visibility: 'private' }));
      const postDoc = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>;
      expect(postDoc['visibility']).toBe('PRIVATE');
    });
  });
});
