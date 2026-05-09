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

import type {
  AgentConnectedAccount,
  AgentPromptContext,
  AgentRetrievedMemories,
  AgentUserContext,
} from '@nxt1/core';
import {
  buildCanonicalProfilePath,
  buildCanonicalTeamPath,
  resolveCanonicalTeamRoute,
} from '@nxt1/core';
import { getFirestore } from 'firebase-admin/firestore';
import { getUserById, type UserData } from '../../../services/profile/users.service.js';
import { getCacheService, CACHE_TTL } from '../../../services/core/cache.service.js';
import { TeamServiceAdapter } from '../../../adapters/team.adapter.js';
import { getSyncDeltaEventService } from '../../../services/core/sync-delta-event.service.js';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { AgentThreadModel } from '../../../models/agent/agent-thread.model.js';
import type { VectorMemoryService } from './vector.service.js';
import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../config/runtime-environment.js';
import {
  type AgentSeasonInfo,
  getAgentAppConfig,
  resolveRolePersona as resolveConfiguredRolePersona,
  resolveSeasonInfo as resolveConfiguredSeasonInfo,
} from '../config/agent-app-config.js';
import { logger } from '../../../utils/logger.js';
import { resolveAppBaseUrl, toAbsoluteAppUrl } from '../../../utils/app-url.js';

/** Cache key prefix for assembled agent context. Exported so callers can build/invalidate the same key without hardcoding. */
export const AGENT_CONTEXT_PREFIX = 'agent:context:';

/** TTL for the assembled context (same as profile: 15 min). */
const AGENT_CONTEXT_TTL = CACHE_TTL.PROFILES;

const MEMORY_RECALL_TIMEOUT_MS = 1200;
const RECENT_SYNC_TIMEOUT_MS = 800;
const MEMORY_RESULTS_PER_TARGET = 3;
const RECENT_SYNC_RESULTS_LIMIT = 4;

const EMPTY_RETRIEVED_MEMORIES: AgentRetrievedMemories = {
  user: [],
  team: [],
  organization: [],
};

type TeamLike = {
  id?: string;
  organizationId?: string;
  sportName?: string;
  sport?: string;
};

/**
 * Parse a height string (e.g., "6'2\"", "6-2", "74") into total inches.
 * Returns undefined if the string is unparseable.
 */
