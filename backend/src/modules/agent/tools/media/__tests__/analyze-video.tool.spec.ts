import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../base.tool.js';
import { AnalyzeVideoTool } from '../analyze-video.tool.js';

describe('AnalyzeVideoTool', () => {
  const scraper = {
    scrape: vi.fn(),
  };
  const llm = {
    complete: vi.fn(),
  };
  const apify = {
    searchActors: vi.fn(),
    getActorDetails: vi.fn(),
    callActor: vi.fn(),
  };
  const ffmpeg = {
    convertVideo: vi.fn(),
  };

  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    sessionId: 'session-789',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends public direct video files straight to OpenRouter', async () => {
    const tool = new AnalyzeVideoTool(scraper as never, llm as never);

    llm.complete.mockResolvedValueOnce({
      content: 'Detailed football play analysis',
      model: 'google/gemini-2.5-pro',
      usage: { totalTokens: 1234 },
    });

    const result = await tool.execute(
      {
        url: 'https://cdn.example.com/game-film.mp4',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(apify.searchActors).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalledTimes(1);
    const requestMessages = llm.complete.mock.calls[0]?.[0];
    expect(requestMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: { url: 'https://cdn.example.com/game-film.mp4' },
        }),
      ])
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        stagedUrls: [],
        sourceVideoUrls: ['https://cdn.example.com/game-film.mp4'],
        videoUrls: ['https://cdn.example.com/game-film.mp4'],
      })
    );
  });

  it('uses Apify to convert auth-backed media into an MP4 before analysis', async () => {
    const tool = new AnalyzeVideoTool(scraper as never, llm as never, apify as never);

    llm.complete.mockResolvedValueOnce({
      content: 'Detailed Apify-backed analysis',
      model: 'google/gemini-2.5-pro',
      usage: { totalTokens: 222 },
    });
    apify.searchActors.mockResolvedValue({
      items: [
        {
          actorId: 'demo/video-downloader',
          title: 'Authenticated Video Downloader',
          description: 'Downloads protected video URLs and converts them to mp4.',
        },
      ],
    });
    apify.getActorDetails.mockResolvedValue({
      actorId: 'demo/video-downloader',
      inputSchema: {
        properties: {
          url: { type: 'string' },
          headers: { type: 'object' },
          format: { type: 'string' },
        },
      },
    });
    apify.callActor.mockResolvedValue({
      videoUrl: 'https://downloads.example.com/from-apify.mp4',
    });

    const result = await tool.execute(
      {
        prompt: 'Analyze this clip.',
        artifact: {
          mediaKind: 'video',
          sourceType: 'protected_direct',
          transportReadiness: 'download_required',
          analysisReady: false,
          recommendedNextAction: 'call_apify_actor',
          sourceUrl: 'https://vc.hudl.com/protected.mp4',
          portableUrl: null,
          playableUrls: ['https://vc.hudl.com/protected.mp4'],
          directMp4Urls: ['https://vc.hudl.com/protected.mp4'],
          manifestUrls: [],
          stagingHeaders: {
            Cookie: 'session=abc123',
            Referer: 'https://www.hudl.com/library/123',
          },
          rationale: 'Protected clip must be acquired as a downloadable MP4 first.',
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(apify.searchActors).toHaveBeenCalledWith(expect.stringContaining('hudl.com'), 8);
    expect(apify.callActor).toHaveBeenCalledWith(
      'demo/video-downloader',
      expect.objectContaining({
        url: 'https://vc.hudl.com/protected.mp4',
        headers: {
          Cookie: 'session=abc123',
          Referer: 'https://www.hudl.com/library/123',
        },
        format: 'mp4',
      }),
      undefined
    );
    expect(llm.complete).toHaveBeenCalledTimes(1);
    const firstMessages = llm.complete.mock.calls[0]?.[0];
    expect(firstMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: {
            url: 'https://downloads.example.com/from-apify.mp4',
          },
        }),
      ])
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        videoUrls: ['https://downloads.example.com/from-apify.mp4'],
        sourceVideoUrls: ['https://downloads.example.com/from-apify.mp4'],
      })
    );
  });

  it('prefers explicit signed Firebase URL input over stale call_apify_actor artifact hints', async () => {
    const tool = new AnalyzeVideoTool(scraper as never, llm as never, apify as never);

    llm.complete.mockResolvedValueOnce({
      content: 'Direct signed-url analysis succeeded',
      model: 'google/gemini-2.5-pro',
      usage: { totalTokens: 333 },
    });

    const signedUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip.mp4?X-Goog-Signature=signed123';

    const result = await tool.execute(
      {
        url: signedUrl,
        prompt: 'Analyze this clip.',
        artifact: {
          mediaKind: 'video',
          sourceType: 'protected_direct',
          transportReadiness: 'download_required',
          analysisReady: false,
          recommendedNextAction: 'call_apify_actor',
          sourceUrl: 'https://vc.hudl.com/protected.mp4',
          portableUrl: null,
          playableUrls: ['https://vc.hudl.com/protected.mp4'],
          directMp4Urls: ['https://vc.hudl.com/protected.mp4'],
          manifestUrls: [],
          stagingHeaders: {
            Cookie: 'session=abc123',
            Referer: 'https://www.hudl.com/library/123',
          },
          rationale: 'Protected clip must be acquired as a downloadable MP4 first.',
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(apify.searchActors).not.toHaveBeenCalled();
    const requestMessages = llm.complete.mock.calls[0]?.[0];
    expect(requestMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: { url: signedUrl },
        }),
      ])
    );
  });

  it('uses media transport resolver output before Apify fallback workflows', async () => {
    const tool = new AnalyzeVideoTool(scraper as never, llm as never, apify as never);
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: ReturnType<typeof vi.fn> };
      }
    ).mediaTransportResolver = {
      resolveProcessingUrl: vi.fn().mockResolvedValue({
        url: 'https://downloads.cloudflare.com/video-123.mp4',
        source: 'cloudflare_download',
        cloudflareVideoId: 'video-123',
      }),
    };

    llm.complete.mockResolvedValueOnce({
      content: 'Resolved via transport layer',
      model: 'google/gemini-2.5-pro',
      usage: { totalTokens: 111 },
    });

    const result = await tool.execute(
      {
        url: 'https://watch.cloudflarestream.com/video-123',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(apify.searchActors).not.toHaveBeenCalled();
    const requestMessages = llm.complete.mock.calls[0]?.[0];
    expect(requestMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: { url: 'https://downloads.cloudflare.com/video-123.mp4' },
        }),
      ])
    );
  });

  it('retries with FFmpeg-normalized MP4 when OpenRouter returns empty choices for signed Firebase/GCS URLs without extension', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never
    );

    llm.complete
      .mockRejectedValueOnce(new Error('OpenRouter returned no choices.'))
      .mockResolvedValueOnce({
        content: 'Recovered after FFmpeg normalization',
        model: 'google/gemini-2.5-pro',
        usage: { totalTokens: 321 },
      });

    ffmpeg.convertVideo.mockResolvedValueOnce({
      outputUrl:
        'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized.mp4?alt=media&token=abc',
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip?X-Goog-Signature=abc123',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(ffmpeg.convertVideo).toHaveBeenCalledTimes(1);
    expect(llm.complete).toHaveBeenCalledTimes(2);

    const retryMessages = llm.complete.mock.calls[1]?.[0];
    expect(retryMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: {
            url: 'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized.mp4?alt=media&token=abc',
          },
        }),
      ])
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        videoUrls: [
          'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized.mp4?alt=media&token=abc',
        ],
      })
    );
  });

  it('retries with FFmpeg-normalized MP4 when OpenRouter returns INVALID_ARGUMENT cannot-fetch for signed Firebase/GCS URLs', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never
    );

    llm.complete
      .mockRejectedValueOnce(
        new Error(
          'OpenRouter API error 400: {"error":{"message":"Provider returned error","metadata":{"raw":"{ "error": { "message": "Cannot fetch content from the provided URL.", "status": "INVALID_ARGUMENT" } }"}}}'
        )
      )
      .mockResolvedValueOnce({
        content: 'Recovered after provider fetch failure via FFmpeg normalization',
        model: 'google/gemini-2.5-pro',
        usage: { totalTokens: 654 },
      });

    ffmpeg.convertVideo.mockResolvedValueOnce({
      outputUrl:
        'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized-fetch-failure.mp4?alt=media&token=def',
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip?X-Goog-Signature=def456',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(ffmpeg.convertVideo).toHaveBeenCalledTimes(1);
    expect(llm.complete).toHaveBeenCalledTimes(2);

    const retryMessages = llm.complete.mock.calls[1]?.[0];
    expect(retryMessages?.[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'video_url',
          video_url: {
            url: 'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized-fetch-failure.mp4?alt=media&token=def',
          },
        }),
      ])
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        videoUrls: [
          'https://firebasestorage.googleapis.com/v0/b/nxt-1/o/normalized-fetch-failure.mp4?alt=media&token=def',
        ],
      })
    );
  });
});
