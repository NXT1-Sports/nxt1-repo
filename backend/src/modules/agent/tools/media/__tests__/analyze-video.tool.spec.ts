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
  const geminiFiles = {
    analyzeVideoFromUrl: vi.fn(),
    analyzeVideosFromUrls: vi.fn(),
  };
  const cloudflareBridge = {
    clipVideo: vi.fn(),
    getVideo: vi.fn(),
  };

  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    sessionId: 'session-789',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    scraper.scrape.mockReset();
    llm.complete.mockReset();
    apify.searchActors.mockReset();
    apify.getActorDetails.mockReset();
    apify.callActor.mockReset();
    ffmpeg.convertVideo.mockReset();
    geminiFiles.analyzeVideoFromUrl.mockReset();
    geminiFiles.analyzeVideosFromUrls.mockReset();
    cloudflareBridge.clipVideo.mockReset();
    cloudflareBridge.getVideo.mockReset();
    context.emitStage = vi.fn();
  });

  it('clips bounded Cloudflare ranges before Gemini analysis', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never,
      geminiFiles as never,
      cloudflareBridge as never
    );
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: 'https://customer.example.cloudflarestream.com/clip-456/downloads/default.mp4',
      source: 'cloudflare_download',
      cloudflareVideoId: 'clip-456',
    });
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    cloudflareBridge.clipVideo.mockResolvedValueOnce({ uid: 'clip-456' });
    cloudflareBridge.getVideo.mockResolvedValueOnce({
      uid: 'clip-456',
      status: { state: 'ready', pctComplete: 100 },
    });
    geminiFiles.analyzeVideosFromUrls.mockResolvedValueOnce({
      content: 'Bounded clip analysis',
      toolCalls: [],
      model: 'gemini-3.1-pro-preview',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 1200,
      costUsd: 0.001,
      finishReason: 'STOP',
    });

    const result = await tool.execute(
      {
        url: 'https://watch.cloudflarestream.com/source-123',
        cloudflareVideoId: 'source-123',
        prompt: 'Analyze this play.',
        timeRange: {
          startSec: 15,
          endSec: 22,
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(cloudflareBridge.clipVideo).toHaveBeenCalledWith('source-123', 13, 24, undefined, 240);
    expect(resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://watch.cloudflarestream.com/clip-456',
        cloudflareVideoId: 'clip-456',
        cloudflareDownloadPolicy: 'allow_render_and_poll',
        fallbackToFirebaseStaging: false,
      })
    );
    expect(geminiFiles.analyzeVideosFromUrls).toHaveBeenCalledWith(
      ['https://customer.example.cloudflarestream.com/clip-456/downloads/default.mp4'],
      'Analyze this play.',
      4096,
      expect.objectContaining({ userId: 'user-123', threadId: 'thread-456' })
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        clipApplied: {
          sourceVideoId: 'source-123',
          clipVideoId: 'clip-456',
          requestedStartSec: 15,
          requestedEndSec: 22,
          clipStartSec: 13,
          clipEndSec: 24,
        },
      })
    );
  });

  it('uses Gemini Files API for public direct video files when configured', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never,
      geminiFiles as never
    );

    geminiFiles.analyzeVideosFromUrls.mockResolvedValueOnce({
      content: 'Detailed Gemini Files football play analysis',
      toolCalls: [],
      model: 'gemini-3.1-pro-preview',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 1200,
      costUsd: 0.001,
      finishReason: 'STOP',
    });

    const result = await tool.execute(
      {
        url: 'https://cdn.example.com/game-film.mp4',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(geminiFiles.analyzeVideosFromUrls).toHaveBeenCalledWith(
      ['https://cdn.example.com/game-film.mp4'],
      'Analyze this clip.',
      4096,
      expect.objectContaining({
        userId: 'user-123',
        threadId: 'thread-456',
      })
    );
    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        analysis: 'Detailed Gemini Files football play analysis',
        model: 'gemini-3.1-pro-preview',
        sourceVideoUrls: ['https://cdn.example.com/game-film.mp4'],
        videoUrls: ['https://cdn.example.com/game-film.mp4'],
      })
    );
  });

  it('uses Gemini Files API for Hudl CDN MP4s when configured', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never,
      geminiFiles as never
    );

    const hudlUrl =
      'https://vf.hudl.com/p-highlights/User/18167874/63122f7d2aa66805346b6425/a821e6aa_720.mp4?v=EAA6F78B7EC0DA08';

    geminiFiles.analyzeVideosFromUrls.mockResolvedValueOnce({
      content: 'Hudl video analyzed through Gemini Files',
      toolCalls: [],
      model: 'gemini-3.1-pro-preview',
      usage: { inputTokens: 90, outputTokens: 45, totalTokens: 135 },
      latencyMs: 1000,
      costUsd: 0.001,
      finishReason: 'STOP',
    });

    const result = await tool.execute(
      {
        url: hudlUrl,
        prompt: 'Find the best moments.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(geminiFiles.analyzeVideosFromUrls).toHaveBeenCalledWith(
      [hudlUrl],
      'Find the best moments.',
      4096,
      expect.objectContaining({
        userId: 'user-123',
        threadId: 'thread-456',
      })
    );
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('falls back to OpenRouter for public direct video files when Gemini Files is not configured', async () => {
    const tool = new AnalyzeVideoTool(scraper as never, llm as never);

    llm.complete.mockResolvedValueOnce({
      content: 'Detailed football play analysis',
      model: 'google/gemini-3.1-pro-preview',
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
      model: 'google/gemini-3.1-pro-preview',
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
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip.mp4?X-Goog-Signature=signed123',
      source: 'unchanged',
    });
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    llm.complete.mockResolvedValueOnce({
      content: 'Direct signed-url analysis succeeded',
      model: 'google/gemini-3.1-pro-preview',
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
    expect(resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: signedUrl,
        fallbackToFirebaseStaging: true,
      })
    );
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
      model: 'google/gemini-3.1-pro-preview',
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

  it('passes cloudflareVideoId through transport resolution before Gemini analysis', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never,
      geminiFiles as never
    );
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: 'https://customer.example.cloudflarestream.com/8c72670e15519099333c03359dd39b98/downloads/default.mp4',
      source: 'cloudflare_download',
      cloudflareVideoId: '8c72670e15519099333c03359dd39b98',
    });
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    geminiFiles.analyzeVideosFromUrls.mockResolvedValueOnce({
      content: 'Cloudflare-backed film analyzed through Gemini Files',
      toolCalls: [],
      model: 'gemini-3.1-pro-preview',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 1200,
      costUsd: 0.001,
      finishReason: 'STOP',
    });

    const firebasePlaceholderUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/staged/video/1779287684553-b1aa23127cb752e1-8c72670e15519099333c03359dd39b98.bin?X-Goog-Signature=signed';

    const result = await tool.execute(
      {
        url: firebasePlaceholderUrl,
        cloudflareVideoId: '8c72670e15519099333c03359dd39b98',
        prompt: 'Analyze this clip.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: firebasePlaceholderUrl,
        cloudflareVideoId: '8c72670e15519099333c03359dd39b98',
        cloudflareDownloadPolicy: 'allow_render_and_poll',
        fallbackToFirebaseStaging: true,
        stageMediaKind: 'video',
      })
    );
    expect(geminiFiles.analyzeVideosFromUrls).toHaveBeenCalledWith(
      [
        'https://customer.example.cloudflarestream.com/8c72670e15519099333c03359dd39b98/downloads/default.mp4',
      ],
      'Analyze this clip.',
      4096,
      expect.objectContaining({ userId: 'user-123', threadId: 'thread-456' })
    );
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('reuses a cached Cloudflare MP4 download without hitting the transport resolver again', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never,
      geminiFiles as never
    );
    const resolveProcessingUrl = vi.fn();
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    geminiFiles.analyzeVideosFromUrls.mockResolvedValueOnce({
      content: 'Cached Cloudflare download analyzed directly',
      toolCalls: [],
      model: 'gemini-3.1-pro-preview',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 1200,
      costUsd: 0.001,
      finishReason: 'STOP',
    });

    const result = await tool.execute(
      {
        url: 'https://watch.cloudflarestream.com/video-123',
        cloudflareVideoId: 'video-123',
        prompt: 'Analyze this clip.',
        artifact: {
          mediaKind: 'video',
          sourceType: 'cloudflare',
          transportReadiness: 'persistence_optional',
          analysisReady: true,
          recommendedNextAction: 'analyze_video',
          sourceUrl: 'https://watch.cloudflarestream.com/video-123',
          portableUrl: 'https://watch.cloudflarestream.com/video-123',
          playableUrls: ['https://watch.cloudflarestream.com/video-123'],
          directMp4Urls: [
            'https://customer.example.cloudflarestream.com/video-123/downloads/default.mp4',
          ],
          manifestUrls: [],
          cloudflareVideoId: 'video-123',
          rationale: 'A prewarmed Cloudflare MP4 is already available.',
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(resolveProcessingUrl).not.toHaveBeenCalled();
    expect(geminiFiles.analyzeVideosFromUrls).toHaveBeenCalledWith(
      ['https://customer.example.cloudflarestream.com/video-123/downloads/default.mp4'],
      'Analyze this clip.',
      4096,
      expect.objectContaining({ userId: 'user-123', threadId: 'thread-456' })
    );
  });

  it('retries with FFmpeg-normalized MP4 when OpenRouter returns empty choices for signed Firebase/GCS URLs without extension', async () => {
    const tool = new AnalyzeVideoTool(
      scraper as never,
      llm as never,
      apify as never,
      ffmpeg as never
    );
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip?X-Goog-Signature=abc123',
      source: 'unchanged',
    });
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    llm.complete
      .mockRejectedValueOnce(new Error('OpenRouter returned no choices.'))
      .mockResolvedValueOnce({
        content: 'Recovered after FFmpeg normalization',
        model: 'google/gemini-3.1-pro-preview',
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
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/tmp/video/clip?X-Goog-Signature=def456',
      source: 'unchanged',
    });
    (
      tool as unknown as {
        mediaTransportResolver: { resolveProcessingUrl: typeof resolveProcessingUrl };
      }
    ).mediaTransportResolver = { resolveProcessingUrl };

    llm.complete
      .mockRejectedValueOnce(
        new Error(
          'OpenRouter API error 400: {"error":{"message":"Provider returned error","metadata":{"raw":"{ "error": { "message": "Cannot fetch content from the provided URL.", "status": "INVALID_ARGUMENT" } }"}}}'
        )
      )
      .mockResolvedValueOnce({
        content: 'Recovered after provider fetch failure via FFmpeg normalization',
        model: 'google/gemini-3.1-pro-preview',
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