function parseHeightToInches(height: string | undefined): number | undefined {
  if (!height) return undefined;

  const plain = Number(height);
  if (!isNaN(plain) && plain > 0) return plain;

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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

type TeamLinkCandidate = {
  sport?: string;
  teamName?: string;
  slug?: string;
  teamCode?: string;
  id?: string;
};

interface PromptCompressionOptions {
  readonly environment?: RuntimeEnvironment;
  readonly appBaseUrl?: string;
  readonly origin?: string;
  readonly referer?: string;
}

function dedupeProfilePathsBySport(
  links: Array<{ sport: string; path: string }>
): Array<{ sport: string; path: string }> {
  const seen = new Set<string>();
  const unique: Array<{ sport: string; path: string }> = [];

  for (const link of links) {
    const key = `${link.sport.toLowerCase()}::${link.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }

  return unique;
}

function dedupeTeamPaths(
  links: Array<{ sport?: string; teamName?: string; teamCode: string; path: string }>
): Array<{ sport?: string; teamName?: string; teamCode: string; path: string }> {
  const seen = new Set<string>();
  const unique: Array<{ sport?: string; teamName?: string; teamCode: string; path: string }> = [];

  for (const link of links) {
    const key = `${link.teamCode.toLowerCase()}::${link.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }

  return unique;
}

function isLikelyTeamDocumentIdentifier(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[A-Za-z0-9]{20,}$/.test(trimmed);
}

export class ContextBuilder {
  constructor(private readonly vectorMemory?: VectorMemoryService) {}

  /**
   * Build the full hydrated context for a user.
   * Checks Redis cache first; on miss fetches from the users service
   * (which itself caches the raw Firestore doc in Redis).
   */
  async buildContext(
    userId: string,
    firestore?: FirebaseFirestore.Firestore
  ): Promise<AgentUserContext> {
    const cacheKey = `${AGENT_CONTEXT_PREFIX}${userId}`;
    const db = firestore ?? getFirestore();

    try {
      const cache = getCacheService();
      const cached = await cache.get<AgentUserContext>(cacheKey);
      if (cached) {
        logger.debug('[ContextBuilder] ✅ Cache HIT', { userId });
        return cached;
      }
    } catch {
      logger.warn('[ContextBuilder] Cache read failed, fetching fresh', { userId });
    }

    logger.info('[ContextBuilder] Cache MISS — building context', { userId });
    await getAgentAppConfig(db);

    const user = await getUserById(userId, firestore);

    if (!user) {
      logger.warn('[ContextBuilder] User not found, returning minimal context', { userId });
      return {
        userId,
        role: 'athlete',
        displayName: 'Unknown User',
      };
    }

    let context = this.mapUserToContext(userId, user);
    context = await this.hydrateCanonicalTeamRoutes(context, db);

    if (!context.teamId) {
      try {
        const teamAdapter = new TeamServiceAdapter(db);
        const userTeams = await teamAdapter.getUserTeams(userId);
        const activeTeam = this.selectFallbackTeam(userTeams, context.sport);

        if (activeTeam?.id) {
          context = {
            ...context,
            teamId: activeTeam.id,
            organizationId: activeTeam.organizationId ?? context.organizationId,
          };
          logger.info('[ContextBuilder] Resolved teamId via RosterEntries', {
            userId,
            teamId: activeTeam.id,
            organizationId: activeTeam.organizationId,
            sport: context.sport,
          });
        }
      } catch (teamErr) {
        logger.warn('[ContextBuilder] Failed to resolve team for user', {
          userId,
          error: teamErr instanceof Error ? teamErr.message : String(teamErr),
        });
      }
    }

    const rawGoals = (user['agentGoals'] as Array<Record<string, unknown>> | undefined) ?? [];
    const activeGoals = rawGoals.slice(0, 5).map((g) => ({
      id: String(g['id'] ?? ''),
      text: String(g['text'] ?? ''),
      ...(g['category'] ? { category: String(g['category']) } : {}),
    }));
    if (activeGoals.length > 0) {
      context = { ...context, activeGoals };
    }

    try {
      const db = firestore ?? getFirestore();
      const playbookSummary = await this.withTimeout(
        (async () => {
          const snap = await db
            .collection('Users')
            .doc(userId)
            .collection('agent_playbooks')
            .orderBy('generatedAt', 'desc')
            .limit(1)
            .get();

          if (snap.empty) return undefined;
          const items = (snap.docs[0].data()['items'] ?? []) as Array<{ status?: string }>;
          return {
            playbookId: snap.docs[0].id,
            total: items.length,
            completed: items.filter((i) => i.status === 'complete').length,
            snoozed: items.filter((i) => i.status === 'snoozed').length,
          };
        })(),
        800,
        `playbook summary fetch timed out for ${userId}`
      );
      if (playbookSummary) {
        context = { ...context, currentPlaybookSummary: playbookSummary };
      }
    } catch {
      // Non-critical — context is still valid without playbook summary
    }

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

  async buildPromptContext(
    userId: string,
    query: string,
    firestore?: FirebaseFirestore.Firestore
  ): Promise<AgentPromptContext> {
    const profile = await this.buildContext(userId, firestore);
    const [memories, recentSyncSummaries] = await Promise.all([
      this.retrieveMemories(profile, query),
      this.retrieveRecentSyncSummaries(profile),
    ]);

    return { profile, memories, recentSyncSummaries };
  }

  async getMemoriesForContext(
    context: AgentUserContext,
    query: string
  ): Promise<AgentRetrievedMemories> {
    return this.retrieveMemories(context, query);
  }

  async getRecentSyncSummariesForContext(context: AgentUserContext): Promise<readonly string[]> {
    return this.retrieveRecentSyncSummaries(context);
  }

  async invalidateContext(userId: string): Promise<void> {
    try {
      const cache = getCacheService();
      await cache.del(`${AGENT_CONTEXT_PREFIX}${userId}`);
      logger.info('[ContextBuilder] Context cache invalidated', { userId });
    } catch {
      logger.warn('[ContextBuilder] Failed to invalidate context cache', { userId });
    }
  }

  compressToPrompt(
    context: AgentUserContext,
    memories: AgentRetrievedMemories = EMPTY_RETRIEVED_MEMORIES,
    recentSyncSummaries: readonly string[] = [],
    options: PromptCompressionOptions = {}
  ): string {
    const lines: string[] = [];
    const appBaseUrl = resolveAppBaseUrl({
      environment: options.environment ?? getRuntimeEnvironment(),
      appBaseUrl: options.appBaseUrl,
      origin: options.origin,
      referer: options.referer,
    });

    // Internal reference IDs — for tool arguments only, NEVER mention or display to the user.
    lines.push(`[User Profile]`);
    lines.push(`UserID: ${context.userId}`);
    if (context.teamId) lines.push(`TeamID: ${context.teamId}`);
    if (context.organizationId) lines.push(`OrgID: ${context.organizationId}`);

    lines.push(`User: ${context.displayName} | Role: ${context.role}`);

    if (context.sport) {
      const pos = context.position ? ` | Pos: ${context.position}` : '';
      const gradYear = context.graduationYear ? ` | Class: ${context.graduationYear}` : '';
      lines.push(`Sport: ${context.sport}${pos}${gradYear}`);
    }

    if (context.sports?.length) {
      const sportSummary = context.sports
        .slice(0, 8)
        .map((entry) => {
          const tags: string[] = [];
          if (entry.isActive) tags.push('active');
          if (entry.positions?.length) tags.push(`pos: ${entry.positions.join('/')}`);
          if (entry.teamName) tags.push(`team: ${entry.teamName}`);
          return tags.length > 0 ? `${entry.sport} (${tags.join(', ')})` : entry.sport;
        })
        .join(' | ');
      lines.push(`All Sports: ${sportSummary}`);
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

    if (context.connectedAccounts?.length) {
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

    const shouldShowProfileLinks = context.role === 'athlete';
    const hasExactNxt1Links =
      (shouldShowProfileLinks &&
        Boolean(context.profilePath || context.profilePathsBySport?.length)) ||
      Boolean(context.teamPath || context.teamPaths?.length);

    if (hasExactNxt1Links) {
      lines.push(
        'Use the exact NXT1 URLs below when referencing a profile or team. Do not invent, shorten, or rewrite them.'
      );
    }

    if (shouldShowProfileLinks && context.profilePath) {
      lines.push(`Profile URL: ${toAbsoluteAppUrl(context.profilePath, { appBaseUrl })}`);
    }

    if (shouldShowProfileLinks && context.profilePathsBySport?.length) {
      const profileLinks = context.profilePathsBySport
        .slice(0, 8)
        .map((link) => `${link.sport}: ${toAbsoluteAppUrl(link.path, { appBaseUrl })}`)
        .join(' | ');
      lines.push(`All Sport Profile URLs: ${profileLinks}`);
    }

    if (context.teamPath) {
      lines.push(`Team URL: ${toAbsoluteAppUrl(context.teamPath, { appBaseUrl })}`);
    }

    if (context.teamPaths?.length) {
      const teamLinks = context.teamPaths
        .slice(0, 8)
        .map(
          (link) =>
            `${link.teamName ?? link.teamCode}: ${toAbsoluteAppUrl(link.path, { appBaseUrl })}`
        )
        .join(' | ');
      lines.push(`Team URLs: ${teamLinks}`);
    }

    if (recentSyncSummaries.length) {
      lines.push(`Recent Sync Activity:\n- ${recentSyncSummaries.join('\n- ')}`);
    }

    if (context.activeGoals?.length) {
      const goalLines = context.activeGoals
        .map((g) => `"${g.text}"${g.category ? ` [${g.category}]` : ''}`)
        .join(', ');
      lines.push(`Active Goals (${context.activeGoals.length}): ${goalLines}`);
    }

    if (context.currentPlaybookSummary) {
      const { total, completed, snoozed } = context.currentPlaybookSummary;
      const active = total - completed - snoozed;
      lines.push(
        `This Week's Playbook: ${completed}/${total} done, ${active} active, ${snoozed} snoozed`
      );
    }

    if (memories.user.length) {
      lines.push(`User Memory: ${memories.user.map((memory) => memory.content).join(' | ')}`);
    }

    if (memories.team.length) {
      lines.push(`Team Memory: ${memories.team.map((memory) => memory.content).join(' | ')}`);
    }

    if (memories.organization.length) {
      lines.push(
        `Organization Memory: ${memories.organization.map((memory) => memory.content).join(' | ')}`
      );
    }

    return lines.join('\n');
  }

  private async retrieveMemories(
    context: AgentUserContext,
    query: string
  ): Promise<AgentRetrievedMemories> {
    if (!this.vectorMemory || !query.trim()) {
      return EMPTY_RETRIEVED_MEMORIES;
    }

    try {
      return await this.withTimeout(
        this.vectorMemory.recallByScope(context.userId, query, {
          teamId: context.teamId,
          organizationId: context.organizationId,
          perTargetLimit: MEMORY_RESULTS_PER_TARGET,
        }),
        MEMORY_RECALL_TIMEOUT_MS,
        `memory retrieval timed out for ${context.userId}`
      );
    } catch (err) {
      logger.warn('[ContextBuilder] Memory retrieval failed, continuing without memories', {
        userId: context.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return EMPTY_RETRIEVED_MEMORIES;
    }
  }

  private async retrieveRecentSyncSummaries(context: AgentUserContext): Promise<readonly string[]> {
    try {
      return await this.withTimeout(
        getSyncDeltaEventService().listRecentSummaries({
          userId: context.userId,
          teamId: context.teamId,
          organizationId: context.organizationId,
          limit: RECENT_SYNC_RESULTS_LIMIT,
        }),
        RECENT_SYNC_TIMEOUT_MS,
        `recent sync retrieval timed out for ${context.userId}`
      );
    } catch (err) {
      logger.warn(
        '[ContextBuilder] Recent sync retrieval failed, continuing without sync history',
        {
          userId: context.userId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      return [];
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private selectFallbackTeam(userTeams: readonly TeamLike[], sport?: string): TeamLike | undefined {
    if (!userTeams.length) return undefined;
    if (!sport) return userTeams[0];

    const normalizedSport = sport.trim().toLowerCase();
    return (
      userTeams.find((team) => {
        const teamSport = (team.sportName ?? team.sport ?? '').toString().trim().toLowerCase();
        return teamSport === normalizedSport;
      }) ?? userTeams[0]
    );
  }

  private async hydrateCanonicalTeamRoutes(
    context: AgentUserContext,
    db: FirebaseFirestore.Firestore
  ): Promise<AgentUserContext> {
    const teamDocIds = new Set<string>();

    if (context.teamId) {
      teamDocIds.add(context.teamId);
    }

    for (const entry of context.teamPaths ?? []) {
      if (isLikelyTeamDocumentIdentifier(entry.teamCode)) {
        teamDocIds.add(entry.teamCode);
      }
    }

    if (teamDocIds.size === 0) return context;

    try {
      const teamDocs = await Promise.all(
        Array.from(teamDocIds).map(async (teamDocId) => {
          const teamDoc = await db.collection('Teams').doc(teamDocId).get();
          if (!teamDoc.exists) return null;

          const team = (teamDoc.data() ?? {}) as Record<string, unknown>;
          const resolvedTeamRoute = resolveCanonicalTeamRoute({
            slug: asString(team['slug']) ?? asString(team['unicode']),
            teamName: asString(team['teamName']) ?? asString(team['name']),
            teamCode: asString(team['teamCode']),
            code: asString(team['code']),
            teamId: asString(team['teamId']) ?? teamDoc.id,
            id: asString(team['id']) ?? teamDoc.id,
            unicode: asString(team['unicode']),
          });

          if (!resolvedTeamRoute?.teamIdentifier) return null;

          return {
            docId: teamDocId,
            sport: asString(team['sport']) ?? asString(team['sportName']),
            teamName: resolvedTeamRoute.teamName,
            teamCode: resolvedTeamRoute.teamIdentifier,
            path: resolvedTeamRoute.path,
          };
        })
      );

      const canonicalByDocId = new Map(
        teamDocs
          .filter((entry): entry is NonNullable<(typeof teamDocs)[number]> => entry !== null)
          .map((entry) => [entry.docId, entry])
      );

      if (canonicalByDocId.size === 0) return context;

      const hydratedTeamPaths = dedupeTeamPaths([
        ...(context.teamPaths ?? []).map((entry) => canonicalByDocId.get(entry.teamCode) ?? entry),
        ...Array.from(canonicalByDocId.values()),
      ]);

      const hydratedPrimaryPath =
        (context.teamId ? canonicalByDocId.get(context.teamId)?.path : undefined) ??
        context.teamPath;

      return {
        ...context,
        ...(hydratedPrimaryPath ? { teamPath: hydratedPrimaryPath } : {}),
        ...(hydratedTeamPaths.length > 0 ? { teamPaths: hydratedTeamPaths } : {}),
      };
    } catch (err) {
      logger.warn('[ContextBuilder] Failed to hydrate canonical team route from team document', {
        teamId: context.teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return context;
    }
  }

  // ─── Internal Mapping ────────────────────────────────────────────────────

  /**
   * Map a raw Firestore user document into a clean AgentUserContext.
   * Extracts active sport, physical attributes, location, coach data,
   * connected accounts, and last-active platform data from the single user doc.
   */
  private mapUserToContext(userId: string, user: UserData): AgentUserContext {
    const role = (user['role'] as string) ?? 'athlete';

    // Build display name from available fields
    const firstName = user['firstName'] as string | undefined;
    const lastName = user['lastName'] as string | undefined;
    const displayName =
      (user['displayName'] as string) ??
      ([firstName, lastName].filter(Boolean).join(' ') || 'Unknown User');

    // ── Active sport / role-aware context ────────────────────────────────
    const sports = user['sports'] as Array<Record<string, unknown>> | undefined;
    const activeSportIndex = (user['activeSportIndex'] as number) ?? 0;
    const activeSport = sports?.[activeSportIndex] ?? sports?.[0];
    const coach = user['coach'] as Record<string, unknown> | undefined;
    const director = user['director'] as Record<string, unknown> | undefined;
    const recruiter = user['recruiter'] as Record<string, unknown> | undefined;

    const roleSports =
      role === 'coach'
        ? asStringArray(coach?.['coachingSports'])
        : role === 'director'
          ? asStringArray(director?.['overseeSports'])
          : role === 'coach'
            ? asStringArray(recruiter?.['sports'])
            : [];

    const sport =
      asString(activeSport?.['sport']) ??
      asString(user['primarySport']) ??
      asString(user['sport']) ??
      (roleSports.length > 0 ? roleSports.join(', ') : undefined);

    const shouldExposeAthleteProfileLinks = role === 'athlete';
    const profileCode = asString(user['unicode']) ?? userId;
    const profilePath = shouldExposeAthleteProfileLinks
      ? buildCanonicalProfilePath({
          athleteName: displayName,
          sport,
          unicode: profileCode,
          id: userId,
        })
      : undefined;

    const sportLinks: Array<{ sport: string; path: string }> = [];
    const allSports = Array.isArray(sports) ? sports : [];
    if (shouldExposeAthleteProfileLinks) {
      for (const sportEntry of allSports) {
        const sportName = asString(sportEntry?.['sport']);
        if (!sportName) continue;

        sportLinks.push({
          sport: sportName,
          path: buildCanonicalProfilePath({
            athleteName: displayName,
            sport: sportName,
            unicode: profileCode,
            id: userId,
          }),
        });
      }

      if (sport && sportLinks.length === 0 && profilePath) {
        sportLinks.push({ sport, path: profilePath });
      }
    }
    const profilePathsBySport = dedupeProfilePathsBySport(sportLinks);
    const positions = activeSport?.['positions'] as string[] | undefined;
    const position = positions?.[0];

    const sportsContext: Array<{
      sport: string;
      positions: string[];
      teamName?: string;
      isActive: boolean;
    }> = [];

    for (const [index, sportEntry] of allSports.entries()) {
      const sportName = asString(sportEntry?.['sport']);
      if (!sportName) continue;

      const team = sportEntry?.['team'] as Record<string, unknown> | undefined;
      sportsContext.push({
        sport: sportName,
        positions: asStringArray(sportEntry?.['positions']),
        teamName: asString(team?.['name']) ?? asString(team?.['teamName']),
        isActive: index === activeSportIndex,
      });
    }

    // ── Physical attributes ───────────────────────────────────────────────
    // Try top-level fields first (legacy), then measurables[], then sport metrics
    const measurables = user['measurables'] as
      | Array<{ field: string; value: string | number }>
      | undefined;
    const heightInches =
      parseHeightToInches(user['height'] as string | undefined) ??
      parseHeightToInches(measurables?.find((m) => m.field === 'height')?.value?.toString()) ??
      parseHeightToInches(
        (activeSport?.['metrics'] as Record<string, string> | undefined)?.['height']
      );
    const weightLbs =
      parseWeight(user['weight'] as string | undefined) ??
      parseWeight(measurables?.find((m) => m.field === 'weight')?.value?.toString()) ??
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
    // (resolved below after activeSportTeam is available)

    // ── Team context (from active sport profile) ─────────────────────────
    const activeSportTeam = activeSport?.['team'] as Record<string, unknown> | undefined;
    const teamHistory = Array.isArray(user['teamHistory'])
      ? (user['teamHistory'] as Array<Record<string, unknown>>)
      : [];
    const currentTeamHistory =
      teamHistory.find((entry) => entry?.['isCurrent'] === true) ?? teamHistory[0];

    const teamId =
      asString(activeSportTeam?.['teamId']) ??
      asString(currentTeamHistory?.['teamId']) ??
      asString(user['teamId']);
    const organizationId =
      asString(activeSportTeam?.['organizationId']) ??
      asString(currentTeamHistory?.['organizationId']) ??
      asString(user['organizationId']);

    // V2-first: extract team name from sports[].team, then roster/team history, then legacy school fields
    const school =
      asString(activeSportTeam?.['name']) ??
      asString(currentTeamHistory?.['name']) ??
      (user['highSchool'] as string | undefined) ??
      (athlete?.['highSchool'] as string | undefined);

    const teamLinkCandidates: TeamLinkCandidate[] = [];

    if (activeSportTeam) {
      teamLinkCandidates.push({
        sport,
        teamName: asString(activeSportTeam['name']) ?? asString(activeSportTeam['teamName']),
        slug: asString(activeSportTeam['slug']) ?? asString(activeSportTeam['unicode']),
        teamCode: asString(activeSportTeam['teamCode']) ?? asString(activeSportTeam['code']),
        id: asString(activeSportTeam['teamId']) ?? asString(activeSportTeam['id']),
      });
    }

    for (const sportEntry of allSports) {
      const team = sportEntry?.['team'] as Record<string, unknown> | undefined;
      if (!team) continue;
      teamLinkCandidates.push({
        sport: asString(sportEntry?.['sport']),
        teamName: asString(team['name']) ?? asString(team['teamName']),
        slug: asString(team['slug']) ?? asString(team['unicode']),
        teamCode: asString(team['teamCode']) ?? asString(team['code']),
        id: asString(team['teamId']) ?? asString(team['id']),
      });
    }

    const topLevelTeam =
      typeof user['teamCode'] === 'object' && user['teamCode'] !== null
        ? (user['teamCode'] as Record<string, unknown>)
        : undefined;
    if (topLevelTeam) {
      teamLinkCandidates.push({
        sport: asString(topLevelTeam['sport']) ?? sport,
        teamName: asString(topLevelTeam['teamName']) ?? asString(topLevelTeam['name']),
        slug: asString(topLevelTeam['slug']) ?? asString(topLevelTeam['unicode']),
        teamCode: asString(topLevelTeam['teamCode']) ?? asString(topLevelTeam['code']),
        id: asString(topLevelTeam['teamId']) ?? asString(topLevelTeam['id']),
      });
    }

    if (currentTeamHistory) {
      teamLinkCandidates.push({
        teamName: asString(currentTeamHistory['name']) ?? asString(currentTeamHistory['teamName']),
        slug: asString(currentTeamHistory['slug']) ?? asString(currentTeamHistory['unicode']),
        teamCode: asString(currentTeamHistory['teamCode']) ?? asString(currentTeamHistory['code']),
        id: asString(currentTeamHistory['teamId']) ?? asString(currentTeamHistory['id']),
      });
    }

    const primaryResolvedTeamRoute = resolveCanonicalTeamRoute({
      slug:
        asString(topLevelTeam?.['slug']) ??
        asString(activeSportTeam?.['slug']) ??
        asString(currentTeamHistory?.['slug']) ??
        asString(topLevelTeam?.['unicode']) ??
        asString(activeSportTeam?.['unicode']) ??
        asString(currentTeamHistory?.['unicode']),
      teamName:
        asString(topLevelTeam?.['teamName']) ??
        asString(topLevelTeam?.['name']) ??
        asString(activeSportTeam?.['name']) ??
        asString(activeSportTeam?.['teamName']) ??
        asString(currentTeamHistory?.['name']) ??
        asString(currentTeamHistory?.['teamName']),
      teamCode:
        asString(topLevelTeam?.['teamCode']) ??
        asString(activeSportTeam?.['teamCode']) ??
        asString(currentTeamHistory?.['teamCode']),
      code:
        asString(topLevelTeam?.['code']) ??
        asString(activeSportTeam?.['code']) ??
        asString(currentTeamHistory?.['code']),
      teamId:
        asString(topLevelTeam?.['teamId']) ??
        asString(activeSportTeam?.['teamId']) ??
        asString(currentTeamHistory?.['teamId']) ??
        teamId,
      id:
        asString(topLevelTeam?.['id']) ??
        asString(activeSportTeam?.['id']) ??
        asString(currentTeamHistory?.['id']) ??
        teamId,
      unicode:
        asString(topLevelTeam?.['unicode']) ??
        asString(activeSportTeam?.['unicode']) ??
        asString(currentTeamHistory?.['unicode']),
    });

    const teamPathLinks: Array<{
      sport?: string;
      teamName?: string;
      teamCode: string;
      path: string;
    }> = [];

    for (const candidate of teamLinkCandidates) {
      const routeIdentifier = candidate.teamCode ?? candidate.id;
      if (!routeIdentifier) continue;

      teamPathLinks.push({
        ...(candidate.sport ? { sport: candidate.sport } : {}),
        ...(candidate.teamName ? { teamName: candidate.teamName } : {}),
        teamCode: routeIdentifier,
        path: buildCanonicalTeamPath({
          slug: candidate.slug,
          teamName: candidate.teamName,
          teamCode: candidate.teamCode,
          id: candidate.id,
        }),
      });
    }

    const teamPaths = dedupeTeamPaths(teamPathLinks).sort((left, right) => {
      const leftUsesShortCode = left.path.endsWith(`/${encodeURIComponent(left.teamCode)}`);
      const rightUsesShortCode = right.path.endsWith(`/${encodeURIComponent(right.teamCode)}`);
      if (leftUsesShortCode === rightUsesShortCode) return 0;
      return leftUsesShortCode ? -1 : 1;
    });
    const teamPath = primaryResolvedTeamRoute?.path ?? teamPaths[0]?.path;

    // ── Coach / director-specific ────────────────────────────────────────
    const coachProgram =
      asString(activeSportTeam?.['name']) ??
      asString(currentTeamHistory?.['name']) ??
      asString(coach?.['organization']) ??
      asString(director?.['organization']);
    const coachDivision = coach?.['division'] as string | undefined;
    const coachSport = role === 'coach' ? sport : undefined;

    // ── Connected accounts from social links & connected sources ──────────
    const connectedAccounts = this.extractConnectedAccounts(user);

    const lastActiveAt = (user['lastLoginAt'] as string) ?? (user['updatedAt'] as string);

    // ── Recruiting context (athlete-only) ─────────────────────────────────
    const recruitingData = role === 'athlete' ? this.extractRecruitingData(user) : undefined;

    return {
      userId,
      role,
      displayName,
      activeSportIndex,

      // Canonical NXT1 routes
      ...(profilePath ? { profilePath } : {}),
      ...(profilePathsBySport.length > 0 ? { profilePathsBySport } : {}),
      ...(teamPath ? { teamPath } : {}),
      ...(teamPaths.length > 0 ? { teamPaths } : {}),

      // Athletic data
      sport,
      ...(sportsContext.length > 0 ? { sports: sportsContext } : {}),
      position,
      heightInches,
      weightLbs,
      graduationYear,
      gpa: gpa && !isNaN(gpa) ? gpa : undefined,
      school,
      city,
      state,

      // Recruiting
      recruitingStatus: recruitingData?.recruitingStatus,

      // Engagement
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
    recruitingStatus?: string;
  } {
    const athlete = user['athlete'] as Record<string, unknown> | undefined;
    return {
      recruitingStatus: (athlete?.['recruitingStatus'] as string) ?? 'active',
    };
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
   * Fetch recent thread messages as structured AgentSessionMessage objects.
   *
   * Used by SessionMemoryService to cold-seed Redis on a cache miss.
   * Returns ONLY 'user' and 'assistant' role messages — tool observations
   * are excluded to keep session history clean and token-efficient.
   *
   * Unlike getRecentThreadHistory() which returns a formatted prompt string,
   * this method returns clean structured data suitable for Redis storage and
   * direct injection into the LLM messages array.
   *
   * @param threadId - The MongoDB thread ID.
   * @param maxMessages - Maximum messages to return (default: 10).
   */
  async getRecentThreadMessages(
    threadId: string,
    maxMessages = 10
  ): Promise<import('@nxt1/core').AgentSessionMessage[]> {
    const limit = Math.min(maxMessages, ContextBuilder.THREAD_HISTORY_MAX_MESSAGES);

    try {
      const messages = await AgentMessageModel.find({
        threadId,
        role: { $in: ['user', 'assistant'] },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('role content createdAt')
        .lean()
        .exec();

      if (!messages.length) return [];

      return messages
        .reverse() // chronological order
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          // Phase F: no longer truncate to 500 chars \u2014 the prompt budget
          // governor (PromptBudgetService) is the single trim authority.
          // Pre-truncation here corrupts replay fidelity for Redis seeds.
          content: m.content,
          timestamp:
            typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
        }));
    } catch (err) {
      logger.warn('[ContextBuilder] Failed to fetch thread messages for session seed', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Build a compressed team context string for injection into LLM prompts.
   * Mirrors `buildPromptContext` / `compressToPrompt` but operates on a Team
   * document instead of a User document.
   *
   * - Retrieves team-scoped vector memories (owner userId + teamId filter)
   * - Retrieves sync delta summaries scoped to teamId
   * - Compresses team identity fields into a token-efficient string
   *
   * @param teamId - Firestore Teams document ID
   * @param teamData - Raw team document fields
   * @param query - Semantic query for vector memory retrieval
   */
  async buildTeamPromptContext(
    teamId: string,
    teamData: Record<string, unknown>,
    query: string
  ): Promise<string> {
    const lines: string[] = [];

    // ── Identity fields ────────────────────────────────────────────────────
    const teamName = (teamData['teamName'] as string) || 'Unknown Program';
    const sport = (teamData['sport'] as string) || '';
    const teamType = (teamData['teamType'] as string) || '';
    const city = (teamData['city'] as string) || '';
    const state = (teamData['state'] as string) || '';
    const division = (teamData['division'] as string) || '';
    const conference = (teamData['conference'] as string) || '';
    const mascot = (teamData['branding'] as Record<string, unknown> | undefined)?.['mascot'] as
      | string
      | undefined;
    const record = teamData['record'] as Record<string, unknown> | undefined;
    const organizationId = (teamData['organizationId'] as string) || '';
    const createdBy = (teamData['createdBy'] as string) || '';

    const loc = [city, state].filter(Boolean).join(', ');
    lines.push(
      `Team: ${teamName} | TeamID: ${teamId}${organizationId ? ` | OrgID: ${organizationId}` : ''}`
    );

    if (sport) {
      const divPart = division ? ` | Division: ${division}` : '';
      const confPart = conference ? ` | Conference: ${conference}` : '';
      lines.push(`Sport: ${sport}${teamType ? ` (${teamType})` : ''}${divPart}${confPart}`);
    }

    if (loc) lines.push(`Location: ${loc}`);
    if (mascot) lines.push(`Mascot: ${mascot}`);

    if (record) {
      const wins = record['wins'] ?? record['w'];
      const losses = record['losses'] ?? record['l'];
      const ties = record['ties'] ?? record['t'];
      const parts: string[] = [];
      if (wins !== undefined) parts.push(`W: ${wins}`);
      if (losses !== undefined) parts.push(`L: ${losses}`);
      if (ties !== undefined) parts.push(`T: ${ties}`);
      if (parts.length) lines.push(`Record: ${parts.join(' | ')}`);
    }

    // ── Vector memories (team-scoped, retrieved via coach/owner userId) ────
    if (this.vectorMemory && createdBy && query.trim()) {
      try {
        const memories = await this.withTimeout(
          this.vectorMemory.recallByScope(createdBy, query, {
            teamId,
            targets: ['team'],
            perTargetLimit: MEMORY_RESULTS_PER_TARGET,
          }),
          MEMORY_RECALL_TIMEOUT_MS,
          `team memory retrieval timed out for ${teamId}`
        );

        if (memories.team.length) {
          lines.push(`Team Memory: ${memories.team.map((m) => m.content).join(' | ')}`);
        }
      } catch (err) {
        logger.warn('[ContextBuilder] Team memory retrieval failed', {
          teamId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Sync delta summaries (teamId-scoped) ───────────────────────────────
    try {
      const syncSummaries = await this.withTimeout(
        getSyncDeltaEventService().listRecentSummaries({
          userId: createdBy || teamId,
          teamId,
          limit: RECENT_SYNC_RESULTS_LIMIT,
        }),
        RECENT_SYNC_TIMEOUT_MS,
        `team sync retrieval timed out for ${teamId}`
      );

      if (syncSummaries.length) {
        lines.push(`Recent Sync Activity:\n- ${syncSummaries.join('\n- ')}`);
      }
    } catch (err) {
      logger.warn('[ContextBuilder] Team sync retrieval failed', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return lines.join('\n');
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
/**
 * @fileoverview Elite Context Builder — Deep user context for Agent X prompts
 * @module @nxt1/backend/modules/agent/services
 *
 * Builds a rich, role-aware context string from the user's Firestore document
 * so that Agent X playbook and briefing prompts are hyper-personalized.
 *
 * Handles graceful degradation: any missing field is silently omitted,
 * never producing "undefined" or broken sentences.
 */

/**
 * Get the season info for a sport at the current date.
 * Returns `null` if the sport is not in our calendar map (graceful degradation).
 */
export function getSeasonInfo(sportRaw: string, now: Date = new Date()): AgentSeasonInfo | null {
  return resolveConfiguredSeasonInfo(sportRaw, now);
}

function getRolePersona(role: string): string {
  return resolveConfiguredRolePersona(role);
}

// ─── Elite Context Builder ──────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Build a rich, dynamic context paragraph from the user's Firestore data.
 * Every field is optional — if missing, that sentence is silently skipped.
 *
 * Returns a multi-line string ready to inject directly into an LLM prompt.
 */
export function buildEliteContext(
  userData: Record<string, unknown>,
  now: Date = new Date()
): string {
  const role = str(userData['role']) || 'athlete';
  const displayName = str(userData['displayName']);
  const location = buildLocation(userData);
  const primarySport = resolvePrimarySport(userData);
  const season = primarySport ? getSeasonInfo(primarySport, now) : null;

  const currentMonth = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();

  const lines: string[] = [];

  // 1 — Identity sentence (who is this user?)
  lines.push(buildIdentityLine(role, userData, displayName, primarySport, location));

  // 2 — Season / calendar context
  if (season && primarySport) {
    lines.push(
      `It is currently ${currentMonth} ${currentYear}.` +
        ` For ${primarySport}, this is the ${season.phase} period.` +
        ` Focus areas: ${season.focus}.`
    );
  } else {
    lines.push(`It is currently ${currentMonth} ${currentYear}.`);
  }

  // 3 — Role-specific deep context (profile gaps, team count, etc.)
  const roleContext = buildRoleContext(role, userData);
  if (roleContext) lines.push(roleContext);

  // 4 — Persona / tone instruction
  lines.push(getRolePersona(role));

  // 5 — Goal-vs-season harmonization mandate
  lines.push(
    [
      `CRITICAL: The user's stated goals are your #1 priority.`,
      `Use the calendar/season timing and their profile data as the ENVIRONMENT`,
      `and CONTEXT for HOW they should execute those goals right now —`,
      `never override or deprioritize their goals in favor of generic seasonal advice.`,
    ].join(' ')
  );

  return lines.join('\n\n');
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Safe string extraction — returns empty string for nullish / non-string values. */
function str(val: unknown): string {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return '';
}

function getActiveSportProfile(
  userData: Record<string, unknown>
): Record<string, unknown> | undefined {
  const sports = userData['sports'];
  if (!Array.isArray(sports) || sports.length === 0) return undefined;

  const activeSportIndex =
    typeof userData['activeSportIndex'] === 'number' ? (userData['activeSportIndex'] as number) : 0;

  return (
    (sports[activeSportIndex] as Record<string, unknown> | undefined) ??
    (sports[0] as Record<string, unknown> | undefined)
  );
}

/** V2-first: resolve team/org name from sports[].team.name, then legacy fields. */
function resolveV2TeamName(userData: Record<string, unknown>): string {
  const v2Name = getActiveSportProfile(userData)?.['team'] as Record<string, unknown> | undefined;
  return str(v2Name?.['name']) || str(userData['teamName']);
}

/** Build "City, State" location string from various possible field shapes. */
function buildLocation(userData: Record<string, unknown>): string {
  const city = str(userData['city']);
  const state = str(userData['state']);
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  if (city) return city;
  return str(userData['location']);
}

/**
 * Resolve the user's primary sport from whichever field source exists.
 * Checks: top-level `sport` → `sports[0].sport` → role-specific sport fields.
 */
export function resolvePrimarySport(userData: Record<string, unknown>): string {
  const activeSport = getActiveSportProfile(userData);
  const activeSportName = activeSport && str(activeSport['sport']);
  if (activeSportName) return activeSportName;

  const explicitPrimarySport = str(userData['primarySport']);
  if (explicitPrimarySport) return explicitPrimarySport;

  const topSport = str(userData['sport']);
  if (topSport) return topSport;

  const coach = userData['coach'] as Record<string, unknown> | undefined;
  if (coach) {
    const arr = coach['coachingSports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  const recruiter = userData['recruiter'] as Record<string, unknown> | undefined;
  if (recruiter) {
    const arr = recruiter['sports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  const director = userData['director'] as Record<string, unknown> | undefined;
  if (director) {
    const arr = director['overseeSports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  return '';
}

// ─── Identity Line Builders (one per role) ──────────────────────────────────

function buildIdentityLine(
  role: string,
  userData: Record<string, unknown>,
  displayName: string,
  primarySport: string,
  location: string
): string {
  const name = displayName || 'the user';

  switch (role) {
    case 'athlete':
      return buildAthleteIdentity(userData, name, primarySport, location);
    case 'coach':
    case 'recruiter': // legacy → coach
      return buildCoachIdentity(userData, name, primarySport, location);
    case 'parent': // legacy → athlete
      return buildAthleteIdentity(userData, name, primarySport, location);
    case 'director':
      return buildDirectorIdentity(userData, name, location);
    default:
      return `${name} is a ${role} on the NXT1 platform${location ? ` in ${location}` : ''}.`;
  }
}

function buildAthleteIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const parts: string[] = [`${name} is an athlete`];

  const classOf = userData['classOf'];
  if (classOf && typeof classOf === 'number') parts.push(`Class of ${classOf}`);

  const positions = resolvePositions(userData);
  if (positions) parts.push(positions);

  if (sport) parts.push(`in ${sport}`);

  const physicals = buildPhysicals(userData);
  if (physicals) parts.push(`(${physicals})`);

  const team = resolveV2TeamName(userData) || str(userData['school']);
  if (team) parts.push(`playing for ${team}`);

  if (location) parts.push(`in ${location}`);

  const academics = buildAcademics(userData);
  if (academics) parts.push(`— Academics: ${academics}`);

  return parts.join(', ').replace(/, —/, ' —') + '.';
}

function buildCoachIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const coach = userData['coach'] as Record<string, unknown> | undefined;
  const title = (coach && str(coach['title'])) || 'Coach';
  const team = resolveV2TeamName(userData);
  const level = resolveCoachingLevel(userData);

  const parts: string[] = [`${name} is a ${title}`];
  if (level) parts.push(`at the ${level} level`);
  if (sport) parts.push(`for ${sport}`);
  if (team) parts.push(`at ${team}`);
  if (location) parts.push(`in ${location}`);

  return parts.join(' ') + '.';
}

function buildDirectorIdentity(
  userData: Record<string, unknown>,
  name: string,
  location: string
): string {
  const director = userData['director'] as Record<string, unknown> | undefined;
  const title = (director && str(director['title'])) || 'Athletic Director';
  // V2-first: sports[].team.name → legacy director.organization → teamName
  const org = resolveV2TeamName(userData) || (director && str(director['organization']));

  const parts: string[] = [`${name} is a ${title}`];
  if (org) parts.push(`at ${org}`);
  if (location) parts.push(`in ${location}`);

  return parts.join(' ') + '.';
}

// ─── Field Extractors ───────────────────────────────────────────────────────

/** Resolve positions from the sports array or a top-level `position` field. */
function resolvePositions(userData: Record<string, unknown>): string {
  const activeSport = getActiveSportProfile(userData);
  if (activeSport) {
    const pos = activeSport['positions'];
    if (Array.isArray(pos) && pos.length > 0) return pos.join('/');

    const singlePos = str(activeSport['position']);
    if (singlePos) return singlePos;
  }
  const topPos = userData['position'];
  if (typeof topPos === 'string' && topPos.trim()) return topPos.trim();
  return '';
}

/** Build "height, weight" string, omitting any missing value. */
function buildPhysicals(userData: Record<string, unknown>): string {
  const parts: string[] = [];
  const measurables = userData['measurables'] as
    | Array<{ field: string; value: string | number }>
    | undefined;
  const height =
    str(userData['height']) ||
    measurables?.find((m) => m.field === 'height')?.value?.toString() ||
    '';
  const weight =
    str(userData['weight']) ||
    measurables?.find((m) => m.field === 'weight')?.value?.toString() ||
    '';
  if (height) parts.push(height);
  if (weight) parts.push(weight);
  return parts.join(', ');
}

/** Build academics summary string, omitting any missing value. */
function buildAcademics(userData: Record<string, unknown>): string {
  const parts: string[] = [];
  const gpa = userData['gpa'];
  if (gpa && (typeof gpa === 'number' || (typeof gpa === 'string' && gpa.trim()))) {
    parts.push(`GPA ${gpa}`);
  }
  return parts.join(', ');
}

// ─── Role-Specific Deep Context ─────────────────────────────────────────────

/**
 * Resolve the coaching level from the user's team type.
 * Checks sports[0].team.type.
 * Returns a display-friendly label or empty string.
 */
function resolveCoachingLevel(userData: Record<string, unknown>): string {
  // Try sports array first (primary sport team type)
  const team = getActiveSportProfile(userData)?.['team'] as Record<string, unknown> | undefined;
  const type = team && str(team['type']);
  if (type) return coachingLevelLabel(type);

  return '';
}

export function getRolePromptScaffolding(userData: Record<string, unknown>): string {
  const role = str(userData['role']) || 'athlete';
  const lines: string[] = [];

  const roleContext = buildRoleContext(role, userData);
  if (roleContext) lines.push(roleContext);

  lines.push(getRolePersona(role));

  return lines.join('\n');
}

/** Map team type slugs to display-friendly coaching level labels. */
function coachingLevelLabel(type: string): string {
  switch (type.toLowerCase()) {
    case 'high-school':
    case 'high_school':
    case 'hs':
      return 'high school';
    case 'middle-school':
    case 'middle_school':
    case 'ms':
      return 'middle school';
    case 'club':
      return 'club';
    case 'college':
      return 'college';
    case 'juco':
      return 'junior college';
    case 'organization':
      return 'organization';
    default:
      return type;
  }
}

/** Check if the coaching level represents a college/recruiting-focused role. */
function isCollegeLevelCoach(userData: Record<string, unknown>): boolean {
  const level = resolveCoachingLevel(userData);
  return level === 'college' || level === 'junior college';
}

/**
 * Build role-specific supplementary context beyond the identity line.
 * Returns `null` if there is nothing meaningful to add.
 */
function buildRoleContext(role: string, userData: Record<string, unknown>): string | null {
  switch (role) {
    case 'athlete':
      return buildAthleteRoleContext(userData);
    case 'coach':
      return buildCoachRoleContext(userData);
    case 'parent':
      return buildParentRoleContext(userData);
    case 'director':
      return buildDirectorRoleContext(userData);
    case 'recruiter':
      return buildRecruiterRoleContext(userData);
    default:
      return null;
  }
}

function buildAthleteRoleContext(userData: Record<string, unknown>): string | null {
  const missing: string[] = [];
  if (!str(userData['contactEmail'])) missing.push('contact email');
  if (!str(userData['phone'])) missing.push('phone number');
  if (!str(userData['hudlUrl'])) missing.push('Hudl profile link');

  if (missing.length > 0) {
    return `Profile gaps detected: missing ${missing.join(', ')}. Consider tasks to complete their profile.`;
  }
  return null;
}

function buildCoachRoleContext(userData: Record<string, unknown>): string | null {
  const coach = userData['coach'] as Record<string, unknown> | undefined;
  const lines: string[] = [];

  // Coaching level context — critical for differentiating HS/club vs college
  const level = resolveCoachingLevel(userData);
  if (level && !isCollegeLevelCoach(userData)) {
    lines.push(
      `This is a ${level} coach. Focus on player development, team culture, game preparation,` +
        ` parent communication, and program building. Do NOT suggest college-level recruiting tasks` +
        ` like scouting prospects or managing a recruiting pipeline — that is not relevant for ${level} coaches.`
    );
  } else if (isCollegeLevelCoach(userData)) {
    lines.push(
      `This is a ${level} coach. Recruiting, prospect evaluation, compliance,` +
        ` and roster management are key priorities alongside game preparation and player development.`
    );
  }

  // Multi-team management — V2-first: count sports entries, fall back to legacy managedTeamCodes
  const sports = userData['sports'] as unknown[] | undefined;
  const managedTeamCount =
    (Array.isArray(sports) && sports.length > 1 ? sports.length : 0) ||
    (coach
      ? (() => {
          const managedTeams = coach['managedTeamCodes'];
          return Array.isArray(managedTeams) && managedTeams.length > 1 ? managedTeams.length : 0;
        })()
      : 0);
  if (managedTeamCount > 1) {
    lines.push(
      `This coach manages ${managedTeamCount} teams.` +
        ` Consider tasks that span team management, roster coordination, and cross-team scheduling.`
    );
  }

  return lines.length > 0 ? lines.join(' ') : null;
}

function buildParentRoleContext(userData: Record<string, unknown>): string | null {
  const parentFallback =
    `This parent is actively supporting their child's athletic journey.` +
    ` Focus on scheduling, financial planning, communication with coaches,` +
    ` and emotional/physical wellness of their athlete.`;

  const parent = userData['parent'] as Record<string, unknown> | undefined;
  if (!parent) return parentFallback;

  const managed = parent['managedAthleteIds'];
  if (Array.isArray(managed) && managed.length > 1) {
    return (
      `This parent manages ${managed.length} student-athletes.` +
      ` Consider tasks that help them stay organized across multiple schedules,` +
      ` finances, and recruiting timelines.`
    );
  }

  return parentFallback;
}

function buildDirectorRoleContext(userData: Record<string, unknown>): string | null {
  const base = 'Focus on tasks spanning operations, compliance, budgeting, and staff management.';
  const director = userData['director'] as Record<string, unknown> | undefined;

  if (!director) return `This director oversees the athletic program. ${base}`;

  const overseeSports = director['overseeSports'];
  if (Array.isArray(overseeSports) && overseeSports.length > 0) {
    const sportList = overseeSports.slice(0, 5).join(', ');
    return `This director oversees ${overseeSports.length} sport programs (${sportList}). ${base}`;
  }

  return `This director oversees the athletic program. ${base}`;
}

function buildRecruiterRoleContext(userData: Record<string, unknown>): string | null {
  const base =
    'Focus on prospect evaluation, relationship building, and talent pipeline management.';
  const recruiter = userData['recruiter'] as Record<string, unknown> | undefined;

  if (!recruiter) return base;

  const lines: string[] = [];
  const division = str(recruiter['division']);
  if (division) lines.push(`Recruiting at the ${division} level.`);

  const regions = recruiter['regions'];
  if (Array.isArray(regions) && regions.length > 0) {
    lines.push(`Active recruiting regions: ${regions.join(', ')}.`);
  }

  lines.push(base);
  return lines.join(' ');
}

// ─── Recurring Habit Menus (Role × Season) ──────────────────────────────────

interface RecurringHabitMenu {
  readonly inSeason: readonly string[];
  readonly offSeason: readonly string[];
  readonly general: readonly string[];
}

const ROLE_HABITS: Readonly<Record<string, RecurringHabitMenu>> = {
  athlete: {
    inSeason: [
      "Upload this week's game film or highlights so coaches can see your latest performance",
      'Update your stats from the latest game or competition',
      'Log your recovery, sleep, and wellness check-in for the week',
    ],
    offSeason: [
      'Sync your profile — update height, weight, and any new training metrics',
      'Log your strength and conditioning progress for the week',
      'Review and update your academic GPA and test scores',
    ],
    general: ['Sync your profile to make sure coaches are seeing your latest info'],
  },

  coach: {
    inSeason: [
      'Review updated athlete profiles and recent stat uploads from your roster',
      'Generate or review opponent scout report for the upcoming matchup',
      'Audit your team depth chart and check for roster updates',
    ],
    offSeason: [
      'Review player development plans and update training goals',
      'Audit roster academic standing and eligibility compliance',
      'Update offseason training plans and share with athletes',
    ],
    general: ['Review your team analytics dashboard for the week'],
  },

  /** College/JUCO coaches get recruiting-focused habits. */
  coach_college: {
    inSeason: [
      'Review updated athlete profiles and recent stat uploads from your roster',
      'Generate or review opponent scout report for the upcoming matchup',
      'Audit your team depth chart and check for roster updates',
    ],
    offSeason: [
      'Review your recruiting prospect board and update evaluations',
      'Audit roster academic standing and eligibility compliance',
      'Update offseason training plans and share with athletes',
    ],
    general: ['Review your team analytics dashboard for the week'],
  },

  parent: {
    inSeason: [
      "Review your athlete's weekly schedule, game times, and travel logistics",
      "Check your athlete's latest stats and recovery status",
    ],
    offSeason: [
      'Review upcoming camp, club, and showcase costs and budget accordingly',
      "Track your athlete's academic progress and recruiting milestones",
    ],
    general: ["Sync your athlete's profile to ensure it reflects the latest info"],
  },

  director: {
    inSeason: [
      'Review compliance alerts and eligibility updates across all programs',
      'Audit facility scheduling and resolve any booking conflicts',
      'Check coach and staff platform engagement metrics',
    ],
    offSeason: [
      'Review departmental budget allocations and upcoming fiscal needs',
      'Audit coaching staff evaluations and offseason hiring pipeline',
      'Review athlete retention and transfer portal activity',
    ],
    general: ['Run a department-wide analytics review for the week'],
  },

  recruiter: {
    inSeason: [
      'Update your prospect evaluation board with weekend game observations',
      'Log high-school coach communications and follow-ups from the week',
      'Review weekend film of committed prospects and watchlist athletes',
    ],
    offSeason: [
      'Refresh your recruiting target list and update prospect rankings',
      'Review camp and showcase invitee lists for upcoming events',
      'Audit your communication cadence with top prospects',
    ],
    general: ['Sync your recruiting pipeline — update contact logs and prospect notes'],
  },
};

/**
 * Build the recurring habit instruction block for the LLM prompt.
 * Returns a formatted string telling the AI which habits to choose from.
 *
 * @param userData - Optional user data for coaching level differentiation.
 */
export function getRecurringHabitsPrompt(
  role: string,
  sportRaw?: string,
  now: Date = new Date(),
  userData?: Record<string, unknown>
): string {
  // For coaches, use college-specific habits when applicable
  let menuKey = role;
  if (role === 'coach' && userData && isCollegeLevelCoach(userData)) {
    menuKey = 'coach_college';
  }

  const menu = ROLE_HABITS[menuKey] ?? ROLE_HABITS[role] ?? ROLE_HABITS['athlete'];
  const season = sportRaw ? getSeasonInfo(sportRaw, now) : null;

  const isInSeason = season?.phase === 'In-Season' || season?.phase === 'Post-Season / Playoffs';
  const habits = isInSeason ? menu.inSeason : menu.offSeason;
  const alwaysHabits = menu.general;

  const allHabits = [...habits, ...alwaysHabits];
  const numbered = allHabits.map((h, i) => `  ${i + 1}. ${h}`).join('\n');

  return [
    `RECURRING WEEKLY HABITS (select 2 from this menu and adapt the wording to the user's context):`,
    numbered,
    `Make the habit task titles short and action-oriented. Adapt the language to feel personal — reference their sport, team, or season.`,
  ].join('\n');
}
