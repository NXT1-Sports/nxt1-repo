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
import { ApifyMcpBridgeService } from '../apify/apify-mcp-bridge.service.js';
import { z } from 'zod';
import {
  ScraperMediaService,
  type MediaInput,
  type PersistedMedia,
  type MediaThreadContext,
} from './scraper-media.service.js';
import { extractMediaPayloads } from '../../../stream-media-payloads.js';
import { logger } from '../../../../../utils/logger.js';

/** Maximum posts to return in the LLM context to avoid overflow. */
const MAX_POSTS_IN_RESPONSE = 50;

/** Maximum profiles to return in the LLM context. */
const MAX_PROFILES_IN_RESPONSE = 20;

/** Max characters for a search query (matches WebSearchTool / ScrapeTwitterTool). */
const MAX_QUERY_LENGTH = 500;

/** Maximum usernames per request to prevent abuse. */
const MAX_USERNAMES_PER_REQUEST = 10;

const APIFY_FALLBACK_DISCOVERY_LIMIT = 8;
const APIFY_FALLBACK_MAX_CANDIDATES = 3;
const PRIMARY_INSTAGRAM_ACTORS = new Set(['apify/instagram-scraper']);

type ApifyBridge = Pick<ApifyMcpBridgeService, 'searchActors' | 'getActorDetails' | 'callActor'>;

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

  readonly parameters = z.object({
    mode: z.enum(['posts', 'profile', 'hashtag']),
    usernames: z.array(z.string().trim().min(1)).max(10).optional(),
    query: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    newer_than: z.string().trim().min(1).optional(),
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
    if (!mode || !['posts', 'profile', 'hashtag'].includes(mode)) {
      return {
        success: false,
        error: 'Parameter "mode" is required and must be one of: "posts", "profile", "hashtag".',
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
        case 'posts': {
          const usernames = this.extractInstagramUsernames(input);
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'posts',
            usernames,
            usernameCount: usernames.length,
            platform: 'instagram',
          });
          const postsResult = await this.handlePosts(input, staging);
          if (postsResult.success) {
            emitStage?.('processing_media', {
              icon: 'media',
              mode: 'posts',
              usernames,
              platform: 'instagram',
            });
          }
          return postsResult;
        }
        case 'profile': {
          const usernames = this.extractInstagramUsernames(input);
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'profile',
            usernames,
            usernameCount: usernames.length,
            platform: 'instagram',
          });
          return await this.handleProfile(input, staging);
        }
        case 'hashtag': {
          const query = this.str(input, 'query') ?? '';
          emitStage?.('fetching_data', {
            icon: 'search',
            mode: 'hashtag',
            query,
            platform: 'instagram',
          });
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
    staging?: MediaThreadContext
  ): Promise<ToolResult> {
    const usernames = this.extractInstagramUsernames(input);
    if (usernames.length === 0) {
      return this.paramError('usernames');
    }

    const result = await this.apify.getInstagramPosts(usernames, {
      limit: this.num(input, 'limit') ?? undefined,
      newerThan: this.str(input, 'newer_than') ?? undefined,
    });

    const fallback =
      !result.success || !this.postsContainMedia(result.items)
        ? await this.tryFallbackPosts(usernames)
        : null;

    if (!result.success && !fallback) {
      return { success: false, error: result.error ?? 'Instagram posts fetch failed' };
    }

    const posts = result.items.length > 0 ? result.items : (fallback?.posts ?? []);

    if (posts.length === 0 && fallback) {
      return {
        success: true,
        data: {
          mode: 'posts',
          usernames,
          postCount: fallback.posts.length,
          durationMs: result.durationMs,
          posts: this.formatPosts(fallback.posts),
          attachments: [],
          ...(fallback.imageUrl ? { imageUrl: fallback.imageUrl } : {}),
          ...(fallback.videoUrl ? { videoUrl: fallback.videoUrl } : {}),
          fallbackActorId: fallback.actorId,
        },
      };
    }

    // Persist media to Firebase Storage for in-app display
    const enrichedPosts =
      fallback && !this.postsContainMedia(posts)
        ? this.applyFallbackMediaToPosts(posts, fallback.videoUrl, fallback.imageUrl)
        : posts;

    const attachments = await this.persistPostMedia(enrichedPosts, staging);
    const firstImage = attachments.find((a) => a.type === 'image');
    const firstVideo = attachments.find((a) => a.type === 'video');
    const firstDisplay = enrichedPosts.find((post) => !!post.displayUrl)?.displayUrl;
    const firstPlayable = enrichedPosts.find((post) => !!post.videoUrl)?.videoUrl;

    return {
      success: true,
      data: {
        mode: 'posts',
        usernames,
        postCount: enrichedPosts.length,
        durationMs: result.durationMs,
        posts: this.formatPosts(enrichedPosts),
        attachments: this.formatAttachments(attachments),
        ...(firstImage
          ? { imageUrl: firstImage.url }
          : firstDisplay
            ? { imageUrl: firstDisplay }
            : {}),
        ...(firstVideo
          ? { videoUrl: firstVideo.url }
          : firstPlayable
            ? { videoUrl: firstPlayable }
            : {}),
        ...(fallback?.actorId ? { fallbackActorId: fallback.actorId } : {}),
      },
    };
  }

  private async handleProfile(
    input: Record<string, unknown>,
    staging?: MediaThreadContext
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
    staging?: MediaThreadContext
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
    if (!staging) {
      logger.warn(
        '[ScrapeInstagramTool] Skipping media persistence — no userId/threadId in context'
      );
      return [];
    }

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
    staging?: MediaThreadContext
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
    if (!staging) {
      logger.warn(
        '[ScrapeInstagramTool] Skipping profile media persistence — no userId/threadId in context'
      );
      return [];
    }

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

  private getApifyBridge(): ApifyBridge | null {
    if (this.apifyBridge !== undefined) {
      return this.apifyBridge;
    }

    try {
      this.apifyBridge = new ApifyMcpBridgeService();
    } catch (error) {
      logger.warn('[ScrapeInstagramTool] Apify MCP bridge unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.apifyBridge = null;
    }

    return this.apifyBridge;
  }

  private postsContainMedia(posts: readonly InstagramPost[]): boolean {
    return posts.some((post) => !!post.videoUrl || !!post.displayUrl);
  }

  private async tryFallbackPosts(usernames: readonly string[]): Promise<{
    readonly actorId: string;
    readonly posts: readonly InstagramPost[];
    readonly videoUrl?: string;
    readonly imageUrl?: string;
  } | null> {
    const bridge = this.getApifyBridge();
    if (!bridge || usernames.length === 0) {
      return null;
    }

    const candidates = await this.resolveFallbackActorCandidates(usernames, bridge);
    if (candidates.length === 0) {
      return null;
    }

    const sourceUrls = usernames.map((username) => `https://www.instagram.com/${username}/`);

    for (const candidate of candidates) {
      try {
        const details = await bridge.getActorDetails(candidate.actorId);
        const actorInput = this.buildFallbackActorInput(details, sourceUrls);
        if (!actorInput) {
          continue;
        }

        const output = await bridge.callActor(candidate.actorId, actorInput);
        const media = extractMediaPayloads(this.normalizeApifyFallbackPayload(output));
        const videoUrl = media.find((item) => item.type === 'video')?.url;
        const imageUrl = media.find((item) => item.type === 'image')?.url;

        if (!videoUrl && !imageUrl) {
          logger.warn('[ScrapeInstagramTool] Fallback actor returned no media', {
            actorId: candidate.actorId,
            usernames,
          });
          continue;
        }

        logger.info('[ScrapeInstagramTool] Fallback actor resolved Instagram media', {
          actorId: candidate.actorId,
          usernames,
          hasVideo: !!videoUrl,
          hasImage: !!imageUrl,
        });

        return {
          actorId: candidate.actorId,
          posts: usernames.map((username, index) =>
            this.buildFallbackPost(
              username,
              sourceUrls[index] ?? `https://www.instagram.com/${username}/`,
              videoUrl,
              imageUrl
            )
          ),
          videoUrl,
          imageUrl,
        };
      } catch (error) {
        logger.warn('[ScrapeInstagramTool] Fallback actor candidate failed', {
          actorId: candidate.actorId,
          usernames,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return null;
  }

  private async resolveFallbackActorCandidates(
    usernames: readonly string[],
    bridge: ApifyBridge
  ): Promise<
    Array<{ readonly actorId: string; readonly title: string; readonly description: string }>
  > {
    const queries = [
      'instagram reel video downloader',
      'instagram profile media scraper',
      `${usernames[0] ?? 'instagram'} instagram downloader`,
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
          if (PRIMARY_INSTAGRAM_ACTORS.has(candidate.actorId)) {
            continue;
          }

          const score = this.scoreFallbackActorCandidate(candidate);
          if (score <= 0) {
            continue;
          }

          const existing = candidates.get(candidate.actorId);
          if (!existing || existing.score < score) {
            candidates.set(candidate.actorId, { ...candidate, score });
          }
        }
      } catch (error) {
        logger.warn('[ScrapeInstagramTool] Fallback actor search failed', {
          usernames,
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
    sourceUrls: readonly string[]
  ): Record<string, unknown> | null {
    const schema = this.extractInputSchema(details);
    if (!schema) {
      return { directUrls: sourceUrls, maxItems: 3, limit: 3 };
    }

    const rawProperties = schema['properties'];
    const properties =
      rawProperties && typeof rawProperties === 'object'
        ? (rawProperties as Record<string, unknown>)
        : {};
    const propertyEntries = Object.entries(properties);
    if (propertyEntries.length === 0) {
      return { directUrls: sourceUrls, maxItems: 3, limit: 3 };
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
        input[propertyName] = this.buildSchemaCompatibleUrlValue(definition, sourceUrls);
        assignedUrl = true;
        continue;
      }

      if (
        lower === 'maxitems' ||
        lower === 'limit' ||
        lower === 'maxresults' ||
        lower === 'resultslimit'
      ) {
        input[propertyName] = 3;
        continue;
      }

      if (lower.includes('download') || lower.includes('savevideo')) {
        input[propertyName] = true;
        continue;
      }

      if (lower === 'resultstype' || lower === 'type') {
        input[propertyName] = 'posts';
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

  private applyFallbackMediaToPosts(
    posts: readonly InstagramPost[],
    fallbackVideoUrl?: string,
    fallbackImageUrl?: string
  ): readonly InstagramPost[] {
    if (!fallbackVideoUrl && !fallbackImageUrl) {
      return posts;
    }

    return posts.map((post, index) =>
      index === 0
        ? {
            ...post,
            videoUrl: post.videoUrl || fallbackVideoUrl || '',
            displayUrl: post.displayUrl || fallbackImageUrl || '',
          }
        : post
    );
  }

  private buildFallbackPost(
    username: string,
    url: string,
    videoUrl?: string,
    imageUrl?: string
  ): InstagramPost {
    return {
      id: url,
      shortCode: '',
      caption: '',
      url,
      likes: 0,
      comments: 0,
      timestamp: '',
      ownerUsername: username,
      type: videoUrl ? 'Video' : 'Image',
      locationName: '',
      hashtags: [],
      mentions: [],
      displayUrl: imageUrl ?? '',
      videoUrl: videoUrl ?? '',
    };
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

  private scoreFallbackActorCandidate(candidate: {
    readonly actorId: string;
    readonly title: string;
    readonly description: string;
  }): number {
    const haystack =
      `${candidate.actorId} ${candidate.title} ${candidate.description}`.toLowerCase();
    let score = 0;
    if (haystack.includes('instagram') || haystack.includes('insta')) score += 4;
    if (haystack.includes('video') || haystack.includes('reel')) score += 3;
    if (haystack.includes('download')) score += 3;
    if (haystack.includes('mp4')) score += 2;
    if (haystack.includes('post') || haystack.includes('profile') || haystack.includes('media'))
      score += 1;
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
    sourceUrls: readonly string[]
  ): unknown {
    if (definition['type'] === 'array') {
      const items = definition['items'];
      if (
        items &&
        typeof items === 'object' &&
        (items as Record<string, unknown>)['type'] === 'object'
      ) {
        return sourceUrls.map((sourceUrl) => ({ url: sourceUrl }));
      }
      return [...sourceUrls];
    }

    return sourceUrls[0] ?? null;
  }

  private isUrlProperty(propertyName: string): boolean {
    return [
      'url',
      'urls',
      'directurls',
      'posturl',
      'posturls',
      'profileurl',
      'profileurls',
      'videourl',
      'videourls',
      'mediaurl',
      'mediaurls',
      'sourceurl',
      'sourceurls',
      'starturls',
      'requesturl',
    ].includes(propertyName);
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
