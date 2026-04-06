/**
 * @fileoverview Apify Service — Twitter/X Scraping via Hosted Scweet Actor
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Wraps the Apify Client SDK to trigger and consume the `altimis/scweet` actor
 * for scraping tweets and profile timelines from Twitter/X.
 *
 * Architecture:
 * - Uses the official `apify-client` SDK (handles retries, pagination, auth).
 * - Runs the actor **synchronously** via `actor.call()` which waits for the
 *   run to finish and returns the run metadata. We then fetch the dataset.
 * - For short scrapes (max_items ≤ 200) this completes in ~30–90 seconds.
 * - For large scrapes the caller should set a generous timeout or use
 *   `startRun()` + `waitForRun()` + `getDatasetItems()` for async polling.
 *
 * Security:
 * - The APIFY_API_TOKEN is server-side only; never exposed to the frontend.
 * - Input is validated and sanitized before being sent to Apify.
 * - Results are returned as plain JSON — no HTML rendering.
 *
 * Configuration:
 * Set the `APIFY_API_TOKEN` environment variable.
 *
 * Scweet Actor API (2026):
 * - source_mode: "search" | "profiles" | "auto"
 * - search_query: raw advanced query string (for search mode)
 * - profile_urls: array of @handle or x.com URLs (for profiles mode)
 * - max_items: global run target (minimum enforced: 100)
 * - since / until: date or UTC timestamp window
 * - search_sort: "Top" | "Latest" (default: "Latest")
 */

import { ApifyClient } from 'apify-client';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Apify actor ID for Scweet (altimis/scweet). */
const SCWEET_ACTOR_ID = 'altimis/scweet';

/** Maximum tweet limit per request to prevent runaway costs. */
const MAX_TWEET_LIMIT = 500;

/** Default tweet limit if none specified (Scweet enforces minimum of 100). */
const DEFAULT_TWEET_LIMIT = 100;

/** Scweet enforces a minimum of 100 items per run. */
const MIN_ITEMS_PER_RUN = 100;

/** Timeout for synchronous actor runs (5 minutes). */
const ACTOR_CALL_TIMEOUT_SECS = 300;

/** Max characters for a search query. */
const MAX_QUERY_LENGTH = 500;

