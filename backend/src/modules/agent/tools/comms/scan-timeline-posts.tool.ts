/**
 * @fileoverview Scan Timeline Posts Tool — Extract Durable Context from Social Posts
 * @module @nxt1/backend/modules/agent/tools/comms
 *
 * Reads recent posts from a user's (and optionally a team's) Firestore timeline,
 * uses an LLM to extract durable facts (achievements, stats, recruiting milestones,
 * goals, announcements), and stores them as vector memories so future agent
 * conversations automatically receive relevant post context without needing
 * to re-query the feed on every run.
 *
 * This is the social-feed analogue of MemorySummarizationService, which does the
 * same extraction for conversation transcripts. Here, the "transcript" is a
 * curated digest of recent timeline posts.
 *
 * Design decisions:
 * - Uses the 'extraction' tier (cheap model) to keep costs low.
 * - Hard-caps at 50 posts to bound prompt size and latency.
 * - Deduplicates extracted facts before storing (same content + category guard).
 * - isMutation = true because it writes to the vector memory store.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type {
  AgentIdentifier,
  AgentMemoryCategory,
  AgentMemoryTarget,
  AgentToolCategory,
} from '@nxt1/core';
import { POSTS_COLLECTIONS } from '@nxt1/core/constants';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';
import { AgentMemoryModel } from '../../memory/vector.service.js';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum posts to scan per invocation (keeps prompt size bounded). */
const MAX_POSTS = 50;

/** Maximum characters to include from a single post's content field. */
const MAX_POST_CONTENT_CHARS = 500;

/** Categories the LLM is allowed to emit. */
const VALID_CATEGORIES: readonly AgentMemoryCategory[] = [
  'preference',
  'goal',
  'recruiting_context',
  'performance_data',
];

const VALID_TARGETS: readonly AgentMemoryTarget[] = ['user', 'team', 'organization'];

/**
 * System prompt for the post-scanning extraction model.
 * Mirrors the extraction logic in MemorySummarizationService but adapted
 * for social feed posts rather than conversation transcripts.
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

// ─── Tool Class ────────────────────────────────────────────────────────────────

export class ScanTimelinePostsTool extends BaseTool {
  readonly name = 'scan_timeline_posts';
  readonly description =
    "Scan recent posts on a user's (and optionally their team's) social timeline to extract important context — " +
    'such as stats, achievements, recruiting milestones, and goals — and store them as long-term memories. ' +
    'Use this to build rich context about what the athlete has been publicly sharing before starting analysis or ' +
    'recruiting workflows. Results feed directly into future prompt context retrieval.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the user whose timeline to scan.\n' +
    '- scope (optional): "user" (default) | "team" | "both" — which timelines to scan.\n' +
    '- teamId (optional): Required when scope is "team" or "both".\n' +
    '- limit (optional): Number of recent posts to scan (1–50, default 20).';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Firebase UID of the user whose timeline to scan.',
      },
      scope: {
        type: 'string',
        enum: ['user', 'team', 'both'],
        description:
          'Which timeline(s) to scan. "user" scans only the user\'s own posts. ' +
          '"team" scans the team feed (requires teamId). "both" scans both.',
        default: 'user',
      },
      teamId: {
        type: 'string',
        description:
          'Team ID to scope team-feed scanning. Required when scope is "team" or "both".',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: MAX_POSTS,
        description: `Number of recent posts to include (1–${MAX_POSTS}, default 20).`,
      },
    },
    required: ['userId'],
  } as const;

  readonly isMutation = true;
  readonly category: AgentToolCategory = 'communication';

  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = [
    'data_coordinator',
    'general',
    'recruiting_coordinator',
    'performance_coordinator',
  ];

  constructor(
    private readonly db: Firestore,
    private readonly llm: OpenRouterService,
    private readonly vectorMemory: VectorMemoryService
  ) {
    super();
  }

  // ─── Execute ───────────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Required parameters ──────────────────────────────────────────────
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    const scopeRaw = this.str(input, 'scope') ?? 'user';
    const scope = ['user', 'team', 'both'].includes(scopeRaw)
      ? (scopeRaw as 'user' | 'team' | 'both')
      : 'user';

    const teamId = this.str(input, 'teamId');

    if ((scope === 'team' || scope === 'both') && !teamId) {
      return {
        success: false,
        error: 'Parameter "teamId" is required when scope is "team" or "both".',
      };
    }

    const limitRaw = this.num(input, 'limit');
    const limit = Math.min(Math.max(limitRaw ?? 20, 1), MAX_POSTS);

    try {
      context?.onProgress?.('Fetching timeline posts…');
      const posts = await this.fetchPosts(userId, scope, teamId ?? undefined, limit);

      if (posts.length === 0) {
        return {
          success: true,
          data: {
            postsScanned: 0,
            memoriesStored: 0,
            message: 'No timeline posts found to scan.',
          },
        };
      }

      context?.onProgress?.(`Analyzing ${posts.length} posts for key context…`);
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
          jsonMode: true,
          telemetryContext: {
            operationId: `scan-timeline-posts-${userId}`,
            userId,
            agentId: 'data_coordinator',
            feature: 'scan-timeline-posts',
          },
        }
      );

      if (!completion.content) {
        return {
          success: true,
          data: {
            postsScanned: posts.length,
            memoriesStored: 0,
            message: 'No durable facts could be extracted from the scanned posts.',
          },
        };
      }

      let facts: Array<{ content: string; category: string; target?: string }>;
      try {
        const parsed = JSON.parse(completion.content);
        facts = Array.isArray(parsed) ? parsed : [];
      } catch {
        logger.warn('[ScanTimelinePostsTool] Failed to parse extraction JSON', {
          userId,
          raw: completion.content.slice(0, 500),
        });
        return {
          success: true,
          data: {
            postsScanned: posts.length,
            memoriesStored: 0,
            message: 'Extraction model returned an unparseable response. No memories stored.',
          },
        };
      }

      context?.onProgress?.(`Storing ${facts.length} extracted facts to memory…`);
      const stored = await this.storeFacts(facts, userId);

      logger.info('[ScanTimelinePostsTool] Scan complete', {
        userId,
        scope,
        postsScanned: posts.length,
        factsExtracted: facts.length,
        memoriesStored: stored,
      });

      return {
        success: true,
        data: {
          postsScanned: posts.length,
          factsExtracted: facts.length,
          memoriesStored: stored,
          message:
            stored > 0
              ? `Scanned ${posts.length} posts and stored ${stored} new memory fact(s) for future context.`
              : `Scanned ${posts.length} posts — no new facts to add (all already known or none found).`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during timeline scan';
      logger.error('[ScanTimelinePostsTool] Scan failed', { error: message, userId });
      return { success: false, error: message };
    }
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
    userId: string
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

      const target: AgentMemoryTarget = VALID_TARGETS.includes(fact.target as AgentMemoryTarget)
        ? (fact.target as AgentMemoryTarget)
        : 'user';

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
          { target }
        );
        stored++;
      } catch (err) {
        logger.warn('[ScanTimelinePostsTool] Failed to store extracted fact', {
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
