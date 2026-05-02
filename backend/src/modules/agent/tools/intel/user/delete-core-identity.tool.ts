/**
 * @fileoverview Delete Core Identity Tool — Clear core identity fields
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Clears core identity fields from a User document by setting them to null/empty.
 * This is a soft delete for identity data — the document remains but identity fields are cleared.
 *
 * Auth: uses ProfileWriteAccessService — same access model as write_core_identity.
 * Cache: invalidates profile identity caches on success.
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

const USERS_COLLECTION = 'Users';

const DeleteCoreIdentityInputSchema = z.object({
  userId: z.string().trim().min(1),
  fieldKeys: z.array(z.string().trim().min(1)).min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteCoreIdentityTool extends BaseTool {
  readonly name = 'delete_core_identity';

  readonly description =
    'Clears specified core identity fields from the user profile. ' +
    'Supported fields: firstName, lastName, displayName, aboutMe, height, weight, classOf, city, state, country, profileImage, gpa, satScore, actScore, intendedMajor.';

  readonly parameters = DeleteCoreIdentityInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  // ─── Execute ────────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteCoreIdentityInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, fieldKeys } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    let userData: Record<string, unknown>;
    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:delete_core_identity',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to delete identity data.',
      };
    }

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'delete_core_identity',
    });

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);
    const patch: Record<string, null> = {};

    // Clear specified fields
    for (const key of fieldKeys) {
      patch[key] = null;
    }

    patch['updatedAt'] = new Date() as any;

    try {
      await userRef.update(patch);

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);

      logger.info('[DeleteCoreIdentityTool] Identity fields cleared', {
        userId,
        clearedFields: fieldKeys,
      });

      return {
        success: true,
        data: {
          userId,
          clearedFields: fieldKeys,
        },
      };
    } catch (error) {
      logger.error('[DeleteCoreIdentityTool] Failed to clear identity fields', {
        err: error instanceof Error ? error.message : String(error),
        userId,
        fieldKeys,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete identity data.',
      };
    }
  }
}
