/**
 * @fileoverview Twitter/X Scraper Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Gives Agent X the ability to scrape tweets, profile timelines, and followers
 * from Twitter/X using the hosted Apify Scweet actor. No official Twitter API
 * key required — Apify handles session management and anti-bot evasion.
 *
 * Use cases:
 * - Fetching a coach's latest tweets for recruiting intelligence
 * - Monitoring hashtags (#NXT1, #D1Commits) for trending content
 * - Pulling an athlete's tweet history for brand analysis
 * - Getting follower lists for engagement/influence scoring
 * - Tracking college program announcements and NIL deals
 *
 * Architecture:
 * - Thin tool shell that delegates to ApifyService.
 * - Runs synchronously within the Agent X tool loop (Apify handles async
 *   execution internally; `actor.call()` blocks until the run finishes).
 * - Results are trimmed and formatted for the LLM context window.
 *
 * Configuration:
 * Set the `APIFY_API_TOKEN` environment variable.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { ApifyService, type ScweetTweet, type ScweetUser } from '../apify/apify.service.js';
import { ApifyMcpBridgeService } from '../apify/apify-mcp-bridge.service.js';
import { z } from 'zod';
import {
  ScraperMediaService,
  type MediaInput,
  type PersistedMedia,
  type MediaThreadContext,
} from './scraper-media.service.js';
import { checkTwitterSingleTweetIntent } from '../../media/media-acquisition.middleware.js';
import { extractMediaPayloads } from '../../../stream-media-payloads.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum tweets to return in the LLM context to avoid overflow. */
const MAX_TWEETS_IN_RESPONSE = 50;

/** Maximum followers to return in the LLM context. */
const MAX_FOLLOWERS_IN_RESPONSE = 100;

/** Max characters for a search query (matches WebSearchTool). */
const MAX_QUERY_LENGTH = 500;

const APIFY_FALLBACK_DISCOVERY_LIMIT = 8;
const APIFY_FALLBACK_MAX_CANDIDATES = 3;
const PRIMARY_TWITTER_ACTORS = new Set(['apidojo/twitter-scraper-lite', 'altimis/scweet']);

type ApifyBridge = Pick<ApifyMcpBridgeService, 'searchActors' | 'getActorDetails' | 'callActor'>;

export class ScrapeTwitterTool extends BaseTool {
  readonly name = 'scrape_twitter';
  readonly description =
    'Scrape tweets, profile timelines, followers, or a single tweet from Twitter/X. ' +
    'No API key needed — uses Apify-hosted actors. ' +
    'Supports four modes: ' +
    '1) "single_tweet" — fetch ONE specific tweet by URL (e.g. https://x.com/user/status/ID). ' +
    '   Returns tweet text, imageUrls[], videoUrl, and a mediaArtifact ready for analyze_video. ' +
    '   Use this whenever you have a specific tweet permalink. ' +
    '2) "search" — find tweets by keyword, hashtag, or phrase. ' +
    '3) "profile_tweets" — get recent tweets from specific user(s). ' +
    '4) "followers" — get follower list of specific user(s). ' +
    'Returns structured JSON: tweet text, engagement metrics (likes, retweets, replies), timestamps, and URLs. ' +
    'Use this for recruiting intel, coach monitoring, trending topic analysis, and brand auditing.';

  readonly parameters = z.object({
    mode: z.enum(['search', 'profile_tweets', 'followers', 'single_tweet']),
    /** Required for mode=single_tweet: the full tweet permalink URL. */
    tweetUrl: z.string().url().optional(),
    query: z.string().trim().min(1).optional(),
    usernames: z.array(z.string().trim().min(1)).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    since: z.string().trim().min(1).optional(),
    until: z.string().trim().min(1).optional(),
    language: z.string().trim().min(1).optional(),
  });

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly apify: ApifyService;
  private readonly media: ScraperMediaService;
  private apifyBridge: ApifyBridge | null | undefined;

