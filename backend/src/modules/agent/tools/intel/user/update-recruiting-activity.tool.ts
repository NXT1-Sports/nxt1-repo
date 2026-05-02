/**
 * @fileoverview Update Recruiting Activity Tool — Partial-patch recruiting records
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to an existing recruiting activity document in
 * the `Recruiting` collection. Only supplied fields are written; omitted
 * fields remain unchanged.
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

const VALID_CATEGORIES = ['offer', 'interest', 'visit', 'camp', 'commitment', 'contact'] as const;

const UpdateRecruitingActivityInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  category: z.enum(VALID_CATEGORIES).optional(),
  collegeName: z.string().trim().min(1).optional(),
  collegeLogoUrl: z.string().trim().min(1).optional(),
  division: z.string().trim().min(1).optional(),
  conference: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  scholarshipType: z.string().trim().min(1).optional(),
  coachName: z.string().trim().min(1).optional(),
  coachTitle: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  verified: z.boolean().optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateRecruitingActivityTool extends BaseTool {
  readonly name = 'update_recruiting_activity';

  readonly description =
    'Applies a partial update to an existing recruiting activity record.\n\n' +
    'Only the fields you supply are changed — omitted fields remain as-is.\n\n' +
    'Parameters:\n' +
    '- docId (required): Firestore document ID of the recruiting record.\n' +
    '- userId (required): Firebase UID of the athlete.\n' +
    '- category (optional): New category — "offer", "interest", "visit", "camp", "commitment", or "contact".\n' +
    '- collegeName (optional): Updated college/university name.\n' +
    '- collegeLogoUrl (optional): Updated logo URL.\n' +
    '- division (optional): Updated division (e.g. "D1", "D2").\n' +
    '- conference (optional): Updated conference name.\n' +
    '- city / state (optional): Updated college location.\n' +
    '- date (optional): Updated ISO date string.\n' +
    '- scholarshipType (optional): Updated scholarship type.\n' +
    '- coachName / coachTitle (optional): Updated coach contact details.\n' +
    '- notes (optional): Updated notes.\n' +
    '- verified (optional): Mark whether the activity has been verified.\n\n' +
    'Use delete_recruiting_activity to remove a record entirely.';

  readonly parameters = UpdateRecruitingActivityInputSchema;

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
    const parsed = UpdateRecruitingActivityInputSchema.safeParse(input);
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
        action: 'tool:update_recruiting_activity',
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

      // ── Build patch (only non-undefined fields) ───────────────────────
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      const patchableFields = [
        'category',
        'collegeName',
        'collegeLogoUrl',
        'division',
        'conference',
        'city',
        'state',
        'date',
        'scholarshipType',
        'coachName',
        'coachTitle',
        'notes',
        'verified',
      ] as const;

      for (const field of patchableFields) {
        if (parsed.data[field] !== undefined) {
          patch[field] = parsed.data[field];
        }
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'update_recruiting_activity',
      });

      await docRef.update(patch);

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

      const patchedFields = Object.keys(patch).filter((k) => k !== 'updatedAt');
      logger.info('[UpdateRecruitingActivityTool] Record updated', {
        docId,
        userId,
        patchedFields,
      });

      return {
        success: true,
        data: {
          docId,
          userId,
          patchedFields,
          updatedAt: patch['updatedAt'],
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update recruiting activity';
      logger.error('[UpdateRecruitingActivityTool] Failed', { error: message, docId, userId });
      return { success: false, error: message };
    }
  }
}
