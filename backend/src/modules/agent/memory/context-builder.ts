/**
 * @fileoverview Context Builder — Profile Hydration Pipeline
 * @module @nxt1/backend/modules/agent/memory
 *
 * The ContextBuilder is the FIRST thing that runs before any agent processes
 * a request. It fetches the user's complete profile and compresses it into
 * a token-efficient AgentUserContext object.
 *
 * This context is injected into AgentSessionContext so every sub-agent
 * naturally "knows" who the user is without the user having to explain.
 *
 * Architecture:
 * ┌──────────────────┐
 * │ User sends prompt │
 * └────────┬─────────┘
 *          ▼
 * ┌──────────────────────────────────────────────────────┐
 * │ Context Builder (THIS FILE)                          │
 * │  1. Check Redis cache for assembled context          │
 * │  2. On miss → fetch user via getUserById (cached)    │
 * │  3. Extract athletic, recruiting, engagement data    │
 * │  4. Map connected accounts from social/sources       │
 * │  5. Assemble & cache AgentUserContext in Redis       │
 * └────────┬─────────────────────────────────────────────┘
 *          ▼
 * ┌──────────────────┐
 * │ Planner Agent     │  ← Now knows everything about the user
 * └──────────────────┘
 *
 * Caching strategy:
 * - Layer 1: Assembled AgentUserContext cached in Redis (15 min TTL)
 * - Layer 2: getUserById already caches raw Firestore doc in Redis (15 min TTL)
 * - Result: Repeat agent calls within 15 min cost ZERO database reads
 *
 * Cache invalidation:
 * - Call `invalidateContext(userId)` when profile is updated
 * - getUserById cache is separately invalidated by the profile update flow
 */

import type { AgentUserContext, AgentConnectedAccount } from '@nxt1/core';
import { getFirestore } from 'firebase-admin/firestore';
import { getUserById, type UserData } from '../../../services/users.service.js';
import { getCacheService, CACHE_TTL } from '../../../services/cache.service.js';
import { TeamServiceAdapter } from '../../../services/team-adapter.service.js';
import { AgentMessageModel } from '../../../models/agent-message.model.js';
import { AgentThreadModel } from '../../../models/agent-thread.model.js';
import { logger } from '../../../utils/logger.js';

/** Cache key prefix for assembled agent context. Exported so callers can build/invalidate the same key without hardcoding. */
export const AGENT_CONTEXT_PREFIX = 'agent:context:';

/** TTL for the assembled context (same as profile: 15 min). */
const AGENT_CONTEXT_TTL = CACHE_TTL.PROFILES;

/**
 * Parse a height string (e.g., "6'2\"", "6-2", "74") into total inches.
 * Returns undefined if the string is unparseable.
 */
