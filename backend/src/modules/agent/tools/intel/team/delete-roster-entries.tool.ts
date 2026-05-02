/**
 * @fileoverview Delete Roster Entries Tool — Hard delete roster entries
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const ROSTER_COLLECTION = 'Roster';

const DeleteRosterEntriesInputSchema = z.object({
  docId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
});

export class DeleteRosterEntriesTool extends BaseTool {
  readonly name = 'delete_roster_entries';
  readonly description = 'Hard deletes a roster entry.';
  readonly parameters = DeleteRosterEntriesInputSchema;
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
    const parsed = DeleteRosterEntriesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, teamId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists || teamDoc.data()?.['ownerId'] !== context.userId) {
      return { success: false, error: 'Not authorized to delete roster.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'delete_roster_entries' });

    const docRef = this.db.collection(ROSTER_COLLECTION).doc(docId);

    try {
      await docRef.delete();
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`team:${teamId}:`)]);

      logger.info('[DeleteRosterEntriesTool] Entry deleted', { docId, teamId });
      return { success: true, data: { docId, teamId, deleted: true } };
    } catch (error) {
      logger.error('[DeleteRosterEntriesTool] Failed to delete entry', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        teamId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete entry.',
      };
    }
  }
}
