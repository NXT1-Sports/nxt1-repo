import type { SyncDeltaReport } from '@nxt1/core';
import { createHash } from 'node:crypto';
import type { ToolExecutionContext } from './base.tool.js';
import {
  AgentMutationPolicyOutboxModel,
  type AgentMutationPolicyStep,
} from '../../../models/agent/agent-mutation-policy-outbox.model.js';
import { getAnalyticsLoggerService } from '../../../services/core/analytics-logger.service.js';
import { getSyncDeltaEventService } from '../../../services/core/sync-delta-event.service.js';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { SyncMemoryExtractorService } from '../memory/sync-memory-extractor.service.js';
import { SyncDiffService, type PreviousProfileState } from '../sync/index.js';
import type { DistilledProfile } from './integrations/firecrawl/scraping/distillers/distiller.types.js';
import { db as appDb } from '../../../utils/firebase.js';
import { logger } from '../../../utils/logger.js';

const POLICY_VERSION = '2026-05-06-typed-deltas';

interface AdapterResolution {
  readonly previous: PreviousProfileState;
  readonly extracted: DistilledProfile;
}

interface AdapterError {
  readonly error: true;
  readonly reason: string;
}

type AdapterResult = AdapterResolution | AdapterError;

interface TypedDeltaAdapter {
  readonly adapterVersion: string;
  readonly resolve: (
    input: Record<string, unknown>,
    context: ToolExecutionContext | undefined,
    scope: ResolvedMutationScope
  ) => Promise<AdapterResult>;
}

const emptyPreviousState = (): PreviousProfileState => ({});

const baseDistilledProfile = (scope: ResolvedMutationScope): DistilledProfile => ({
  platform: scope.source,
  profileUrl: '',
});

