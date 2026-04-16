/**
 * @fileoverview Instagram Scraper Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Gives Agent X the ability to scrape Instagram posts, profiles, and hashtag
 * feeds using the hosted Apify `apify/instagram-scraper` actor. No official
 * Instagram API key required — Apify handles session management and anti-bot
 * evasion.
 *
 * Use cases:
 * - Fetching an athlete's latest Instagram posts for brand/content analysis
 * - Monitoring hashtags (#NXT1, #D1Commits, #CollegeFootball) for trending content
 * - Pulling profile details (followers, bio, verified status) for recruiting intel
 * - Tracking college program accounts for NIL and recruiting announcements
 * - Auditing an athlete's social media presence and engagement metrics
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
import { ApifyService, type InstagramPost, type InstagramProfile } from '../apify/apify.service.js';
import {
  ScraperMediaService,
  type MediaInput,
  type PersistedMedia,
  type MediaStagingContext,
} from './scraper-media.service.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum posts to return in the LLM context to avoid overflow. */
const MAX_POSTS_IN_RESPONSE = 50;

/** Maximum profiles to return in the LLM context. */
const MAX_PROFILES_IN_RESPONSE = 20;

/** Max characters for a search query (matches WebSearchTool / ScrapeTwitterTool). */
const MAX_QUERY_LENGTH = 500;

/** Maximum usernames per request to prevent abuse. */
const MAX_USERNAMES_PER_REQUEST = 10;

export class ScrapeInstagramTool extends BaseTool {
  readonly name = 'scrape_instagram';
  readonly description =
    'Scrape posts, profile details, or hashtag feeds from Instagram. ' +
    'No API key needed — uses the Apify-hosted Instagram Scraper actor. ' +
    'Supports three modes: ' +
    '1) "posts" — get recent posts from specific user(s). Returns captions, likes, comments, timestamps, and media type. ' +
    '2) "profile" — get profile details (bio, follower count, verified status) for specific user(s). ' +
    '3) "hashtag" — search Instagram by hashtag and return matching posts. ' +
    'Use this for brand auditing, recruiting intel, trending content analysis, and engagement scoring.';

