/**
 * @fileoverview Update Schedule Event Tool — Partial-patch competitive schedule docs
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to an existing schedule event in the `Schedule`
 * collection. Supports both athlete (ownerType: 'user') and team
 * (ownerType: 'team') events. Only supplied fields are written; omitted
 * fields remain unchanged.
 *
 * Auth:
 *   - ownerType 'user': uses ProfileWriteAccessService (same as write_schedule).
 *   - ownerType 'team': verifies team.ownerId === context.userId.
 *
 * Cache: invalidates relevant profile or team schedule caches on success.
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

const UpdateScheduleEventInputSchema = z.object({
  docId: z.string().trim().min(1),
  scheduleType: z.enum(['game', 'scrimmage', 'practice', 'playoff', 'other']).optional(),
  title: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  opponent: z.string().trim().min(1).optional(),
  isHome: z.boolean().optional(),
  result: z.string().trim().min(1).optional(),
  outcome: z.enum(['win', 'loss', 'draw']).optional(),
  status: z.enum(['upcoming', 'final', 'postponed', 'cancelled']).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateScheduleEventTool extends BaseTool {
  readonly name = 'update_schedule_event';

  readonly description =
    'Applies a partial update to an existing competitive schedule event.\n\n' +
    'Supports both athlete and team schedule events — the tool reads the ownerId\n' +
    'and ownerType from the existing document and enforces appropriate auth.\n\n' +
    'Only the fields you supply are changed — omitted fields remain as-is.\n\n' +
    'Parameters:\n' +
    '- docId (required): Firestore document ID of the schedule event to update.\n' +
    '- scheduleType (optional): New type — "game", "scrimmage", "practice", "playoff", or "other".\n' +
    '- title (optional): Updated event title.\n' +
    '- date (optional): Updated ISO start date string.\n' +
    '- endDate (optional): Updated ISO end date string.\n' +
    '- location (optional): Updated venue or address.\n' +
    '- opponent (optional): Updated opponent name.\n' +
    '- isHome (optional): Updated home/away flag.\n' +
    '- result (optional): Updated score result string (e.g. "W 24-14").\n' +
    '- outcome (optional): Updated outcome — "win", "loss", or "draw".\n' +
    '- status (optional): Updated status — "upcoming", "final", "postponed", or "cancelled".\n\n' +
    'Use delete_schedule_event to remove an event entirely.';

  readonly parameters = UpdateScheduleEventInputSchema;

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
    const parsed = UpdateScheduleEventInputSchema.safeParse(input);
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
        // ── Auth: athlete schedule — use profile write access service ────
        const accessGrant = await createProfileWriteAccessService(
          this.db
        ).assertCanManageAthleteProfileTarget({
          actorUserId: context.userId,
          targetUserId: ownerId,
          action: 'tool:update_schedule_event',
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
        // ── Auth: team schedule — verify actor is team owner ─────────────
        const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(ownerId).get();
        if (!teamDoc.exists) {
          return { success: false, error: `Team ${ownerId} not found.` };
        }
        const teamOwnerId = teamDoc.data()?.['ownerId'] as string | undefined;
        if (teamOwnerId !== context.userId) {
          return {
            success: false,
            error: 'Not authorized to update schedule events for this team.',
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

      // ── Build patch (only supplied fields) ────────────────────────────
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      const patchableFields = [
        'scheduleType',
        'title',
        'date',
        'endDate',
        'location',
        'opponent',
        'isHome',
        'result',
        'outcome',
        'status',
      ] as const;

      for (const field of patchableFields) {
        if (parsed.data[field] !== undefined) {
          patch[field] = parsed.data[field];
        }
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'update_schedule_event',
      });

      await docRef.update(patch);
      await cacheInvalidation();

      const patchedFields = Object.keys(patch).filter((k) => k !== 'updatedAt');
      logger.info('[UpdateScheduleEventTool] Event updated', {
        docId,
        ownerType,
        ownerId,
        patchedFields,
      });

      return {
        success: true,
        data: {
          docId,
          ownerType,
          ownerId,
          patchedFields,
          updatedAt: patch['updatedAt'],
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update schedule event';
      logger.error('[UpdateScheduleEventTool] Failed', { error: message, docId });
      return { success: false, error: message };
    }
  }
}