const TYPED_DELTA_ADAPTERS: Readonly<Record<string, TypedDeltaAdapter>> = {
  write_core_identity: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const firstName = String(input['firstName'] ?? '').trim();
      const lastName = String(input['lastName'] ?? '').trim();
      if (!firstName || !lastName) {
        return { error: true, reason: 'Missing required identity fields: firstName/lastName' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          identity: {
            firstName,
            lastName,
            school: String(input['school'] ?? '').trim() || undefined,
          },
        },
      };
    },
  },
  write_season_stats: {
    adapterVersion: '2.0',
    resolve: async (input, _context, scope) => {
      const stats = Array.isArray(input['stats']) ? input['stats'] : [];
      if (stats.length === 0) {
        return { error: true, reason: 'No season stats found in input.stats' };
      }

      // Group flat stat entries by season+category so each DistilledSeasonStats
      // carries real totals/averages — not empty arrays.
      interface StatGroup {
        season: string;
        category: string;
        columns: { key: string; label: string; abbreviation?: string }[];
        totals: Record<string, string | number>;
        averages: Record<string, string | number>;
      }
      const groupMap = new Map<string, StatGroup>();

      for (const entry of stats) {
        const row = (entry ?? {}) as Record<string, unknown>;
        const season = String(row['season'] ?? 'unknown');
        const category = String(row['category'] ?? 'overall');
        const groupKey = `${season}||${category}`;

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { season, category, columns: [], totals: {}, averages: {} });
        }
        const group = groupMap.get(groupKey)!;

        // Each stat entry has: field, label, value, unit?, trend?
        const field = String(row['field'] ?? row['label'] ?? '').trim();
        const label = String(row['label'] ?? row['field'] ?? '').trim();
        const rawValue = row['value'];
        if (!field || rawValue === undefined || rawValue === null) continue;

        const value = typeof rawValue === 'number' ? rawValue : String(rawValue);

        // Register column (dedup by key)
        if (!group.columns.some((c) => c.key === field)) {
          const col: { key: string; label: string; abbreviation?: string } = { key: field, label };
          const unit = String(row['unit'] ?? '').trim();
          if (unit) col['abbreviation'] = unit;
          group.columns.push(col);
        }

        // Totals hold the authoritative value; averages hold per-game values when unit = 'avg'
        const unit = String(row['unit'] ?? '')
          .trim()
          .toLowerCase();
        if (unit === 'avg' || unit === 'per game') {
          group.averages[field] = value;
        } else {
          group.totals[field] = value;
        }
      }

      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          seasonStats: Array.from(groupMap.values()).map((g) => ({
            season: g.season,
            category: g.category,
            columns: g.columns,
            games: [],
            totals: Object.keys(g.totals).length > 0 ? g.totals : undefined,
            averages: Object.keys(g.averages).length > 0 ? g.averages : undefined,
          })),
        },
      };
    },
  },
  write_rankings: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const rankings = Array.isArray(input['rankings']) ? input['rankings'] : [];
      if (rankings.length === 0) {
        return { error: true, reason: 'No rankings found in input.rankings' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          metrics: rankings.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            return {
              field: `ranking_${String(row['rankingSystem'] ?? 'unknown')}`,
              label: `${String(row['rankingSystem'] ?? 'Unknown')} Ranking`,
              value: Number(row['rank'] ?? 0),
              category: 'ranking',
            };
          }),
        },
      };
    },
  },
  write_combine_metrics: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const metrics = Array.isArray(input['metrics']) ? input['metrics'] : [];
      if (metrics.length === 0) {
        return { error: true, reason: 'No combine metrics found in input.metrics' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          metrics: metrics.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            return {
              field: String(row['metricName'] ?? 'unknown'),
              label: String(row['metricName'] ?? 'Unknown Metric'),
              value: Number(row['value'] ?? 0),
              unit: String(row['unit'] ?? '') || undefined,
              category: 'combine',
            };
          }),
        },
      };
    },
  },
  write_recruiting_activity: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const activities = Array.isArray(input['activities']) ? input['activities'] : [];
      if (activities.length === 0) {
        return { error: true, reason: 'No recruiting activity found in input.activities' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          recruiting: activities.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            const normalized = String(row['activityType'] ?? 'interest').toLowerCase();
            const category =
              normalized === 'offer' ||
              normalized === 'visit' ||
              normalized === 'camp' ||
              normalized === 'commitment'
                ? normalized
                : 'interest';
            return {
              category,
              collegeName: String(row['schoolName'] ?? '') || undefined,
              date: String(row['date'] ?? '') || undefined,
              coachName: String(row['coachName'] ?? '') || undefined,
              notes: String(row['notes'] ?? '') || undefined,
            };
          }),
        },
      };
    },
  },
  write_awards: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const awards = Array.isArray(input['awards']) ? input['awards'] : [];
      if (awards.length === 0) {
        return { error: true, reason: 'No awards found in input.awards' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          awards: awards.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            const year = String(row['year'] ?? '').trim();
            return {
              title: String(row['awardName'] ?? row['title'] ?? 'Unknown Award'),
              category: String(row['category'] ?? 'achievement') || undefined,
              issuer: String(row['awardedBy'] ?? row['issuer'] ?? '') || undefined,
              date: String(row['date'] ?? year) || undefined,
              season: String(row['season'] ?? '') || undefined,
            };
          }),
        },
      };
    },
  },
  write_schedule: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const schedule = Array.isArray(input['schedule']) ? input['schedule'] : [];
      if (schedule.length === 0) {
        return { error: true, reason: 'No schedule events found in input.schedule' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          schedule: schedule.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            return {
              date: String(row['date'] ?? row['eventDate'] ?? ''),
              opponent: String(row['opponent'] ?? '') || undefined,
              location: String(row['location'] ?? '') || undefined,
              result: String(row['result'] ?? '') || undefined,
            };
          }),
        },
      };
    },
  },
  write_calendar_events: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const events = Array.isArray(input['events']) ? input['events'] : [];
      if (events.length === 0) {
        return { error: true, reason: 'No calendar events found in input.events' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          schedule: events.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            return {
              date: String(row['date'] ?? row['eventDate'] ?? ''),
              opponent: String(row['opponent'] ?? '') || undefined,
              location: String(row['location'] ?? '') || undefined,
              result: String(row['result'] ?? '') || undefined,
            };
          }),
        },
      };
    },
  },
  write_athlete_videos: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const videos = Array.isArray(input['videos']) ? input['videos'] : [];
      if (videos.length === 0) {
        return { error: true, reason: 'No videos found in input.videos' };
      }
      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          videos: videos.map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            const providerRaw = String(row['platform'] ?? row['provider'] ?? 'other').toLowerCase();
            const provider =
              providerRaw === 'youtube' ||
              providerRaw === 'hudl' ||
              providerRaw === 'vimeo' ||
              providerRaw === 'twitter'
                ? providerRaw
                : 'other';
            return {
              src: String(row['url'] ?? row['src'] ?? ''),
              provider,
              title: String(row['title'] ?? '') || undefined,
            };
          }),
        },
      };
    },
  },
  write_playbooks: {
    adapterVersion: '2.0',
    resolve: async (input, _context, scope) => {
      // 'plays' is the canonical key from WritePlaybooksTool.
      // Fall back to 'playbooks' for legacy compat.
      const plays = Array.isArray(input['plays'])
        ? input['plays']
        : Array.isArray(input['playbooks'])
          ? input['playbooks']
          : [];

      if (plays.length === 0) {
        return { error: true, reason: 'No plays found in input.plays' };
      }

      const sport = String(input['sport'] ?? scope.sport ?? '');
      const playbookName = String(input['name'] ?? 'Main Playbook');

      // Collect aggregate indexes across all plays for the sync delta
      const allFormations = new Set<string>();
      const allConceptTags = new Set<string>();
      const allPersonnel = new Set<string>();

      for (const entry of plays) {
        const row = (entry ?? {}) as Record<string, unknown>;
        if (typeof row['formation'] === 'string' && row['formation']) {
          allFormations.add(row['formation'] as string);
        }
        if (typeof row['personnel'] === 'string' && row['personnel']) {
          allPersonnel.add(row['personnel'] as string);
        }
        if (Array.isArray(row['conceptTags'])) {
          for (const t of row['conceptTags']) allConceptTags.add(String(t));
        }
        // Legacy field names from v1 adapter
        if (Array.isArray(row['formationTypes'])) {
          for (const f of row['formationTypes']) allFormations.add(String(f));
        }
      }

      return {
        previous: emptyPreviousState(),
        extracted: {
          ...baseDistilledProfile(scope),
          playbooks: [
            {
              name: playbookName,
              sport,
              playCount: plays.length,
              formationTypes: allFormations.size > 0 ? Array.from(allFormations).sort() : undefined,
              conceptTags: allConceptTags.size > 0 ? Array.from(allConceptTags).sort() : undefined,
              personnelGroups: allPersonnel.size > 0 ? Array.from(allPersonnel).sort() : undefined,
            },
          ],
        },
      };
    },
  },
  write_team_stats: {
    adapterVersion: '1.0',
    resolve: async (input, _context, scope) => {
      const teamId = String(input['teamId'] ?? scope.teamId ?? '').trim();
      const sportId = String(input['sportId'] ?? scope.sport).trim();
      const season = String(input['season'] ?? '').trim();
      const stats = Array.isArray(input['stats']) ? input['stats'] : [];

      if (!teamId || !sportId || !season || stats.length === 0) {
        return {
          error: true,
          reason: 'write_team_stats missing required fields (teamId, sportId, season, stats)',
        };
      }

      const docId = `${teamId}_${sportId}_${season}`;
      const existingDoc = await appDb.collection('TeamStats').doc(docId).get();
      const previousStats = existingDoc.exists
        ? ((existingDoc.data()?.['stats'] as Record<string, unknown>[]) ?? [])
        : [];

      const hydratedTeam = await hydrateTeamMetadata(teamId);
      const teamSnapshot = hydratedTeam?.teamSnapshot;
      const resolvedSport = hydratedTeam?.sport ?? sportId;
      const toMetric = (
        entry: unknown
      ): {
        field: string;
        label: string;
        value: string | number;
        unit?: string;
        category: string;
      } | null => {
        const row = (entry ?? {}) as Record<string, unknown>;
        const field = String(row['field'] ?? '').trim();
        const label = String(row['label'] ?? field).trim();
        const value = row['value'];
        if (!field || (typeof value !== 'string' && typeof value !== 'number')) {
          return null;
        }

        return {
          field,
          label,
          value,
          unit: String(row['unit'] ?? '').trim() || undefined,
          category: String(row['category'] ?? 'team_stats').trim(),
        };
      };

      return {
        previous: {
          metrics: previousStats
            .map((entry) => toMetric(entry))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
          team: teamSnapshot,
          sportInfo: { sport: resolvedSport },
        },
        extracted: {
          ...baseDistilledProfile(scope),
          team: teamSnapshot as DistilledProfile['team'],
          sportInfo: { sport: resolvedSport },
          metrics: stats
            .map((entry) => toMetric(entry))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
        },
      };
    },
  },
};

