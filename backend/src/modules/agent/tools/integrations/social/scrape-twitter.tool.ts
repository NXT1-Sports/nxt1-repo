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
import {
  ScraperMediaService,
  type MediaInput,
  type PersistedMedia,
  type MediaThreadContext,
} from './scraper-media.service.js';
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
    'Scrape tweets, profile timelines, or followers from Twitter/X. ' +
    'No API key needed — uses the Apify-hosted Scweet actor. ' +
    'Supports three modes: ' +
    '1) "search" — find tweets by keyword, hashtag, or phrase (e.g. "#D1Commits since:2025-01-01"). ' +
    '2) "profile_tweets" — get recent tweets from specific user(s). ' +
    '3) "followers" — get follower list of specific user(s). ' +
    'Returns structured JSON: tweet text, engagement metrics (likes, retweets, replies), timestamps, and URLs. ' +
    'Use this for recruiting intel, coach monitoring, trending topic analysis, and brand auditing.';

  readonly parameters = {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['search', 'profile_tweets', 'followers'],
        description:
          'Scraping mode: "search" for keyword/hashtag search, ' +
          '"profile_tweets" for a user\'s timeline, "followers" for follower lists.',
      },
      query: {
        type: 'string',
        description:
          'For "search" mode: the search query (keywords, hashtags, phrases). ' +
          'Supports Twitter advanced search operators. ' +
          'Example: "#NXT1 since:2025-06-01" or "Ohio State football commits".',
      },
      usernames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For "profile_tweets" or "followers" mode: Twitter username(s) without @. ' +
          'Example: ["OhioStateFB", "CoachDay"].',
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of items to return. ' +
          'Defaults to 50 for tweets, 100 for followers. ' +
          'Higher limits take longer and cost more.',
      },
      since: {
        type: 'string',
        description:
          'For "search" mode: start date in YYYY-MM-DD format. ' + 'Example: "2025-01-01".',
      },
      until: {
        type: 'string',
        description:
          'For "search" mode: end date in YYYY-MM-DD format. ' + 'Example: "2025-12-31".',
      },
      language: {
        type: 'string',
        description:
          'For "search" mode: ISO 639-1 language code to filter by. ' +
          'Example: "en" for English.',
      },
    },
    required: ['mode'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'recruiting_coordinator',
    'brand_media_coordinator',
    'general',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

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
    if (!mode || !['search', 'profile_tweets', 'followers'].includes(mode)) {
      return {
        success: false,
        error:
          'Parameter "mode" is required and must be one of: "search", "profile_tweets", "followers".',
      };
    }

    // Build staging context for thread-scoped media storage
    const staging: MediaThreadContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    const progress = context?.onProgress;

    try {
      switch (mode) {
        case 'search': {
          const query = this.str(input, 'query') ?? '';
          progress?.(`Searching Twitter for "${query.slice(0, 60)}"…`);
          const searchResult = await this.handleSearch(input, staging);
          if (searchResult.success) progress?.('Processing Twitter media…');
          return searchResult;
        }
        case 'profile_tweets': {
          const usernames = this.extractUsernames(input);
          progress?.(
            `Fetching tweets from ${usernames.length ? '@' + usernames.join(', @') : 'user'}…`
          );
          const tweetsResult = await this.handleProfileTweets(input, staging);
          if (tweetsResult.success) progress?.('Processing Twitter media…');
          return tweetsResult;
        }
        case 'followers': {
          const usernames = this.extractUsernames(input);
          progress?.(
            `Loading followers for ${usernames.length ? '@' + usernames.join(', @') : 'user'}…`
          );
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
