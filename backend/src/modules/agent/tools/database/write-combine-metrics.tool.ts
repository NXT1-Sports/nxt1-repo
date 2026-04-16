/**
 * @fileoverview Write Combine Metrics Tool — Atomic writer for physical measurements
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled metrics (40-yard dash, bench press, vertical jump, etc.)
 * to the root-level collection: PlayerMetrics/{userId}_{sportId}_{field}
 *
 * Each metric uses a deterministic composite doc ID so repeated writes
 * for the same metric field are idempotent (set with merge).
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import { getAnalyticsLoggerService } from '../../../../services/analytics-logger.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAYER_METRICS_COLLECTION = 'PlayerMetrics';
const MAX_METRICS = 50;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteCombineMetricsTool extends BaseTool {
  readonly name = 'write_combine_metrics';

  readonly description =
    'Writes physical combine metrics (speed, strength, agility measurements) to the root ' +
    'PlayerMetrics collection: PlayerMetrics/{userId}_{sportId}_{field}.\n\n' +
    'Call this after reading the "metrics" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "maxpreps").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): The athlete profile URL on the source platform.\n' +
    '- metrics (required): Array of { field, label, value, unit?, category? }.\n' +
    '  field: snake_case machine key (e.g. "forty_yard_dash", "bench_press").\n' +
    '  label: Human-readable name (e.g. "40-Yard Dash").\n' +
    '  value: Number or string measurement.\n' +
    '  unit: Optional (e.g. "seconds", "lbs", "inches").\n' +
    '  category: Optional (e.g. "speed", "strength", "agility").';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      profileUrl: { type: 'string' },
      metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            label: { type: 'string' },
            value: { type: ['string', 'number'] },
            unit: { type: 'string' },
            category: { type: 'string' },
          },
          required: ['field', 'label', 'value'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'metrics'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const sourceUrl = this.str(input, 'sourceUrl') ?? this.str(input, 'profileUrl') ?? undefined;

    const metrics = input['metrics'];
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return { success: false, error: 'metrics must be a non-empty array.' };
    }
    if (metrics.length > MAX_METRICS) {
      return { success: false, error: `metrics array exceeds maximum of ${MAX_METRICS}.` };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_combine_metrics',
      });
      const userData = accessGrant.targetUserData;
      const sportId = targetSport.trim().toLowerCase();
      if (
        !accessGrant.isSelfWrite &&
        !resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant)
      ) {
        return { success: false, error: 'Not authorized to write combine metrics for this sport.' };
      }
      const now = new Date().toISOString();
      const metricsCol = this.db.collection(PLAYER_METRICS_COLLECTION);

      context?.onProgress?.(`Writing ${metrics.length} combine metric(s)…`);

      let written = 0;
      let skipped = 0;
      const writtenRecords: Record<string, unknown>[] = [];

      await Promise.all(
        metrics.map(async (metric) => {
          if (!metric || typeof metric !== 'object') {
            skipped++;
            return;
          }
          const m = metric as Record<string, unknown>;
          const field = this.str(m, 'field');
          const label = this.str(m, 'label');
          const value = m['value'];

          if (!field || !label || value === undefined || value === null) {
            skipped++;
            return;
          }

          const fieldKey = field.trim().toLowerCase();
          const docId = `${userId}_${sportId}_${fieldKey}`;
          const record: Record<string, unknown> = {
            id: docId,
            userId,
            sportId,
            field: fieldKey,
            label,
            value,
            source,
            verified: false,
            dateRecorded: now,
            updatedAt: now,
            // Data lineage
            provider: source,
            extractedAt: now,
          };
          if (sourceUrl) record['sourceUrl'] = sourceUrl;

          const unit = this.str(m, 'unit');
          if (unit) record['unit'] = unit;
          const category = this.str(m, 'category');
          if (category) record['category'] = category;

          await metricsCol.doc(docId).set(record, { merge: true });
          writtenRecords.push(record);
          written++;
        })
      );

      // Cache invalidation
      context?.onProgress?.('Invalidating metrics caches…');
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:metrics:${userId}:${sportId}`),
          invalidateProfileCaches(
            userId,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Best-effort
      }

      if (writtenRecords.length > 0) {
        const analytics = getAnalyticsLoggerService();
        void Promise.allSettled(
          writtenRecords.map((record) =>
            analytics.safeTrack({
              subjectId: userId,
              subjectType: 'user',
              domain: 'performance',
              eventType: 'metric_recorded',
              source: 'agent',
              actorUserId: context.userId,
              sessionId: context.sessionId ?? null,
              threadId: context.threadId ?? null,
              value:
                typeof record['value'] === 'number' || typeof record['value'] === 'string'
                  ? (record['value'] as number | string)
                  : undefined,
              tags: [
                sportId,
                typeof record['field'] === 'string' ? record['field'] : null,
                typeof record['category'] === 'string' ? record['category'] : null,
              ].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0),
              payload: {
                sportId,
                source,
                sourceUrl,
                metricField: record['field'],
                label: record['label'],
                unit: record['unit'],
                category: record['category'],
                value: record['value'],
              },
              metadata: {
                toolName: this.name,
              },
            })
          )
        ).catch((error) => {
          logger.warn('[WriteCombineMetrics] Analytics tracking failed', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      // Metrics writes are intentionally excluded from the deterministic sync-delta
      // trigger flow until they have a dedicated first-class diff model.

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          written,
          skipped,
          message: `Wrote ${written} metric(s) for sport "${sportId}" (${skipped} skipped).`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write metrics',
      };
    }
  }
}
