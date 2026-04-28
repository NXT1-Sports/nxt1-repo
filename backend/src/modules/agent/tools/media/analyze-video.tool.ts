/**
 * @fileoverview Analyze Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Agent X tool for analyzing video content via OpenRouter's native video_url
 * support on Gemini models. Handles the full pipeline:
 *
 * 1. Receives a URL (page with video, direct MP4, or YouTube link).
 * 2. If the URL is a page (not a direct video), scrapes it to extract video URLs.
 * 3. Sends the video URL(s) + user prompt to a video-capable model via OpenRouter.
 * 4. Returns the model's analysis as structured text.
 *
 * Supported video sources:
 * - Direct MP4/MOV/WebM/MPEG/HLS/DASH URLs (CDN links, Hudl CDN, manifests, etc.)
 * - YouTube URLs (youtube.com/watch, youtu.be) — Gemini processes natively
 * - Pages containing embedded videos (Hudl profiles, MaxPreps, etc.)
 *
 * The tool uses the `video_analysis` model tier (Gemini 2.5 Flash) which
 * supports up to 2-hour videos and has a massive context window.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { ScraperService } from '../integrations/firecrawl/scraping/scraper.service.js';
import type { LLMContentPart, LLMMessage } from '../../llm/llm.types.js';
import { VIDEO_ANALYSIS_TIMEOUT_MS } from '../../llm/llm.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

/** File extensions that indicate a direct video URL or stream manifest. */
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mpeg|m4v|m3u8|mpd)(\?|$)/i;

/** URL patterns that are natively supported by Gemini without extraction. */
const YOUTUBE_PATTERN =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i;

/** Hudl CDN direct video pattern. */
const HUDL_CDN_PATTERN = /^https?:\/\/v[ic]\.hudl\.com\/.*\.mp4/i;

