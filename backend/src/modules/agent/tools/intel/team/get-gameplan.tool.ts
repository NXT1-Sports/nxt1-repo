/**
 * @fileoverview Get Game Plan Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Fetches a single game plan from Firestore `TeamGamePlans` by ID.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { TeamGamePlanDoc } from '@nxt1/core';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans';
const TEAMS_COLLECTION = 'Teams';

const GetGameplanInputSchema = z.object({
  gamePlanId: z.string().trim().min(1),
});

export class GetGameplanTool extends BaseTool {
  readonly name = 'get_gameplan';
  readonly description =
    'Get a saved game plan by ID, including strategic sections and linked play references.';

  readonly parameters = GetGameplanInputSchema;
  override readonly allowedAgents = ['strategy_coordinator'] as const;
  readonly isMutation = false;
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
    const parsed = GetGameplanInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { gamePlanId } = parsed.data;

    try {
      const doc = await this.db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();
      if (!doc.exists) {
        return { success: false, error: `Game plan ${gamePlanId} not found.` };
      }

      const gamePlan = doc.data() as TeamGamePlanDoc;
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();

      const canManageTeam = teamDoc.exists
        ? await canManageTeamMutationForUser(
            this.db,
            context.userId,
            gamePlan.teamId,
            teamDoc.data() ?? {}
          )
        : false;
      const isOwner =
        gamePlan.createdBy === context.userId || gamePlan.updatedBy === context.userId;

      if (!canManageTeam && !isOwner) {
        return { success: false, error: 'Not authorized to view this game plan.' };
      }

      return {
        success: true,
        markdown: `Loaded game plan **${gamePlan.title}** (${gamePlan.sport}).`,
        data: {
          gamePlan,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load game plan',
      };
    }
  }
}