// ─── Feature Flag for Typed Deltas ───────────────────────────────────────────

/** Enable/disable typed delta generation. Defaults to true with synthetic fallback. */
const ENABLE_TYPED_DELTAS = process.env['ENABLE_TYPED_DELTAS'] !== 'false';

const SYNC_MEMORY_PROFILED_TOOLS = new Set([
  'write_calendar_events',
  'write_schedule',
  'write_combine_metrics',
  'write_athlete_videos',
  'write_awards',
  'write_recruiting_activity',
  'write_core_identity',
  'write_season_stats',
  'write_rankings',
  'write_playbooks',
  'write_team_stats',
]);

const TEAM_ANALYTICS_ONLY_TOOLS = new Set([
  'write_team_news',
  'write_team_post',
  'write_roster_entries',
]);

interface MutationAnalyticsProfile {
  readonly templateKey: string;
  readonly templateBaseDomain: 'communication' | 'engagement' | 'performance' | 'recruiting';
  readonly tags: readonly string[];
}

const DEFAULT_ANALYTICS_PROFILE: MutationAnalyticsProfile = {
  templateKey: 'mutation_tool_default',
  templateBaseDomain: 'engagement',
  tags: ['mutation'],
};

const MUTATION_ANALYTICS_PROFILES: Readonly<Record<string, MutationAnalyticsProfile>> = {
  write_season_stats: {
    templateKey: 'mutation_write_season_stats',
    templateBaseDomain: 'performance',
    tags: ['season-stats', 'performance'],
  },
  write_rankings: {
    templateKey: 'mutation_write_rankings',
    templateBaseDomain: 'performance',
    tags: ['rankings', 'performance'],
  },
  write_combine_metrics: {
    templateKey: 'mutation_write_combine_metrics',
    templateBaseDomain: 'performance',
    tags: ['combine-metrics', 'performance'],
  },
  write_awards: {
    templateKey: 'mutation_write_awards',
    templateBaseDomain: 'performance',
    tags: ['awards', 'performance'],
  },
  write_recruiting_activity: {
    templateKey: 'mutation_write_recruiting_activity',
    templateBaseDomain: 'recruiting',
    tags: ['recruiting', 'activity'],
  },
  write_timeline_post: {
    templateKey: 'mutation_write_timeline_post',
    templateBaseDomain: 'engagement',
    tags: ['timeline-post', 'engagement'],
  },
  send_email: {
    templateKey: 'mutation_send_email',
    templateBaseDomain: 'communication',
    tags: ['email', 'communication'],
  },
  gmail_send_email: {
    templateKey: 'mutation_gmail_send_email',
    templateBaseDomain: 'communication',
    tags: ['gmail', 'communication'],
  },
  batch_send_email: {
    templateKey: 'mutation_batch_send_email',
    templateBaseDomain: 'communication',
    tags: ['batch-email', 'communication'],
  },
  write_playbooks: {
    templateKey: 'mutation_write_playbooks',
    templateBaseDomain: 'performance',
    tags: ['playbooks', 'coaching'],
  },
  write_team_stats: {
    templateKey: 'mutation_write_team_stats',
    templateBaseDomain: 'performance',
    tags: ['team-stats', 'performance', 'team'],
  },
  write_schedule: {
    templateKey: 'mutation_write_schedule',
    templateBaseDomain: 'performance',
    tags: ['schedule', 'team'],
  },
  write_calendar_events: {
    templateKey: 'mutation_write_calendar_events',
    templateBaseDomain: 'performance',
    tags: ['calendar', 'schedule', 'team'],
  },
  write_athlete_videos: {
    templateKey: 'mutation_write_athlete_videos',
    templateBaseDomain: 'engagement',
    tags: ['video', 'highlight', 'media'],
  },
  write_core_identity: {
    templateKey: 'mutation_write_core_identity',
    templateBaseDomain: 'performance',
    tags: ['identity', 'profile'],
  },
};