function parseHeightToInches(height: string | undefined): number | undefined {
  if (!height) return undefined;

  // Already a plain number (total inches)
  const plain = Number(height);
  if (!isNaN(plain) && plain > 0) return plain;

  // Feet'Inches" or Feet-Inches
  const match = height.match(/(\d+)\s*['-]\s*(\d+)/);
  if (match) {
    return Number(match[1]) * 12 + Number(match[2]);
  }

  return undefined;
}

/**
 * Parse a weight string (e.g., "195", "195lb", "195 lbs") into a number.
 */
function parseWeight(weight: string | undefined): number | undefined {
  if (!weight) return undefined;
  const num = parseInt(weight, 10);
  return isNaN(num) ? undefined : num;
}

export class ContextBuilder {
  /**
   * Build the full hydrated context for a user.
   * Checks Redis cache first; on miss fetches from the users service
   * (which itself caches the raw Firestore doc in Redis).
   *
   * @param userId - The Firebase UID of the user.
   * @param firestore - Optional Firestore instance (for staging vs production).
   * @returns A compressed, token-efficient context object.
   */
  async buildContext(
    userId: string,
    firestore?: FirebaseFirestore.Firestore
  ): Promise<AgentUserContext> {
    const cacheKey = `${AGENT_CONTEXT_PREFIX}${userId}`;

    // ── Step 1: Check Redis for fully assembled context ───────────────────
    try {
      const cache = getCacheService();
      const cached = await cache.get<AgentUserContext>(cacheKey);
      if (cached) {
        logger.debug('[ContextBuilder] ✅ Cache HIT', { userId });
        return cached;
      }
    } catch {
      // Cache unavailable — fall through to fetch
      logger.warn('[ContextBuilder] Cache read failed, fetching fresh', { userId });
    }

    logger.info('[ContextBuilder] Cache MISS — building context', { userId });

    // ── Step 2: Fetch user doc via users service (itself Redis-cached) ────
    const user = await getUserById(userId, firestore);

    if (!user) {
      logger.warn('[ContextBuilder] User not found, returning minimal context', { userId });
      return {
        userId,
        role: 'athlete',
        displayName: 'Unknown User',
        subscriptionTier: 'free',
      };
    }

    // ── Step 3: Map the raw Firestore doc to AgentUserContext ─────────────
    let context = this.mapUserToContext(userId, user);

    // ── Step 3b: Resolve teamId via RosterEntries if not on user doc ─────
    if (!context.teamId) {
      try {
        const db = firestore ?? getFirestore();
        const teamAdapter = new TeamServiceAdapter(db);
        const userTeams = await teamAdapter.getUserTeams(userId);

        if (userTeams.length > 0) {
          const activeTeam = userTeams[0];
          context = {
            ...context,
            teamId: activeTeam.id,
            organizationId: activeTeam.organizationId ?? context.organizationId,
          };
          logger.info('[ContextBuilder] Resolved teamId via RosterEntries', {
            userId,
            teamId: activeTeam.id,
            organizationId: activeTeam.organizationId,
          });
        }
      } catch (teamErr) {
        logger.warn('[ContextBuilder] Failed to resolve team for user', {
          userId,
          error: teamErr instanceof Error ? teamErr.message : String(teamErr),
        });
      }
    }

    // ── Step 4: Cache the assembled context ───────────────────────────────
    try {
      const cache = getCacheService();
      await cache.set(cacheKey, context, { ttl: AGENT_CONTEXT_TTL });
      logger.debug('[ContextBuilder] ✅ Cached assembled context', {
        userId,
        ttl: AGENT_CONTEXT_TTL,
      });
    } catch {
      logger.warn('[ContextBuilder] Failed to cache context', { userId });
    }

    return context;
  }

  /**
   * Invalidate the cached context for a user.
   * Call this when the user updates their profile, subscription, or connected accounts.
   */
  async invalidateContext(userId: string): Promise<void> {
    try {
      const cache = getCacheService();
      await cache.del(`${AGENT_CONTEXT_PREFIX}${userId}`);
      logger.info('[ContextBuilder] Context cache invalidated', { userId });
    } catch {
      logger.warn('[ContextBuilder] Failed to invalidate context cache', { userId });
    }
  }

  /**
   * Converts the hydrated context into a compressed string for injection
   * into the agent's system prompt. This keeps token usage minimal.
   *
   * Example output:
   * "User: John Doe | Role: Athlete | Sport: Football | Pos: QB | Class: 2027
   *  School: Lincoln HS, Dallas TX | GPA: 3.8 | Height: 6'2" | Weight: 195lb
   *  Targets: D1, D2 | Top Schools: Georgia, Texas, Ohio State
   *  Status: Uncommitted | Tier: Premium | Profile: 85% complete"
   */
  compressToPrompt(context: AgentUserContext): string {
    const lines: string[] = [];

    const teamPart = context.teamId ? ` | TeamID: ${context.teamId}` : '';
    const orgPart = context.organizationId ? ` | OrgID: ${context.organizationId}` : '';
    lines.push(
      `User: ${context.displayName} | Role: ${context.role} | Tier: ${context.subscriptionTier} | UserID: ${context.userId}${teamPart}${orgPart}`
    );

    if (context.sport) {
      const pos = context.position ? ` | Pos: ${context.position}` : '';
      const gradYear = context.graduationYear ? ` | Class: ${context.graduationYear}` : '';
      lines.push(`Sport: ${context.sport}${pos}${gradYear}`);
    }

    if (context.school) {
      const loc = [context.city, context.state].filter(Boolean).join(', ');
      lines.push(`School: ${context.school}${loc ? `, ${loc}` : ''}`);
    }

    if (context.gpa || context.heightInches || context.weightLbs) {
      const parts: string[] = [];
      if (context.gpa) parts.push(`GPA: ${context.gpa}`);
      if (context.heightInches) {
        const ft = Math.floor(context.heightInches / 12);
        const inches = context.heightInches % 12;
        parts.push(`Height: ${ft}'${inches}"`);
      }
      if (context.weightLbs) parts.push(`Weight: ${context.weightLbs}lb`);
      lines.push(parts.join(' | '));
    }

    if (context.targetDivisions?.length || context.targetColleges?.length) {
      const divs = context.targetDivisions?.length
        ? `Targets: ${context.targetDivisions.join(', ')}`
        : '';
      const cols = context.targetColleges?.length
        ? `Top Schools: ${context.targetColleges.slice(0, 5).join(', ')}`
        : '';
      lines.push([divs, cols].filter(Boolean).join(' | '));
    }

    if (context.commitmentStatus) {
      lines.push(`Status: ${context.commitmentStatus}`);
    }

    if (context.connectedAccounts?.length) {
      // Exclude social media platforms entirely — agents cannot scrape them (auth required)
      // and knowing the user has instagram/twitter connected adds no actionable value.
      // Only show platforms that agents can actually use (hudl, maxpreps, gmail, etc.)
      const SOCIAL_MEDIA_PLATFORMS = new Set([
        'instagram',
        'twitter',
        'tiktok',
        'facebook',
        'snapchat',
        'threads',
        'x',
      ]);
      const accountParts = context.connectedAccounts
        .filter((a) => a.isTokenValid && !SOCIAL_MEDIA_PLATFORMS.has(a.provider.toLowerCase()))
        .map((a) => (a.profileUrl ? `${a.provider} (${a.profileUrl})` : a.provider));
      if (accountParts.length) lines.push(`Connected: ${accountParts.join(', ')}`);
    }

    if (context.profileCompletionPercent !== undefined) {
      lines.push(
        `Profile: ${context.profileCompletionPercent}% complete | Views: ${context.totalProfileViews ?? 0}`
      );
    }

    return lines.join('\n');
  }

  // ─── Internal Mapping ────────────────────────────────────────────────────

  /**
   * Map a raw Firestore user document into a clean AgentUserContext.
   * Extracts active sport, physical attributes, location, coach data,
   * connected accounts, and engagement metrics from the single user doc.
   */
  private mapUserToContext(userId: string, user: UserData): AgentUserContext {
    const role = (user['role'] as string) ?? 'athlete';

    // Build display name from available fields
    const firstName = user['firstName'] as string | undefined;
    const lastName = user['lastName'] as string | undefined;
    const displayName =
      (user['displayName'] as string) ??
      ([firstName, lastName].filter(Boolean).join(' ') || 'Unknown User');

    // Resolve subscription tier
    const subscriptionTier = (user['planTier'] as string) ?? 'free';

    // ── Active sport profile ──────────────────────────────────────────────
    const sports = user['sports'] as Array<Record<string, unknown>> | undefined;
    const activeSportIndex = (user['activeSportIndex'] as number) ?? 0;
    const activeSport = sports?.[activeSportIndex] ?? sports?.[0];

    const sport = (activeSport?.['sport'] as string) ?? (user['primarySport'] as string);
    const positions = activeSport?.['positions'] as string[] | undefined;
    const position = positions?.[0];

    // ── Physical attributes ───────────────────────────────────────────────
    // Try top-level fields first (some docs store height/weight at root),
    // then fall back to metrics inside the active sport profile
    const heightInches =
      parseHeightToInches(user['height'] as string | undefined) ??
      parseHeightToInches(
        (activeSport?.['metrics'] as Record<string, string> | undefined)?.['height']
      );
    const weightLbs =
      parseWeight(user['weight'] as string | undefined) ??
      parseWeight((activeSport?.['metrics'] as Record<string, string> | undefined)?.['weight']);

    // ── Athlete / graduation data ─────────────────────────────────────────
    const athlete = user['athlete'] as Record<string, unknown> | undefined;
    const graduationYear =
      (athlete?.['classOf'] as number | undefined) ?? (user['classOf'] as number | undefined);

    // GPA: check metrics inside the active sport profile
    const gpaRaw = (activeSport?.['metrics'] as Record<string, string> | undefined)?.['gpa'];
    const gpa = gpaRaw ? parseFloat(gpaRaw) : undefined;

    // ── Location ──────────────────────────────────────────────────────────
    const location = user['location'] as Record<string, string> | undefined;
    const city = location?.['city'] ?? (user['city'] as string | undefined);
    const state = location?.['state'] ?? (user['state'] as string | undefined);

    // ── School ────────────────────────────────────────────────────────────
    const school =
      (user['highSchool'] as string | undefined) ?? (athlete?.['highSchool'] as string | undefined);

    // ── Team context (from active sport profile) ─────────────────────────
    const activeSportTeam = activeSport?.['team'] as Record<string, unknown> | undefined;
    const teamId = activeSportTeam?.['teamId'] as string | undefined;
    const organizationId = activeSportTeam?.['organizationId'] as string | undefined;

    // ── Coach-specific ────────────────────────────────────────────────────
    const coach = user['coach'] as Record<string, unknown> | undefined;
    const coachProgram = coach?.['organization'] as string | undefined;
    const coachDivision = coach?.['division'] as string | undefined;
    const coachSport = role === 'coach' ? sport : undefined;

    // ── Connected accounts from social links & connected sources ──────────
    const connectedAccounts = this.extractConnectedAccounts(user);

    // ── Engagement metrics from counters ──────────────────────────────────
    const counters = user['_counters'] as Record<string, unknown> | undefined;
    const totalProfileViews = counters?.['profileViews'] as number | undefined;

    // Profile completion: check onboarding
    const onboardingCompleted = user['onboardingCompleted'] as boolean | undefined;
    const profileCompletionPercent = onboardingCompleted ? 100 : this.estimateCompletion(user);

    const lastActiveAt = (user['lastLoginAt'] as string) ?? (user['updatedAt'] as string);

    // ── Recruiting context (athlete-only) ─────────────────────────────────
    const recruitingData = role === 'athlete' ? this.extractRecruitingData(user) : undefined;

    return {
      userId,
      role,
      displayName,
      subscriptionTier,

      // Athletic data
      sport,
      position,
      heightInches,
      weightLbs,
      graduationYear,
      gpa: gpa && !isNaN(gpa) ? gpa : undefined,
      school,
      city,
      state,

      // Recruiting
      targetDivisions: recruitingData?.targetDivisions,
      targetColleges: recruitingData?.targetColleges,
      recruitingStatus: recruitingData?.recruitingStatus,
      commitmentStatus: recruitingData?.commitmentStatus,

      // Engagement
      profileCompletionPercent,
      totalProfileViews,
      lastActiveAt,

      // Connected accounts
      connectedAccounts,

      // Team context
      teamId,
      organizationId,

      // Coach-specific
      coachProgram,
      coachDivision,
      coachSport,
    };
  }

  /**
   * Extract connected accounts from social links and connectedSources.
   */
  private extractConnectedAccounts(user: UserData): AgentConnectedAccount[] {
    const accounts: AgentConnectedAccount[] = [];

    // From social links (e.g., twitter, instagram, hudl)
    const social = user['social'] as Array<Record<string, unknown>> | undefined;
    if (social) {
      for (const link of social) {
        const platform = link['platform'] as string | undefined;
        if (platform) {
          accounts.push({
            provider: platform,
            email: link['email'] as string | undefined,
            isTokenValid: (link['connected'] as boolean) ?? true,
            lastSyncAt: link['lastSyncedAt'] as string | undefined,
          });
        }
      }
    }

    // From connectedSources (verified data imports: maxpreps, hudl, etc.)
    const sources = user['connectedSources'] as Array<Record<string, unknown>> | undefined;
    if (sources) {
      for (const src of sources) {
        const platform = src['platform'] as string | undefined;
        if (platform && !accounts.some((a) => a.provider === platform)) {
          accounts.push({
            provider: platform,
            isTokenValid: src['syncStatus'] !== 'error',
            lastSyncAt: src['lastSyncedAt'] as string | undefined,
            profileUrl: src['profileUrl'] as string | undefined,
          });
        }
      }
    }

    // From connectedEmails (Gmail integration)
    const emails = user['connectedEmails'] as Array<Record<string, unknown>> | undefined;
    if (emails) {
      for (const email of emails) {
        accounts.push({
          provider: 'gmail',
          email: email['email'] as string | undefined,
          isTokenValid: (email['isValid'] as boolean) ?? true,
          lastSyncAt: email['lastSyncedAt'] as string | undefined,
        });
      }
    }

    return accounts;
  }

  /**
   * Extract recruiting data from the user document.
   * Checks athlete sub-object and top-level fields.
   */
  private extractRecruitingData(user: UserData): {
    targetDivisions?: string[];
    targetColleges?: string[];
    recruitingStatus?: string;
    commitmentStatus?: string;
  } {
    const athlete = user['athlete'] as Record<string, unknown> | undefined;
    return {
      targetDivisions: (athlete?.['targetDivisions'] as string[]) ?? undefined,
      targetColleges: (athlete?.['targetColleges'] as string[]) ?? undefined,
      recruitingStatus: (athlete?.['recruitingStatus'] as string) ?? 'active',
      commitmentStatus: (athlete?.['commitmentStatus'] as string) ?? 'uncommitted',
    };
  }

  /**
   * Estimate profile completion percentage based on key fields.
   * Returns a rough percentage for profiles that haven't completed onboarding.
   */
  private estimateCompletion(user: UserData): number {
    const checks = [
      !!user['firstName'],
      !!user['profileImgs'] && (user['profileImgs'] as string[]).length > 0,
      !!(user['sports'] as unknown[] | undefined)?.length,
      !!user['location'],
      !!user['aboutMe'],
      !!user['height'] || !!user['weight'],
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }

  // ─── Thread History (Parallel Conversation Memory) ─────────────────────

  /** Max characters per message before truncation in thread history context. */
  private static readonly THREAD_HISTORY_MAX_CHARS = 500;

  /** Max messages that can ever be fetched for thread history. */
  private static readonly THREAD_HISTORY_MAX_MESSAGES = 50;

  /** Delimiters used to frame thread history — stripped from message content to prevent prompt injection. */
  private static readonly HISTORY_START_DELIMITER = '--- Recent conversation history ---';
  private static readonly HISTORY_END_DELIMITER = '--- End conversation history ---';

  /**
   * Retrieve recent messages for a specific thread, formatted for injection
   * into the agent's system prompt. This gives conversation continuity.
   *
   * @param threadId - The MongoDB thread ID to pull history from.
   * @param maxMessages - Maximum number of messages to retrieve (default: 20).
   * @returns A formatted string of recent exchanges, or empty string if none.
   */
  async getRecentThreadHistory(threadId: string, maxMessages = 20): Promise<string> {
    // Hard cap to prevent unbounded memory usage
    const limit = Math.min(maxMessages, ContextBuilder.THREAD_HISTORY_MAX_MESSAGES);

    try {
      const messages = await AgentMessageModel.find({ threadId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('role content createdAt agentId')
        .lean()
        .exec();

      if (!messages.length) return '';

      // Reverse to chronological order
      const chronological = messages.reverse();

      const lines = chronological.map((m) => {
        const label = m.role === 'user' ? 'User' : `Agent X${m.agentId ? ` (${m.agentId})` : ''}`;
        // Truncate very long messages to keep token usage reasonable
        let content =
          m.content.length > ContextBuilder.THREAD_HISTORY_MAX_CHARS
            ? m.content.slice(0, ContextBuilder.THREAD_HISTORY_MAX_CHARS) + '...'
            : m.content;
        // Strip delimiter strings from message content to prevent prompt injection (C4 fix)
        content = content
          .replaceAll(ContextBuilder.HISTORY_START_DELIMITER, '')
          .replaceAll(ContextBuilder.HISTORY_END_DELIMITER, '');
        return `[${label}]: ${content}`;
      });

      return `\n${ContextBuilder.HISTORY_START_DELIMITER}\n${lines.join('\n')}\n${ContextBuilder.HISTORY_END_DELIMITER}`;
    } catch (err) {
      logger.warn('[ContextBuilder] Failed to fetch thread history', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  /**
   * Get a summary of the user's active (non-archived) threads.
   * Used by the PlannerAgent to understand what conversations are in flight.
   *
   * @param userId - The user's Firebase UID.
   * @param maxThreads - Maximum threads to summarize (default: 5).
   * @returns Formatted string listing active threads.
   */
  async getActiveThreadsSummary(userId: string, maxThreads = 5): Promise<string> {
    try {
      const threads = await AgentThreadModel.find({ userId, archived: false })
        .sort({ lastMessageAt: -1 })
        .limit(maxThreads)
        .select('title category messageCount lastMessageAt')
        .lean()
        .exec();

      if (!threads.length) return '';

      const lines = threads.map(
        (t, i) =>
          `${i + 1}. "${t.title}" (${t.category ?? 'general'}, ${t.messageCount} messages, last active: ${t.lastMessageAt})`
      );

      return `\nActive conversations:\n${lines.join('\n')}`;
    } catch (err) {
      logger.warn('[ContextBuilder] Failed to fetch active threads summary', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }
}
