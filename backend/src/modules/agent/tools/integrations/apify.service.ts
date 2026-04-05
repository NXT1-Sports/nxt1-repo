/**
 * @fileoverview Apify Service — Twitter/X Scraping via Hosted Scweet Actor
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Wraps the Apify Client SDK to trigger and consume the `altimis/scweet` actor
 * for scraping tweets, profile timelines, and followers from Twitter/X.
 *
 * Architecture:
 * - Uses the official `apify-client` SDK (handles retries, pagination, auth).
 * - Runs the actor **synchronously** via `actor.call()` which waits for the
 *   run to finish and returns the run metadata. We then fetch the dataset.
 * - For short scrapes (limit ≤ 200) this completes in ~30–90 seconds.
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
 */

import { ApifyClient } from 'apify-client';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Apify actor ID for Scweet (altimis/scweet). */
const SCWEET_ACTOR_ID = 'altimis/scweet';

/** Maximum tweet limit per request to prevent runaway costs. */
const MAX_TWEET_LIMIT = 500;

/** Default tweet limit if none specified. */
const DEFAULT_TWEET_LIMIT = 50;

/** Maximum follower limit per request. */
const MAX_FOLLOWER_LIMIT = 1000;

/** Default follower limit. */
const DEFAULT_FOLLOWER_LIMIT = 100;

/** Timeout for synchronous actor runs (5 minutes). */
const ACTOR_CALL_TIMEOUT_SECS = 300;

/** Max characters for a search query. */
const MAX_QUERY_LENGTH = 500;

/** Strict YYYY-MM-DD date pattern. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Types ───────────────────────────────────────────────────────────────────

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
    const limit = this.clampLimit(options.limit ?? DEFAULT_TWEET_LIMIT, MAX_TWEET_LIMIT);

    logger.info('[ApifyService] Searching tweets', { query: query.slice(0, 100), limit, since });

    return this.runActor<ScweetTweet>({
      mode: 'search',
      words: query.trim(),
      ...(since && { since }),
      ...(until && { until }),
      limit,
      ...(options.language && { lang: options.language }),
    });
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

    const limit = this.clampLimit(options.limit ?? DEFAULT_TWEET_LIMIT, MAX_TWEET_LIMIT);

    logger.info('[ApifyService] Fetching profile tweets', { usernames: sanitized, limit });

    return this.runActor<ScweetTweet>({
      mode: 'profile_tweets',
      users: sanitized,
      limit,
    });
  }

  /**
   * Fetch followers of one or more users.
   */
  async getFollowers(
    usernames: readonly string[],
    options: { limit?: number } = {}
  ): Promise<ApifyRunResult<ScweetUser>> {
    const sanitized = this.sanitizeUsernames(usernames);
    if (sanitized.length === 0) {
      return this.emptyResult('No valid usernames provided');
    }

    const limit = this.clampLimit(options.limit ?? DEFAULT_FOLLOWER_LIMIT, MAX_FOLLOWER_LIMIT);

    logger.info('[ApifyService] Fetching followers', { usernames: sanitized, limit });

    return this.runActor<ScweetUser>({
      mode: 'followers',
      users: sanitized,
      limit,
    });
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async runActor<T>(input: Record<string, unknown>): Promise<ApifyRunResult<T>> {
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
        items: items as unknown as readonly T[],
        itemCount: items.length,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apify actor run failed';
      const durationMs = Date.now() - startMs;

      logger.error('[ApifyService] Actor run failed', {
        error: message,
        durationMs,
        mode: input['mode'],
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
   * Clamp a limit to [1, max].
   */
  private clampLimit(value: number, max: number): number {
    return Math.max(1, Math.min(Math.floor(value), max));
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
