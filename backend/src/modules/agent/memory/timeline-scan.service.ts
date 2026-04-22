/**
 * @fileoverview Timeline Scan Service — Extract Durable Context from Social Posts
 * @module @nxt1/backend/modules/agent/memory
 *
 * Shared service used by:
 * - `ScanTimelinePostsTool` (agent tool — on-demand during a conversation)
 * - `AgentWorker` (BullMQ job — event-driven, 30-min post-publish debounce)
 * - `/cron/scan-timeline-posts` (nightly safety net — scans agent-active users)
 *
 * Reads recent Firestore timeline posts for a user (and optionally their team),
 * runs the digest through an LLM extraction tier, and stores durable facts as
 * vector memories — making them available to future sessions via automatic
 * context retrieval.
 *
 * Design decisions:
 * - Uses the 'extraction' tier (cheap model) to minimize cost.
 * - Hard-caps at 50 posts per user to bound prompt size and latency.
 * - Deduplicates extracted facts before storing (content + category guard).
 * - Cron safety net scoped to agent-active users (queried from AgentThreadModel).
 * - Max 10 users per cron run to bound LLM load (tunable via exported constant).
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentMemoryCategory, AgentMemoryTarget } from '@nxt1/core';
import { POSTS_COLLECTIONS } from '@nxt1/core/constants';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { VectorMemoryService } from './vector.service.js';
import { AgentMemoryModel } from './vector.service.js';
import { AgentThreadModel } from '../../../models/agent/agent-thread.model.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { logger } from '../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants (exported for cron route + tests) ───────────────────────────────

/** How far back in time the cron safety net looks for recent posts (hours). */
export const TIMELINE_SCAN_LOOKBACK_HOURS = 24;

/** Maximum users to scan in a single cron safety-net run. */
export const MAX_USERS_PER_CRON_RUN = 10;

/** BullMQ delay before a timeline scan fires after a post-publish event (30 min). */
export const SCAN_TIMELINE_DELAY_MS = 1_800_000;

/** Maximum posts to scan per user invocation. */
const MAX_POSTS = 50;

/** Maximum characters from a single post's content field. */
const MAX_POST_CONTENT_CHARS = 500;

/** Categories the LLM is allowed to emit. */
const VALID_CATEGORIES: readonly AgentMemoryCategory[] = [
  'preference',
  'goal',
  'recruiting_context',
  'performance_data',
];

const VALID_TARGETS: readonly AgentMemoryTarget[] = ['user', 'team', 'organization'];

const extractedTimelineFactSchema = z.object({
  content: z.string().trim().min(1),
  category: z.enum(['preference', 'goal', 'recruiting_context', 'performance_data']),
  target: z.enum(['user', 'team', 'organization']).default('user'),
});

const extractedTimelineFactsSchema = z.array(z.unknown());

/** How recently a user must have interacted with Agent X to be eligible for cron scanning. */
const AGENT_ACTIVE_LOOKBACK_DAYS = 7;

/**
 * System prompt for the post-scanning extraction model.
 * Adapted from MemorySummarizationService for social feed posts.
 */
const EXTRACTION_SYSTEM_PROMPT = `You are an AI memory extraction system for a sports recruiting platform called NXT1.

Your job is to read a digest of recent social timeline posts published by or about a user (athlete, coach, or team), then extract DURABLE FACTS that should be remembered for future AI-agent conversations.

Extract ONLY:
- Performance data and achievements (e.g., "User posted about running a 4.5 forty-yard dash", "User announced 3,200 passing yards this season")
- Recruiting milestones (e.g., "User shared a post about an official visit to Ohio State", "User announced a scholarship offer from Michigan")
- Goals and intentions stated in posts (e.g., "User publicly committed to earning a D1 scholarship")
- Notable personal or team milestones (e.g., "User announced state championship win", "User shared All-District selection")

Do NOT extract:
- Generic social content (motivational quotes, emojis, vague captions)
- Temporary content (game previews, hype posts without outcomes)
- Obvious or trivial information (e.g., "User posted a photo")
- Information the agent already likely knows from the profile

Return a JSON array of objects. Each object has:
- "content": A concise third-person factual statement (e.g., "User ran a 4.5 forty-yard dash per a verified post.")
- "category": One of "preference", "goal", "recruiting_context", "performance_data"
- "target": One of "user", "team", or "organization"

Use "team" only when the fact should be remembered as team-level context.
Use "organization" only when the fact applies to the school, club, or program above the team.
Default to "user" when in doubt.

If there are no durable facts to extract, return an empty array: []

Return ONLY the JSON array, no markdown fences, no explanation.`;