/** Strict YYYY-MM-DD date pattern. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Raw Scweet actor output item (2026 schema). */
export interface ScweetRawItem {
  readonly id: string;
  readonly handle: string;
  readonly text?: string;
  readonly tweet_url?: string;
  readonly favorite_count?: number;
  readonly retweet_count?: number;
  readonly reply_count?: number;
  readonly source_root?: string;
  readonly source_value?: string;
  readonly collected_at_utc?: string;
  readonly user?: {
    readonly name?: string;
    readonly handle?: string;
    readonly description?: string;
    readonly followers_count?: number;
    readonly friends_count?: number;
    readonly verified?: boolean;
    readonly is_blue_verified?: boolean;
    readonly profile_image_url_https?: string;
    readonly statuses_count?: number;
    readonly location?: string;
    readonly created_at?: string;
    readonly [key: string]: unknown;
  };
  readonly tweet?: {
    readonly rest_id?: string;
    readonly created_at?: string;
    readonly text?: string;
    readonly tweet_url?: string;
    readonly favorite_count?: number;
    readonly retweet_count?: number;
    readonly reply_count?: number;
    readonly quote_count?: number;
    readonly view_count?: string;
    readonly bookmark_count?: number;
    readonly hashtags?: readonly string[];
    readonly mentions?: readonly string[];
    readonly lang?: string;
    readonly media?: readonly Record<string, unknown>[];
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

/** Normalized tweet for LLM consumption. */
export interface ScweetTweet {
  readonly id: string;
  readonly text: string;
  readonly username: string;
  readonly timestamp: string;
  readonly retweets: number;
  readonly likes: number;
  readonly replies: number;
  readonly url: string;
  readonly [key: string]: unknown;
}

/** Normalized user info extracted from tweet data. */
export interface ScweetUser {
  readonly username: string;
  readonly name: string;
  readonly bio?: string;
  readonly followers_count?: number;
  readonly following_count?: number;
  readonly verified?: boolean;
  readonly profile_image_url?: string;
  readonly [key: string]: unknown;
}

export interface ApifyRunResult<T = unknown> {
  readonly success: boolean;
  readonly runId: string;
  readonly datasetId: string;
  readonly items: readonly T[];
  readonly itemCount: number;
  readonly durationMs: number;
  readonly error?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ApifyService {
  private readonly client: ApifyClient;

  constructor(token?: string) {
    const resolved = token?.trim() || process.env['APIFY_API_TOKEN']?.trim();
    if (!resolved) {
      throw new Error(
        'APIFY_API_TOKEN is not configured. ' +
          'Set it in your .env file (https://console.apify.com → Settings → API Tokens).'
      );
    }
    this.client = new ApifyClient({ token: resolved });
  }

  /**
   * Search Twitter/X for tweets matching a query.
   */
  async searchTweets(
    query: string,
    options: {
      since?: string;
      until?: string;
      limit?: number;
      language?: string;
    } = {}
  ): Promise<ApifyRunResult<ScweetTweet>> {
    if (!query || query.trim().length === 0) {
      return this.emptyResult('Search query is required');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return this.emptyResult(`Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
    }

    const since = this.validateDate(options.since);
    const until = this.validateDate(options.until);
    const maxItems = this.clampLimit(options.limit ?? DEFAULT_TWEET_LIMIT, MAX_TWEET_LIMIT);

    // Append language filter to the query if specified (Scweet uses Twitter
    // advanced search syntax, e.g. "lang:en")
    let searchQuery = query.trim();
    if (options.language && !/\blang:\w+/.test(searchQuery)) {
      searchQuery += ` lang:${options.language}`;
    }

    logger.info('[ApifyService] Searching tweets', {
      query: searchQuery.slice(0, 100),
      maxItems,
      since,
    });

    const result = await this.runActor({
      source_mode: 'search',
      search_query: searchQuery,
      ...(since && { since }),
      ...(until && { until }),
      max_items: maxItems,
      search_sort: 'Latest',
    });

    if (!result.success) {
      return { ...result, items: [] };
    }

    return {
      ...result,
      items: (result.items as readonly ScweetRawItem[]).map((item) => this.normalizeToTweet(item)),
    };
  }

  /**
   * Fetch tweets from one or more user profile timelines.
   */
  async getProfileTweets(
    usernames: readonly string[],
    options: { limit?: number } = {}
  ): Promise<ApifyRunResult<ScweetTweet>> {
    const sanitized = this.sanitizeUsernames(usernames);
    if (sanitized.length === 0) {
      return this.emptyResult('No valid usernames provided');
    }

    const maxItems = this.clampLimit(options.limit ?? DEFAULT_TWEET_LIMIT, MAX_TWEET_LIMIT);

    logger.info('[ApifyService] Fetching profile tweets', { usernames: sanitized, maxItems });

    // Scweet accepts @handle or full URLs in profile_urls
    const profileUrls = sanitized.map((u) => `@${u}`);

    const result = await this.runActor({
      source_mode: 'profiles',
      profile_urls: profileUrls,
      max_items: maxItems,
    });

    if (!result.success) {
      return { ...result, items: [] };
    }

    return {
      ...result,
      items: (result.items as readonly ScweetRawItem[]).map((item) => this.normalizeToTweet(item)),
    };
  }

  /**
   * Extract user info from profile tweet results.
   *
   * Note: The Scweet actor no longer has a dedicated "followers" mode.
   * This method fetches profile tweets and extracts the user metadata
   * embedded in each tweet's `user` object, deduplicating by handle.
   */
  async getFollowers(
    usernames: readonly string[],
    options: { limit?: number } = {}
  ): Promise<ApifyRunResult<ScweetUser>> {
    // Scweet no longer supports a dedicated followers mode.
    // We fetch profile tweets and extract user objects as a best-effort fallback.
    logger.warn(
      '[ApifyService] getFollowers is deprecated — Scweet no longer supports follower scraping. ' +
        'Returning profile metadata extracted from tweets instead.'
    );

    const result = await this.getProfileTweets(usernames, options);
    if (!result.success) {
      return { ...result, items: [] };
    }

    // Extract unique user info from the raw items
    const seen = new Set<string>();
    const users: ScweetUser[] = [];

    for (const tweet of result.items) {
      const username = tweet.username;
      if (username && !seen.has(username)) {
        seen.add(username);
        users.push({
          username,
          name: ((tweet as unknown as Record<string, unknown>)['name'] as string) ?? username,
          bio: undefined,
          followers_count: undefined,
          following_count: undefined,
          verified: false,
          profile_image_url: undefined,
        });
      }
    }

    return {
      success: true,
      runId: result.runId,
      datasetId: result.datasetId,
      items: users,
      itemCount: users.length,
      durationMs: result.durationMs,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async runActor(input: Record<string, unknown>): Promise<ApifyRunResult<ScweetRawItem>> {
    const startMs = Date.now();

    try {
      const run = await this.client.actor(SCWEET_ACTOR_ID).call(input, {
        timeout: ACTOR_CALL_TIMEOUT_SECS,
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const durationMs = Date.now() - startMs;

      logger.info('[ApifyService] Actor run completed', {
        runId: run.id,
        datasetId: run.defaultDatasetId,
        itemCount: items.length,
        durationMs,
      });

      return {
        success: true,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        items: items as unknown as readonly ScweetRawItem[],
        itemCount: items.length,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apify actor run failed';
      const durationMs = Date.now() - startMs;

      logger.error('[ApifyService] Actor run failed', {
        error: message,
        durationMs,
        sourceMode: input['source_mode'],
      });

      return {
        success: false,
        runId: '',
        datasetId: '',
        items: [],
        itemCount: 0,
        durationMs,
        error: message,
      };
    }
  }

  /**
   * Normalize a raw Scweet item into the ScweetTweet format expected by
   * the ScrapeTwitterTool and LLM context.
   */
  private normalizeToTweet(raw: ScweetRawItem): ScweetTweet {
    const tweet = raw.tweet;
    return {
      id: tweet?.rest_id ?? raw.id ?? '',
      text: tweet?.text ?? raw.text ?? '',
      username: raw.handle ?? raw.user?.handle ?? '',
      timestamp: tweet?.created_at ?? raw.collected_at_utc ?? '',
      retweets: tweet?.retweet_count ?? raw.retweet_count ?? 0,
      likes: tweet?.favorite_count ?? raw.favorite_count ?? 0,
      replies: tweet?.reply_count ?? raw.reply_count ?? 0,
      url: tweet?.tweet_url ?? raw.tweet_url ?? '',
    };
  }

  /**
   * Sanitize an array of usernames: strip @, trim, remove blanks.
   */
  private sanitizeUsernames(usernames: readonly string[]): string[] {
    return usernames
      .map((u) => u.trim().replace(/^@/, ''))
      .filter((u) => u.length > 0 && /^[a-zA-Z0-9_]{1,15}$/.test(u));
  }

  /**
   * Validate an optional date string against YYYY-MM-DD format.
   * Returns the date if valid, undefined otherwise.
   */
  private validateDate(date: string | undefined): string | undefined {
    if (!date) return undefined;
    return DATE_PATTERN.test(date.trim()) ? date.trim() : undefined;
  }

  /**
   * Clamp a limit to [MIN_ITEMS_PER_RUN, max].
   * Scweet enforces a minimum of 100 items per run.
   */
  private clampLimit(value: number, max: number): number {
    return Math.max(MIN_ITEMS_PER_RUN, Math.min(Math.floor(value), max));
  }

  /**
   * Create an empty result for early-return cases.
   */
  private emptyResult<T>(error: string): ApifyRunResult<T> {
    return {
      success: false,
      runId: '',
      datasetId: '',
      items: [],
      itemCount: 0,
      durationMs: 0,
      error,
    };
  }
}
