/**
 * @fileoverview Delete Schedule Event Tool — Hard delete competitive schedule docs
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Permanently removes a schedule event from the `Schedule` collection.
 * Supports both athlete (ownerType: 'user') and team (ownerType: 'team') events.
 * This is a hard delete — the document is irrecoverably erased.
 *
 * Auth:
 *   - ownerType 'user': uses ProfileWriteAccessService.
 *   - ownerType 'team': verifies team.ownerId === context.userId.
 *
 * Cache: invalidates relevant schedule caches on success.
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

const SCHEDULE_COLLECTION = 'Schedule';
const TEAMS_COLLECTION = 'Teams';

const DeleteScheduleEventInputSchema = z.object({
  docId: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteScheduleEventTool extends BaseTool {
  readonly name = 'delete_schedule_event';

  readonly description =
    'Permanently deletes a competitive schedule event from the Schedule collection.\n\n' +
    'Supports both athlete and team schedule events — the tool reads the ownerId\n' +
    'and ownerType from the existing document and enforces appropriate auth.\n\n' +
    'This is a hard delete — the event cannot be recovered.\n\n' +
    'Parameters:\n' +
    '- docId (required): Firestore document ID of the schedule event to delete.\n\n' +
    'Use update_schedule_event to modify an event (e.g. status: "cancelled") instead of deleting.';

  readonly parameters = DeleteScheduleEventInputSchema;

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
    const parsed = DeleteScheduleEventInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Read doc to determine ownerType and ownerId ───────────────────
      const docRef = this.db.collection(SCHEDULE_COLLECTION).doc(docId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return { success: false, error: `Schedule event ${docId} not found.` };
      }

      const docData = docSnap.data() ?? {};
      const ownerType = docData['ownerType'] as 'user' | 'team' | undefined;
      const ownerId = docData['ownerId'] as string | undefined;

      if (!ownerType || !ownerId) {
        return { success: false, error: 'Schedule event is missing ownerType or ownerId.' };
      }

      let cacheInvalidation: () => Promise<void>;

      if (ownerType === 'user') {
        // ── Auth: athlete schedule ────────────────────────────────────────
        const accessGrant = await createProfileWriteAccessService(
          this.db
        ).assertCanManageAthleteProfileTarget({
          actorUserId: context.userId,
          targetUserId: ownerId,
          action: 'tool:delete_schedule_event',
        });
        const userData = accessGrant.targetUserData;
        const cache = getCacheService();

        cacheInvalidation = async () => {
          await Promise.allSettled([
            cache.del(USER_CACHE_KEYS.USER_BY_ID(ownerId)),
            invalidateProfileCaches(
              ownerId,
              typeof userData['unicode'] === 'string' ? userData['unicode'] : null
            ),
            cache.delByPrefix(`schedule:${ownerId}:`),
          ]);
        };
      } else {
        // ── Auth: team schedule ───────────────────────────────────────────
        const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(ownerId).get();
        if (!teamDoc.exists) {
          return { success: false, error: `Team ${ownerId} not found.` };
        }
        const teamOwnerId = teamDoc.data()?.['ownerId'] as string | undefined;
        if (teamOwnerId !== context.userId) {
          return {
            success: false,
            error: 'Not authorized to delete schedule events for this team.',
          };
        }

        const cache = getCacheService();
        cacheInvalidation = async () => {
          await Promise.allSettled([
            cache.delByPrefix(`team:schedule:${ownerId}:`),
            cache.delByPrefix(`schedule:team:${ownerId}:`),
          ]);
        };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'delete_schedule_event',
      });

      await docRef.delete();
      await cacheInvalidation();

      logger.info('[DeleteScheduleEventTool] Event deleted', { docId, ownerType, ownerId });

      return {
        success: true,
        data: {
          docId,
          ownerType,
          ownerId,
          deleted: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete schedule event';
      logger.error('[DeleteScheduleEventTool] Failed', { error: message, docId });
      return { success: false, error: message };
    }
  }
}
