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

  const mockMedia = {
    persistBatch: vi.fn(),
  };

  let tool: ScrapeTwitterTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new ScrapeTwitterTool(mockApify as never, mockMedia as never);
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
});
