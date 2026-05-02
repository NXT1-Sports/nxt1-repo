/**
 * @fileoverview Unit Tests — ScrapeTwitterTool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Tests the tool shell in isolation by mocking the ApifyService.
 * Verifies input validation, mode dispatching, result formatting,
 * and error handling for all three modes (search, profile_tweets, followers).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeTwitterTool } from '../social/scrape-twitter.tool.js';
import type {
  ApifyService,
  ApifyRunResult,
  ScweetTweet,
  ScweetUser,
} from '../apify/apify.service.js';
import type { ScraperMediaService, PersistedMedia } from '../social/scraper-media.service.js';

// ─── Mock ApifyService ──────────────────────────────────────────────────

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

function createMockMedia(): ScraperMediaService {
  return {
    persistBatch: vi.fn().mockResolvedValue([]),
  } as unknown as ScraperMediaService;
}

const MOCK_TWEET: ScweetTweet = {
  id: '1234567890',
  text: 'Excited to announce my commitment to Ohio State! #GoBucks',
  username: 'jalensmith',
  timestamp: '2025-06-15T14:30:00Z',
  retweets: 120,
  likes: 450,
  replies: 35,
  url: 'https://x.com/jalensmith/status/1234567890',
  imageUrls: ['https://pbs.twimg.com/media/tweet_photo1.jpg'],
  videoUrl: '',
};

const MOCK_VIDEO_TWEET: ScweetTweet = {
  ...MOCK_TWEET,
  id: '1234567891',
  imageUrls: [],
  videoUrl: 'https://video.twimg.com/ext_tw_video/1234567891/pu/vid/720x1280/tweet_video.mp4',
};

const MOCK_NO_MEDIA_TWEET: ScweetTweet = {
  ...MOCK_TWEET,
  id: '1234567892',
  imageUrls: [],
  videoUrl: '',
};

const MOCK_USER: ScweetUser = {
  username: 'OhioStateFB',
  name: 'Ohio State Football',
  bio: 'Official account of Ohio State Buckeyes Football',
  followers_count: 1_200_000,
  following_count: 250,
  verified: true,
  profile_image_url: 'https://pbs.twimg.com/profile_images/ohiostate.jpg',
};

function mockTweetResult(items: ScweetTweet[] = [MOCK_TWEET]): ApifyRunResult<ScweetTweet> {
  return {
    success: true,
    runId: 'run-abc123',
    datasetId: 'dataset-xyz789',
    items,
    itemCount: items.length,
    durationMs: 5200,
  };
}

function mockFollowerResult(items: ScweetUser[] = [MOCK_USER]): ApifyRunResult<ScweetUser> {
  return {
    success: true,
    runId: 'run-def456',
    datasetId: 'dataset-uvw321',
    items,
    itemCount: items.length,
    durationMs: 8400,
  };
}

function mockErrorResult(error: string): ApifyRunResult<never> {
  return {
    success: false,
    runId: '',
    datasetId: '',
    items: [],
    itemCount: 0,
    durationMs: 1200,
    error,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScrapeTwitterTool', () => {
  let tool: ScrapeTwitterTool;
  let mockApify: ApifyService;
  let mockMedia: ScraperMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApify = createMockApify();
    mockMedia = createMockMedia();
    tool = new ScrapeTwitterTool(mockApify, mockMedia);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  it('should have correct name and category', () => {
    expect(tool.name).toBe('scrape_twitter');
    expect(tool.category).toBe('analytics');
    expect(tool.isMutation).toBe(false);
  });

  it('should allow the correct agents', () => {
    expect(tool.allowedAgents).toContain('*');
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

  it('should reject search mode without query', async () => {
    const result = await tool.execute({ mode: 'search' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('should reject profile_tweets mode without usernames', async () => {
    const result = await tool.execute({ mode: 'profile_tweets' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  it('should reject followers mode without usernames', async () => {
    const result = await tool.execute({ mode: 'followers' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  // ── Search Mode ───────────────────────────────────────────────────────

  it('should search tweets successfully', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockTweetResult());

    const result = await tool.execute({
      mode: 'search',
      query: '#D1Commits',
      since: '2025-01-01',
      limit: 25,
    });

    expect(result.success).toBe(true);
    expect(mockApify.searchTweets).toHaveBeenCalledWith('#D1Commits', {
      since: '2025-01-01',
      until: undefined,
      limit: 25,
      language: undefined,
    });

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('search');
    expect(data['query']).toBe('#D1Commits');
    expect(data['tweetCount']).toBe(1);

    const tweets = data['tweets'] as unknown[];
    expect(tweets).toHaveLength(1);
    expect((tweets[0] as Record<string, unknown>)['text']).toContain('Ohio State');
  });

  it('should handle search API failure', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockErrorResult('Rate limited'));

    const result = await tool.execute({ mode: 'search', query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });

  // ── Profile Tweets Mode ───────────────────────────────────────────────

  it('should fetch profile tweets successfully', async () => {
    vi.mocked(mockApify.getProfileTweets).mockResolvedValue(mockTweetResult());

    const result = await tool.execute({
      mode: 'profile_tweets',
      usernames: ['OhioStateFB', 'CoachDay'],
    });

    expect(result.success).toBe(true);
    expect(mockApify.getProfileTweets).toHaveBeenCalledWith(['OhioStateFB', 'CoachDay'], {
      limit: undefined,
    });

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('profile_tweets');
    expect(data['usernames']).toEqual(['OhioStateFB', 'CoachDay']);
  });

  it('should strip @ from usernames', async () => {
    vi.mocked(mockApify.getProfileTweets).mockResolvedValue(mockTweetResult());

    await tool.execute({
      mode: 'profile_tweets',
      usernames: ['@OhioStateFB'],
    });

    expect(mockApify.getProfileTweets).toHaveBeenCalledWith(['OhioStateFB'], { limit: undefined });
  });

  it('should accept comma-separated username string', async () => {
    vi.mocked(mockApify.getProfileTweets).mockResolvedValue(mockTweetResult());

    await tool.execute({
      mode: 'profile_tweets',
      usernames: 'OhioStateFB, CoachDay',
    });

    expect(mockApify.getProfileTweets).toHaveBeenCalledWith(['OhioStateFB', 'CoachDay'], {
      limit: undefined,
    });
  });

  it('should reject invalid usernames', async () => {
    const result = await tool.execute({
      mode: 'profile_tweets',
      usernames: ['this is not a valid username!!!'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  // ── Followers Mode ────────────────────────────────────────────────────

  it('should fetch followers successfully', async () => {
    vi.mocked(mockApify.getFollowers).mockResolvedValue(mockFollowerResult());

    const result = await tool.execute({
      mode: 'followers',
      usernames: ['OhioStateFB'],
      limit: 50,
    });

    expect(result.success).toBe(true);
    expect(mockApify.getFollowers).toHaveBeenCalledWith(['OhioStateFB'], { limit: 50 });

    const data = result.data as Record<string, unknown>;
    expect(data['mode']).toBe('followers');
    expect(data['followerCount']).toBe(1);

    const followers = data['followers'] as unknown[];
    expect(followers).toHaveLength(1);
    expect((followers[0] as Record<string, unknown>)['username']).toBe('OhioStateFB');
    expect((followers[0] as Record<string, unknown>)['verified']).toBe(true);
  });

  it('should handle followers API failure', async () => {
    vi.mocked(mockApify.getFollowers).mockResolvedValue(mockErrorResult('Actor timeout'));

    const result = await tool.execute({
      mode: 'followers',
      usernames: ['OhioStateFB'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Actor timeout');
  });

  // ── Error Handling ────────────────────────────────────────────────────

  it('should catch thrown exceptions gracefully', async () => {
    vi.mocked(mockApify.searchTweets).mockRejectedValue(new Error('Network failure'));

    const result = await tool.execute({ mode: 'search', query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  // ── Input Sanitization ────────────────────────────────────────────────

  it('should reject search query exceeding max length', async () => {
    const longQuery = 'a'.repeat(501);
    const result = await tool.execute({ mode: 'search', query: longQuery });
    expect(result.success).toBe(false);
    expect(result.error).toContain('maximum length');
  });

  it('should accept search query at max length', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockTweetResult());
    const query = 'a'.repeat(500);
    const result = await tool.execute({ mode: 'search', query });
    expect(result.success).toBe(true);
  });

  it('should filter out empty usernames from array', async () => {
    const result = await tool.execute({
      mode: 'profile_tweets',
      usernames: ['', '  ', ''],
    });
    // All empty → no valid usernames → paramError
    expect(result.success).toBe(false);
    expect(result.error).toContain('usernames');
  });

  // ── Media Persistence ──────────────────────────────────────────

  it('should persist tweet images to Firebase Storage', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockTweetResult());
    const mockPersisted: PersistedMedia[] = [
      {
        url: 'https://storage.googleapis.com/bucket/agent-scraping/twitter/123-abc.jpg',
        storagePath: 'agent-scraping/twitter/123-abc.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'twitter',
        originalUrl: 'https://pbs.twimg.com/media/abc123.jpg',
        sourceUrl: 'https://x.com/jalensmith/status/1234567890',
        sizeBytes: 180_000,
      },
    ];
    vi.mocked(mockMedia.persistBatch).mockResolvedValue(mockPersisted);

    const result = await tool.execute(
      { mode: 'search', query: '#D1Commits' },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    expect(result.success).toBe(true);
    expect(mockMedia.persistBatch).toHaveBeenCalledOnce();

    // Verify media inputs passed to persistBatch
    const mediaInputs = vi.mocked(mockMedia.persistBatch).mock.calls[0][0];
    expect(mediaInputs).toHaveLength(1);
    expect(mediaInputs[0]).toMatchObject({
      url: MOCK_TWEET.imageUrls[0],
      type: 'image',
      platform: 'twitter',
    });

    const data = result.data as Record<string, unknown>;
    expect(data['imageUrl']).toBe(mockPersisted[0].url);
    expect(data['attachments']).toHaveLength(1);
  });

  it('should persist tweet video URLs', async () => {
    vi.mocked(mockApify.getProfileTweets).mockResolvedValue(mockTweetResult([MOCK_VIDEO_TWEET]));
    vi.mocked(mockMedia.persistBatch).mockResolvedValue([]);

    await tool.execute(
      { mode: 'profile_tweets', usernames: ['jalensmith'] },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    const mediaInputs = vi.mocked(mockMedia.persistBatch).mock.calls[0][0];
    expect(mediaInputs).toHaveLength(1);
    expect(mediaInputs[0]).toMatchObject({
      url: MOCK_VIDEO_TWEET.videoUrl,
      type: 'video',
      platform: 'twitter',
    });
  });

  it('should not call persistBatch for tweets without media', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockTweetResult([MOCK_NO_MEDIA_TWEET]));

    const result = await tool.execute({
      mode: 'search',
      query: 'test',
    });

    expect(result.success).toBe(true);
    // No media to persist — persistBatch should NOT be called
    expect(mockMedia.persistBatch).not.toHaveBeenCalled();

    const data = result.data as Record<string, unknown>;
    expect(data['attachments']).toEqual([]);
    expect(data['imageUrl']).toBeUndefined();
  });

  it('should continue successfully if media persistence fails', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(mockTweetResult());
    vi.mocked(mockMedia.persistBatch).mockRejectedValue(new Error('Firebase Storage unavailable'));

    const result = await tool.execute({
      mode: 'search',
      query: '#D1Commits',
    });

    // Tool should still succeed with data, just without attachments
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['attachments']).toEqual([]);
    expect(data['imageUrl']).toBeUndefined();
    expect(data['tweets']).toHaveLength(1);
  });

  it('should include imageUrls and videoUrl in formatted tweet output', async () => {
    vi.mocked(mockApify.searchTweets).mockResolvedValue(
      mockTweetResult([MOCK_TWEET, MOCK_VIDEO_TWEET, MOCK_NO_MEDIA_TWEET])
    );

    const result = await tool.execute({
      mode: 'search',
      query: 'test',
    });

    const data = result.data as Record<string, unknown>;
    const tweets = data['tweets'] as Record<string, unknown>[];
    // Tweet with image
    expect(tweets[0]['imageUrls']).toEqual(MOCK_TWEET.imageUrls);
    expect(tweets[0]['videoUrl']).toBeUndefined();
    // Tweet with video
    expect(tweets[1]['imageUrls']).toBeUndefined();
    expect(tweets[1]['videoUrl']).toBe(MOCK_VIDEO_TWEET.videoUrl);
    // Tweet without media
    expect(tweets[2]['imageUrls']).toBeUndefined();
    expect(tweets[2]['videoUrl']).toBeUndefined();
  });

  it('should persist media for profile_tweets mode', async () => {
    vi.mocked(mockApify.getProfileTweets).mockResolvedValue(mockTweetResult());
    const mockPersisted: PersistedMedia[] = [
      {
        url: 'https://storage.googleapis.com/bucket/agent-scraping/twitter/789-ghi.jpg',
        storagePath: 'agent-scraping/twitter/789-ghi.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'twitter',
        originalUrl: 'https://pbs.twimg.com/media/abc123.jpg',
        sourceUrl: 'https://x.com/jalensmith/status/1234567890',
        sizeBytes: 200_000,
      },
    ];
    vi.mocked(mockMedia.persistBatch).mockResolvedValue(mockPersisted);

    const result = await tool.execute(
      { mode: 'profile_tweets', usernames: ['jalensmith'] },
      { userId: 'user_123', threadId: 'thread_456' }
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['imageUrl']).toBe(mockPersisted[0].url);
    expect(data['attachments']).toHaveLength(1);
  });
});
