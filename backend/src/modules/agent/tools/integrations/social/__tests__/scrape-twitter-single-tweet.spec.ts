/**
 * @fileoverview Unit Tests — ScrapeTwitterTool single_tweet mode
 *
 * Verifies that the single_tweet mode:
 *   1) Delegates to ApifyService.getSingleTweet() (not the bulk actor)
 *   2) Returns a MediaWorkflowArtifact when the tweet contains a video
 *   3) Returns imageUrls[] when the tweet contains images
 *   4) Handles tweets with neither video nor images gracefully
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ScrapeTwitterTool } from '../scrape-twitter.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { ScweetTweet } from '../../apify/apify.service.js';

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-123',
  threadId: 'thread-456',
};

const TWEET_URL = 'https://x.com/WEGOTNEXTHOOPS1/status/2016489040111972590';

function makeTweet(overrides: Partial<ScweetTweet> = {}): ScweetTweet {
  return {
    id: '2016489040111972590',
    text: 'Check out this highlight 🏀',
    author: {
      username: 'WEGOTNEXTHOOPS1',
      displayName: 'We Got Next Hoops',
      followersCount: 50000,
    },
    createdAt: '2026-05-01T12:00:00Z',
    videoUrl: null,
    imageUrls: [],
    likeCount: 100,
    retweetCount: 25,
    replyCount: 10,
    ...overrides,
  };
}

describe('ScrapeTwitterTool — single_tweet mode', () => {
  const mockApify = {
    getSingleTweet: vi.fn(),
    searchTweets: vi.fn(),
    getUserTweets: vi.fn(),
    getUserFollowers: vi.fn(),
  };

  const mockBridge = {
    searchActors: vi.fn(),
    getActorDetails: vi.fn(),
    callActor: vi.fn(),
  };

  const mockMedia = {
    persistBatch: vi.fn(),
  };

  let tool: ScrapeTwitterTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new ScrapeTwitterTool(mockApify as never, mockMedia as never, mockBridge as never);
  });

  it('calls getSingleTweet with the tweet URL', async () => {
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet()],
      runId: 'run-1',
      durationMs: 500,
    });

    await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(mockApify.getSingleTweet).toHaveBeenCalledWith(TWEET_URL);
    expect(mockApify.searchTweets).not.toHaveBeenCalled();
    expect(mockApify.getUserTweets).not.toHaveBeenCalled();
  });

  it('returns a MediaWorkflowArtifact when the tweet has a video', async () => {
    const videoUrl = 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/clip.mp4';
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet({ videoUrl })],
      runId: 'run-1',
      durationMs: 500,
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['artifact']).toBeDefined();
    const artifact = data['artifact'] as Record<string, unknown>;
    expect(artifact['mediaKind']).toBe('video');
    expect(artifact['sourceUrl']).toBe(TWEET_URL);
  });

  it('uses staged URLs for playable media while preserving the tweet source URL', async () => {
    const videoUrl = 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/clip.mp4';
    const imageUrl = 'https://pbs.twimg.com/media/example1.jpg';
    const stagedVideoUrl = 'https://storage.googleapis.com/nxt1/tmp/clip.mp4?token=abc';
    const stagedImageUrl = 'https://storage.googleapis.com/nxt1/tmp/example1.jpg?token=def';

    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet({ videoUrl, imageUrls: [imageUrl] })],
      runId: 'run-1',
      durationMs: 500,
    });
    mockMedia.persistBatch.mockResolvedValue([
      {
        url: stagedVideoUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/clip.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        platform: 'twitter',
        originalUrl: videoUrl,
        sourceUrl: TWEET_URL,
        sizeBytes: 100,
      },
      {
        url: stagedImageUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/example1.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'twitter',
        originalUrl: imageUrl,
        sourceUrl: TWEET_URL,
        sizeBytes: 50,
      },
    ]);

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const tweet = data['tweet'] as Record<string, unknown>;
    const artifact = data['artifact'] as Record<string, unknown>;

    expect(data['videoUrl']).toBe(stagedVideoUrl);
    expect(data['imageUrls']).toEqual([stagedImageUrl]);
    expect(tweet['videoUrl']).toBe(stagedVideoUrl);
    expect(tweet['imageUrls']).toEqual([stagedImageUrl]);
    expect(artifact['sourceUrl']).toBe(TWEET_URL);
    expect(artifact['playableUrls']).toContain(stagedVideoUrl);
    expect(artifact['directMp4Urls']).toContain(stagedVideoUrl);
  });

  it('returns imageUrls[] when tweet has images but no video', async () => {
    const imageUrls = [
      'https://pbs.twimg.com/media/example1.jpg',
      'https://pbs.twimg.com/media/example2.jpg',
    ];
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet({ imageUrls })],
      runId: 'run-1',
      durationMs: 500,
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['imageUrls']).toEqual(imageUrls);
    expect(data['artifact']).toBeUndefined();
  });

  it('succeeds gracefully when tweet has no media', async () => {
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet()],
      runId: 'run-1',
      durationMs: 500,
    });

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['artifact']).toBeUndefined();
    expect(data['imageUrls']).toEqual([]);
  });

  it('returns failure when tweetUrl is missing', async () => {
    const result = await tool.execute({ mode: 'single_tweet' }, TEST_CONTEXT);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/tweetUrl/i);
  });

  it('returns failure when mode=single_tweet receives a profile URL instead of /status permalink', async () => {
    const result = await tool.execute(
      { mode: 'single_tweet', tweetUrl: 'https://x.com/WEGOTNEXTHOOPS1' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/single tweet permalink|profile_tweets|Routing mismatch/i);
    expect(mockApify.getSingleTweet).not.toHaveBeenCalled();
  });

  it('returns failure on ApifyService error', async () => {
    mockApify.getSingleTweet.mockRejectedValue(new Error('Apify rate limit'));

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate limit|failed/i);
  });

  it('falls back to Apify MCP when the dedicated actor returns no usable video', async () => {
    const fallbackVideoUrl = 'https://cdn.example.com/fallback-highlight.mp4';

    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet({ imageUrls: ['https://pbs.twimg.com/media/poster.jpg'], videoUrl: '' })],
      runId: 'run-1',
      durationMs: 500,
    });
    mockBridge.searchActors.mockResolvedValue([
      {
        actorId: 'community/twitter-video-downloader',
        title: 'Twitter Video Downloader',
        description: 'Download tweet videos as mp4',
      },
    ]);
    mockBridge.getActorDetails.mockResolvedValue({
      inputSchema: {
        properties: {
          startUrls: {
            type: 'array',
            items: { type: 'object' },
          },
          maxItems: { type: 'integer' },
          saveVideo: { type: 'boolean' },
        },
      },
    });
    mockBridge.callActor.mockResolvedValue({
      result: [{ videoUrl: fallbackVideoUrl }],
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(mockBridge.searchActors).toHaveBeenCalled();
    expect(mockBridge.getActorDetails).toHaveBeenCalledWith('community/twitter-video-downloader');
    expect(mockBridge.callActor).toHaveBeenCalledWith(
      'community/twitter-video-downloader',
      expect.objectContaining({
        startUrls: [{ url: TWEET_URL }],
        maxItems: 1,
        saveVideo: true,
      })
    );

    const data = result.data as Record<string, unknown>;
    expect(data['videoUrl']).toBe(fallbackVideoUrl);
    expect(data['fallbackActorId']).toBe('community/twitter-video-downloader');
  });

  it('uses the numeric tweet ID for fallback actor schemas that require it', async () => {
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet()],
      runId: 'run-1',
      durationMs: 500,
    });
    mockBridge.searchActors.mockResolvedValue([
      { actorId: 'community/id-only', title: 'Tweet video', description: 'video downloader' },
    ]);
    mockBridge.getActorDetails.mockResolvedValue({
      inputSchema: {
        required: ['tweetUrls'],
        properties: {
          tweetUrls: {
            type: 'array',
            items: { type: 'string', pattern: '^\\d+$' },
          },
        },
      },
    });
    mockBridge.callActor.mockResolvedValue({
      result: [{ videoUrl: 'https://cdn.example.com/id.mp4' }],
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    await tool.execute(
      { mode: 'single_tweet', tweetUrl: `${TWEET_URL}?s=46&t=tracking` },
      TEST_CONTEXT
    );

    expect(mockApify.getSingleTweet).toHaveBeenCalledWith(TWEET_URL);
    expect(mockBridge.callActor).toHaveBeenCalledWith('community/id-only', {
      tweetUrls: ['2016489040111972590'],
    });
  });

  it('uses a canonical no-query permalink for strict fallback URL schemas', async () => {
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet()],
      runId: 'run-1',
      durationMs: 500,
    });
    mockBridge.searchActors.mockResolvedValue([
      { actorId: 'community/canonical-url', title: 'Tweet video', description: 'video downloader' },
    ]);
    mockBridge.getActorDetails.mockResolvedValue({
      inputSchema: {
        required: ['tweetUrls'],
        properties: {
          tweetUrls: {
            type: 'array',
            items: {
              type: 'string',
              pattern: '^(https?:\\/\\/(?:x\\.com|twitter\\.com)\\/\\w+\\/status\\/\\d+|\\d+)$',
            },
          },
        },
      },
    });
    mockBridge.callActor.mockResolvedValue({
      result: [{ videoUrl: 'https://cdn.example.com/url.mp4' }],
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    await tool.execute(
      { mode: 'single_tweet', tweetUrl: `${TWEET_URL}?s=46&t=tracking` },
      TEST_CONTEXT
    );

    expect(mockBridge.callActor).toHaveBeenCalledWith('community/canonical-url', {
      tweetUrls: [TWEET_URL],
    });
  });

  it('skips fallback actors with required fields it cannot safely provide', async () => {
    mockApify.getSingleTweet.mockResolvedValue({
      success: true,
      items: [makeTweet()],
      runId: 'run-1',
      durationMs: 500,
    });
    mockBridge.searchActors.mockResolvedValue([
      { actorId: 'community/incompatible', title: 'Tweet video', description: 'video downloader' },
    ]);
    mockBridge.getActorDetails.mockResolvedValue({
      inputSchema: {
        required: ['tweetUrls', 'apiKey'],
        properties: {
          tweetUrls: { type: 'array', items: { type: 'string' } },
          apiKey: { type: 'string' },
        },
      },
    });

    const result = await tool.execute({ mode: 'single_tweet', tweetUrl: TWEET_URL }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(mockBridge.callActor).not.toHaveBeenCalled();
    expect((result.data as Record<string, unknown>)['mediaFound']).toBe(false);
  });
});