export interface AgentMutationPolicyInput {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly context?: ToolExecutionContext;
}

interface ResolvedMutationScope {
  readonly subjectId: string;
  readonly sport: string;
  readonly source: string;
  readonly teamId?: string;
  readonly organizationId?: string;
}

interface HydratedTeamMetadata {
  readonly teamId: string;
  readonly organizationId?: string;
  readonly sport?: string;
  readonly teamSnapshot: Record<string, unknown>;
}

let _syncMemoryExtractor: SyncMemoryExtractorService | null = null;

function getSyncMemoryExtractor(): SyncMemoryExtractorService {
  if (_syncMemoryExtractor) return _syncMemoryExtractor;
  const llm = new OpenRouterService({ firestore: appDb });
  const vectorMemory = new VectorMemoryService(llm);
  _syncMemoryExtractor = new SyncMemoryExtractorService(
    vectorMemory,
    new ContextBuilder(vectorMemory),
    llm
  );
  return _syncMemoryExtractor;
}

export class AgentMutationPolicyService {
  async apply(input: AgentMutationPolicyInput): Promise<void> {
    const executionKey = this.buildExecutionKey(input.toolName, input.input, input.context);
    const scope = await this.resolveScope(input.input, input.context);

    if (!scope.subjectId) {
      logger.warn('[AgentMutationPolicy] Skipping policy because no subjectId could be resolved', {
        toolName: input.toolName,
        operationId: input.context?.operationId,
      });
      return;
    }

    const analyticsProfile =
      MUTATION_ANALYTICS_PROFILES[input.toolName] ?? DEFAULT_ANALYTICS_PROFILE;
    const analyticsTags = [
      'agent-mutation-policy',
      input.toolName,
      ...analyticsProfile.tags,
      scope.sport,
      scope.source,
    ].filter((tag) => typeof tag === 'string' && tag.trim().length > 0);

    await this.runStepExactlyOnce(input, executionKey, scope, 'analytics', async () => {
      await getAnalyticsLoggerService().safeTrack({
        subjectId: scope.subjectId,
        subjectType: 'user',
        domain: 'custom',
        eventType: 'agent_mutation_tool_executed',
        source: 'agent',
        actorUserId: input.context?.userId ?? scope.subjectId,
        sessionId: input.context?.sessionId ?? null,
        threadId: input.context?.threadId ?? null,
        tags: analyticsTags,
        payload: {
          toolName: input.toolName,
          operationId: input.context?.operationId ?? null,
          threadId: input.context?.threadId ?? null,
          sessionId: input.context?.sessionId ?? null,
          sport: scope.sport,
          source: scope.source,
          teamId: scope.teamId ?? null,
          organizationId: scope.organizationId ?? null,
        },
        metadata: {
          templateId: 'agent_mutation_policy',
          templateKey: analyticsProfile.templateKey,
          templateBaseDomain: analyticsProfile.templateBaseDomain,
          policyVersion: POLICY_VERSION,
        },
      });
    });

    if (TEAM_ANALYTICS_ONLY_TOOLS.has(input.toolName)) {
      return;
    }

    if (!SYNC_MEMORY_PROFILED_TOOLS.has(input.toolName)) {
      return;
    }

    // ─── Generate Delta (Typed or Synthetic) ──────────────────────────────────

    let delta: SyncDeltaReport;
    let generationType: 'typed' | 'synthetic' = 'synthetic';
    let fallbackReason: string | undefined;

    if (ENABLE_TYPED_DELTAS) {
      const typedResult = await this.tryTypedDelta(input, scope);
      if (typedResult.success) {
        delta = typedResult.delta;
        generationType = 'typed';
      } else {
        fallbackReason = typedResult.fallbackReason;
        delta = this.buildSyntheticDelta(input.toolName, input.input, scope);
      }
    } else {
      delta = this.buildSyntheticDelta(input.toolName, input.input, scope);
    }

    // Add metadata tagging
    delta = {
      ...delta,
      metadata: {
        generationType,
        policyVersion: POLICY_VERSION,
        fallbackReason,
      },
    };

    await this.runStepExactlyOnce(input, executionKey, scope, 'sync_delta', async () => {
      await getSyncDeltaEventService().record(delta);
    });

    await this.runStepExactlyOnce(input, executionKey, scope, 'memory', async () => {
      await getSyncMemoryExtractor().storeDeltaMemories(delta);
    });
  }