// ─── Result Types ──────────────────────────────────────────────────────────────

export interface TimelineScanUserResult {
  readonly postsScanned: number;
  readonly factsExtracted: number;
  readonly memoriesStored: number;
  readonly message: string;
}

export interface TimelineScanBatchResult {
  readonly usersScanned: number;
  readonly totalMemoriesStored: number;
  readonly usersSkipped: number;
  readonly errors: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class TimelineScanService {
  constructor(
    private readonly db: Firestore,
    private readonly llm: OpenRouterService,
    private readonly vectorMemory: VectorMemoryService
  ) {}

  // ─── Single-User Scan (used by tool, worker, and cron) ─────────────────

  /**
   * Scan a single user's timeline posts and extract durable facts into vector memory.
   *
   * @param userId - Firebase UID of the user.
   * @param teamId - Optional team ID for team-scoped scanning.
   * @param scope - Which timelines to scan: 'user' | 'team' | 'both'.
   * @param limit - Number of recent posts to scan (1–50, default 20).
   */
  async scanForUser(
    userId: string,
    teamId?: string,
    scope: 'user' | 'team' | 'both' = 'user',
    limit: number = 20
  ): Promise<TimelineScanUserResult> {
    const clampedLimit = Math.min(Math.max(limit, 1), MAX_POSTS);

    const posts = await this.fetchPosts(userId, scope, teamId, clampedLimit);

    if (posts.length === 0) {
      return {
        postsScanned: 0,
        factsExtracted: 0,
        memoriesStored: 0,
        message: 'No timeline posts found to scan.',
      };
    }

    const digest = this.buildDigest(posts);

    const completion = await this.llm.complete(
      [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: digest },
      ],
      {
        tier: 'extraction',
        temperature: 0,
        maxTokens: 2000,
        outputSchema: {
          name: 'timeline_scan_facts',
          schema: extractedTimelineFactsSchema,
        },
        telemetryContext: {
          operationId: `scan-timeline-posts-${userId}`,
          userId,
          agentId: 'router',
          feature: 'scan-timeline-posts',
        },
      }
    );

    let parsedFacts: z.infer<typeof extractedTimelineFactsSchema>;
    try {
      parsedFacts = resolveStructuredOutput(
        completion,
        extractedTimelineFactsSchema,
        'Timeline scan extraction'
      );
    } catch {
      logger.warn('[TimelineScanService] Failed to parse extraction JSON', {
        userId,
        raw: (completion.content ?? '').slice(0, 500),
      });
      return {
        postsScanned: posts.length,
        factsExtracted: 0,
        memoriesStored: 0,
        message: 'Extraction model returned an unparseable response. No memories stored.',
      };
    }

    const facts = parsedFacts.flatMap((item) => {
      const fact = extractedTimelineFactSchema.safeParse(item);
      return fact.success ? [fact.data] : [];
    });

    const stored = await this.storeFacts(facts, userId, teamId);

    logger.info('[TimelineScanService] User scan complete', {
      userId,
      scope,
      postsScanned: posts.length,
      factsExtracted: facts.length,
      memoriesStored: stored,
    });

    return {
      postsScanned: posts.length,
      factsExtracted: facts.length,
      memoriesStored: stored,
      message:
        stored > 0
          ? `Scanned ${posts.length} posts and stored ${stored} new memory fact(s) for future context.`
          : `Scanned ${posts.length} posts — no new facts to add (all already known or none found).`,
    };
  }

  // ─── Batch Scan (cron safety net) ──────────────────────────────────────

