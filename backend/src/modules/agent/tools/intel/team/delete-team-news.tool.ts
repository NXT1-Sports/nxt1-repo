/**
 * @fileoverview Delete Team News Tool — Hard delete team news articles
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const TEAM_NEWS_COLLECTION = 'TeamNews';

const DeleteTeamNewsInputSchema = z.object({
  docId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
});

export class DeleteTeamNewsTool extends BaseTool {
  readonly name = 'delete_team_news';
  readonly description = 'Hard deletes a team news article.';
  readonly parameters = DeleteTeamNewsInputSchema;
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
    const parsed = DeleteTeamNewsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, teamId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists || teamDoc.data()?.['ownerId'] !== context.userId) {
      return { success: false, error: 'Not authorized to delete team news.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'delete_team_news' });

    const docRef = this.db.collection(TEAM_NEWS_COLLECTION).doc(docId);

    try {
      await docRef.delete();
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`team:${teamId}:`)]);

      logger.info('[DeleteTeamNewsTool] News deleted', { docId, teamId });
      return { success: true, data: { docId, teamId, deleted: true } };
    } catch (error) {
      logger.error('[DeleteTeamNewsTool] Failed to delete news', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        teamId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete news.',
      };
    }
  }
}