  private async runStepExactlyOnce(
    input: AgentMutationPolicyInput,
    executionKey: string,
    scope: ResolvedMutationScope,
    step: AgentMutationPolicyStep,
    runner: () => Promise<void>
  ): Promise<void> {
    const existing = await AgentMutationPolicyOutboxModel.findOne({
      executionKey,
      step,
      status: 'completed',
    })
      .select('_id')
      .lean()
      .exec();

    if (existing) return;

    const nowIso = new Date().toISOString();

    try {
      await runner();

      await AgentMutationPolicyOutboxModel.findOneAndUpdate(
        { executionKey, step },
        {
          $set: {
            userId: scope.subjectId,
            toolName: input.toolName,
            operationId: input.context?.operationId,
            threadId: input.context?.threadId,
            sessionId: input.context?.sessionId,
            executionKey,
            step,
            status: 'completed',
            policyVersion: POLICY_VERSION,
            metadata: {
              sport: scope.sport,
              source: scope.source,
              teamId: scope.teamId,
              organizationId: scope.organizationId,
            },
            completedAt: nowIso,
            updatedAt: nowIso,
          },
          $setOnInsert: {
            createdAt: nowIso,
          },
          $inc: { attempts: 1 },
        },
        { upsert: true }
      ).exec();
    } catch (error) {
      await AgentMutationPolicyOutboxModel.findOneAndUpdate(
        { executionKey, step },
        {
          $set: {
            userId: scope.subjectId,
            toolName: input.toolName,
            operationId: input.context?.operationId,
            threadId: input.context?.threadId,
            sessionId: input.context?.sessionId,
            executionKey,
            step,
            status: 'failed',
            policyVersion: POLICY_VERSION,
            errorMessage: error instanceof Error ? error.message : String(error),
            updatedAt: nowIso,
          },
          $setOnInsert: {
            createdAt: nowIso,
          },
          $inc: { attempts: 1 },
        },
        { upsert: true }
      ).exec();

      throw error;
    }
  }

