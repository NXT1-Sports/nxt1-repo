/**
 * @fileoverview Apify Service — Twitter/X & Instagram Scraping via Hosted Actors
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Wraps the Apify Client SDK to trigger and consume hosted actors:
 * - `altimis/scweet` for scraping tweets / profile timelines from Twitter/X.
 * - `apify/instagram-scraper` for scraping Instagram posts, profiles & hashtags.
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
 *
 * Instagram Actor API (2026) — apify/instagram-scraper:
 * - directUrls: array of Instagram profile/post/hashtag URLs
 * - resultsType: "posts" | "details" | "comments" | "reels"
 * - resultsLimit: max items per URL
 * - search: keyword search query
 * - searchType: "user" | "hashtag" | "place"
 * - searchLimit: max search results (1–250)
 * - onlyPostsNewerThan: YYYY-MM-DD or relative ("7 days")
 */

import { ApifyClient } from 'apify-client';
import { logger } from '../../../../../utils/logger.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Apify actor ID for Scweet (altimis/scweet). */
const SCWEET_ACTOR_ID = 'altimis/scweet';

/**
 * Apify actor for fetching a single tweet by URL.
 * Use this instead of tweet-scraper V2 — V2 has a 50-tweet minimum and
 * explicitly prohibits single tweet fetching.
 */
const TWITTER_SCRAPER_LITE_ACTOR_ID = 'apidojo/twitter-scraper-lite';

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

// ─── Instagram Constants ─────────────────────────────────────────────────────

/** Apify actor ID for the official Instagram Scraper. */
const INSTAGRAM_ACTOR_ID = 'apify/instagram-scraper';

/** Maximum results per Instagram request to prevent runaway costs. */
const MAX_INSTAGRAM_RESULTS_LIMIT = 200;

/** Default Instagram results limit per URL. */
const DEFAULT_INSTAGRAM_RESULTS_LIMIT = 30;

/** Maximum search results for Instagram hashtag/user/place search. */
const MAX_INSTAGRAM_SEARCH_LIMIT = 100;

/** Default Instagram search limit. */
const DEFAULT_INSTAGRAM_SEARCH_LIMIT = 10;

/** Minimum results limit for Instagram (no minimum enforced like Scweet). */
const MIN_INSTAGRAM_RESULTS = 1;

/** Instagram username pattern — letters, digits, underscores, periods, 1–30 chars. */
const INSTAGRAM_USERNAME_PATTERN = /^[a-zA-Z0-9_.]{1,30}$/;

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
  /** Image URLs extracted from tweet media (photo type). */
  readonly imageUrls: readonly string[];
  /** Video URL extracted from tweet media (highest bitrate mp4). */
  readonly videoUrl: string;
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

// ─── Instagram Types ─────────────────────────────────────────────────────────

/** Raw item from the apify/instagram-scraper actor (post result). */
export interface InstagramRawPost {
  readonly id?: string;
  readonly shortCode?: string;
  readonly caption?: string;
  readonly url?: string;
  readonly commentsCount?: number;
  readonly likesCount?: number;
  readonly timestamp?: string;
  readonly ownerUsername?: string;
  readonly ownerFullName?: string;
  readonly ownerId?: string;
  readonly type?: string; // "Image" | "Video" | "Sidecar"
  readonly videoUrl?: string;
  readonly displayUrl?: string;
  readonly locationName?: string;
  readonly hashtags?: readonly string[];
  readonly mentions?: readonly string[];
  readonly [key: string]: unknown;
}

