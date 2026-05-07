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
import type { ApifyMcpBridgeService } from '../integrations/apify/apify-mcp-bridge.service.js';
import type { FfmpegMcpBridgeService } from '../integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
import type { LLMContentPart, LLMMessage } from '../../llm/llm.types.js';
import { VIDEO_ANALYSIS_TIMEOUT_MS } from '../../llm/llm.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';
import { buildPortableMediaArtifact, type MediaWorkflowArtifact } from './media-workflow.js';
import { MediaTransportResolverService } from './media-transport-resolver.service.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** File extensions that indicate a directly playable video file. */
const DIRECT_VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mpeg|m4v)(\?|$)/i;
const HLS_MANIFEST_PATTERN = /\.m3u8(\?|$)/i;
const DASH_MANIFEST_PATTERN = /\.mpd(\?|$)/i;

/** URL patterns that are natively supported by Gemini without extraction. */
const YOUTUBE_PATTERN =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i;

/** Hudl CDN direct video pattern. */
const HUDL_CDN_PATTERN = /^https?:\/\/v[ic]\.hudl\.com\/.*\.mp4/i;

/** Maximum number of video URLs to send in a single analysis request. */
const MAX_VIDEOS_PER_REQUEST = 5;
const APIFY_DISCOVERY_LIMIT = 8;
const APIFY_MAX_CANDIDATES = 4;
const APIFY_DEFAULT_TIMEOUT_SECS = 180;
const APIFY_DEFAULT_MEMORY_MB = 256;
const MOV_EXTENSION_PATTERN = /\.mov(?:$|[?#])/i;
const GCS_SIGNED_URL_PATTERN = /[?&]X-Goog-Signature=/i;
const FIREBASE_GCS_HOST_PATTERN =
  /^https?:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i;
const OPENROUTER_FETCH_FAILURE_PATTERN =
  /cannot fetch content from the provided url|invalid_argument/i;

const MediaArtifactSchema = z.object({
  mediaKind: z.enum(['video', 'image', 'audio', 'document', 'other']),
  sourceType: z.enum([
    'public_direct',
    'protected_direct',
    'hls_manifest',
    'dash_manifest',
    'playlist',
    'youtube',
    'staged',
    'cloudflare',
    'unknown',
  ]),
  transportReadiness: z.enum([
    'portable',
    'auth_required',
    'download_required',
    'persistence_optional',
    'persistence_required',
    'unknown',
  ]),
  analysisReady: z.boolean(),
  recommendedNextAction: z.enum([
    'analyze_video',
    'stage_media',
    'call_apify_actor',
    'import_video',
    'enable_download',
    'review_media',
  ]),
  sourceUrl: z.string().nullable(),
  portableUrl: z.string().nullable(),
  playableUrls: z.array(z.string()),
  directMp4Urls: z.array(z.string()),
  manifestUrls: z.array(z.string()),
  stagingHeaders: z.record(z.string(), z.string()).optional(),
  rationale: z.string(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class AnalyzeVideoTool extends BaseTool {
  readonly name = 'analyze_video';
  readonly description =
    'Analyzes video content from a URL using AI vision. ' +
    'Accepts direct video URLs (MP4, MOV, WebM), YouTube links, or page URLs containing embedded videos. ' +
    'For page URLs (e.g. Hudl profiles, team pages), automatically extracts the video URLs first. ' +
    'Use for: game film analysis, defensive/offensive scheme breakdowns, player evaluation from highlights, ' +
    'technique assessment, play-by-play analysis, scouting reports from video, and any video-based coaching insights. ' +
    'Supports videos up to 2 hours long.';

  readonly parameters = z.object({
    url: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1),
    artifact: MediaArtifactSchema.optional(),
  });

  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly mediaTransportResolver = new MediaTransportResolverService();

  constructor(
    private readonly scraper: ScraperService,
    private readonly llm: OpenRouterService,
    private readonly apifyBridge?: ApifyMcpBridgeService,
    private readonly ffmpegBridge?: FfmpegMcpBridgeService
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const prompt = parsed.data.prompt;
    const artifact = parsed.data.artifact as MediaWorkflowArtifact | undefined;
    const url = parsed.data.url ?? artifact?.portableUrl ?? artifact?.sourceUrl ?? null;

    // ── Input validation ───────────────────────────────────────────────
    if (typeof url !== 'string' || url.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "url" or artifact.sourceUrl is required and must be a non-empty string.',
      };
    }

    const trimmedUrl = url.trim();
    const trimmedPrompt = prompt.trim();

    try {
      const resolvedInput = await this.resolveAnalysisInput(trimmedUrl, artifact, context);

      // ── Resolve video URLs ─────────────────────────────────────────
      context?.emitStage?.('fetching_data', {
        icon: 'media',
        url: resolvedInput.url,
        phase: 'resolve_video_url',
      });
      const videoUrls = await this.resolveVideoUrls(resolvedInput.url);

      if (videoUrls.length === 0) {
        return {
          success: false,
          error:
            `No video content found at "${resolvedInput.url}". ` +
            'Ensure the URL points to a page with embedded videos, a direct video file, or a YouTube link.',
        };
      }

      logger.info('[AnalyzeVideoTool] Resolved video URLs', {
        inputUrl: resolvedInput.url,
        videoCount: videoUrls.length,
        providers: videoUrls.map((v) => this.classifyUrl(v)),
      });

      // ── Build multimodal message ───────────────────────────────────
      context?.emitStage?.('processing_media', {
        icon: 'media',
        url: resolvedInput.url,
        videoCount: videoUrls.length,
        phase: 'analyze_video',
      });
      const videosToAnalyze = videoUrls.slice(0, MAX_VIDEOS_PER_REQUEST);
      const analysis = await this.completeVideoAnalysisWithMovFallback(
        videosToAnalyze,
        trimmedPrompt,
        context
      );

      if (!analysis.result.content) {
        return {
          success: false,
          error: 'The model returned an empty response for the video analysis.',
        };
      }

      const finalVideoUrls = analysis.analyzedVideoUrls;

      return {
        success: true,
        data: {
          analysis: analysis.result.content,
          videosAnalyzed: finalVideoUrls.length,
          videoUrls: finalVideoUrls,
          sourceVideoUrls: finalVideoUrls,
          stagedUrls: [],
          mediaArtifact: buildPortableMediaArtifact({
            sourceUrl: finalVideoUrls[0] ?? resolvedInput.url,
            rationale: 'This media source was normalized into a portable analysis input.',
          }),
          model: analysis.result.model,
          usage: analysis.result.usage,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video analysis failed';
      logger.error('[AnalyzeVideoTool] Failed', { error: message, url: trimmedUrl });
      return { success: false, error: message };
    }
  }

  private async resolveAnalysisInput(
    url: string,
    artifact: MediaWorkflowArtifact | undefined,
    context?: ToolExecutionContext
  ): Promise<{ readonly url: string; readonly headers?: Readonly<Record<string, string>> }> {
    if (!artifact) {
      const resolvedTransportInput = await this.mediaTransportResolver.resolveProcessingUrl({
        sourceUrl: url,
        fallbackToFirebaseStaging: true,
        stageMediaKind: 'video',
        executionContext: context,
      });

      if (resolvedTransportInput.source !== 'unchanged') {
        logger.info('[AnalyzeVideoTool] Resolved media transport before analysis', {
          source: resolvedTransportInput.source,
          cloudflareVideoId: resolvedTransportInput.cloudflareVideoId,
        });
        return { url: resolvedTransportInput.url };
      }

      if (HLS_MANIFEST_PATTERN.test(url) || DASH_MANIFEST_PATTERN.test(url)) {
        const manifestArtifact: MediaWorkflowArtifact = {
          mediaKind: 'video',
          sourceType: HLS_MANIFEST_PATTERN.test(url) ? 'hls_manifest' : 'dash_manifest',
          transportReadiness: 'download_required',
          analysisReady: false,
          recommendedNextAction: 'call_apify_actor',
          sourceUrl: url,
          portableUrl: null,
          playableUrls: [url],
          directMp4Urls: [],
          manifestUrls: [url],
          rationale: 'Manifest URLs must be converted into a downloadable MP4 before analysis.',
        };
        return { url: await this.acquireMp4WithApify(manifestArtifact, context) };
      }

      return { url };
    }

    if (artifact.analysisReady && artifact.portableUrl) {
      const resolvedPortable = await this.mediaTransportResolver.resolveProcessingUrl({
        sourceUrl: artifact.portableUrl,
        fallbackToFirebaseStaging: true,
        stageMediaKind: 'video',
        executionContext: context,
      });

      return {
        url: resolvedPortable.url,
        ...(artifact.stagingHeaders ? { headers: artifact.stagingHeaders } : {}),
      };
    }

    if (artifact.recommendedNextAction === 'call_apify_actor') {
      // If the caller already supplied a portable analysis URL (for example a
      // Firebase/GCS signed URL), trust that explicit input over stale artifact
      // routing hints from an earlier extraction pass.
      if (this.isPortableAnalysisUrl(url)) {
        const resolvedPortableInput = await this.mediaTransportResolver.resolveProcessingUrl({
          sourceUrl: url,
          fallbackToFirebaseStaging: true,
          stageMediaKind: 'video',
          executionContext: context,
        });
        return { url: resolvedPortableInput.url };
      }

      if (!artifact.sourceUrl) {
        throw new Error(
          'This media requires Apify downloader acquisition before analysis, but no source URL is available.'
        );
      }

      if (artifact.sourceType === 'cloudflare') {
        const resolvedForArtifact = await this.mediaTransportResolver.resolveProcessingUrl({
          sourceUrl: artifact.sourceUrl,
          fallbackToFirebaseStaging: true,
          stageMediaKind: 'video',
          executionContext: context,
        });

        if (resolvedForArtifact.source !== 'unchanged') {
          logger.info('[AnalyzeVideoTool] Used transport resolver for artifact input', {
            source: resolvedForArtifact.source,
            cloudflareVideoId: resolvedForArtifact.cloudflareVideoId,
          });
          return { url: resolvedForArtifact.url };
        }
      }

      const apifyMp4Url = await this.acquireMp4WithApify(artifact, context);

      logger.info('[AnalyzeVideoTool] Acquired Apify MP4 before analysis', {
        sourceUrl: artifact.sourceUrl,
        apifyMp4Url,
      });

      return { url: apifyMp4Url };
    }

    if (artifact.recommendedNextAction === 'stage_media') {
      throw new Error(
        'This media is not directly analysis-ready. Use stage_media first, then pass the returned portable URL into analyze_video.'
      );
    }

    if (!artifact.analysisReady) {
      const nextStep = artifact.recommendedNextAction.replace(/_/g, ' ');
      throw new Error(
        `This media needs an additional preparation step before it can be analyzed. Try the '${nextStep}' workflow step or use a different video source.`
      );
    }

    return { url };
  }

  private async completeVideoAnalysis(
    videoUrls: readonly string[],
    prompt: string,
    context?: ToolExecutionContext
  ): Promise<Awaited<ReturnType<OpenRouterService['complete']>>> {
    const contentParts: LLMContentPart[] = [];
    for (const videoUrl of videoUrls) {
      contentParts.push({ type: 'video_url', video_url: { url: videoUrl } });
    }
    contentParts.push({ type: 'text', text: prompt });

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

    // Scale token budget by number of videos: single clip rarely needs more
    // than 4096 tokens; each additional video adds headroom for the extra content.
    // Cap stays at 8192 for large batches to preserve full analysis quality.
    const maxTokens = Math.min(4096 + (videoUrls.length - 1) * 2048, 8192);

    return this.llm.complete(messages, {
      tier: 'video_analysis',
      maxTokens,
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
  }

  private async completeVideoAnalysisWithMovFallback(
    videoUrls: readonly string[],
    prompt: string,
    context?: ToolExecutionContext
  ): Promise<{
    readonly result: Awaited<ReturnType<OpenRouterService['complete']>>;
    readonly analyzedVideoUrls: readonly string[];
  }> {
    // ── Proactive MOV conversion ───────────────────────────────────────────
    // Firebase/GCS signed URLs with a .mov extension are known to fail Gemini
    // ingest (OpenRouter returns empty choices or a fetch failure). Rather than
    // paying for an inevitable first round-trip that will always fail, detect
    // this case upfront and convert to MP4 before the first model call.
    const movUrlsPresent = videoUrls.some((url) => this.needsProactiveConversion(url));

    if (movUrlsPresent && !this.ffmpegBridge) {
      // FFmpeg bridge is not available — fail fast with a clear message rather
      // than sending the .mov to Gemini and waiting for a predictable failure.
      throw new Error(
        'MOV video files from Firebase Storage cannot be analyzed directly: ' +
          'the FFmpeg conversion service is not configured. ' +
          'Please re-upload as MP4 or contact support.'
      );
    }

    if (this.ffmpegBridge && movUrlsPresent) {
      logger.info('[AnalyzeVideoTool] Proactively converting MOV → MP4 before Gemini call', {
        videoCount: videoUrls.length,
        movUrls: videoUrls.filter((u) => this.needsProactiveConversion(u)).length,
      });

      context?.emitStage?.('processing_media', {
        icon: 'processing',
        phase: 'ffmpeg_convert_for_analysis',
        videoCount: videoUrls.length,
      });

      const proactivelyConverted = await this.convertUrlsToMp4(videoUrls, 'proactive', context);
      const result = await this.completeVideoAnalysis(proactivelyConverted, prompt, context);
      return { result, analyzedVideoUrls: proactivelyConverted };
    }

    // ── Normal path (non-MOV formats) ─────────────────────────────────────
    try {
      const result = await this.completeVideoAnalysis(videoUrls, prompt, context);
      return {
        result,
        analyzedVideoUrls: [...videoUrls],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!this.shouldRetryWithMp4Fallback(videoUrls, errorMessage)) {
        throw error;
      }

      logger.warn('[AnalyzeVideoTool] Retrying with FFmpeg MP4 conversion fallback', {
        reason: errorMessage,
        videoCount: videoUrls.length,
      });

      context?.emitStage?.('processing_media', {
        icon: 'processing',
        phase: 'ffmpeg_convert_for_analysis',
        videoCount: videoUrls.length,
      });

      const convertedUrls = await this.convertUrlsToMp4(videoUrls, errorMessage, context);
      const result = await this.completeVideoAnalysis(convertedUrls, prompt, context);
      return {
        result,
        analyzedVideoUrls: convertedUrls,
      };
    }
  }

  /**
   * Returns `true` for URLs that are known to fail Gemini ingest and should be
   * proactively converted to MP4 before the first model call.
   *
   * Currently targets: `.mov` files served from Firebase Storage or GCS signed
   * URLs — both patterns are observed to produce empty choices or fetch-failure
   * errors from OpenRouter/Gemini even for otherwise valid video content.
   */
  private needsProactiveConversion(url: string): boolean {
    if (!MOV_EXTENSION_PATTERN.test(url)) return false;
    return FIREBASE_GCS_HOST_PATTERN.test(url) || GCS_SIGNED_URL_PATTERN.test(url);
  }

  /**
   * Converts a list of video URLs to MP4 using FFmpeg, skipping URLs that
   * don't need normalization.
   *
   * @param videoUrls - The input URLs to process.
   * @param conversionReason - A string passed to `shouldNormalizeViaFfmpeg`
   *   for the reactive-fallback path. Use `'proactive'` to force conversion of
   *   all URLs that match `needsProactiveConversion`.
   */
  private async convertUrlsToMp4(
    videoUrls: readonly string[],
    conversionReason: string,
    context?: ToolExecutionContext
  ): Promise<readonly string[]> {
    return Promise.all(
      videoUrls.map(async (url, index) => {
        const shouldConvert =
          conversionReason === 'proactive'
            ? this.needsProactiveConversion(url)
            : this.shouldNormalizeViaFfmpeg(url, conversionReason);

        if (!shouldConvert) return url;

        const conversion = await this.ffmpegBridge!.convertVideo(
          {
            inputPath: url,
            outputPath: `analysis-${Date.now()}-${index}.mp4`,
            videoCodec: 'libx264',
            audioCodec: 'aac',
            preset: 'ultrafast',
            crf: 28,
          },
          context
        );

        const convertedUrl = conversion.outputUrl ?? conversion.output_path;
        if (!convertedUrl) {
          throw new Error('FFmpeg conversion completed without an output URL.');
        }

        logger.info('[AnalyzeVideoTool] MOV converted to MP4 for Gemini compatibility', {
          originalUrl: url,
          convertedUrl,
          conversionReason,
        });

        return convertedUrl;
      })
    );
  }

  private shouldRetryWithMp4Fallback(videoUrls: readonly string[], errorMessage: string): boolean {
    if (!this.ffmpegBridge) return false;

    const hasNormalizableVideo = videoUrls.some((url) =>
      this.shouldNormalizeViaFfmpeg(url, errorMessage)
    );
    if (!hasNormalizableVideo) return false;

    // OpenRouter can fail on ingest with empty responses or provider-side
    // fetch failures. Both are recoverable via FFmpeg normalization fallback.
    return this.isRecoverableIngestFailure(errorMessage);
  }

  private shouldNormalizeViaFfmpeg(url: string, errorMessage: string): boolean {
    if (YOUTUBE_PATTERN.test(url)) return false;

    if (MOV_EXTENSION_PATTERN.test(url)) {
      return true;
    }

    const isRecoverableIngestFailure = this.isRecoverableIngestFailure(errorMessage);
    if (!isRecoverableIngestFailure) {
      return false;
    }

    // When Gemini returns empty choices for signed GCS/Firebase URLs, force
    // normalization even when the URL path has no explicit .mp4 extension.
    if (FIREBASE_GCS_HOST_PATTERN.test(url) || GCS_SIGNED_URL_PATTERN.test(url)) {
      return true;
    }

    // Generic recovery path for explicit direct-video URLs.
    return DIRECT_VIDEO_EXTENSIONS.test(url);
  }

  private isRecoverableIngestFailure(errorMessage: string): boolean {
    return (
      /no choices|empty response/i.test(errorMessage) ||
      OPENROUTER_FETCH_FAILURE_PATTERN.test(errorMessage)
    );
  }

  private isPortableAnalysisUrl(url: string): boolean {
    if (YOUTUBE_PATTERN.test(url)) return true;
    if (FIREBASE_GCS_HOST_PATTERN.test(url)) return true;
    if (/^https?:\/\/[^/]*firebasestorage\.app\//i.test(url)) return true;
    return false;
  }

  private async acquireMp4WithApify(
    artifact: MediaWorkflowArtifact,
    context?: ToolExecutionContext
  ): Promise<string> {
    if (!this.apifyBridge) {
      throw new Error('Apify downloader workflow is not configured for analyze_video.');
    }

    const sourceUrl = artifact.directMp4Urls[0] ?? artifact.sourceUrl;
    if (!sourceUrl) {
      throw new Error('Apify downloader workflow requires a source URL.');
    }

    context?.emitStage?.('submitting_job', {
      icon: 'processing',
      phase: 'run_apify_video_downloader',
      url: sourceUrl,
    });

    const actorCandidates = await this.resolveApifyCandidates(artifact);
    for (const candidate of actorCandidates) {
      const actorInput = this.buildApifyActorInput(candidate.details, artifact, sourceUrl);
      if (!actorInput) {
        continue;
      }

      try {
        const output = await this.apifyBridge.callActor(
          candidate.actorId,
          actorInput,
          context?.signal
        );
        const downloadableMp4 = this.extractDownloadableMp4Url(output);
        if (!downloadableMp4) {
          logger.warn('[AnalyzeVideoTool] Apify actor did not return an MP4 URL', {
            actorId: candidate.actorId,
            sourceUrl,
          });
          continue;
        }

        logger.info('[AnalyzeVideoTool] Acquired MP4 via Apify actor', {
          actorId: candidate.actorId,
          sourceUrl,
          downloadableMp4,
        });

        return downloadableMp4;
      } catch (error) {
        logger.warn('[AnalyzeVideoTool] Apify actor candidate failed', {
          actorId: candidate.actorId,
          sourceUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(`No Apify downloader actor produced a downloadable MP4 URL for ${sourceUrl}.`);
  }

  private async resolveApifyCandidates(
    artifact: MediaWorkflowArtifact
  ): Promise<Array<{ readonly actorId: string; readonly details: unknown }>> {
    if (!this.apifyBridge) {
      return [];
    }

    const actorIdFromEnv = process.env['APIFY_VIDEO_DOWNLOADER_ACTOR_ID']?.trim();
    if (actorIdFromEnv) {
      const details = await this.apifyBridge.getActorDetails(actorIdFromEnv);
      return [{ actorId: actorIdFromEnv, details }];
    }

    const hostname = this.safeHostname(artifact.sourceUrl);
    const query = [
      hostname,
      artifact.sourceType.includes('manifest') ? 'm3u8 mp4 video downloader headers cookies' : null,
      artifact.sourceType === 'protected_direct'
        ? 'authenticated video downloader mp4 cookies headers'
        : 'video downloader mp4',
    ]
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .join(' ');

    const searchResults = await this.apifyBridge.searchActors(query, APIFY_DISCOVERY_LIMIT);
    const candidates = this.normalizeActorSearchResults(searchResults)
      .map((candidate) => ({
        ...candidate,
        score: this.scoreActorCandidate(candidate, hostname, artifact.sourceType),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, APIFY_MAX_CANDIDATES);

    const resolved = await Promise.all(
      candidates.map(async (candidate) => ({
        actorId: candidate.actorId,
        details: await this.apifyBridge!.getActorDetails(candidate.actorId),
      }))
    );

    return resolved;
  }

  private buildApifyActorInput(
    details: unknown,
    artifact: MediaWorkflowArtifact,
    sourceUrl: string
  ): Record<string, unknown> | null {
    const schema = this.extractInputSchema(details);
    const rawProperties = schema?.['properties'];
    const properties =
      rawProperties && typeof rawProperties === 'object'
        ? (rawProperties as Record<string, unknown>)
        : {};
    const propertyEntries = Object.entries(properties);
    if (propertyEntries.length === 0) {
      return {
        url: sourceUrl,
        headers: artifact.stagingHeaders,
        cookies: artifact.stagingHeaders?.['Cookie'],
        timeoutSecs: APIFY_DEFAULT_TIMEOUT_SECS,
        memoryMbytes: APIFY_DEFAULT_MEMORY_MB,
      };
    }

    const input: Record<string, unknown> = {
      timeoutSecs: APIFY_DEFAULT_TIMEOUT_SECS,
      memoryMbytes: APIFY_DEFAULT_MEMORY_MB,
    };
    const cookieHeader = artifact.stagingHeaders?.['Cookie'];

    for (const [propertyName, propertySchema] of propertyEntries) {
      const lower = propertyName.toLowerCase();
      const definition =
        propertySchema && typeof propertySchema === 'object'
          ? (propertySchema as Record<string, unknown>)
          : {};

      if (this.isUrlProperty(lower)) {
        input[propertyName] = this.buildSchemaCompatibleUrlValue(definition, sourceUrl);
        continue;
      }

      if (lower === 'headers' || lower === 'requestheaders' || lower === 'customheaders') {
        if (artifact.stagingHeaders) input[propertyName] = artifact.stagingHeaders;
        continue;
      }

      if (lower === 'cookie' || lower === 'cookieheader') {
        if (cookieHeader) input[propertyName] = cookieHeader;
        continue;
      }

      if (lower === 'cookies' && cookieHeader) {
        input[propertyName] = this.parseCookieHeader(cookieHeader);
        continue;
      }

      if (lower === 'referer' && artifact.stagingHeaders?.['Referer']) {
        input[propertyName] = artifact.stagingHeaders['Referer'];
        continue;
      }

      if (lower === 'origin' && artifact.stagingHeaders?.['Origin']) {
        input[propertyName] = artifact.stagingHeaders['Origin'];
        continue;
      }

      if (
        (lower === 'useragent' || lower === 'user-agent') &&
        artifact.stagingHeaders?.['User-Agent']
      ) {
        input[propertyName] = artifact.stagingHeaders['User-Agent'];
        continue;
      }

      if (lower.includes('format')) {
        input[propertyName] = 'mp4';
        continue;
      }

      if (lower.includes('download') || lower.includes('savevideo')) {
        input[propertyName] = true;
        continue;
      }

      if (lower === 'maxitems' || lower === 'limit' || lower === 'maxresults') {
        input[propertyName] = 1;
      }
    }

    return Object.keys(input).some((key) => this.isUrlProperty(key.toLowerCase())) ? input : null;
  }

  private extractDownloadableMp4Url(output: unknown): string | null {
    const matches = new Set<string>();

    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        const mp4Matches = value.match(/https?:\/\/[^\s"']+\.mp4(?:\?[^\s"']*)?/gi);
        if (mp4Matches) {
          for (const match of mp4Matches) matches.add(match);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }

      if (value && typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          walk(nested);
        }
      }
    };

    walk(output);
    return [...matches][0] ?? null;
  }

  private normalizeActorSearchResults(
    searchResults: unknown
  ): Array<{ readonly actorId: string; readonly title: string; readonly description: string }> {
    const items = Array.isArray(searchResults)
      ? searchResults
      : searchResults && typeof searchResults === 'object'
        ? [
            ...(((searchResults as Record<string, unknown>)['actors'] as unknown[] | undefined) ??
              []),
            ...(((searchResults as Record<string, unknown>)['items'] as unknown[] | undefined) ??
              []),
            ...(((searchResults as Record<string, unknown>)['results'] as unknown[] | undefined) ??
              []),
          ]
        : [];

    return items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const actorId = this.firstString(record, ['actorId', 'id', 'name']);
        if (!actorId) return null;
        return {
          actorId,
          title: this.firstString(record, ['title', 'name']) ?? actorId,
          description: this.firstString(record, ['description', 'summary']) ?? '',
        };
      })
      .filter(
        (
          item
        ): item is {
          readonly actorId: string;
          readonly title: string;
          readonly description: string;
        } => item !== null
      );
  }

  private scoreActorCandidate(
    candidate: { readonly actorId: string; readonly title: string; readonly description: string },
    hostname: string | null,
    sourceType: MediaWorkflowArtifact['sourceType']
  ): number {
    const haystack =
      `${candidate.actorId} ${candidate.title} ${candidate.description}`.toLowerCase();
    let score = 0;
    if (haystack.includes('video')) score += 3;
    if (haystack.includes('download')) score += 3;
    if (haystack.includes('mp4')) score += 2;
    if (haystack.includes('m3u8') || haystack.includes('hls'))
      score += sourceType === 'hls_manifest' ? 3 : 1;
    if (haystack.includes('mpd') || haystack.includes('dash'))
      score += sourceType === 'dash_manifest' ? 3 : 1;
    if (haystack.includes('cookie') || haystack.includes('header') || haystack.includes('auth'))
      score += 2;
    if (hostname && haystack.includes(hostname.toLowerCase())) score += 2;
    return score;
  }

  private extractInputSchema(details: unknown): Record<string, unknown> | null {
    if (!details || typeof details !== 'object') return null;
    const record = details as Record<string, unknown>;
    const schema = record['inputSchema'];
    return schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : null;
  }

  private buildSchemaCompatibleUrlValue(
    definition: Record<string, unknown>,
    sourceUrl: string
  ): unknown {
    if (definition['type'] === 'array') {
      const items = definition['items'];
      if (
        items &&
        typeof items === 'object' &&
        (items as Record<string, unknown>)['type'] === 'object'
      ) {
        return [{ url: sourceUrl }];
      }
      return [sourceUrl];
    }

    return sourceUrl;
  }

  private isUrlProperty(propertyName: string): boolean {
    return [
      'url',
      'urls',
      'videourl',
      'videourls',
      'sourceurl',
      'sourceurls',
      'mediaurl',
      'mediaurls',
      'downloadurl',
      'downloadurls',
      'starturls',
      'requesturl',
    ].includes(propertyName);
  }

  private parseCookieHeader(
    cookieHeader: string
  ): Array<{ readonly name: string; readonly value: string }> {
    return cookieHeader
      .split(';')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && segment.includes('='))
      .map((segment) => {
        const separator = segment.indexOf('=');
        return {
          name: segment.slice(0, separator).trim(),
          value: segment.slice(separator + 1).trim(),
        };
      });
  }

  private safeHostname(url: string | null): string | null {
    if (!url) return null;

    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private firstString(record: Record<string, unknown>, fields: readonly string[]): string | null {
    for (const field of fields) {
      const value = record[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Resolves the input URL to one or more direct video URLs.
   * - If the URL is already a direct video or YouTube link, returns it directly.
   * - Otherwise, scrapes the page and extracts embedded video URLs.
   */
  private async resolveVideoUrls(url: string): Promise<string[]> {
    // Direct video file
    if (DIRECT_VIDEO_EXTENSIONS.test(url) || HUDL_CDN_PATTERN.test(url)) {
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
        if (DIRECT_VIDEO_EXTENSIONS.test(src) || HUDL_CDN_PATTERN.test(src)) {
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
    if (DIRECT_VIDEO_EXTENSIONS.test(url)) return 'direct-video';
    if (HLS_MANIFEST_PATTERN.test(url)) return 'hls-manifest';
    if (DASH_MANIFEST_PATTERN.test(url)) return 'dash-manifest';
    return 'other';
  }
}
