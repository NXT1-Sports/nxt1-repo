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
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
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

    // Validate user exists
    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);
    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return { success: false, error: `User "${userId}" not found.` };
      }

      const userData = userDoc.data() as Record<string, unknown>;
      const sportId = targetSport.trim().toLowerCase();
      const now = new Date().toISOString();
      const metricsCol = this.db.collection(PLAYER_METRICS_COLLECTION);

      context?.onProgress?.(`Writing ${metrics.length} combine metric(s)…`);

      let written = 0;
      let skipped = 0;

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
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Best-effort
      }

      // ── Delta Trigger (metrics — no structural diff yet, Phase 2) ─────
      // SyncDiffService has no diffMetrics() yet. Fire a minimal delta so
      // the trigger pipeline still runs for metric updates.
      if (written > 0) {
        try {
          const delta = {
            userId,
            sport: sportId,
            source,
            syncedAt: now,
            isEmpty: false,
            identityChanges: [],
            newCategories: [],
            statChanges: [],
            newRecruitingActivities: [],
            newAwards: [],
            newScheduleEvents: [],
            newVideos: [],
            summary: {
              identityFieldsChanged: 0,
              newCategoriesAdded: 0,
              statsUpdated: 0,
              newRecruitingActivities: 0,
              newAwards: 0,
              newScheduleEvents: 0,
              newVideos: 0,
              totalChanges: written,
            },
          } as const;
          onDailySyncComplete(delta).catch((err) =>
            logger.error('[WriteCombineMetrics] Trigger failed', {
              userId,
              sport: sportId,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        } catch (err) {
          logger.error('[WriteCombineMetrics] Delta trigger failed', {
            userId,
            sport: sportId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

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
