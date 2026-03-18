/**
 * @fileoverview Write Combine Metrics Tool — Atomic writer for physical measurements
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled metrics (40-yard dash, bench press, vertical jump, etc.)
 * to the subcollection: Users/{uid}/sports/{sportId}/metrics/{fieldId}
 *
 * Each metric is keyed by its `field` name (snake_case), so repeated writes
 * for the same metric field are idempotent (set with merge).
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { ContextBuilder } from '../../memory/context-builder.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const MAX_METRICS = 50;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteCombineMetricsTool extends BaseTool {
  readonly name = 'write_combine_metrics';

  readonly description =
    "Writes physical combine metrics (speed, strength, agility measurements) to the athlete's " +
    'metrics subcollection: Users/{uid}/sports/{sportId}/metrics/{fieldId}.\n\n' +
    'Call this after reading the "metrics" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "maxpreps").\n' +
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

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');

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
      const metricsCol = userRef.collection('sports').doc(sportId).collection('metrics');

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

          const docId = field.trim().toLowerCase();
          const record: Record<string, unknown> = {
            id: docId,
            sportId,
            field: docId,
            label,
            value,
            source,
            verified: false,
            dateRecorded: now,
            updatedAt: now,
          };

          const unit = this.str(m, 'unit');
          if (unit) record['unit'] = unit;
          const category = this.str(m, 'category');
          if (category) record['category'] = category;

          await metricsCol.doc(docId).set(record, { merge: true });
          written++;
        })
      );

      // Cache invalidation
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:sub:metrics:${userId}:${sportId}`),
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