/** Raw item from the apify/instagram-scraper actor (profile/details result). */
export interface InstagramRawProfile {
  readonly id?: string;
  readonly username?: string;
  readonly fullName?: string;
  readonly biography?: string;
  readonly followersCount?: number;
  readonly followsCount?: number;
  readonly postsCount?: number;
  readonly isVerified?: boolean;
  readonly profilePicUrl?: string;
  readonly profilePicUrlHD?: string;
  readonly externalUrl?: string;
  readonly igtvVideoCount?: number;
  readonly relatedProfiles?: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

/** Normalized Instagram post for LLM consumption. */
export interface InstagramPost {
  readonly id: string;
  readonly shortCode: string;
  readonly caption: string;
  readonly url: string;
  readonly likes: number;
  readonly comments: number;
  readonly timestamp: string;
  readonly ownerUsername: string;
  readonly type: string;
  readonly locationName: string;
  readonly hashtags: readonly string[];
  readonly mentions: readonly string[];
  /** Direct display image URL from Instagram CDN (temporary — must re-host). */
  readonly displayUrl: string;
  /** Direct video URL from Instagram CDN (temporary — must re-host). Empty for images/sidecars. */
  readonly videoUrl: string;
}

/** Normalized Instagram profile for LLM consumption. */
export interface InstagramProfile {
  readonly username: string;
  readonly fullName: string;
  readonly biography: string;
  readonly followersCount: number;
  readonly followsCount: number;
  readonly postsCount: number;
  readonly isVerified: boolean;
  /** Profile picture URL from Instagram CDN (temporary — must re-host). */
  readonly profilePicUrl: string;
  /** HD variant of profile picture if available. */
  readonly profilePicUrlHD: string;
  readonly externalUrl: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ApifyService {
  private readonly client: ApifyClient;

  constructor(token?: string) {
    const resolved = token?.trim() || process.env['APIFY_API_TOKEN']?.trim();
    if (!resolved) {
      throw new AgentEngineError(
        'APIFY_CONFIG_MISSING_API_TOKEN',
        'APIFY_API_TOKEN is not configured. ' +
          'Set it in your .env file (https://console.apify.com → Settings → API Tokens).'
      );
    }
    this.client = new ApifyClient({ token: resolved });
  }

  /**
   * Fetch a single tweet by its URL using apidojo/twitter-scraper-lite.
   *
   * Use this for single tweet URLs (x.com/user/status/ID).
   * Do NOT use apidojo/tweet-scraper V2 for single tweets — V2 has a
   * 50-tweet minimum and explicitly prohibits single tweet fetching.
   *
   * @param tweetUrl — Full tweet URL, e.g. https://x.com/user/status/123456
   */
  async getSingleTweet(tweetUrl: string): Promise<ApifyRunResult<ScweetTweet>> {
    if (!tweetUrl || tweetUrl.trim().length === 0) {
      return this.emptyResult('Tweet URL is required');
    }

    const normalizedUrl = tweetUrl.trim();

    logger.info('[ApifyService] Fetching single tweet', { tweetUrl: normalizedUrl });

    const startMs = Date.now();

    try {
      const run = await this.client
        .actor(TWITTER_SCRAPER_LITE_ACTOR_ID)
        .call(
          { startUrls: [{ url: normalizedUrl }], maxItems: 1 },
          { timeout: ACTOR_CALL_TIMEOUT_SECS }
        );

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      const durationMs = Date.now() - startMs;

      logger.info('[ApifyService] Single tweet fetch completed', {
        runId: run.id,
        datasetId: run.defaultDatasetId,
        itemCount: items.length,
        durationMs,
      });

      if (items.length === 0) {
        return {
          success: false,
          runId: run.id,
          datasetId: run.defaultDatasetId,
          items: [],
          itemCount: 0,
          durationMs,
          error: `No tweet data returned for URL: ${normalizedUrl}. The tweet may be private, deleted, or the URL format is unsupported.`,
        };
      }

      // twitter-scraper-lite returns a slightly different schema than Scweet—
      // normalize to the shared ScweetTweet interface.
      const normalized = items.map((item) =>
        this.normalizeTwitterScraperLiteItem(item as Record<string, unknown>)
      );

      return {
        success: true,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        items: normalized,
        itemCount: normalized.length,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Single tweet fetch failed';
      const durationMs = Date.now() - startMs;

      logger.error('[ApifyService] Single tweet fetch failed', {
        tweetUrl: normalizedUrl,
        error: message,
        durationMs,
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

  // ─── Instagram Methods ────────────────────────────────────────────────

  /**
   * Fetch posts from one or more Instagram profiles.
   */
  async getInstagramPosts(
    usernames: readonly string[],
    options: {
      limit?: number;
      newerThan?: string;
    } = {}
  ): Promise<ApifyRunResult<InstagramPost>> {
    const sanitized = this.sanitizeInstagramUsernames(usernames);
    if (sanitized.length === 0) {
      return this.emptyResult('No valid Instagram usernames provided');
    }

    const resultsLimit = this.clampInstagramLimit(
      options.limit ?? DEFAULT_INSTAGRAM_RESULTS_LIMIT,
      MAX_INSTAGRAM_RESULTS_LIMIT
    );

    logger.info('[ApifyService] Fetching Instagram posts', {
      usernames: sanitized,
      resultsLimit,
    });

    const directUrls = sanitized.map((u) => `https://www.instagram.com/${u}/`);

    const result = await this.runInstagramActor({
      directUrls,
      resultsType: 'posts',
      resultsLimit,
      ...(options.newerThan && { onlyPostsNewerThan: options.newerThan }),
    });

    if (!result.success) {
      return { ...result, items: [] };
    }

    return {
      ...result,
      items: (result.items as readonly InstagramRawPost[]).map((item) =>
        this.normalizeToInstagramPost(item)
      ),
    };
  }

  /**
   * Fetch profile details for one or more Instagram users.
   */
  async getInstagramProfiles(
    usernames: readonly string[]
  ): Promise<ApifyRunResult<InstagramProfile>> {
    const sanitized = this.sanitizeInstagramUsernames(usernames);
    if (sanitized.length === 0) {
      return this.emptyResult('No valid Instagram usernames provided');
    }

    logger.info('[ApifyService] Fetching Instagram profiles', { usernames: sanitized });

    const directUrls = sanitized.map((u) => `https://www.instagram.com/${u}/`);

    const result = await this.runInstagramActor({
      directUrls,
      resultsType: 'details',
      resultsLimit: 1, // One detail result per URL
    });

    if (!result.success) {
      return { ...result, items: [] };
    }

    return {
      ...result,
      items: (result.items as readonly InstagramRawProfile[]).map((item) =>
        this.normalizeToInstagramProfile(item)
      ),
    };
  }

  /**
   * Search Instagram by hashtag, user, or place.
   */
  async searchInstagram(
    query: string,
    options: {
      searchType?: 'user' | 'hashtag' | 'place';
      limit?: number;
    } = {}
  ): Promise<ApifyRunResult<InstagramPost>> {
    if (!query || query.trim().length === 0) {
      return this.emptyResult('Search query is required');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return this.emptyResult(`Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
    }

    const searchType = options.searchType ?? 'hashtag';
    const searchLimit = this.clampInstagramLimit(
      options.limit ?? DEFAULT_INSTAGRAM_SEARCH_LIMIT,
      MAX_INSTAGRAM_SEARCH_LIMIT
    );

    // Strip # prefix for hashtag searches — Apify expects the raw tag
    const cleanQuery = searchType === 'hashtag' ? query.trim().replace(/^#/, '') : query.trim();

    logger.info('[ApifyService] Searching Instagram', {
      query: cleanQuery.slice(0, 100),
      searchType,
      searchLimit,
    });

    const result = await this.runInstagramActor({
      search: cleanQuery,
      searchType,
      searchLimit,
      resultsType: 'posts',
      resultsLimit: DEFAULT_INSTAGRAM_RESULTS_LIMIT,
    });

    if (!result.success) {
      return { ...result, items: [] };
    }

    return {
      ...result,
      items: (result.items as readonly InstagramRawPost[]).map((item) =>
        this.normalizeToInstagramPost(item)
      ),
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
      imageUrls: this.extractTweetImageUrls(tweet?.media),
      videoUrl: this.extractTweetVideoUrl(tweet?.media),
    };
  }

  /**
   * Normalize a raw twitter-scraper-lite item into the shared ScweetTweet format.
   * The lite actor uses a slightly different schema than altimis/scweet.
   */
  private normalizeTwitterScraperLiteItem(raw: Record<string, unknown>): ScweetTweet {
    // twitter-scraper-lite nests tweet data differently — try multiple paths
    const tweetId =
      (raw['id'] as string) ?? (raw['rest_id'] as string) ?? (raw['tweetId'] as string) ?? '';
    const text =
      (raw['text'] as string) ??
      (raw['full_text'] as string) ??
      (raw['tweet_text'] as string) ??
      '';
    const username =
      ((raw['author'] as Record<string, unknown>)?.['userName'] as string) ??
      ((raw['author'] as Record<string, unknown>)?.['screen_name'] as string) ??
      (raw['userName'] as string) ??
      (raw['screen_name'] as string) ??
      '';
    const timestamp =
      (raw['createdAt'] as string) ??
      (raw['created_at'] as string) ??
      (raw['timestamp'] as string) ??
      '';
    const url =
      (raw['url'] as string) ?? (raw['tweet_url'] as string) ?? (raw['tweetUrl'] as string) ?? '';

    const publicMetrics = raw['public_metrics'] as Record<string, unknown> | undefined;
    const retweets =
      (publicMetrics?.['retweet_count'] as number) ?? (raw['retweetCount'] as number) ?? 0;
    const likes =
      (publicMetrics?.['like_count'] as number) ??
      (raw['likeCount'] as number) ??
      (raw['favoriteCount'] as number) ??
      0;
    const replies =
      (publicMetrics?.['reply_count'] as number) ?? (raw['replyCount'] as number) ?? 0;

    // Media extraction — twitter-scraper-lite uses entities.media[]
    const entities = raw['entities'] as Record<string, unknown> | undefined;
    const media = (entities?.['media'] ?? raw['media']) as
      | readonly Record<string, unknown>[]
      | undefined;

    return {
      id: tweetId,
      text,
      username,
      timestamp,
      retweets,
      likes,
      replies,
      url,
      imageUrls: this.extractTweetImageUrls(media),
      videoUrl: this.extractTweetVideoUrl(media),
    };
  }

  /**
   * Extract image URLs from raw Scweet tweet media array.
   * Looks for `media_url_https` on photo-type media objects.
   */
  private extractTweetImageUrls(media: readonly Record<string, unknown>[] | undefined): string[] {
    if (!media || !Array.isArray(media)) return [];
    return media
      .filter((m) => {
        const type = (m['type'] as string) ?? '';
        return type === 'photo' || (!type && m['media_url_https']);
      })
      .map((m) => (m['media_url_https'] as string) ?? (m['media_url'] as string) ?? '')
      .filter((url) => url.length > 0);
  }

  /**
   * Extract the best video URL from raw Scweet tweet media array.
   * Picks the highest-bitrate mp4 variant.
   */
  private extractTweetVideoUrl(media: readonly Record<string, unknown>[] | undefined): string {
    if (!media || !Array.isArray(media)) return '';
    for (const m of media) {
      const type = m['type'] as string;
      if (type !== 'video' && type !== 'animated_gif') continue;
      const videoInfo = m['video_info'] as Record<string, unknown> | undefined;
      if (!videoInfo) continue;
      const variants = videoInfo['variants'] as readonly Record<string, unknown>[] | undefined;
      if (!variants || !Array.isArray(variants)) continue;
      // Pick highest bitrate mp4
      let best = '';
      let bestBitrate = -1;
      for (const v of variants) {
        const ct = (v['content_type'] as string) ?? '';
        if (!ct.includes('mp4')) continue;
        const bitrate = (v['bitrate'] as number) ?? 0;
        if (bitrate > bestBitrate || best === '') {
          best = (v['url'] as string) ?? '';
          bestBitrate = bitrate;
        }
      }
      if (best) return best;
    }
    return '';
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
   * Clamp a limit for Instagram (minimum 1, unlike Scweet's 100).
   */
  private clampInstagramLimit(value: number, max: number): number {
    return Math.max(MIN_INSTAGRAM_RESULTS, Math.min(Math.floor(value), max));
  }

  /**
   * Run the Instagram scraper actor and return raw dataset items.
   */
  private async runInstagramActor(
    input: Record<string, unknown>
  ): Promise<ApifyRunResult<InstagramRawPost | InstagramRawProfile>> {
    const startMs = Date.now();

    try {
      const run = await this.client.actor(INSTAGRAM_ACTOR_ID).call(input, {
        timeout: ACTOR_CALL_TIMEOUT_SECS,
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const durationMs = Date.now() - startMs;

      logger.info('[ApifyService] Instagram actor run completed', {
        runId: run.id,
        datasetId: run.defaultDatasetId,
        itemCount: items.length,
        durationMs,
        resultsType: input['resultsType'],
      });

      return {
        success: true,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        items: items as unknown as readonly (InstagramRawPost | InstagramRawProfile)[],
        itemCount: items.length,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Instagram actor run failed';
      const durationMs = Date.now() - startMs;

      logger.error('[ApifyService] Instagram actor run failed', {
        error: message,
        durationMs,
        resultsType: input['resultsType'],
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
   * Normalize a raw Instagram post into the clean format for LLM consumption.
   */
  private normalizeToInstagramPost(raw: InstagramRawPost): InstagramPost {
    return {
      id: raw.id ?? '',
      shortCode: raw.shortCode ?? '',
      caption: raw.caption ?? '',
      url: raw.url ?? (raw.shortCode ? `https://www.instagram.com/p/${raw.shortCode}/` : ''),
      likes: raw.likesCount ?? 0,
      comments: raw.commentsCount ?? 0,
      timestamp: raw.timestamp ?? '',
      ownerUsername: raw.ownerUsername ?? '',
      type: raw.type ?? 'Image',
      locationName: raw.locationName ?? '',
      hashtags: raw.hashtags ?? [],
      mentions: raw.mentions ?? [],
      displayUrl: raw.displayUrl ?? '',
      videoUrl: raw.videoUrl ?? '',
    };
  }

  /**
   * Normalize a raw Instagram profile into the clean format for LLM consumption.
   */
  private normalizeToInstagramProfile(raw: InstagramRawProfile): InstagramProfile {
    return {
      username: raw.username ?? '',
      fullName: raw.fullName ?? '',
      biography: raw.biography ?? '',
      followersCount: raw.followersCount ?? 0,
      followsCount: raw.followsCount ?? 0,
      postsCount: raw.postsCount ?? 0,
      isVerified: raw.isVerified ?? false,
      profilePicUrl: raw.profilePicUrlHD ?? raw.profilePicUrl ?? '',
      profilePicUrlHD: raw.profilePicUrlHD ?? '',
      externalUrl: raw.externalUrl ?? '',
    };
  }

  /**
   * Sanitize an array of Instagram usernames: strip @, trim, remove blanks.
   */
  private sanitizeInstagramUsernames(usernames: readonly string[]): string[] {
    return usernames
      .map((u) => u.trim().replace(/^@/, ''))
      .filter((u) => u.length > 0 && INSTAGRAM_USERNAME_PATTERN.test(u));
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
