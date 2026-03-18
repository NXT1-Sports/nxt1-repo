/**
 * @fileoverview Write Season Stats Tool — Atomic writer for season game-log data
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled season stats to TWO locations:
 *
 * 1. **User sport profile** (`Users/{uid}.sports[i].verifiedGameLog[]`):
 *    Full game-by-game tables (columns, game entries, totals) in the
 *    `ProfileSeasonGameLog` format consumed by the Profile Stats UI.
 *
 * 2. **PlayerStats collection** (`PlayerStats/{userId}_{sportId}_{season}`):
 *    Flat aggregated stat entries (field, label, value, category, season)
 *    derived from the season totals. Used by the stats API endpoint.
 *
 * The distilled data from the platform distillers maps cleanly into both
 * formats — no AI transformation required.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import {
  SyncDiffService,
  type PreviousProfileState,
  type PreviousSeasonEntry,
} from '../../sync/index.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';

type SupportedTeamType = 'school' | 'club' | 'college';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const MAX_SEASONS = 20;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteSeasonStatsTool extends BaseTool {
  readonly name = 'write_season_stats';

  readonly description =
    'Writes distilled season stats (game logs) to both the user sport profile and PlayerStats collection.\n\n' +
    'Call this after reading the "seasonStats" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "maxpreps").\n' +
    '- position (optional): Primary position (e.g. "QB") for PlayerStats docs.\n' +
    '- teamType (optional): "school" (default), "club", or "college".\n' +
    '- seasonStats (required): Array of season stat objects, each with:\n' +
    '  • season: Season label (e.g. "2024-2025").\n' +
    '  • category: Stat category (e.g. "Passing", "Rushing").\n' +
    '  • columns: Array of { key, label, abbreviation? } defining table columns.\n' +
    '  • games: Array of game entries, each with { date?, opponent?, result?, values: { [key]: value } }.\n' +
    '  • totals (optional): { [key]: value } season totals.\n' +
    '  • averages (optional): { [key]: value } per-game averages.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      position: { type: 'string' },
      teamType: { type: 'string', enum: ['school', 'club', 'college'] },
      seasonStats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            season: { type: 'string' },
            category: { type: 'string' },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  abbreviation: { type: 'string' },
                },
                required: ['key', 'label'],
              },
            },
            games: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  opponent: { type: 'string' },
                  opponentLogoUrl: { type: 'string' },
                  result: { type: 'string' },
                  values: { type: 'object' },
                },
              },
            },
            totals: { type: 'object' },
            averages: { type: 'object' },
          },
          required: ['season', 'category', 'columns'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'seasonStats'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const position = this.str(input, 'position') ?? undefined;
    const teamType = (this.str(input, 'teamType') ?? 'school') as SupportedTeamType;

    const seasonStats = input['seasonStats'];
    if (!Array.isArray(seasonStats) || seasonStats.length === 0) {
      return { success: false, error: 'seasonStats must be a non-empty array.' };
    }
    if (seasonStats.length > MAX_SEASONS) {
      return { success: false, error: `seasonStats exceeds maximum of ${MAX_SEASONS}.` };
    }

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);

    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return { success: false, error: `User "${userId}" not found.` };
      }

      const userData = userDoc.data() as Record<string, unknown>;
      const sportId = targetSport.trim().toLowerCase();
      const now = new Date().toISOString();

      // ── 0. Snapshot previous state for delta computation ──────────────
      const previousState = this.snapshotPreviousState(userData, targetSport);

      // ── 1. Build ProfileSeasonGameLog entries for the sport profile ────
      const gameLogs = this.buildGameLogs(
        seasonStats as Record<string, unknown>[],
        source,
        teamType
      );

      // ── 2. Build flat PlayerStats entries from totals ─────────────────
      const flatStats = this.buildFlatStats(seasonStats as Record<string, unknown>[]);

      // ── 3. Write game logs to User sport profile ──────────────────────
      const rawSports = userData['sports'];
      const existingSports: Record<string, unknown>[] = Array.isArray(rawSports)
        ? (rawSports as Record<string, unknown>[])
        : rawSports && typeof rawSports === 'object'
          ? (Object.values(rawSports) as Record<string, unknown>[])
          : [];

      const sportIndex = this.resolveSportIndex(existingSports, targetSport);
      const isNewSport = sportIndex >= existingSports.length;

      if (isNewSport) {
        // Create new sport entry with game log
        const newSport: Record<string, unknown> = {
          sport: targetSport,
          order: existingSports.length,
          accountType: 'free',
          verifiedGameLog: gameLogs,
          createdAt: now,
          updatedAt: now,
        };
        const payload: Record<string, unknown> = {
          sports: [...existingSports, newSport],
          updatedAt: FieldValue.serverTimestamp(),
        };
        await userRef.update(payload);
      } else {
        // Update only the targeted sport entry to avoid clobbering concurrent array writes.
        const sportObj = { ...(existingSports[sportIndex] ?? {}) } as Record<string, unknown>;
        const existingLogs = Array.isArray(sportObj['verifiedGameLog'])
          ? (sportObj['verifiedGameLog'] as Record<string, unknown>[])
          : [];

        const mergedGameLogs = this.mergeGameLogs(existingLogs, gameLogs);

        await userRef.update({
          [`sports.${sportIndex}.verifiedGameLog`]: mergedGameLogs,
          [`sports.${sportIndex}.updatedAt`]: now,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // ── 4. Write flat stats to PlayerStats collection ─────────────────
      let playerStatsWritten = 0;

      for (const [season, stats] of flatStats.entries()) {
        const docId = `${userId}_${sportId}_${season}`;
        const docRef = this.db.collection(PLAYER_STATS_COLLECTION).doc(docId);
        const existingDoc = await docRef.get();
        const existingStatEntries = existingDoc.exists
          ? ((existingDoc.data()?.['stats'] ?? []) as Record<string, unknown>[])
          : [];

        const mergedStats = this.mergeFlatStats(existingStatEntries, stats, source, now);
        const existingData = existingDoc.data() as Record<string, unknown> | undefined;

        await docRef.set(
          {
            id: docId,
            userId,
            sportId,
            season,
            ...(position ? { position } : {}),
            stats: mergedStats,
            source,
            verified: false,
            createdAt: existingData?.['createdAt'] ?? now,
            updatedAt: now,
          },
          { merge: true }
        );
        playerStatsWritten++;
      }

      // ── 5. Cache invalidation ─────────────────────────────────────────
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:sub:stats:${userId}:${sportId}`),
          invalidateProfileCaches(
            userId,
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Best-effort
      }

      // ── 6. Compute delta & fire trigger for Agent X ───────────────────
      try {
        const diffService = new SyncDiffService();
        // Reconstruct the extracted profile shape from the raw seasonStats input
        const extractedProfile = {
          platform: source,
          profileUrl: '',
          seasonStats: (seasonStats as Record<string, unknown>[]).map((s) => ({
            season: (s['season'] as string) ?? '',
            category: (s['category'] as string) ?? '',
            columns: Array.isArray(s['columns'])
              ? (s['columns'] as Array<{ key: string; label: string }>)
              : [],
            games: Array.isArray(s['games'])
              ? (s['games'] as Array<Record<string, unknown>>).map((g) => ({
                  ...g,
                  values: (g['values'] as Record<string, string | number>) ?? {},
                }))
              : [],
            totals: (s['totals'] as Record<string, string | number>) ?? undefined,
            averages: (s['averages'] as Record<string, string | number>) ?? undefined,
          })),
        };

        const delta = diffService.diff(userId, sportId, source, previousState, extractedProfile);

        if (!delta.isEmpty) {
          logger.info('[WriteSeasonStats] Delta detected, firing sync trigger', {
            userId,
            sport: sportId,
            totalChanges: delta.summary.totalChanges,
          });
          // Fire-and-forget — don't let trigger failures block the write response
          onDailySyncComplete(delta).catch((err) => {
            logger.warn('[WriteSeasonStats] Trigger dispatch failed', {
              userId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch (err) {
        // Delta/trigger is non-critical — log and continue
        logger.warn('[WriteSeasonStats] Delta computation failed', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          gameLogCategories: gameLogs.length,
          playerStatsDocs: playerStatsWritten,
          message: `Wrote ${gameLogs.length} game log categor(ies) and ${playerStatsWritten} PlayerStats doc(s) for "${sportId}" from "${source}".`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write season stats',
      };
    }
  }

  // ─── Previous State Snapshot (for Delta Computation) ─────────────────────

  /**
   * Extract the current state from the Firestore user document before writing.
   * This snapshot is compared against the new extraction to compute the delta.
   */
  private snapshotPreviousState(
    userData: Record<string, unknown>,
    targetSport: string
  ): PreviousProfileState {
    const rawSports = userData['sports'];
    const sports: Record<string, unknown>[] = Array.isArray(rawSports)
      ? (rawSports as Record<string, unknown>[])
      : rawSports && typeof rawSports === 'object'
        ? (Object.values(rawSports) as Record<string, unknown>[])
        : [];

    const sportIndex = this.resolveSportIndex(sports, targetSport);
    if (sportIndex >= sports.length) {
      return { seasonStats: [] };
    }

    const sportObj = sports[sportIndex] as Record<string, unknown>;
    const existingLogs = Array.isArray(sportObj['verifiedGameLog'])
      ? (sportObj['verifiedGameLog'] as Record<string, unknown>[])
      : [];

    const seasonStats: PreviousSeasonEntry[] = existingLogs.map((log) => ({
      season: (log['season'] as string) ?? '',
      category: (log['category'] as string) ?? '',
      columns: Array.isArray(log['columns'])
        ? (log['columns'] as Array<{ key: string; label: string }>)
        : [],
      totals: (
        log['totals'] as Array<{ label: string; stats: Record<string, string | number> }>
      )?.[0]?.stats,
      averages: (
        log['totals'] as Array<{ label: string; stats: Record<string, string | number> }>
      )?.[1]?.stats,
    }));

    return {
      identity: {
        firstName: userData['firstName'],
        lastName: userData['lastName'],
        displayName: userData['displayName'],
        height: userData['height'],
        weight: userData['weight'],
        classOf: userData['classOf'],
        city: userData['city'],
        state: userData['state'],
        school: userData['school'],
        profileImage: userData['profileImage'],
      },
      seasonStats,
    };
  }

  // ─── Build Game Logs (ProfileSeasonGameLog format) ──────────────────────

  private buildGameLogs(
    seasons: Record<string, unknown>[],
    source: string,
    teamType: SupportedTeamType
  ): Record<string, unknown>[] {
    const logs: Record<string, unknown>[] = [];

    for (const s of seasons) {
      const season = this.str(s, 'season');
      const category = this.str(s, 'category');
      if (!season || !category) continue;

      const rawColumns = Array.isArray(s['columns']) ? s['columns'] : [];
      const columns = (rawColumns as Record<string, unknown>[])
        .filter((c) => c && typeof c === 'object')
        .map((c) => {
          const result: Record<string, unknown> = {
            key: this.str(c, 'key') ?? this.str(c, 'abbreviation') ?? '',
            label: this.str(c, 'label') ?? this.str(c, 'key') ?? '',
          };
          const tooltip = this.str(c, 'label');
          if (tooltip && tooltip !== result['key']) result['tooltip'] = tooltip;
          return result;
        })
        .filter((c) => c['key']);

      const rawGames = Array.isArray(s['games']) ? s['games'] : [];
      const games = (rawGames as Record<string, unknown>[])
        .filter((g) => g && typeof g === 'object')
        .map((g) => {
          const values = g['values'] as Record<string, unknown> | undefined;
          const stats: Record<string, string | number> = {};
          if (values && typeof values === 'object') {
            for (const [k, v] of Object.entries(values)) {
              if (typeof v === 'number' || typeof v === 'string') stats[k] = v;
            }
          }

          const result = this.str(g, 'result');
          const outcome = result ? this.inferOutcome(result) : undefined;

          return {
            date: this.str(g, 'date') ?? '',
            result: result ?? '',
            ...(outcome && { outcome }),
            opponent: this.str(g, 'opponent') ?? 'Unknown',
            stats,
          };
        });

      // Build totals array
      const totals: Record<string, unknown>[] = [];
      const rawTotals = s['totals'] as Record<string, unknown> | undefined;
      if (rawTotals && typeof rawTotals === 'object' && !Array.isArray(rawTotals)) {
        const stats: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(rawTotals)) {
          if (typeof v === 'number' || typeof v === 'string') stats[k] = v;
        }
        if (Object.keys(stats).length > 0) {
          totals.push({ label: 'Season Totals', stats });
        }
      }
      const rawAverages = s['averages'] as Record<string, unknown> | undefined;
      if (rawAverages && typeof rawAverages === 'object' && !Array.isArray(rawAverages)) {
        const stats: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(rawAverages)) {
          if (typeof v === 'number' || typeof v === 'string') stats[k] = v;
        }
        if (Object.keys(stats).length > 0) {
          totals.push({ label: 'Per Game Avg', stats });
        }
      }

      logs.push({
        season,
        category,
        teamType,
        columns,
        games,
        ...(totals.length > 0 ? { totals } : {}),
        verified: false,
        verifiedBy: source,
      });
    }

    return logs;
  }

  // ─── Build Flat Stats (for PlayerStats collection) ──────────────────────

  private buildFlatStats(
    seasons: Record<string, unknown>[]
  ): Map<
    string,
    Array<{ field: string; label: string; value: string | number; category: string }>
  > {
    const result = new Map<
      string,
      Array<{ field: string; label: string; value: string | number; category: string }>
    >();

    for (const s of seasons) {
      const season = this.str(s, 'season');
      const category = this.str(s, 'category');
      if (!season || !category) continue;

      // Use totals (or averages) to build flat stat entries
      const totals = (s['totals'] ?? s['averages']) as Record<string, unknown> | undefined;
      if (!totals || typeof totals !== 'object' || Array.isArray(totals)) continue;

      const columns = Array.isArray(s['columns'])
        ? (s['columns'] as Record<string, unknown>[])
        : [];
      const columnLabelMap = new Map<string, string>();
      for (const col of columns) {
        const key = this.str(col, 'key');
        const label = this.str(col, 'label') ?? this.str(col, 'abbreviation');
        if (key && label) columnLabelMap.set(key, label);
      }

      if (!result.has(season)) result.set(season, []);
      const entries = result.get(season)!;

      for (const [key, value] of Object.entries(totals)) {
        if (typeof value !== 'number' && typeof value !== 'string') continue;
        const field = `${category.toLowerCase()}_${key.toLowerCase()}`;
        const label = columnLabelMap.get(key) ?? key;
        entries.push({ field, label, value, category: category.toLowerCase() });
      }
    }

    return result;
  }

  // ─── Merge Helpers ──────────────────────────────────────────────────────

  private mergeGameLogs(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const keyOf = (log: Record<string, unknown>) => {
      const season = String(log['season'] ?? '').toLowerCase();
      const category = String(log['category'] ?? '').toLowerCase();
      return `${season}::${category}`;
    };

    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) indexMap.set(keyOf(merged[i]), i);

    for (const log of incoming) {
      const key = keyOf(log);
      const idx = indexMap.get(key);
      if (idx !== undefined) {
        // Replace existing with newer data
        merged[idx] = log;
      } else {
        indexMap.set(key, merged.length);
        merged.push(log);
      }
    }

    return merged;
  }

  private mergeFlatStats(
    existing: Record<string, unknown>[],
    incoming: Array<{ field: string; label: string; value: string | number; category: string }>,
    source: string,
    now: string
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const indexMap = new Map<string, number>();

    for (let i = 0; i < merged.length; i++) {
      const field = merged[i]['field'];
      if (typeof field === 'string') {
        indexMap.set(field.toLowerCase(), i);
      }
    }

    for (const stat of incoming) {
      const key = stat.field.toLowerCase();
      const record: Record<string, unknown> = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        field: stat.field,
        label: stat.label,
        value: stat.value,
        category: stat.category,
        source,
        verified: false,
        dateRecorded: now,
        updatedAt: now,
      };

      const existingIndex = indexMap.get(key);
      if (existingIndex !== undefined) {
        record['id'] = merged[existingIndex]['id'] ?? record['id'];
        merged[existingIndex] = record;
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }

    return merged;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  private resolveSportIndex(
    existingSports: Record<string, unknown>[],
    targetSport: string
  ): number {
    const normalized = targetSport.toLowerCase().trim();
    for (let i = 0; i < existingSports.length; i++) {
      if (
        typeof existingSports[i]['sport'] === 'string' &&
        (existingSports[i]['sport'] as string).toLowerCase().trim() === normalized
      ) {
        return i;
      }
    }
    return existingSports.length;
  }

  private inferOutcome(result: string): 'win' | 'loss' | 'tie' | undefined {
    const r = result.trim().toUpperCase();
    if (r.startsWith('W')) return 'win';
    if (r.startsWith('L')) return 'loss';
    if (r.startsWith('T') || r.startsWith('D')) return 'tie';
    return undefined;
  }
}