/** Maximum number of video URLs to send in a single analysis request. */
const MAX_VIDEOS_PER_REQUEST = 5;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class AnalyzeVideoTool extends BaseTool {
  readonly name = 'analyze_video';
  readonly description =
    'Analyzes video content from a URL using AI vision. ' +
    'Accepts direct video URLs (MP4, MOV, WebM, M3U8, MPD), YouTube links, or page URLs containing embedded videos. ' +
    'For page URLs (e.g. Hudl profiles, team pages), automatically extracts the video URLs first. ' +
    'Use for: game film analysis, defensive/offensive scheme breakdowns, player evaluation from highlights, ' +
    'technique assessment, play-by-play analysis, scouting reports from video, and any video-based coaching insights. ' +
    'Supports videos up to 2 hours long.';

  readonly parameters = z.object({
    url: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  });

  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  constructor(
    private readonly scraper: ScraperService,
    private readonly llm: OpenRouterService
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const url = input['url'];
    const prompt = input['prompt'];

    // ── Input validation ───────────────────────────────────────────────
    if (typeof url !== 'string' || url.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "url" is required and must be a non-empty string.',
      };
    }
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "prompt" is required and must be a non-empty string.',
      };
    }

    const trimmedUrl = url.trim();
    const trimmedPrompt = prompt.trim();

    try {
      // ── Resolve video URLs ─────────────────────────────────────────
      context?.emitStage?.('fetching_data', {
        icon: 'media',
        url: trimmedUrl,
        phase: 'resolve_video_url',
      });
      const videoUrls = await this.resolveVideoUrls(trimmedUrl);

      if (videoUrls.length === 0) {
        return {
          success: false,
          error:
            `No video content found at "${trimmedUrl}". ` +
            'Ensure the URL points to a page with embedded videos, a direct video file, or a YouTube link.',
        };
      }

      logger.info('[AnalyzeVideoTool] Resolved video URLs', {
        inputUrl: trimmedUrl,
        videoCount: videoUrls.length,
        providers: videoUrls.map((v) => this.classifyUrl(v)),
      });

      // ── Build multimodal message ───────────────────────────────────
      context?.emitStage?.('processing_media', {
        icon: 'media',
        url: trimmedUrl,
        videoCount: videoUrls.length,
        phase: 'analyze_video',
      });
      const contentParts: LLMContentPart[] = [];

      // Add video URL parts (capped to avoid context overflow)
      const videosToAnalyze = videoUrls.slice(0, MAX_VIDEOS_PER_REQUEST);
      for (const videoUrl of videosToAnalyze) {
        contentParts.push({ type: 'video_url', video_url: { url: videoUrl } });
      }

      // Add the user's analysis prompt
      contentParts.push({ type: 'text', text: trimmedPrompt });

      const messages: LLMMessage[] = [
        {
          role: 'system',
          content:
            'You are an elite sports video analyst and coaching assistant. ' +
            'Analyze the provided video(s) with expert-level detail. ' +
            'Focus on actionable coaching insights, specific plays/timestamps when possible, ' +
            'schematic tendencies, player technique evaluation, and strategic recommendations. ' +
            'Structure your analysis with clear sections and be thorough.',
        },
        { role: 'user', content: contentParts },
      ];

      // ── Call video-capable model via OpenRouter ────────────────────
      const result = await this.llm.complete(messages, {
        tier: 'video_analysis',
        maxTokens: 8192,
        temperature: 0.3,
        signal: AbortSignal.timeout(VIDEO_ANALYSIS_TIMEOUT_MS),
        telemetryContext: context?.userId
          ? {
              operationId: context.sessionId ?? '',
              userId: context.userId,
              agentId: 'data_coordinator',
              feature: 'video-analysis',
            }
          : undefined,
      });

      if (!result.content) {
        return {
          success: false,
          error: 'The model returned an empty response for the video analysis.',
        };
      }

      return {
        success: true,
        data: {
          analysis: result.content,
          videosAnalyzed: videosToAnalyze.length,
          videoUrls: videosToAnalyze,
          model: result.model,
          usage: result.usage,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video analysis failed';
      logger.error('[AnalyzeVideoTool] Failed', { error: message, url: trimmedUrl });
      return { success: false, error: message };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Resolves the input URL to one or more direct video URLs.
   * - If the URL is already a direct video or YouTube link, returns it directly.
   * - Otherwise, scrapes the page and extracts embedded video URLs.
   */
  private async resolveVideoUrls(url: string): Promise<string[]> {
    // Direct video file
    if (VIDEO_EXTENSIONS.test(url) || HUDL_CDN_PATTERN.test(url)) {
      return [url];
    }

    // YouTube URL — Gemini processes these natively
    if (YOUTUBE_PATTERN.test(url)) {
      return [url];
    }

    // Page URL — scrape and extract videos
    try {
      const result = await this.scraper.scrape({ url });
      const videos = result.pageData?.videos ?? [];

      if (videos.length === 0) {
        return [];
      }

      // Prioritize direct MP4/CDN URLs over embed URLs.
      // Gemini can handle YouTube URLs natively, and direct MP4s via video_url.
      // Embed URLs (iframes) won't work — filter those out.
      const usableUrls: string[] = [];

      for (const video of videos) {
        const src = video.src;
        // Direct video file (Hudl CDN mp4, etc.)
        if (VIDEO_EXTENSIONS.test(src) || HUDL_CDN_PATTERN.test(src)) {
          usableUrls.push(src);
          continue;
        }
        // YouTube — convert embed URLs to watch URLs for Gemini
        if (video.provider === 'youtube' && video.videoId) {
          usableUrls.push(`https://www.youtube.com/watch?v=${video.videoId}`);
          continue;
        }
        // YouTube pattern in src directly
        if (YOUTUBE_PATTERN.test(src)) {
          usableUrls.push(src);
          continue;
        }
      }

      return usableUrls;
    } catch (err) {
      logger.warn('[AnalyzeVideoTool] Scraping failed, trying URL as direct video', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      // If scraping fails, try the URL directly — it might be a video URL
      // that our regex didn't match but the model can still process
      return [url];
    }
  }

  /** Classify a URL for logging purposes. */
  private classifyUrl(url: string): string {
    if (YOUTUBE_PATTERN.test(url)) return 'youtube';
    if (HUDL_CDN_PATTERN.test(url)) return 'hudl-cdn';
    if (VIDEO_EXTENSIONS.test(url)) return 'direct-video';
    return 'other';
  }
}