  /**
   * Nightly safety-net: find users who (a) have been active on Agent X in the
   * last 7 days AND (b) have posted within the lookback window, then scan their
   * timelines.
   *
   * Uses per-user Firestore queries against the existing `userId + createdAt`
   * composite index — avoids a dangerous unbound platform-wide range scan.
   */
  async scanActiveUsers(
    lookbackHours: number = TIMELINE_SCAN_LOOKBACK_HOURS,
    maxUsers: number = MAX_USERS_PER_CRON_RUN
  ): Promise<TimelineScanBatchResult> {
    const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    // Step 1: Find users with recent Agent X activity (MongoDB query)
    const agentActiveCutoff = new Date(
      Date.now() - AGENT_ACTIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    );
    const activeThreads = await AgentThreadModel.find({
      lastMessageAt: { $gte: agentActiveCutoff.toISOString() },
    })
      .select('userId')
      .limit(maxUsers * 5) // over-fetch to account for dedup
      .lean();

    const agentActiveUserIds = [...new Set(activeThreads.map((t) => t.userId))];

    if (agentActiveUserIds.length === 0) {
      logger.info('[TimelineScanService] No agent-active users found — skipping scan');
      return { usersScanned: 0, totalMemoriesStored: 0, usersSkipped: 0, errors: 0 };
    }

    // Step 2: For each agent-active user, check if they have any recent posts.
    // Uses the existing `userId + createdAt` composite index (one query per user).
    // This avoids a platform-wide unbound createdAt range scan.
    const postsCollection = this.db.collection(POSTS_COLLECTIONS.POSTS);
    const usersWithRecentPosts = new Set<string>();
    const userTeamMap = new Map<string, string | undefined>();

    for (const uid of agentActiveUserIds.slice(0, maxUsers * 3)) {
      const snap = await postsCollection
        .where('userId', '==', uid)
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snap.docs.length > 0) {
        usersWithRecentPosts.add(uid);
        const data = snap.docs[0].data() as Record<string, unknown>;
        if (typeof data['teamId'] === 'string') {
          userTeamMap.set(uid, data['teamId']);
        }
      }

      if (usersWithRecentPosts.size >= maxUsers) break;
    }

    if (usersWithRecentPosts.size === 0) {
      logger.info('[TimelineScanService] No agent-active users with recent posts — sleeping');
      return { usersScanned: 0, totalMemoriesStored: 0, usersSkipped: 0, errors: 0 };
    }

    // Step 3: Scan each user sequentially
    let totalMemoriesStored = 0;
    let usersSkipped = 0;
    let errors = 0;