  constructor(apify?: ApifyService, media?: ScraperMediaService, apifyBridge?: ApifyBridge | null) {
    super();
    this.apify = apify ?? new ApifyService();
    this.media = media ?? new ScraperMediaService();
    this.apifyBridge = apifyBridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const mode = this.str(input, 'mode');
    if (!mode || !['search', 'profile_tweets', 'followers', 'single_tweet'].includes(mode)) {
      return {
        success: false,
        error:
          'Parameter "mode" is required and must be one of: "single_tweet", "search", "profile_tweets", "followers".',
      };
    }

    // Build staging context for thread-scoped media storage
    const staging: MediaThreadContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    const emitStage = context?.emitStage;

    try {
      switch (mode) {
        case 'single_tweet': {
          const tweetUrl = this.str(input, 'tweetUrl');
          if (!tweetUrl) {
            return {
              success: false,
              error:
                'Parameter "tweetUrl" is required for mode=single_tweet. Provide the full tweet permalink URL (e.g. https://x.com/user/status/123456789).',
            };
          }

          // Hard preflight gate: mode=single_tweet requires a true /status/{id} permalink.
          // This prevents profile/search URLs from bypassing classifier routing.
          const singleTweetGate = checkTwitterSingleTweetIntent(tweetUrl);
          if (singleTweetGate) {
            return singleTweetGate;
          }

          emitStage?.('fetching_data', {
            icon: 'media',
            mode: 'single_tweet',
            tweetUrl,
            platform: 'twitter',
          });
          return await this.handleSingleTweet(tweetUrl, staging);
        }
        case 'search': {
          const query = this.str(input, 'query') ?? '';
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'search',
            query: query.slice(0, 60),
            platform: 'twitter',
          });
          const searchResult = await this.handleSearch(input, staging);
          if (searchResult.success) {
            emitStage?.('processing_media', {
              icon: 'media',
              mode: 'search',
              platform: 'twitter',
            });
          }
          return searchResult;
        }
        case 'profile_tweets': {
          const usernames = this.extractUsernames(input);
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'profile_tweets',
            usernames,
            usernameCount: usernames.length,
            platform: 'twitter',
          });
          const tweetsResult = await this.handleProfileTweets(input, staging);
          if (tweetsResult.success) {
            emitStage?.('processing_media', {
              icon: 'media',
              mode: 'profile_tweets',
              usernames,
              platform: 'twitter',
            });
          }
          return tweetsResult;
        }
        case 'followers': {
          const usernames = this.extractUsernames(input);
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'followers',
            usernames,
            usernameCount: usernames.length,
            platform: 'twitter',
          });
          return await this.handleFollowers(input);
        }
        default:
          return { success: false, error: `Unknown mode: ${mode}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twitter scraping failed';
      logger.error('[ScrapeTwitterTool] Execution failed', { error: message, mode });
      return { success: false, error: message };
    }
  }

  // ─── Mode Handlers ─────────────────────────────────────────────────────
  /**
   * Fetch a single tweet by permalink URL.
   * Uses apidojo/twitter-scraper-lite (NOT tweet-scraper V2 which requires 50-tweet minimum).
   */
  private async handleSingleTweet(
    tweetUrl: string,
    staging?: MediaThreadContext
  ): Promise<ToolResult> {
    logger.info('[ScrapeTwitterTool] Fetching single tweet', { tweetUrl });

    const result = await this.apify.getSingleTweet(tweetUrl);
    let tweet: ScweetTweet | null | undefined = result.items[0];
    let imageUrls: readonly string[] = tweet?.imageUrls ?? [];
    let videoUrl: string | undefined = tweet?.videoUrl || undefined;

    const fallback =
      !result.success || !tweet || !videoUrl
        ? await this.tryFallbackSingleTweet(tweetUrl, { hasPrimaryTweet: !!tweet })
        : null;

    if (!result.success && !fallback) {
      return {
        success: false,
        error: result.error ?? `Failed to fetch tweet from ${tweetUrl}`,
      };
    }

    if (!tweet && !fallback) {
      return {
        success: false,
        error: `No tweet data returned for URL: ${tweetUrl}. The tweet may be private or deleted.`,
      };
    }

    if (!tweet && fallback) {
      tweet = this.buildFallbackTweet(tweetUrl, fallback);
    }

    if (!tweet) {
      return {
        success: false,
        error: `No tweet data returned for URL: ${tweetUrl}. The tweet may be private or deleted.`,
      };
    }

    imageUrls = imageUrls.length > 0 ? imageUrls : (fallback?.imageUrls ?? []);
    videoUrl = videoUrl ?? fallback?.videoUrl;
    if (
      fallback &&
      (!tweet.videoUrl || tweet.videoUrl !== videoUrl || imageUrls !== tweet.imageUrls)
    ) {
      tweet = {
        ...tweet,
        videoUrl: videoUrl ?? '',
        imageUrls,
      };
    }

    // Persist any media assets found in the tweet to staging
    let artifact: import('../../media/media-workflow.js').MediaWorkflowArtifact | undefined;
    const mediaItems: MediaInput[] = [
      ...(videoUrl
        ? [
            {
              url: videoUrl,
              type: 'video' as const,
              platform: 'twitter' as const,
              sourceUrl: tweetUrl,
            },
          ]
        : []),
      ...imageUrls.map((imageUrl) => ({
        url: imageUrl,
        type: 'image' as const,
        platform: 'twitter' as const,
        sourceUrl: tweetUrl,
      })),
    ];
    const attachments = await this.persistMediaInputs(mediaItems, staging);
    if (attachments.length > 0) {
      imageUrls = this.mapImageUrls(imageUrls, attachments);
      if (videoUrl) {
        videoUrl = this.stagedUrlFor(attachments, videoUrl) ?? videoUrl;
      }
      tweet = {
        ...tweet,
        videoUrl: videoUrl ?? '',
        imageUrls,
      };
    }

    if (videoUrl) {
      const videoAttachment = attachments.find((a) => a.type === 'video' && a.url === videoUrl);

      const { buildVideoWorkflowArtifact } = await import('../../media/media-workflow.js');
      artifact = buildVideoWorkflowArtifact({
        sourceUrl: tweetUrl,
        playableUrls: [videoUrl],
        directMp4Urls: videoAttachment || /\.mp4(?:$|[?#])/i.test(videoUrl) ? [videoUrl] : [],
        sourceTypeHint: videoAttachment ? 'staged' : undefined,
      });
    }

    logger.info('[ScrapeTwitterTool] Single tweet fetched', {
      tweetUrl,
      hasVideo: !!videoUrl,
      imageCount: imageUrls.length,
      runId: result.runId,
      fallbackActorId: fallback?.actorId,
    });

    return {
      success: true,
      data: {
        tweet,
        videoUrl,
        imageUrls,
        attachments: this.formatAttachments(attachments),
        ...(fallback?.actorId ? { fallbackActorId: fallback.actorId } : {}),
        ...(artifact ? { artifact } : {}),
        runId: result.runId,
        durationMs: result.durationMs,
        nextStep: videoUrl
          ? `Call analyze_video({ url: "${videoUrl}", platform: "twitter" }) to process this video.`
          : imageUrls.length > 0
            ? `Use write_athlete_images to persist ${imageUrls.length} image(s) to the athlete profile.`
            : 'No media found in tweet.',
      },
    };
  }
  private async handleSearch(
    input: Record<string, unknown>,
    staging?: MediaThreadContext
  ): Promise<ToolResult> {
    const query = this.str(input, 'query');
    if (!query) {
      return this.paramError('query');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return {
        success: false,
        error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`,
      };
    }

    const result = await this.apify.searchTweets(query, {
      since: this.str(input, 'since') ?? undefined,
      until: this.str(input, 'until') ?? undefined,
      limit: this.num(input, 'limit') ?? undefined,
      language: this.str(input, 'language') ?? undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Search failed' };
    }

    // Persist media to Firebase Storage for in-app display (search mode does
    // NOT include profile images — search results may span many accounts and
    // the avatars are not the user-requested asset).
    const attachments = await this.persistTweetMedia(result.items, staging, {
      includeProfileImage: false,
    });
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');

    return {
      success: true,
      data: {
        mode: 'search',
        query,
        tweetCount: result.itemCount,
        durationMs: result.durationMs,
        tweets: this.formatTweets(result.items, attachments),
        attachments: this.formatAttachments(attachments),
        ...(firstImage ? { imageUrl: firstImage.url } : {}),
        ...(firstVideo ? { videoUrl: firstVideo.url } : {}),
      },
    };
  }

  private async handleProfileTweets(
    input: Record<string, unknown>,
    staging?: MediaThreadContext
  ): Promise<ToolResult> {
    const usernames = this.extractUsernames(input);
    if (usernames.length === 0) {
      return this.paramError('usernames');
    }

    const result = await this.apify.getProfileTweets(usernames, {
      limit: this.num(input, 'limit') ?? undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Profile tweets fetch failed' };
    }

    // Persist media to Firebase Storage for in-app display. Profile-tweet
    // mode prioritises the user's own avatar so downstream renders (chat
    // thumbnails, intro cards, brand reels) always have a real photo of the
    // requested athlete/account instead of a generic placeholder.
    const attachments = await this.persistTweetMedia(result.items, staging, {
      includeProfileImage: true,
    });
    const profileImageUrls = this.collectProfileImageUrls(result.items, attachments);
    const firstProfileImage = attachments.find(
      (a) => a.type === 'image' && profileImageUrls.includes(a.originalUrl)
    );
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');
    const profileImageUrl = firstProfileImage?.url ?? profileImageUrls[0];
    const primaryImageUrl = profileImageUrl ?? firstImage?.url;

    return {
      success: true,
      data: {
        mode: 'profile_tweets',
        usernames,
        tweetCount: result.itemCount,
        durationMs: result.durationMs,
        tweets: this.formatTweets(result.items, attachments),
        attachments: this.formatAttachments(attachments),
        ...(profileImageUrls.length > 0 ? { profileImageUrls } : {}),
        ...(profileImageUrl ? { profileImageUrl } : {}),
        ...(primaryImageUrl ? { imageUrl: primaryImageUrl } : {}),
        ...(firstVideo ? { videoUrl: firstVideo.url } : {}),
      },
    };
  }

  private async handleFollowers(input: Record<string, unknown>): Promise<ToolResult> {
    const usernames = this.extractUsernames(input);
    if (usernames.length === 0) {
      return this.paramError('usernames');
    }

    const result = await this.apify.getFollowers(usernames, {
      limit: this.num(input, 'limit') ?? undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Followers fetch failed' };
    }

    return {
      success: true,
      data: {
        mode: 'followers',
        usernames,
        followerCount: result.itemCount,
        durationMs: result.durationMs,
        followers: this.formatFollowers(result.items),
      },
    };
  }

  // ─── Formatting ────────────────────────────────────────────────────────

  /**
   * Format tweets for the LLM context window.
   * Trims to MAX_TWEETS_IN_RESPONSE and keeps only the most useful fields.
   */
  private formatTweets(
    tweets: readonly ScweetTweet[],
    media: readonly PersistedMedia[] = []
  ): unknown[] {
    return tweets.slice(0, MAX_TWEETS_IN_RESPONSE).map((t) => ({
      id: t.id,
      text: t.text,
      username: t.username,
      timestamp: t.timestamp,
      likes: t.likes ?? 0,
      retweets: t.retweets ?? 0,
      replies: t.replies ?? 0,
      url: t.url,
      imageUrls: t.imageUrls.length > 0 ? this.mapImageUrls(t.imageUrls, media) : undefined,
      videoUrl: t.videoUrl ? (this.stagedUrlFor(media, t.videoUrl) ?? t.videoUrl) : undefined,
      profileImageUrl: t.profileImageUrl
        ? (this.stagedUrlFor(media, t.profileImageUrl) ?? t.profileImageUrl)
        : undefined,
      authorName: t.authorName || undefined,
    }));
  }

  private collectProfileImageUrls(
    tweets: readonly ScweetTweet[],
    media: readonly PersistedMedia[] = []
  ): string[] {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const tweet of tweets) {
      const url = typeof tweet.profileImageUrl === 'string' ? tweet.profileImageUrl.trim() : '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(this.stagedUrlFor(media, url) ?? url);
    }
    return urls;
  }

  /**
   * Format followers for the LLM context window.
   */
  private formatFollowers(users: readonly ScweetUser[]): unknown[] {
    return users.slice(0, MAX_FOLLOWERS_IN_RESPONSE).map((u) => ({
      username: u.username,
      name: u.name,
      bio: u.bio ?? null,
      followers_count: u.followers_count ?? null,
      verified: u.verified ?? false,
      profile_image_url: u.profile_image_url ?? null,
    }));
  }

  // ─── Media Persistence ─────────────────────────────────────────────

  /**
   * Collect media URLs from tweets and persist to Firebase Storage.
   * Extracts image URLs and video URLs from the normalized tweet data.
   */
  private async persistTweetMedia(
    tweets: readonly ScweetTweet[],
    staging?: MediaThreadContext,
    options: { includeProfileImage?: boolean } = {}
  ): Promise<PersistedMedia[]> {
    const { includeProfileImage = false } = options;
    const inputs: MediaInput[] = [];

    for (const tweet of tweets.slice(0, MAX_TWEETS_IN_RESPONSE)) {
      if (includeProfileImage && tweet.profileImageUrl) {
        inputs.push({
          url: tweet.profileImageUrl,
          type: 'image',
          platform: 'twitter',
          sourceUrl: tweet.url || `https://x.com/${tweet.username}`,
        });
      }
      // Add video URL if present (prefer over images)
      if (tweet.videoUrl) {
        inputs.push({
          url: tweet.videoUrl,
          type: 'video',
          platform: 'twitter',
          sourceUrl: tweet.url,
        });
      }
      // Add image URLs
      for (const imageUrl of tweet.imageUrls) {
        inputs.push({
          url: imageUrl,
          type: 'image',
          platform: 'twitter',
          sourceUrl: tweet.url,
        });
      }
    }

    if (inputs.length === 0) return [];
    if (!staging) {
      logger.warn('[ScrapeTwitterTool] Skipping media persistence — no userId/threadId in context');
      return [];
    }

    try {
      return await this.media.persistBatch(inputs, staging);
    } catch (err) {
      logger.warn('[ScrapeTwitterTool] Media persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return [];
    }
  }

  private async persistMediaInputs(
    inputs: readonly MediaInput[],
    staging?: MediaThreadContext
  ): Promise<PersistedMedia[]> {
    if (inputs.length === 0) return [];
    if (!staging) {
      logger.warn('[ScrapeTwitterTool] Skipping media persistence — no userId/threadId in context');
      return [];
    }

    try {
      return await this.media.persistBatch(inputs, staging);
    } catch (err) {
      logger.warn('[ScrapeTwitterTool] Media persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return [];
    }
  }

  private stagedUrlFor(media: readonly PersistedMedia[], originalUrl: string): string | undefined {
    return media.find((m) => m.originalUrl === originalUrl)?.url;
  }

  private mapImageUrls(
    imageUrls: readonly string[],
    media: readonly PersistedMedia[]
  ): readonly string[] {
    return imageUrls.map((imageUrl) => this.stagedUrlFor(media, imageUrl) ?? imageUrl);
  }

  /**
   * Format persisted media attachments for inclusion in tool result data.
   */
  private formatAttachments(media: readonly PersistedMedia[]): unknown[] {
    return media.map((m) => ({
      type: m.type,
      url: m.url,
      mimeType: m.mimeType,
      storagePath: m.storagePath,
      platform: m.platform,
      sourceUrl: m.sourceUrl ?? null,
      sizeBytes: m.sizeBytes,
    }));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private getApifyBridge(): ApifyBridge | null {
    if (this.apifyBridge !== undefined) {
      return this.apifyBridge;
    }

    try {
      this.apifyBridge = new ApifyMcpBridgeService();
    } catch (error) {
      logger.warn('[ScrapeTwitterTool] Apify MCP bridge unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.apifyBridge = null;
    }

    return this.apifyBridge;
  }

  private async tryFallbackSingleTweet(
    tweetUrl: string,
    options: { hasPrimaryTweet: boolean }
  ): Promise<{
    readonly actorId: string;
    readonly videoUrl?: string;
    readonly imageUrls: readonly string[];
  } | null> {
    const bridge = this.getApifyBridge();
    if (!bridge) {
      return null;
    }

    const candidates = await this.resolveFallbackActorCandidates(tweetUrl, bridge);
    if (candidates.length === 0) {
      return null;
    }

    for (const candidate of candidates) {
      try {
        const details = await bridge.getActorDetails(candidate.actorId);
        const actorInput = this.buildFallbackActorInput(details, tweetUrl);
        if (!actorInput) {
          continue;
        }

        const output = await bridge.callActor(candidate.actorId, actorInput);
        const media = extractMediaPayloads(this.normalizeApifyFallbackPayload(output));
        const videoUrl = media.find((item) => item.type === 'video')?.url;
        const imageUrls = media.filter((item) => item.type === 'image').map((item) => item.url);

        if (!videoUrl && imageUrls.length === 0) {
          logger.warn('[ScrapeTwitterTool] Fallback actor returned no media', {
            actorId: candidate.actorId,
            tweetUrl,
          });
          continue;
        }

        if (!videoUrl && options.hasPrimaryTweet) {
          logger.info(
            '[ScrapeTwitterTool] Fallback actor only returned images; keeping primary tweet result',
            {
              actorId: candidate.actorId,
              tweetUrl,
              imageCount: imageUrls.length,
            }
          );
        }

        logger.info('[ScrapeTwitterTool] Fallback actor resolved tweet media', {
          actorId: candidate.actorId,
          tweetUrl,
          hasVideo: !!videoUrl,
          imageCount: imageUrls.length,
        });

        return { actorId: candidate.actorId, videoUrl, imageUrls };
      } catch (error) {
        logger.warn('[ScrapeTwitterTool] Fallback actor candidate failed', {
          actorId: candidate.actorId,
          tweetUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return null;
  }

  private async resolveFallbackActorCandidates(
    tweetUrl: string,
    bridge: ApifyBridge
  ): Promise<
    Array<{ readonly actorId: string; readonly title: string; readonly description: string }>
  > {
    const hostname = this.safeHostname(tweetUrl) ?? 'twitter';
    const queries = [
      `${hostname} tweet video downloader`,
      `${hostname} tweet media scraper`,
      'twitter x single tweet video downloader',
    ];

    const candidates = new Map<
      string,
      {
        readonly actorId: string;
        readonly title: string;
        readonly description: string;
        readonly score: number;
      }
    >();

    for (const query of queries) {
      try {
        const searchResults = await bridge.searchActors(query, APIFY_FALLBACK_DISCOVERY_LIMIT);
        for (const candidate of this.normalizeActorSearchResults(searchResults)) {
          if (PRIMARY_TWITTER_ACTORS.has(candidate.actorId)) {
            continue;
          }

          const score = this.scoreFallbackActorCandidate(candidate, hostname);
          if (score <= 0) {
            continue;
          }

          const existing = candidates.get(candidate.actorId);
          if (!existing || existing.score < score) {
            candidates.set(candidate.actorId, { ...candidate, score });
          }
        }
      } catch (error) {
        logger.warn('[ScrapeTwitterTool] Fallback actor search failed', {
          tweetUrl,
          query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return [...candidates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, APIFY_FALLBACK_MAX_CANDIDATES)
      .map(({ score: _score, ...candidate }) => candidate);
  }

  private buildFallbackActorInput(
    details: unknown,
    tweetUrl: string
  ): Record<string, unknown> | null {
    const schema = this.extractInputSchema(details);
    if (!schema) {
      return { url: tweetUrl, maxItems: 1, limit: 1 };
    }

    const rawProperties = schema['properties'];
    const properties =
      rawProperties && typeof rawProperties === 'object'
        ? (rawProperties as Record<string, unknown>)
        : {};
    const propertyEntries = Object.entries(properties);
    if (propertyEntries.length === 0) {
      return { url: tweetUrl, maxItems: 1, limit: 1 };
    }

    const input: Record<string, unknown> = {};
    let assignedUrl = false;

    for (const [propertyName, propertySchema] of propertyEntries) {
      const lower = propertyName.toLowerCase();
      const definition =
        propertySchema && typeof propertySchema === 'object'
          ? (propertySchema as Record<string, unknown>)
          : {};

      if (this.isUrlProperty(lower)) {
        input[propertyName] = this.buildSchemaCompatibleUrlValue(definition, tweetUrl);
        assignedUrl = true;
        continue;
      }

      if (lower === 'maxitems' || lower === 'limit' || lower === 'maxresults') {
        input[propertyName] = 1;
        continue;
      }

      if (lower.includes('download') || lower.includes('savevideo')) {
        input[propertyName] = true;
        continue;
      }

      if (lower.includes('format')) {
        input[propertyName] = 'mp4';
      }
    }

    return assignedUrl ? input : null;
  }

  private normalizeApifyFallbackPayload(output: unknown): Record<string, unknown> {
    if (Array.isArray(output)) {
      return { result: output };
    }

    if (output && typeof output === 'object') {
      const record = output as Record<string, unknown>;
      const items = Array.isArray(record['items']) ? record['items'] : undefined;
      const records = Array.isArray(record['records']) ? record['records'] : undefined;
      return {
        ...record,
        ...(items ? { result: items } : {}),
        ...(records ? { result: records } : {}),
      };
    }

    return { result: output };
  }

  private buildFallbackTweet(
    tweetUrl: string,
    fallback: {
      readonly actorId: string;
      readonly videoUrl?: string;
      readonly imageUrls: readonly string[];
    }
  ): ScweetTweet {
    const { username, id } = this.parseTweetUrl(tweetUrl);
    return {
      id: id ?? tweetUrl,
      text: '',
      username: username ?? 'unknown',
      timestamp: '',
      retweets: 0,
      likes: 0,
      replies: 0,
      url: tweetUrl,
      imageUrls: fallback.imageUrls,
      videoUrl: fallback.videoUrl ?? '',
    };
  }

  private parseTweetUrl(tweetUrl: string): {
    readonly username: string | null;
    readonly id: string | null;
  } {
    try {
      const parts = new URL(tweetUrl).pathname.split('/').filter(Boolean);
      const statusIndex = parts.findIndex((part) => part.toLowerCase() === 'status');
      return {
        username: parts[0] ?? null,
        id: statusIndex >= 0 ? (parts[statusIndex + 1] ?? null) : null,
      };
    } catch {
      return { username: null, id: null };
    }
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

  private scoreFallbackActorCandidate(
    candidate: { readonly actorId: string; readonly title: string; readonly description: string },
    hostname: string
  ): number {
    const haystack =
      `${candidate.actorId} ${candidate.title} ${candidate.description}`.toLowerCase();
    let score = 0;
    if (haystack.includes('twitter') || haystack.includes('tweet') || haystack.includes('x.com')) {
      score += 4;
    }
    if (haystack.includes(hostname.toLowerCase())) {
      score += 2;
    }
    if (haystack.includes('video')) score += 3;
    if (haystack.includes('download')) score += 3;
    if (haystack.includes('mp4')) score += 2;
    if (haystack.includes('media') || haystack.includes('image')) score += 1;
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
      'tweeturl',
      'tweeturls',
      'videourl',
      'videourls',
      'sourceurl',
      'sourceurls',
      'mediaurl',
      'mediaurls',
      'downloadurl',
      'downloadurls',
      'starturls',
      'directurls',
      'requesturl',
    ].includes(propertyName);
  }

  private safeHostname(url: string): string | null {
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

  /**
   * Extract and sanitize usernames from the "usernames" input parameter.
   * Accepts string[] or a single comma-separated string.
   */
  private extractUsernames(input: Record<string, unknown>): string[] {
    const raw = input['usernames'];

    if (Array.isArray(raw)) {
      return raw
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim().replace(/^@/, ''))
        .filter((u) => u.length > 0 && /^[a-zA-Z0-9_]{1,15}$/.test(u));
    }

    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((u) => u.trim().replace(/^@/, ''))
        .filter((u) => u.length > 0 && /^[a-zA-Z0-9_]{1,15}$/.test(u));
    }

    return [];
  }
}
