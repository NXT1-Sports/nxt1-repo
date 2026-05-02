/**
 * @fileoverview Update Roster Entries Tool — Partial-patch roster entries
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const ROSTER_COLLECTION = 'Roster';

const UpdateRosterEntriesInputSchema = z.object({
  docId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  playerName: z.string().trim().min(1).optional(),
  jerseyNumber: z.number().optional(),
  position: z.string().trim().min(1).optional(),
  height: z.string().trim().min(1).optional(),
  weight: z.number().optional(),
  classSeason: z.string().trim().min(1).optional(),
});

export class UpdateRosterEntriesTool extends BaseTool {
  readonly name = 'update_roster_entries';
  readonly description = 'Partial-updates a roster entry.';
  readonly parameters = UpdateRosterEntriesInputSchema;
  override readonly allowedAgents = ['data_coordinator'] as const;
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
    const parsed = UpdateRosterEntriesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, teamId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists || teamDoc.data()?.['ownerId'] !== context.userId) {
      return { success: false, error: 'Not authorized to update roster.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_roster_entries' });

    const docRef = this.db.collection(ROSTER_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.playerName !== undefined) patch['playerName'] = parsed.data.playerName;
    if (parsed.data.jerseyNumber !== undefined) patch['jerseyNumber'] = parsed.data.jerseyNumber;
    if (parsed.data.position !== undefined) patch['position'] = parsed.data.position;
    if (parsed.data.height !== undefined) patch['height'] = parsed.data.height;
    if (parsed.data.weight !== undefined) patch['weight'] = parsed.data.weight;
    if (parsed.data.classSeason !== undefined) patch['classSeason'] = parsed.data.classSeason;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { docId, teamId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`team:${teamId}:`)]);

      logger.info('[UpdateRosterEntriesTool] Entry updated', { docId, teamId });
      return { success: true, data: { docId, teamId } };
    } catch (error) {
      logger.error('[UpdateRosterEntriesTool] Failed to update entry', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        teamId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update entry.',
      };
    }
  }
}
