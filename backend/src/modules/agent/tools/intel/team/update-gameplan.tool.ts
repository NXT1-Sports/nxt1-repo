/**
 * @fileoverview Update Game Plan Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Partially updates a game plan, preserving unmodified fields.
 * Unlike `save_gameplan` which replaces entire document, this merges changes.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { TeamGamePlanDoc } from '@nxt1/core';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans';
const TEAMS_COLLECTION = 'Teams';
const MAX_TAGS = 20;

const AdjustmentTriggerSchema = z
  .object({
    trigger: z.string().trim().min(1),
    diagnosis: z.string().trim().min(1).optional(),
    adjustment: z.string().trim().min(1),
    validationWindow: z.string().trim().min(1).optional(),
    expectedOutcome: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS).optional(),
  })
  .passthrough();

const PrioritySchema = z
  .object({
    kind: z
      .enum([
        'offense',
        'defense',
        'execution',
        'special_teams',
        'transition',
        'set_piece',
        'custom',
      ])
      .optional(),
    label: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })
  .passthrough();

const SectionSchema = z
  .object({
    key: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    order: z.number().int().min(0).optional(),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS).optional(),
  })
  .passthrough();

const PlayReferenceSchema = z
  .object({
    playbookId: z.string().trim().min(1).optional(),
    playName: z.string().trim().min(1),
    diagramUrl: z.string().url().optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .passthrough();

const UpdateGameplanInputSchema = z
  .object({
    gamePlanId: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    phase: z.enum(['pregame', 'in-game', 'postgame', 'scouting']).optional(),
    gameDate: z.string().trim().min(1).optional(),
    opponentName: z.string().trim().min(1).optional(),
    opponentId: z.string().trim().min(1).optional(),
    ownTeamColor: z.string().trim().min(1).optional(),
    opponentTeamColor: z.string().trim().min(1).optional(),
    identityFocus: z.string().trim().min(1).optional(),
    primaryAttackPlan: z.string().trim().min(1).optional(),
    defensivePriorities: z.string().trim().min(1).optional(),
    specialSituations: z.string().trim().min(1).optional(),
    openingScript: z.array(z.string().trim().min(1)).optional(),
    adjustmentTriggers: z.array(AdjustmentTriggerSchema).optional(),
    halftimePriorities: z.array(PrioritySchema).optional(),
    customSections: z.array(SectionSchema).optional(),
    linkedPlays: z.array(PlayReferenceSchema).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: 'At least one field besides gamePlanId must be provided for update',
  });

type UpdateGameplanInput = z.infer<typeof UpdateGameplanInputSchema>;

export class UpdateGameplanTool extends BaseTool {
  readonly name = 'update_gameplan';
  readonly description =
    'Update specific fields of an existing game plan, preserving unmodified data. ' +
    'Pass only the fields you want to change. All other fields remain unchanged. ' +
    'Useful for tactical mid-week adjustments or status changes.';

  readonly parameters = UpdateGameplanInputSchema;
  override readonly allowedAgents = ['strategy_coordinator'] as const;
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
    const parsed = UpdateGameplanInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { gamePlanId, ...updates } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { success: false, error: `Game plan ${gamePlanId} not found.` };
      }

      const gamePlan = doc.data() as TeamGamePlanDoc;
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();

      if (!teamDoc.exists) {
        return { success: false, error: `Team ${gamePlan.teamId} not found.` };
      }

      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        gamePlan.teamId,
        teamDoc.data() ?? {}
      );

      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to update game plans for this team.' };
      }

      context.emitStage?.('updating_gameplan', {
        icon: 'pencil',
        phase: 'update_gameplan',
        gamePlanId,
        fields: Object.keys(updates),
      });

      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        updatedBy: context.userId,
        updatedAt: now,
      };

      // Merge update fields into existing data
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          // Skip undefined/null values to preserve existing
          return;
        }

        if (key === 'title' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'status' && typeof value === 'string') {
          updateData[key] = value;
        } else if (key === 'phase' && typeof value === 'string') {
          updateData[key] = value;
        } else if (key === 'gameDate' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'opponentName' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'opponentId' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'ownTeamColor' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'opponentTeamColor' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'identityFocus' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'primaryAttackPlan' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'defensivePriorities' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'specialSituations' && typeof value === 'string') {
          updateData[key] = value.trim();
        } else if (key === 'openingScript' && Array.isArray(value)) {
          updateData[key] = value.map((v) => String(v).trim()).filter((v) => v.length > 0);
        } else if (key === 'adjustmentTriggers' && Array.isArray(value)) {
          updateData[key] = value;
        } else if (key === 'halftimePriorities' && Array.isArray(value)) {
          updateData[key] = value;
        } else if (key === 'customSections' && Array.isArray(value)) {
          updateData[key] = value;
        } else if (key === 'linkedPlays' && Array.isArray(value)) {
          updateData[key] = value;
        } else if (key === 'tags' && Array.isArray(value)) {
          updateData[key] = value.map((v) => String(v).trim()).filter((v) => v.length > 0);
        } else {
          updateData[key] = value;
        }
      });

      await docRef.update(updateData);

      // Invalidate cache
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${gamePlan.teamId}`),
          cache.del(`team:gameplans:${gamePlan.teamId}:${gamePlan.sport}`),
          cache.del(`team:profile:${gamePlan.teamId}`),
        ]);
      } catch {
        // Best effort only.
      }

      logger.info('[UpdateGameplanTool] Game plan updated', {
        gamePlanId,
        teamId: gamePlan.teamId,
        title: gamePlan.title,
        updatedFields: Object.keys(updates),
        updatedBy: context.userId,
      });

      const opponentLabel = gamePlan.opponentName ? ` vs. ${gamePlan.opponentName}` : '';

      return {
        success: true,
        markdown:
          `Updated game plan **${gamePlan.title}**${opponentLabel}. ` +
          `Modified fields: ${Object.keys(updates).join(', ')}.`,
        data: {
          gamePlan: {
            id: gamePlanId,
            title: updates.title ?? gamePlan.title,
            sport: gamePlan.sport,
            phase: (updates.phase as string) ?? gamePlan.phase,
            status: (updates.status as string) ?? gamePlan.status,
            opponentName: (updates.opponentName as string) ?? gamePlan.opponentName,
            gameDate: (updates.gameDate as string) ?? gamePlan.gameDate,
          },
          message: `Updated game plan "${gamePlan.title}"${opponentLabel} (${Object.keys(updates).length} field(s)).`,
        },
      };
    } catch (error) {
      logger.error('[UpdateGameplanTool] Failed to update game plan', {
        gamePlanId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update game plan',
      };
    }
  }
}
