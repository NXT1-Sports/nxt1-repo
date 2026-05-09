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
import { z } from 'zod';
import {
  ScraperMediaService,
  type MediaInput,
  type PersistedMedia,
  type MediaThreadContext,
} from './scraper-media.service.js';
import { checkTwitterSingleTweetIntent } from '../../media/media-acquisition.middleware.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum tweets to return in the LLM context to avoid overflow. */
const MAX_TWEETS_IN_RESPONSE = 50;

/** Maximum followers to return in the LLM context. */
const MAX_FOLLOWERS_IN_RESPONSE = 100;

/** Max characters for a search query (matches WebSearchTool). */
const MAX_QUERY_LENGTH = 500;

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

  constructor(apify?: ApifyService, media?: ScraperMediaService) {
    super();
    this.apify = apify ?? new ApifyService();
    this.media = media ?? new ScraperMediaService();
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

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? `Failed to fetch tweet from ${tweetUrl}`,
      };
    }

    const tweet = result.items[0];
    if (!tweet) {
      return {
        success: false,
        error: `No tweet data returned for URL: ${tweetUrl}. The tweet may be private or deleted.`,
      };
    }

    const imageUrls: readonly string[] = tweet.imageUrls ?? [];
    const videoUrl: string | undefined = tweet.videoUrl;

    // Persist any media assets found in the tweet to staging
    let artifact: import('../../media/media-workflow.js').MediaWorkflowArtifact | undefined;
    if (videoUrl && staging) {
      const mediaItems: import('../social/scraper-media.service.js').MediaInput[] = [
        { url: videoUrl, type: 'video', platform: 'twitter', sourceUrl: tweetUrl },
      ];
      await this.media.persistBatch(mediaItems, staging);

      const { buildVideoWorkflowArtifact } = await import('../../media/media-workflow.js');
      artifact = buildVideoWorkflowArtifact({
        sourceUrl: tweetUrl,
        playableUrls: [videoUrl],
        directMp4Urls: videoUrl.endsWith('.mp4') ? [videoUrl] : [],
      });
    }

    logger.info('[ScrapeTwitterTool] Single tweet fetched', {
      tweetUrl,
      hasVideo: !!videoUrl,
      imageCount: imageUrls.length,
      runId: result.runId,
    });

    return {
      success: true,
      data: {
        tweet,
        videoUrl,
        imageUrls,
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

    // Persist media to Firebase Storage for in-app display
    const attachments = await this.persistTweetMedia(result.items, staging);
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');

    return {
      success: true,
      data: {
        mode: 'search',
        query,
        tweetCount: result.itemCount,
        durationMs: result.durationMs,
        tweets: this.formatTweets(result.items),
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

    // Persist media to Firebase Storage for in-app display
    const attachments = await this.persistTweetMedia(result.items, staging);
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');

    return {
      success: true,
      data: {
        mode: 'profile_tweets',
        usernames,
        tweetCount: result.itemCount,
        durationMs: result.durationMs,
        tweets: this.formatTweets(result.items),
        attachments: this.formatAttachments(attachments),
        ...(firstImage ? { imageUrl: firstImage.url } : {}),
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
  private formatTweets(tweets: readonly ScweetTweet[]): unknown[] {
    return tweets.slice(0, MAX_TWEETS_IN_RESPONSE).map((t) => ({
      id: t.id,
      text: t.text,
      username: t.username,
      timestamp: t.timestamp,
      likes: t.likes ?? 0,
      retweets: t.retweets ?? 0,
      replies: t.replies ?? 0,
      url: t.url,
      imageUrls: t.imageUrls.length > 0 ? t.imageUrls : undefined,
      videoUrl: t.videoUrl || undefined,
    }));
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
    staging?: MediaThreadContext
  ): Promise<PersistedMedia[]> {
    const inputs: MediaInput[] = [];

    for (const tweet of tweets.slice(0, MAX_TWEETS_IN_RESPONSE)) {
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