  private async resolveScope(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ResolvedMutationScope> {
    const source = this.readString(input, 'source') ?? 'agent_mutation_tool';
    const resolvedSport =
      this.readString(input, 'sport') ??
      this.readString(input, 'sportId') ??
      this.readString(input, 'targetSport') ??
      'unknown';

    const directTeamId =
      this.readString(input, 'teamId') ??
      this.readString(input, 'ownerId') ??
      this.readString(input, 'resolvedTeamId') ??
      undefined;

    const directOrgId =
      this.readString(input, 'organizationId') ?? this.readString(input, 'orgId') ?? undefined;

    const teamCode =
      this.readString(input, 'teamCode') ?? this.readString(input, 'code') ?? undefined;
    const hydratedTeam = await this.resolveTeamFromInput(directTeamId, teamCode);

    const teamId = directTeamId ?? hydratedTeam?.teamId;
    const organizationId = directOrgId ?? hydratedTeam?.organizationId;
    const subjectId =
      this.readString(input, 'userId') ??
      context?.userId ??
      this.readString(input, 'ownerUserId') ??
      teamId ??
      '';

    return {
      subjectId,
      sport: hydratedTeam?.sport ?? resolvedSport,
      source,
      teamId,
      organizationId,
    };
  }

  private async resolveTeamFromInput(
    teamId: string | undefined,
    teamCode: string | undefined
  ): Promise<HydratedTeamMetadata | undefined> {
    if (teamId) {
      return hydrateTeamMetadata(teamId);
    }

    if (!teamCode) return undefined;

    try {
      const byTeamCode = await appDb
        .collection('Teams')
        .where('teamCode', '==', teamCode)
        .limit(1)
        .get();

      if (!byTeamCode.empty) {
        return hydrateTeamMetadata(byTeamCode.docs[0].id);
      }

      const byCode = await appDb.collection('Teams').where('code', '==', teamCode).limit(1).get();
      if (!byCode.empty) {
        return hydrateTeamMetadata(byCode.docs[0].id);
      }
    } catch (error) {
      logger.warn('[AgentMutationPolicy] Team resolution lookup failed', {
        teamCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return undefined;
  }

  private buildExecutionKey(
    toolName: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): string {
    const stablePayload = {
      toolName,
      operationId: context?.operationId ?? null,
      threadId: context?.threadId ?? null,
      sessionId: context?.sessionId ?? null,
      userId: context?.userId ?? null,
      input,
      policyVersion: POLICY_VERSION,
    };

    const hash = createHash('sha256')
      .update(this.stableStringify(stablePayload))
      .digest('hex')
      .slice(0, 24);

    return `mutation_policy_${hash}`;
  }

  private buildSyntheticDelta(
    toolName: string,
    input: Record<string, unknown>,
    scope: ResolvedMutationScope
  ): SyncDeltaReport {
    const snapshot = this.safeSnapshot(input);
    const syncedAt = new Date().toISOString();

    return {
      userId: scope.subjectId,
      teamId: scope.teamId,
      organizationId: scope.organizationId,
      sport: scope.sport,
      source: scope.source,
      syncedAt,
      isEmpty: false,
      identityChanges: [
        {
          field: `agent_mutation.${toolName}`,
          oldValue: null,
          newValue: snapshot,
        },
      ],
      newCategories: [],
      statChanges: [],
      newRecruitingActivities: [],
      newAwards: [],
      newScheduleEvents: [],
      newVideos: [],
      newPlaybooks: [],
      summary: {
        identityFieldsChanged: 1,
        newCategoriesAdded: 0,
        statsUpdated: 0,
        newRecruitingActivities: 0,
        newAwards: 0,
        newScheduleEvents: 0,
        newVideos: 0,
        newPlaybooks: 0,
        totalChanges: 1,
      },
    };
  }

  // ─── Typed Delta Generation ──────────────────────────────────────────────────

  private async tryTypedDelta(
    input: AgentMutationPolicyInput,
    scope: ResolvedMutationScope
  ): Promise<
    { success: true; delta: SyncDeltaReport } | { success: false; fallbackReason: string }
  > {
    const adapter = TYPED_DELTA_ADAPTERS[input.toolName];
    if (!adapter) {
      return { success: false, fallbackReason: `No adapter for tool ${input.toolName}` };
    }

    try {
      const adapterResult = await adapter.resolve(input.input, input.context, scope);

      if ('error' in adapterResult && adapterResult.error) {
        logger.info('[AgentMutationPolicy] Adapter resolution failed, falling back to synthetic', {
          toolName: input.toolName,
          reason: adapterResult.reason,
        });
        return { success: false, fallbackReason: adapterResult.reason };
      }

      const { previous, extracted } = adapterResult as AdapterResolution;
      const diffService = new SyncDiffService();
      const userId = scope.subjectId;
      const sport = scope.sport;
      const source = scope.source;
      const delta = diffService.diff(userId, sport, source, previous, extracted) as SyncDeltaReport;

      // Preserve scope hints
      return {
        success: true,
        delta: {
          ...delta,
          teamId: scope.teamId,
          organizationId: scope.organizationId,
        },
      };
    } catch (error) {
      logger.error('[AgentMutationPolicy] Typed delta generation failed', {
        error: error instanceof Error ? error.message : String(error),
        toolName: input.toolName,
      });
      return {
        success: false,
        fallbackReason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private safeSnapshot(input: Record<string, unknown>): Record<string, unknown> {
    const clone = this.deepSanitize(input);
    if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
      return {};
    }

    const sanitizedObject = clone as Record<string, unknown>;
    const keys = Object.keys(sanitizedObject).sort();
    const snapshot: Record<string, unknown> = {};
    for (const key of keys.slice(0, 12)) {
      snapshot[key] = sanitizedObject[key];
    }
    return snapshot;
  }

  private deepSanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (this.isSensitiveKeyValue(value)) return '[REDACTED]';
      return value.slice(0, 256);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 25).map((entry) => this.deepSanitize(entry));
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        out[key] = this.isSensitiveKey(key) ? '[REDACTED]' : this.deepSanitize(obj[key]);
      }
      return out;
    }
    return String(value);
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(obj[key])}`).join(',')}}`;
    }
    return JSON.stringify(String(value));
  }

