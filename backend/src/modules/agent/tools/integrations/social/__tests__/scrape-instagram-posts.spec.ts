/**
 * @fileoverview Unit Tests — ScrapeInstagramTool posts mode
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ScrapeInstagramTool } from '../scrape-instagram.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { InstagramPost } from '../../apify/apify.service.js';

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-123',
  threadId: 'thread-456',
};

function makePost(overrides: Partial<InstagramPost> = {}): InstagramPost {
  return {
    id: 'post-1',
    shortCode: 'abc123',
    caption: 'Latest training reel',
    url: 'https://www.instagram.com/p/abc123/',
    likes: 120,
    comments: 12,
    timestamp: '2026-05-01T12:00:00Z',
    ownerUsername: 'athlete_1',
    type: 'Image',
    locationName: '',
    hashtags: [],
    mentions: [],
    displayUrl: '',
    videoUrl: '',
    ...overrides,
  };
}

describe('ScrapeInstagramTool — posts mode', () => {
  const mockApify = {
    getInstagramPosts: vi.fn(),
    getInstagramProfiles: vi.fn(),
    searchInstagram: vi.fn(),
  };

  const mockBridge = {
    searchActors: vi.fn(),
    getActorDetails: vi.fn(),
    callActor: vi.fn(),
  };

  const mockMedia = {
    persistBatch: vi.fn(),
  };

  let tool: ScrapeInstagramTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new ScrapeInstagramTool(mockApify as never, mockMedia as never, mockBridge as never);
  });

  it('falls back to Apify MCP when posts mode returns no usable media', async () => {
    const fallbackVideoUrl = 'https://cdn.example.com/instagram-reel.mp4';

    mockApify.getInstagramPosts.mockResolvedValue({
      success: true,
      items: [makePost()],
      itemCount: 1,
      durationMs: 400,
    });
    mockBridge.searchActors.mockResolvedValue([
      {
        actorId: 'community/instagram-video-downloader',
        title: 'Instagram Video Downloader',
        description: 'Download reels and post videos',
      },
    ]);
    mockBridge.getActorDetails.mockResolvedValue({
      inputSchema: {
        properties: {
          directUrls: { type: 'array' },
          resultsLimit: { type: 'integer' },
          saveVideo: { type: 'boolean' },
          resultsType: { type: 'string' },
        },
      },
    });
    mockBridge.callActor.mockResolvedValue({
      result: [{ videoUrl: fallbackVideoUrl }],
    });
    mockMedia.persistBatch.mockResolvedValue([]);

    const result = await tool.execute({ mode: 'posts', usernames: ['athlete_1'] }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(mockBridge.searchActors).toHaveBeenCalled();
    expect(mockBridge.getActorDetails).toHaveBeenCalledWith('community/instagram-video-downloader');
    expect(mockBridge.callActor).toHaveBeenCalledWith(
      'community/instagram-video-downloader',
      expect.objectContaining({
        directUrls: ['https://www.instagram.com/athlete_1/'],
        resultsLimit: 3,
        saveVideo: true,
        resultsType: 'posts',
      })
    );

    const data = result.data as Record<string, unknown>;
    expect(data['videoUrl']).toBe(fallbackVideoUrl);
    expect(data['fallbackActorId']).toBe('community/instagram-video-downloader');
  });

  it('uses staged URLs for post media while preserving the Instagram permalink', async () => {
    const videoUrl = 'https://scontent.cdninstagram.com/video/reel.mp4';
    const stagedVideoUrl = 'https://storage.googleapis.com/nxt1/tmp/reel.mp4?token=abc';
    const permalink = 'https://www.instagram.com/p/abc123/';

    mockApify.getInstagramPosts.mockResolvedValue({
      success: true,
      items: [makePost({ url: permalink, videoUrl, type: 'Video' })],
      itemCount: 1,
      durationMs: 400,
    });
    mockMedia.persistBatch.mockResolvedValue([
      {
        url: stagedVideoUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/reel.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        platform: 'instagram',
        originalUrl: videoUrl,
        sourceUrl: permalink,
        sizeBytes: 100,
      },
    ]);

    const result = await tool.execute({ mode: 'posts', usernames: ['athlete_1'] }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const posts = data['posts'] as Array<Record<string, unknown>>;

    expect(data['videoUrl']).toBe(stagedVideoUrl);
    expect(posts[0]?.['url']).toBe(permalink);
    expect(posts[0]?.['videoUrl']).toBe(stagedVideoUrl);
  });
});
