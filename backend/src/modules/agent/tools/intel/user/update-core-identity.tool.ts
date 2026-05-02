/**
 * @fileoverview Update Core Identity Tool — Partial-patch core identity fields
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to core identity fields in a User document.
 * Only supplied fields are written; omitted fields remain unchanged.
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

const StringOrNumberSchema = z.union([z.string().trim().min(1), z.number()]);

const UpdateCoreIdentityInputSchema = z.object({
  userId: z.string().trim().min(1),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  aboutMe: z.string().trim().min(1).optional(),
  height: z.string().trim().min(1).optional(),
  weight: z.string().trim().min(1).optional(),
  classOf: z.union([z.number(), z.string().trim().min(1)]).optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  profileImage: z.string().trim().min(1).optional(),
  gpa: StringOrNumberSchema.optional(),
  satScore: StringOrNumberSchema.optional(),
  actScore: StringOrNumberSchema.optional(),
  intendedMajor: z.string().trim().min(1).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateCoreIdentityTool extends BaseTool {
  readonly name = 'update_core_identity';

  readonly description =
    'Partial-updates core identity fields in the user profile. ' +
    'Only supplied fields are written; omitted fields remain unchanged. ' +
    'Use this to correct or enhance existing identity data.';

  readonly parameters = UpdateCoreIdentityInputSchema;

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
    const parsed = UpdateCoreIdentityInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId } = parsed.data;

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
        action: 'tool:update_core_identity',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to update identity data.',
      };
    }

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'update_core_identity',
    });

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);
    const patch: Record<string, unknown> = {};

    // Build patch from supplied fields
    if (parsed.data.firstName !== undefined) patch['firstName'] = parsed.data.firstName;
    if (parsed.data.lastName !== undefined) patch['lastName'] = parsed.data.lastName;
    if (parsed.data.displayName !== undefined) patch['displayName'] = parsed.data.displayName;
    if (parsed.data.aboutMe !== undefined) patch['aboutMe'] = parsed.data.aboutMe;
    if (parsed.data.height !== undefined) patch['height'] = parsed.data.height;
    if (parsed.data.weight !== undefined) patch['weight'] = parsed.data.weight;
    if (parsed.data.classOf !== undefined) patch['classOf'] = parsed.data.classOf;
    if (parsed.data.city !== undefined) patch['city'] = parsed.data.city;
    if (parsed.data.state !== undefined) patch['state'] = parsed.data.state;
    if (parsed.data.country !== undefined) patch['country'] = parsed.data.country;
    if (parsed.data.profileImage !== undefined) patch['profileImage'] = parsed.data.profileImage;
    if (parsed.data.gpa !== undefined) patch['gpa'] = parsed.data.gpa;
    if (parsed.data.satScore !== undefined) patch['satScore'] = parsed.data.satScore;
    if (parsed.data.actScore !== undefined) patch['actScore'] = parsed.data.actScore;
    if (parsed.data.intendedMajor !== undefined) patch['intendedMajor'] = parsed.data.intendedMajor;

    if (Object.keys(patch).length === 0) {
      return {
        success: true,
        data: {
          userId,
          message: 'No fields to update',
        },
      };
    }

    patch['updatedAt'] = new Date();

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

      const patchedFields = Object.keys(patch).filter((k) => k !== 'updatedAt');
      logger.info('[UpdateCoreIdentityTool] Profile updated', {
        userId,
        patchedFields,
      });

      return {
        success: true,
        data: {
          userId,
          patchedFields,
        },
      };
    } catch (error) {
      logger.error('[UpdateCoreIdentityTool] Failed to update identity', {
        err: error instanceof Error ? error.message : String(error),
        userId,
        patch: Object.keys(patch),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update identity data.',
      };
    }
  }
}