    for (const userId of usersWithRecentPosts) {
      try {
        const teamId = userTeamMap.get(userId);
        const scope = teamId ? 'both' : 'user';
        const result = await this.scanForUser(userId, teamId, scope as 'user' | 'team' | 'both');
        if (result.memoriesStored === 0) {
          usersSkipped++;
        }
        totalMemoriesStored += result.memoriesStored;
      } catch (err) {
        errors++;
        logger.error('[TimelineScanService] Failed to scan user', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result: TimelineScanBatchResult = {
      usersScanned: usersWithRecentPosts.size,
      totalMemoriesStored,
      usersSkipped,
      errors,
    };

    logger.info('[TimelineScanService] Batch scan complete', { ...result });
    return result;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Fetch posts from Firestore for the given scope.
   * Returns raw post records ordered by recency (newest first).
   */
  private async fetchPosts(
    userId: string,
    scope: 'user' | 'team' | 'both',
    teamId: string | undefined,
    limit: number
  ): Promise<PostRecord[]> {
    const postsCollection = this.db.collection(POSTS_COLLECTIONS.POSTS);
    const results: PostRecord[] = [];

    if (scope === 'user' || scope === 'both') {
      const userSnap = await postsCollection
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      for (const doc of userSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        results.push(this.toPostRecord(doc.id, data));
      }
    }

    if ((scope === 'team' || scope === 'both') && teamId) {
      const teamSnap = await postsCollection
        .where('teamId', '==', teamId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      for (const doc of teamSnap.docs) {
        if (!results.find((p) => p.id === doc.id)) {
          const data = doc.data() as Record<string, unknown>;
          results.push(this.toPostRecord(doc.id, data));
        }
      }
    }

    // Sort combined results newest-first and cap at limit
    return results
      .sort((a, b) => {
        const ta = a.createdAt ?? '';
        const tb = b.createdAt ?? '';
        return tb.localeCompare(ta);
      })
      .slice(0, limit);
  }

  /** Map a raw Firestore document to a typed PostRecord. */
  private toPostRecord(id: string, data: Record<string, unknown>): PostRecord {
    const createdAt =
      data['createdAt'] != null &&
      typeof (data['createdAt'] as { toDate?: unknown }).toDate === 'function'
        ? (data['createdAt'] as { toDate: () => Date }).toDate().toISOString()
        : typeof data['createdAt'] === 'string'
          ? data['createdAt']
          : undefined;

    return {
      id,
      type: typeof data['type'] === 'string' ? data['type'] : undefined,
      content: typeof data['content'] === 'string' ? data['content'] : undefined,
      title: typeof data['title'] === 'string' ? data['title'] : undefined,
      hashtags: Array.isArray(data['hashtags'])
        ? (data['hashtags'] as unknown[]).filter((h): h is string => typeof h === 'string')
        : [],
      createdAt,
    };
  }

  /**
   * Build a compact, token-efficient digest of posts for the extraction prompt.
   * Each post is rendered as a single labeled line.
   */
  private buildDigest(posts: readonly PostRecord[]): string {
    const lines: string[] = ['Timeline posts (newest first):'];
    for (const post of posts) {
      const date = post.createdAt ? post.createdAt.slice(0, 10) : '(date unknown)';
      const type = post.type ? `[${post.type}]` : '[post]';
      const title = post.title ? `"${post.title}" — ` : '';
      const content = post.content
        ? post.content.length > MAX_POST_CONTENT_CHARS
          ? post.content.slice(0, MAX_POST_CONTENT_CHARS) + '…'
          : post.content
        : '(no text content)';
      const tags =
        post.hashtags && post.hashtags.length > 0
          ? ` ${post.hashtags.map((h) => `#${h}`).join(' ')}`
          : '';

      lines.push(`${date} ${type} ${title}${content}${tags}`);
    }
    return lines.join('\n');
  }

  /**
   * Store extracted facts as vector memories, skipping exact duplicates.
   * Returns the number of memories successfully stored.
   */
  private async storeFacts(
    facts: Array<{ content: string; category: string; target?: string }>,
    userId: string,
    teamId?: string
  ): Promise<number> {
    let stored = 0;
    for (const fact of facts) {
      if (
        !fact.content ||
        typeof fact.content !== 'string' ||
        !fact.category ||
        !VALID_CATEGORIES.includes(fact.category as AgentMemoryCategory)
      ) {
        continue;
      }

      // Resolve target — fall back to 'user' when required IDs are unavailable.
      let target: AgentMemoryTarget = VALID_TARGETS.includes(fact.target as AgentMemoryTarget)
        ? (fact.target as AgentMemoryTarget)
        : 'user';

      if (target === 'team' && !teamId) target = 'user';
      if (target === 'organization') target = 'user'; // organizationId not in scope

      // Dedup guard: skip if an identical content+category already exists
      const existing = await AgentMemoryModel.findOne({
        userId,
        target,
        content: fact.content,
        category: fact.category,
      }).lean();
      if (existing) continue;

      try {
        await this.vectorMemory.store(
          userId,
          fact.content,
          fact.category as AgentMemoryCategory,
          { source: 'timeline_scan' },
          { target, ...(target === 'team' ? { teamId } : {}) }
        );
        stored++;
      } catch (err) {
        logger.warn('[TimelineScanService] Failed to store extracted fact', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return stored;
  }
}

// ─── Internal Types ────────────────────────────────────────────────────────────

interface PostRecord {
  id: string;
  type?: string;
  content?: string;
  title?: string;
  hashtags?: string[];
  createdAt?: string;
}