  readonly parameters = {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['posts', 'profile', 'hashtag'],
        description:
          'Scraping mode: "posts" for a user\'s recent posts, ' +
          '"profile" for profile details (bio, followers, etc.), ' +
          '"hashtag" for hashtag feed search.',
      },
      usernames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For "posts" or "profile" mode: Instagram username(s) without @. ' +
          'Example: ["nike", "ohiostatefb"]. Maximum 10 usernames per request.',
      },
      query: {
        type: 'string',
        description:
          'For "hashtag" mode: the hashtag to search (with or without #). ' +
          'Example: "#D1Commits" or "collegefootball".',
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of posts to return per user/hashtag. ' +
          'Defaults to 30. Maximum 200. ' +
          'Higher limits take longer and cost more.',
      },
      newer_than: {
        type: 'string',
        description:
          'Only return posts newer than this date. ' +
          'Accepts YYYY-MM-DD format or relative format (e.g. "7 days", "2 months"). ' +
          'Example: "2025-01-01" or "30 days".',
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
    if (!mode || !['posts', 'profile', 'hashtag'].includes(mode)) {
      return {
        success: false,
        error: 'Parameter "mode" is required and must be one of: "posts", "profile", "hashtag".',
      };
    }

    // Build staging context for thread-scoped media storage
    const staging: MediaStagingContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    const progress = context?.onProgress;

    try {
      switch (mode) {
        case 'posts': {
          const usernames = this.extractInstagramUsernames(input);
          progress?.(
            `Scraping Instagram posts for ${usernames.length ? '@' + usernames.join(', @') : 'users'}…`
          );
          const postsResult = await this.handlePosts(input, staging);
          if (postsResult.success) progress?.('Processing Instagram media…');
          return postsResult;
        }
        case 'profile': {
          const usernames = this.extractInstagramUsernames(input);
          progress?.(
            `Fetching Instagram profile${usernames.length > 1 ? 's' : ''} for ${usernames.length ? '@' + usernames.join(', @') : 'user'}…`
          );
          return await this.handleProfile(input, staging);
        }
        case 'hashtag': {
          const query = this.str(input, 'query') ?? '';
          progress?.(`Searching Instagram for ${query.startsWith('#') ? query : '#' + query}…`);
          return await this.handleHashtag(input, staging);
        }
        default:
          return { success: false, error: `Unknown mode: ${mode}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Instagram scraping failed';
      logger.error('[ScrapeInstagramTool] Execution failed', { error: message, mode });
      return { success: false, error: message };
    }
  }

  // ─── Mode Handlers ─────────────────────────────────────────────────────

  private async handlePosts(
    input: Record<string, unknown>,
    staging?: MediaStagingContext
  ): Promise<ToolResult> {
    const usernames = this.extractInstagramUsernames(input);
    if (usernames.length === 0) {
      return this.paramError('usernames');
    }

    const result = await this.apify.getInstagramPosts(usernames, {
      limit: this.num(input, 'limit') ?? undefined,
      newerThan: this.str(input, 'newer_than') ?? undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Instagram posts fetch failed' };
    }

    // Persist media to Firebase Storage for in-app display
    const attachments = await this.persistPostMedia(result.items, staging);
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');

    return {
      success: true,
      data: {
        mode: 'posts',
        usernames,
        postCount: result.itemCount,
        durationMs: result.durationMs,
        posts: this.formatPosts(result.items),
        attachments: this.formatAttachments(attachments),
        ...(firstImage ? { imageUrl: firstImage.url } : {}),
        ...(firstVideo ? { videoUrl: firstVideo.url } : {}),
      },
    };
  }

  private async handleProfile(
    input: Record<string, unknown>,
    staging?: MediaStagingContext
  ): Promise<ToolResult> {
    const usernames = this.extractInstagramUsernames(input);
    if (usernames.length === 0) {
      return this.paramError('usernames');
    }

    const result = await this.apify.getInstagramProfiles(usernames);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Instagram profile fetch failed' };
    }

    // Persist profile pictures to Firebase Storage
    const attachments = await this.persistProfileMedia(result.items, staging);
    const firstImage = attachments.find((a) => a.type === 'image');

    return {
      success: true,
      data: {
        mode: 'profile',
        usernames,
        profileCount: result.itemCount,
        durationMs: result.durationMs,
        profiles: this.formatProfiles(result.items),
        attachments: this.formatAttachments(attachments),
        ...(firstImage ? { imageUrl: firstImage.url } : {}),
      },
    };
  }

  private async handleHashtag(
    input: Record<string, unknown>,
    staging?: MediaStagingContext
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

    const result = await this.apify.searchInstagram(query, {
      searchType: 'hashtag',
      limit: this.num(input, 'limit') ?? undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Instagram hashtag search failed' };
    }

    // Persist media to Firebase Storage for in-app display
    const attachments = await this.persistPostMedia(result.items, staging);
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');

    return {
      success: true,
      data: {
        mode: 'hashtag',
        query,
        postCount: result.itemCount,
        durationMs: result.durationMs,
        posts: this.formatPosts(result.items),
        attachments: this.formatAttachments(attachments),
        ...(firstImage ? { imageUrl: firstImage.url } : {}),
        ...(firstVideo ? { videoUrl: firstVideo.url } : {}),
      },
    };
  }

  // ─── Formatting ────────────────────────────────────────────────────────

  /**
   * Format posts for the LLM context window.
   * Trims to MAX_POSTS_IN_RESPONSE and keeps only the most useful fields.
   */
  private formatPosts(posts: readonly InstagramPost[]): unknown[] {
    return posts.slice(0, MAX_POSTS_IN_RESPONSE).map((p) => ({
      id: p.id,
      shortCode: p.shortCode,
      caption: p.caption.length > 500 ? p.caption.slice(0, 500) + '…' : p.caption,
      url: p.url,
      likes: p.likes,
      comments: p.comments,
      timestamp: p.timestamp,
      ownerUsername: p.ownerUsername,
      type: p.type,
      locationName: p.locationName || null,
      hashtags: p.hashtags.slice(0, 10),
      mentions: p.mentions.slice(0, 10),
      displayUrl: p.displayUrl || null,
      videoUrl: p.videoUrl || null,
    }));
  }

  /**
   * Format profiles for the LLM context window.
   */
  private formatProfiles(profiles: readonly InstagramProfile[]): unknown[] {
    return profiles.slice(0, MAX_PROFILES_IN_RESPONSE).map((p) => ({
      username: p.username,
      fullName: p.fullName,
      biography: p.biography,
      followersCount: p.followersCount,
      followsCount: p.followsCount,
      postsCount: p.postsCount,
      isVerified: p.isVerified,
      profilePicUrl: p.profilePicUrl || null,
      externalUrl: p.externalUrl || null,
    }));
  }

  // ─── Media Persistence ─────────────────────────────────────────────

  /**
   * Collect media URLs from Instagram posts and persist to Firebase Storage.
   * Prioritizes displayUrl (images) and videoUrl (videos).
   */
  private async persistPostMedia(
    posts: readonly InstagramPost[],
    staging?: MediaStagingContext
  ): Promise<PersistedMedia[]> {
    const inputs: MediaInput[] = [];

    for (const post of posts.slice(0, MAX_POSTS_IN_RESPONSE)) {
      // Prefer video if available (e.g., Reels), otherwise image
      if (post.videoUrl) {
        inputs.push({
          url: post.videoUrl,
          type: 'video',
          platform: 'instagram',
          sourceUrl: post.url,
        });
      } else if (post.displayUrl) {
        inputs.push({
          url: post.displayUrl,
          type: 'image',
          platform: 'instagram',
          sourceUrl: post.url,
        });
      }
    }

    if (inputs.length === 0) return [];

    try {
      return await this.media.persistBatch(inputs, staging);
    } catch (err) {
      logger.warn('[ScrapeInstagramTool] Media persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return [];
    }
  }

  /**
   * Persist profile pictures to Firebase Storage.
   */
  private async persistProfileMedia(
    profiles: readonly InstagramProfile[],
    staging?: MediaStagingContext
  ): Promise<PersistedMedia[]> {
    const inputs: MediaInput[] = profiles
      .filter((p) => p.profilePicUrl || p.profilePicUrlHD)
      .slice(0, MAX_PROFILES_IN_RESPONSE)
      .map((p) => ({
        url: p.profilePicUrlHD || p.profilePicUrl,
        type: 'image' as const,
        platform: 'instagram' as const,
        sourceUrl: `https://www.instagram.com/${p.username}/`,
      }));

    if (inputs.length === 0) return [];

    try {
      return await this.media.persistBatch(inputs, staging);
    } catch (err) {
      logger.warn('[ScrapeInstagramTool] Profile media persistence failed (non-fatal)', {
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
   * Extract and sanitize Instagram usernames from the "usernames" input parameter.
   * Accepts string[] or a single comma-separated string.
   * Instagram usernames: letters, digits, underscores, periods, 1–30 chars.
   */
  private extractInstagramUsernames(input: Record<string, unknown>): string[] {
    const raw = input['usernames'];
    const pattern = /^[a-zA-Z0-9_.]{1,30}$/;

    let candidates: string[];

    if (Array.isArray(raw)) {
      candidates = raw
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim().replace(/^@/, ''));
    } else if (typeof raw === 'string') {
      candidates = raw.split(',').map((u) => u.trim().replace(/^@/, ''));
    } else {
      return [];
    }

    return candidates
      .filter((u) => u.length > 0 && pattern.test(u))
      .slice(0, MAX_USERNAMES_PER_REQUEST);
  }
}
