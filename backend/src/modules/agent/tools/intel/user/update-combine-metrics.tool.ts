/**
 * @fileoverview Update Combine Metrics Tool — Partial-patch computed metrics
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const METRICS_COLLECTION = 'CombineMetrics';

const UpdateCombineMetricsInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  fortyYardDash: z.number().optional(),
  benchPress: z.number().optional(),
  verticalJump: z.number().optional(),
  broadJump: z.number().optional(),
  coneTime: z.number().optional(),
  shuttleTime: z.number().optional(),
  threeConeTime: z.number().optional(),
});

export class UpdateCombineMetricsTool extends BaseTool {
  readonly name = 'update_combine_metrics';
  readonly description = 'Partial-updates individual combine metrics.';
  readonly parameters = UpdateCombineMetricsInputSchema;
  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateCombineMetricsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, userId } = parsed.data;

    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    let userData: Record<string, unknown>;
    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:update_combine_metrics',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Not authorized.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_combine_metrics' });

    const docRef = this.db.collection(METRICS_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.fortyYardDash !== undefined) patch['fortyYardDash'] = parsed.data.fortyYardDash;
    if (parsed.data.benchPress !== undefined) patch['benchPress'] = parsed.data.benchPress;
    if (parsed.data.verticalJump !== undefined) patch['verticalJump'] = parsed.data.verticalJump;
    if (parsed.data.broadJump !== undefined) patch['broadJump'] = parsed.data.broadJump;
    if (parsed.data.coneTime !== undefined) patch['coneTime'] = parsed.data.coneTime;
    if (parsed.data.shuttleTime !== undefined) patch['shuttleTime'] = parsed.data.shuttleTime;
    if (parsed.data.threeConeTime !== undefined) patch['threeConeTime'] = parsed.data.threeConeTime;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { docId, userId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);

      logger.info('[UpdateCombineMetricsTool] Metrics updated', { docId, userId });
      return {
        success: true,
        data: { docId, userId, patchedFields: Object.keys(patch).filter((k) => k !== 'updatedAt') },
      };
    } catch (error) {
      logger.error('[UpdateCombineMetricsTool] Failed to update metrics', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update metrics.',
      };
    }
  }
}
