/**
 * @fileoverview Delete Recruiting Activity Tool — Hard delete recruiting records
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Permanently removes a recruiting activity document from the `Recruiting` collection.
 * This is a hard delete — the document is irrecoverably erased.
 *
 * Auth: uses ProfileWriteAccessService — same access model as write_recruiting_activity.
 * Cache: invalidates profile recruiting caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const RECRUITING_COLLECTION = 'Recruiting';

const DeleteRecruitingActivityInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteRecruitingActivityTool extends BaseTool {
  readonly name = 'delete_recruiting_activity';

  readonly description =
    'Permanently deletes a recruiting activity record from the Recruiting collection.\n\n' +
    'This is a hard delete — the record cannot be recovered.\n\n' +
    'Parameters:\n' +
    '- docId (required): Firestore document ID of the recruiting record to delete.\n' +
    '- userId (required): Firebase UID of the athlete who owns the record.\n\n' +
    'The tool verifies the record belongs to userId before deleting.\n' +
    'Use update_recruiting_activity to modify a record instead of deleting it.';

  readonly parameters = DeleteRecruitingActivityInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'recruiting_coordinator'] as const;
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
    const parsed = DeleteRecruitingActivityInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, userId } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth ─────────────────────────────────────────────────────────
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:delete_recruiting_activity',
      });

      // ── Verify doc belongs to user ────────────────────────────────────
      const docRef = this.db.collection(RECRUITING_COLLECTION).doc(docId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return { success: false, error: `Recruiting record ${docId} not found.` };
      }

      const docData = docSnap.data() ?? {};
      if (docData['userId'] !== userId) {
        return {
          success: false,
          error: 'Recruiting record does not belong to the specified userId.',
        };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'delete_recruiting_activity',
      });

      await docRef.delete();

      // ── Cache invalidation ────────────────────────────────────────────
      const userData = accessGrant.targetUserData;
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
        cache.delByPrefix(`recruiting:${userId}:`),
      ]);

      logger.info('[DeleteRecruitingActivityTool] Record deleted', { docId, userId });

      return {
        success: true,
        data: {
          docId,
          userId,
          deleted: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete recruiting activity';
      logger.error('[DeleteRecruitingActivityTool] Failed', { error: message, docId, userId });
      return { success: false, error: message };
    }
  }
}
