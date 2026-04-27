/**
 * @fileoverview Write Team Stats Tool — Atomic writer for team season statistics
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes sport-agnostic team stats to the `TeamStats` collection.
 * Doc ID pattern: `{teamId}_{sportId}_{season}` — upsert per sport per season.
 *
 * Uses the same self-describing flat stat entry shape as `PlayerStats`:
 *   { field, label, value, unit?, category }
 * where `field = '{category}_{key}'` (e.g. 'offense_ppg', 'record_wins').
 *
 * No sport-specific field names. The UI renders label + value directly.
 *
 * Queried by: IntelGenerationService (team intel LLM prompt context)
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/core/cache.service.js';
import { logger } from '../../../../utils/logger.js';
import { resolveCreatedAt, seasonToDate } from './doc-date-utils.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAM_STATS_COLLECTION = 'TeamStats';
const TEAMS_COLLECTION = 'Teams';
const MAX_STATS_PER_CALL = 100;

const VALID_TRENDS = new Set(['up', 'down', 'neutral']);

const TeamStatEntrySchema = z
  .object({
    field: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    unit: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    trend: z.string().trim().min(1).optional(),
    trendValue: z.number().optional(),
  })
  .passthrough();

const WriteTeamStatsInputSchema = z.object({
  teamId: z.string().trim().min(1),
  sportId: z.string().trim().min(1),
  season: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  stats: z.array(TeamStatEntrySchema).min(1).max(MAX_STATS_PER_CALL),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteTeamStatsTool extends BaseTool {
  readonly name = 'write_team_stats';

  readonly description =
    'Writes sport-agnostic team season statistics to the TeamStats collection.\n\n' +
    'Call this after reading the "stats" or "standings" section from a team schedule page.\n\n' +
    'Doc ID is {teamId}_{sportId}_{season} — repeated calls for the same season upsert.\n\n' +
    'Stats are sport-agnostic: each entry has field, label, value, unit?, category.\n' +
    'Use field = "{category}_{key}" (e.g. "offense_ppg", "record_wins", "defense_opp_fg_pct").\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- sportId (required): Sport key (e.g. "football", "basketball").\n' +
    '- season (required): Season label (e.g. "2024-2025").\n' +
    '- source (required): Platform slug (e.g. "hudl", "maxpreps").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- stats (required): Array of stat entries:\n' +
    '  • field (required): Machine key e.g. "offense_ppg", "record_wins".\n' +
    '  • label (required): Human-readable label e.g. "Points Per Game".\n' +
    '  • value (required): Stat value (number or formatted string like "11-1" or "48.3%").\n' +
    '  • unit (optional): Unit string e.g. "avg", "%", "pts".\n' +
    '  • category (required): Grouping category e.g. "offense", "defense", "record", "special_teams".\n' +
    '  • trend (optional): "up", "down", or "neutral".\n' +
    '  • trendValue (optional): Numeric change to display with the trend arrow.';

  readonly parameters = WriteTeamStatsInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'team_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WriteTeamStatsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { teamId, sportId, season, source } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl;
    const rawStats = parsed.data.stats;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth: verify actor is team owner ──────────────────────────────
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }
      const teamData = teamDoc.data() ?? {};
      const teamOwnerId = typeof teamData['ownerId'] === 'string' ? teamData['ownerId'] : null;
      if (teamOwnerId !== context.userId) {
        return { success: false, error: 'Not authorized to write stats for this team.' };
      }

      const now = new Date().toISOString();
      const normalizedSportId = sportId.trim().toLowerCase();
      const docId = `${teamId}_${normalizedSportId}_${season.trim()}`;

      // ── Validate and build stat entries ───────────────────────────────
      const validStats: Record<string, unknown>[] = [];
      let skipped = 0;

      for (const rawStat of rawStats) {
        if (!rawStat || typeof rawStat !== 'object') {
          skipped++;
          continue;
        }
        const s = rawStat as Record<string, unknown>;
        const field = this.str(s, 'field');
        const label = this.str(s, 'label');
        const category = this.str(s, 'category');

        if (!field || !label || !category) {
          skipped++;
          continue;
        }

        // value can be number or string
        const rawValue = s['value'];
        if (rawValue === undefined || rawValue === null) {
          skipped++;
          continue;
        }
        const value = typeof rawValue === 'number' ? rawValue : String(rawValue);

        const entry: Record<string, unknown> = {
          field: field.toLowerCase().trim(),
          label,
          value,
          category: category.toLowerCase().trim(),
        };

        const unit = this.str(s, 'unit');
        if (unit) entry['unit'] = unit;

        const trend = this.str(s, 'trend');
        if (trend && VALID_TRENDS.has(trend)) entry['trend'] = trend;

        if (typeof s['trendValue'] === 'number') {
          entry['trendValue'] = s['trendValue'];
        }

        validStats.push(entry);
      }

      if (validStats.length === 0) {
        return { success: false, error: 'No valid stat entries after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        statCount: validStats.length,
        season,
        phase: 'write_team_stats',
      });

      // ── Upsert: merge new stats with existing by field key ─────────────
      const docRef = this.db.collection(TEAM_STATS_COLLECTION).doc(docId);
      const existingDoc = await docRef.get();

      const existingStats: Record<string, unknown>[] = existingDoc.exists
        ? ((existingDoc.data()!['stats'] as Record<string, unknown>[]) ?? [])
        : [];

      // Merge: new stats overwrite existing entries with matching field key
      const mergedMap = new Map<string, Record<string, unknown>>();
      for (const s of existingStats) {
        mergedMap.set(String(s['field'] ?? ''), s);
      }
      for (const s of validStats) {
        mergedMap.set(String(s['field'] ?? ''), s);
      }
      const mergedStats = Array.from(mergedMap.values());

      const docData: Record<string, unknown> = {
        id: docId,
        teamId,
        sportId: normalizedSportId,
        season: season.trim(),
        stats: mergedStats,
        source,
        verified: false,
        provider: source,
        extractedAt: now,
        updatedAt: now,
      };
      if (sourceUrl) docData['sourceUrl'] = sourceUrl;
      docData['createdAt'] = resolveCreatedAt(
        existingDoc.data()?.['createdAt'],
        seasonToDate(season.trim()),
        now
      );

      await docRef.set(docData, { merge: true });

      // ── Cache invalidation ─────────────────────────────────────────────
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${teamId}`),
          cache.del(`team:stats:${teamId}:${normalizedSportId}`),
          cache.del(`team:profile:${teamId}`),
        ]);
      } catch {
        // Best-effort
      }

      return {
        success: true,
        data: {
          teamId,
          sportId: normalizedSportId,
          season,
          docId,
          source,
          written: validStats.length,
          skipped,
          message: `Wrote ${validStats.length} stat(s) for team "${teamId}" (${normalizedSportId} ${season}) from "${source}" (${skipped} skipped).`,
        },
      };
    } catch (err) {
      logger.error('[WriteTeamStats] Failed to write team stats', {
        teamId,
        sportId,
        season,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write team stats',
      };
    }
  }
}
