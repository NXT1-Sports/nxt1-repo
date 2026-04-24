/**
 * @fileoverview Unit Tests — ScrapeInstagramTool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Tests the tool shell in isolation by mocking the ApifyService.
 * Verifies input validation, mode dispatching, result formatting,
 * and error handling for all three modes (posts, profile, hashtag).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeInstagramTool } from '../social/scrape-instagram.tool.js';
import type {
  ApifyService,
  ApifyRunResult,
  InstagramPost,
  InstagramProfile,
} from '../apify/apify.service.js';
import type { ScraperMediaService } from '../social/scraper-media.service.js';

// ─── Mock Factories ─────────────────────────────────────────────────────────

function createMockMedia(): ScraperMediaService {
  return {
    persistBatch: vi.fn().mockResolvedValue([]),
  } as unknown as ScraperMediaService;
}

function createMockApify(): ApifyService {
  return {
    searchTweets: vi.fn(),
    getProfileTweets: vi.fn(),
    getFollowers: vi.fn(),
    getInstagramPosts: vi.fn(),
    getInstagramProfiles: vi.fn(),
    searchInstagram: vi.fn(),
  } as unknown as ApifyService;
}

const MOCK_POST: InstagramPost = {
  id: '3456789012345678901',
  shortCode: 'CxYzAbCdEf',
  caption: 'Excited to announce my commitment to Ohio State! 🏈 #GoBucks #D1Commits #NXT1',
  url: 'https://www.instagram.com/p/CxYzAbCdEf/',
  likes: 1_250,
  comments: 87,
  timestamp: '2025-06-15T14:30:00.000Z',
  ownerUsername: 'jalensmith',
  type: 'Image',
  locationName: 'Ohio Stadium',
  hashtags: ['GoBucks', 'D1Commits', 'NXT1'],
  mentions: ['ohiostatefb'],
  displayUrl: 'https://scontent.cdninstagram.com/v/t51/photo_CxYzAbCdEf.jpg',
  videoUrl: '',
};

const MOCK_VIDEO_POST: InstagramPost = {
  ...MOCK_POST,
  id: '3456789012345678902',
  shortCode: 'DxYzAbCdEf',
  type: 'Video',
  displayUrl: 'https://scontent.cdninstagram.com/v/t51/thumb_DxYzAbCdEf.jpg',
  videoUrl: 'https://scontent.cdninstagram.com/v/t50/video_DxYzAbCdEf.mp4',
};

const MOCK_PROFILE: InstagramProfile = {
  username: 'ohiostatefb',
  fullName: 'Ohio State Football',
  biography: 'The Official Instagram of Ohio State Buckeyes Football 🏈',
  followersCount: 2_400_000,
  followsCount: 312,
  postsCount: 5_678,
  isVerified: true,
  profilePicUrl: 'https://scontent.cdninstagram.com/ohiostatefb.jpg',
  profilePicUrlHD: 'https://scontent.cdninstagram.com/ohiostatefb_hd.jpg',
  externalUrl: 'https://ohiostatebuckeyes.com',
};

function mockPostResult(items: InstagramPost[] = [MOCK_POST]): ApifyRunResult<InstagramPost> {
  return {
    success: true,
    runId: 'run-ig-abc123',
    datasetId: 'dataset-ig-xyz789',
    items,
    itemCount: items.length,
    durationMs: 12_400,
  };
}

function mockProfileResult(
  items: InstagramProfile[] = [MOCK_PROFILE]
): ApifyRunResult<InstagramProfile> {
  return {
    success: true,
    runId: 'run-ig-def456',
    datasetId: 'dataset-ig-uvw321',
    items,
    itemCount: items.length,
    durationMs: 8_200,
  };
}

function mockErrorResult(error: string): ApifyRunResult<never> {
  return {
    success: false,
    runId: '',
    datasetId: '',
    items: [],
    itemCount: 0,
    durationMs: 1_500,
    error,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScrapeInstagramTool', () => {
  let tool: ScrapeInstagramTool;
  let mockApify: ApifyService;
  let mockMedia: ScraperMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApify = createMockApify();
    mockMedia = createMockMedia();
    tool = new ScrapeInstagramTool(mockApify, mockMedia);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  it('should have correct name and category', () => {
    expect(tool.name).toBe('scrape_instagram');
    expect(tool.category).toBe('analytics');
    expect(tool.isMutation).toBe(false);
  });

  it('should allow the correct agents', () => {
    expect(tool.allowedAgents).toContain('data_coordinator');
    expect(tool.allowedAgents).toContain('recruiting_coordinator');
    expect(tool.allowedAgents).toContain('brand_coordinator');
    expect(tool.allowedAgents).toContain('strategy_coordinator');
  });

  // ── Input Validation ──────────────────────────────────────────────────

  it('should reject missing mode', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('mode');
  });

  it('should reject invalid mode', async () => {
    const result = await tool.execute({ mode: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('mode');
  });

  it('should reject posts mode without usernames', async () => {
    const result = await tool.execute({ mode: 'posts' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  it('should reject profile mode without usernames', async () => {
    const result = await tool.execute({ mode: 'profile' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  it('should reject hashtag mode without query', async () => {
    const result = await tool.execute({ mode: 'hashtag' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  // ── Posts Mode ────────────────────────────────────────────────────────

  it('should fetch posts successfully', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['jalensmith'],
      limit: 20,
    });

    expect(result.success).toBe(true);
    expect(mockApify.getInstagramPosts).toHaveBeenCalledWith(['jalensmith'], {
      limit: 20,
      newerThan: undefined,
    });

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('posts');
    expect(data['usernames']).toEqual(['jalensmith']);
    expect(data['postCount']).toBe(1);

    const posts = data['posts'] as unknown[];
    expect(posts).toHaveLength(1);
    expect((posts[0] as Record<string, unknown>)['caption']).toContain('Ohio State');
  });

  it('should pass newer_than option', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    await tool.execute({
      mode: 'posts',
      usernames: ['jalensmith'],
      newer_than: '2025-01-01',
    });

    expect(mockApify.getInstagramPosts).toHaveBeenCalledWith(['jalensmith'], {
      limit: undefined,
      newerThan: '2025-01-01',
    });
  });

  it('should handle posts API failure', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockErrorResult('Rate limited'));

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['jalensmith'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });

  // ── Profile Mode ──────────────────────────────────────────────────────

  it('should fetch profile details successfully', async () => {
    vi.mocked(mockApify.getInstagramProfiles).mockResolvedValue(mockProfileResult());

    const result = await tool.execute({
      mode: 'profile',
      usernames: ['ohiostatefb'],
    });

    expect(result.success).toBe(true);
    expect(mockApify.getInstagramProfiles).toHaveBeenCalledWith(['ohiostatefb']);

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('profile');
    expect(data['profileCount']).toBe(1);

    const profiles = data['profiles'] as unknown[];
    expect(profiles).toHaveLength(1);
    expect((profiles[0] as Record<string, unknown>)['username']).toBe('ohiostatefb');
    expect((profiles[0] as Record<string, unknown>)['isVerified']).toBe(true);
    expect((profiles[0] as Record<string, unknown>)['followersCount']).toBe(2_400_000);
  });

  it('should handle profile API failure', async () => {
    vi.mocked(mockApify.getInstagramProfiles).mockResolvedValue(mockErrorResult('Actor timeout'));

    const result = await tool.execute({
      mode: 'profile',
      usernames: ['ohiostatefb'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Actor timeout');
  });

  // ── Hashtag Mode ──────────────────────────────────────────────────────

  it('should search by hashtag successfully', async () => {
    vi.mocked(mockApify.searchInstagram).mockResolvedValue(mockPostResult());

    const result = await tool.execute({
      mode: 'hashtag',
      query: '#D1Commits',
      limit: 25,
    });

    expect(result.success).toBe(true);
    expect(mockApify.searchInstagram).toHaveBeenCalledWith('#D1Commits', {
      searchType: 'hashtag',
      limit: 25,
    });

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('hashtag');
    expect(data['query']).toBe('#D1Commits');
    expect(data['postCount']).toBe(1);
  });

  it('should handle hashtag search failure', async () => {
    vi.mocked(mockApify.searchInstagram).mockResolvedValue(mockErrorResult('Search failed'));

    const result = await tool.execute({
      mode: 'hashtag',
      query: '#test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Search failed');
  });

  // ── Input Sanitization ────────────────────────────────────────────────

  it('should strip @ from usernames', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    await tool.execute({
      mode: 'posts',
      usernames: ['@ohiostatefb'],
    });

    expect(mockApify.getInstagramPosts).toHaveBeenCalledWith(['ohiostatefb'], {
      limit: undefined,
      newerThan: undefined,
    });
  });

  it('should accept comma-separated username string', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    await tool.execute({
      mode: 'posts',
      usernames: 'ohiostatefb, jalensmith',
    });

    expect(mockApify.getInstagramPosts).toHaveBeenCalledWith(['ohiostatefb', 'jalensmith'], {
      limit: undefined,
      newerThan: undefined,
    });
  });

  it('should accept Instagram usernames with periods and underscores', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    await tool.execute({
      mode: 'posts',
      usernames: ['jalen.smith_23'],
    });

    expect(mockApify.getInstagramPosts).toHaveBeenCalledWith(['jalen.smith_23'], {
      limit: undefined,
      newerThan: undefined,
    });
  });

  it('should reject invalid Instagram usernames', async () => {
    const result = await tool.execute({
      mode: 'posts',
      usernames: ['this has spaces!!!'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  it('should filter out empty usernames from array', async () => {
    const result = await tool.execute({
      mode: 'posts',
      usernames: ['', '  ', ''],
    });
    // All empty → no valid usernames → paramError
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  it('should reject search query exceeding max length', async () => {
    const longQuery = 'a'.repeat(501);
    const result = await tool.execute({ mode: 'hashtag', query: longQuery });
    expect(result.success).toBe(false);
    expect(result.error).toContain('maximum length');
  });

  it('should accept search query at max length', async () => {
    vi.mocked(mockApify.searchInstagram).mockResolvedValue(mockPostResult());
    const query = 'a'.repeat(500);
    const result = await tool.execute({ mode: 'hashtag', query });
    expect(result.success).toBe(true);
  });

  it('should cap usernames at 10 per request', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());

    const usernames = Array.from({ length: 15 }, (_, i) => `user${i}`);
    await tool.execute({ mode: 'posts', usernames });

    const calledWith = vi.mocked(mockApify.getInstagramPosts).mock.calls[0][0];
    expect(calledWith).toHaveLength(10);
  });

  // ── Error Handling ────────────────────────────────────────────────────

  it('should catch thrown exceptions gracefully', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockRejectedValue(new Error('Network failure'));

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['test'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  // ── Post Formatting ───────────────────────────────────────────────────

  it('should truncate long captions in formatted output', async () => {
    const longCaption = 'A'.repeat(600);
    const postWithLongCaption: InstagramPost = {
      ...MOCK_POST,
      caption: longCaption,
    };
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult([postWithLongCaption]));

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['test'],
    });

    const data = result.data as Record<string, unknown>;
    const posts = data['posts'] as Record<string, unknown>[];
    const caption = posts[0]['caption'] as string;
    // 500 chars + '…' = 501 chars
    expect(caption.length).toBeLessThanOrEqual(501);
    expect(caption.endsWith('…')).toBe(true);
  });

  it('should limit posts to 50 in formatted output', async () => {
    const manyPosts = Array.from({ length: 60 }, (_, i) => ({
      ...MOCK_POST,
      id: `post-${i}`,
    }));
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult(manyPosts));

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['test'],
    });

    const data = result.data as Record<string, unknown>;
    const posts = data['posts'] as unknown[];
    expect(posts).toHaveLength(50);
  });

  // ── Media Persistence ──────────────────────────────────────────

  it('should persist post images to Firebase Storage', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());
    const mockPersisted: PersistedMedia[] = [
      {
        url: 'https://storage.googleapis.com/bucket/agent-scraping/instagram/123-abc.jpg',
        storagePath: 'agent-scraping/instagram/123-abc.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'instagram',
        originalUrl: 'https://scontent.cdninstagram.com/v/t51.29350-15/123456.jpg',
        sourceUrl: 'https://www.instagram.com/p/CxYzAbCdEf/',
        sizeBytes: 245_000,
      },
    ];
    vi.mocked(mockMedia.persistBatch).mockResolvedValue(mockPersisted);

    const result = await tool.execute(
      { mode: 'posts', usernames: ['jalensmith'] },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    expect(result.success).toBe(true);
    expect(mockMedia.persistBatch).toHaveBeenCalledOnce();

    // Verify media inputs passed to persistBatch
    const mediaInputs = vi.mocked(mockMedia.persistBatch).mock.calls[0][0];
    expect(mediaInputs).toHaveLength(1);
    expect(mediaInputs[0]).toMatchObject({
      url: MOCK_POST.displayUrl,
      type: 'image',
      platform: 'instagram',
    });

    const data = result.data as Record<string, unknown>;
    expect(data['imageUrl']).toBe(mockPersisted[0].url);
    expect(data['attachments']).toHaveLength(1);
  });

  it('should persist video URLs for video posts', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult([MOCK_VIDEO_POST]));
    vi.mocked(mockMedia.persistBatch).mockResolvedValue([]);

    await tool.execute(
      { mode: 'posts', usernames: ['jalensmith'] },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    const mediaInputs = vi.mocked(mockMedia.persistBatch).mock.calls[0][0];
    expect(mediaInputs).toHaveLength(1);
    expect(mediaInputs[0]).toMatchObject({
      url: MOCK_VIDEO_POST.videoUrl,
      type: 'video',
      platform: 'instagram',
    });
  });

  it('should persist profile pictures to Firebase Storage', async () => {
    vi.mocked(mockApify.getInstagramProfiles).mockResolvedValue(mockProfileResult());
    const mockPersisted: PersistedMedia[] = [
      {
        url: 'https://storage.googleapis.com/bucket/agent-scraping/instagram/456-def.jpg',
        storagePath: 'agent-scraping/instagram/456-def.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'instagram',
        originalUrl: 'https://scontent.cdninstagram.com/v/t51.29350-15/456789.jpg',
        sourceUrl: 'https://www.instagram.com/ohiostatefb/',
        sizeBytes: 120_000,
      },
    ];
    vi.mocked(mockMedia.persistBatch).mockResolvedValue(mockPersisted);

    const result = await tool.execute(
      { mode: 'profile', usernames: ['ohiostatefb'] },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    expect(result.success).toBe(true);
    expect(mockMedia.persistBatch).toHaveBeenCalledOnce();

    const data = result.data as Record<string, unknown>;
    expect(data['imageUrl']).toBe(mockPersisted[0].url);
    expect(data['attachments']).toHaveLength(1);
  });

  it('should persist hashtag search media to Firebase Storage', async () => {
    vi.mocked(mockApify.searchInstagram).mockResolvedValue(mockPostResult());
    vi.mocked(mockMedia.persistBatch).mockResolvedValue([]);

    const result = await tool.execute(
      { mode: 'hashtag', query: '#D1Commits' },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    expect(result.success).toBe(true);
    expect(mockMedia.persistBatch).toHaveBeenCalledOnce();

    const data = result.data as Record<string, unknown>;
    expect(data['attachments']).toEqual([]);
    // No imageUrl when no media persisted
    expect(data['imageUrl']).toBeUndefined();
  });

  it('should continue successfully if media persistence fails', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(mockPostResult());
    vi.mocked(mockMedia.persistBatch).mockRejectedValue(new Error('Firebase Storage unavailable'));

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['jalensmith'],
    });

    // Tool should still succeed with data, just without attachments
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['attachments']).toEqual([]);
    expect(data['imageUrl']).toBeUndefined();
    expect(data['posts']).toHaveLength(1);
  });

  it('should include displayUrl and videoUrl in formatted post output', async () => {
    vi.mocked(mockApify.getInstagramPosts).mockResolvedValue(
      mockPostResult([MOCK_POST, MOCK_VIDEO_POST])
    );

    const result = await tool.execute({
      mode: 'posts',
      usernames: ['jalensmith'],
    });

    const data = result.data as Record<string, unknown>;
    const posts = data['posts'] as Record<string, unknown>[];
    // Image post
    expect(posts[0]['displayUrl']).toBe(MOCK_POST.displayUrl);
    expect(posts[0]['videoUrl']).toBeNull();
    // Video post
    expect(posts[1]['displayUrl']).toBe(MOCK_VIDEO_POST.displayUrl);
    expect(posts[1]['videoUrl']).toBe(MOCK_VIDEO_POST.videoUrl);
  });
});