  private readString(input: Record<string, unknown>, key: string): string | undefined {
    const value = input[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private isSensitiveKey(key: string): boolean {
    return /(password|token|secret|authorization|api[_-]?key|ssn|social)/i.test(key);
  }

  private isSensitiveKeyValue(value: string): boolean {
    return /^bearer\s+/i.test(value);
  }
}

let mutationPolicyService: AgentMutationPolicyService | null = null;

export function getAgentMutationPolicyService(): AgentMutationPolicyService {
  mutationPolicyService ??= new AgentMutationPolicyService();
  return mutationPolicyService;
}

async function hydrateTeamMetadata(teamId: string): Promise<HydratedTeamMetadata | undefined> {
  try {
    const teamDoc = await appDb.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) return undefined;

    const teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
    const location =
      teamData['location'] && typeof teamData['location'] === 'object'
        ? (teamData['location'] as Record<string, unknown>)
        : {};

    const organizationId =
      typeof teamData['organizationId'] === 'string' && teamData['organizationId'].trim().length > 0
        ? teamData['organizationId'].trim()
        : undefined;

    let orgData: Record<string, unknown> = {};
    if (organizationId) {
      const orgDoc = await appDb.collection('Organizations').doc(organizationId).get();
      if (orgDoc.exists) {
        orgData = (orgDoc.data() ?? {}) as Record<string, unknown>;
      }
    }

    const orgLocation =
      orgData['location'] && typeof orgData['location'] === 'object'
        ? (orgData['location'] as Record<string, unknown>)
        : {};

    const sport =
      (typeof teamData['sportId'] === 'string' ? teamData['sportId'] : undefined) ??
      (typeof teamData['sport'] === 'string' ? teamData['sport'] : undefined) ??
      undefined;

    return {
      teamId,
      organizationId,
      sport,
      teamSnapshot: {
        name: typeof teamData['name'] === 'string' ? teamData['name'] : undefined,
        type: typeof teamData['type'] === 'string' ? teamData['type'] : undefined,
        conference: typeof teamData['conference'] === 'string' ? teamData['conference'] : undefined,
        division: typeof teamData['division'] === 'string' ? teamData['division'] : undefined,
        seasonRecord:
          typeof teamData['seasonRecord'] === 'string' ? teamData['seasonRecord'] : undefined,
        mascot:
          typeof orgData['mascot'] === 'string'
            ? orgData['mascot']
            : typeof teamData['mascot'] === 'string'
              ? teamData['mascot']
              : undefined,
        logoUrl:
          typeof orgData['logoUrl'] === 'string'
            ? orgData['logoUrl']
            : typeof teamData['logoUrl'] === 'string'
              ? teamData['logoUrl']
              : undefined,
        primaryColor:
          typeof orgData['primaryColor'] === 'string'
            ? orgData['primaryColor']
            : typeof teamData['primaryColor'] === 'string'
              ? teamData['primaryColor']
              : undefined,
        secondaryColor:
          typeof orgData['secondaryColor'] === 'string'
            ? orgData['secondaryColor']
            : typeof teamData['secondaryColor'] === 'string'
              ? teamData['secondaryColor']
              : undefined,
        city:
          typeof orgLocation['city'] === 'string'
            ? orgLocation['city']
            : typeof location['city'] === 'string'
              ? location['city']
              : undefined,
        state:
          typeof orgLocation['state'] === 'string'
            ? orgLocation['state']
            : typeof location['state'] === 'string'
              ? location['state']
              : undefined,
        country:
          typeof orgLocation['country'] === 'string'
            ? orgLocation['country']
            : typeof location['country'] === 'string'
              ? location['country']
              : undefined,
      },
    };
  } catch (error) {
    logger.warn('[AgentMutationPolicy] Team hydration failed', {
      teamId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
