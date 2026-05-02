/**
 * @fileoverview Update Team News Tool — Partial-patch team news articles
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const TEAM_NEWS_COLLECTION = 'TeamNews';

const UpdateTeamNewsInputSchema = z.object({
  docId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  publishedAt: z.string().trim().min(1).optional(),
});

export class UpdateTeamNewsTool extends BaseTool {
  readonly name = 'update_team_news';
  readonly description = 'Partial-updates a team news article.';
  readonly parameters = UpdateTeamNewsInputSchema;
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
    const parsed = UpdateTeamNewsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, teamId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists || teamDoc.data()?.['ownerId'] !== context.userId) {
      return { success: false, error: 'Not authorized to update team news.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_team_news' });

    const docRef = this.db.collection(TEAM_NEWS_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.title !== undefined) patch['title'] = parsed.data.title;
    if (parsed.data.content !== undefined) patch['content'] = parsed.data.content;
    if (parsed.data.publishedAt !== undefined) patch['publishedAt'] = parsed.data.publishedAt;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { docId, teamId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`team:${teamId}:`)]);

      logger.info('[UpdateTeamNewsTool] News updated', { docId, teamId });
      return { success: true, data: { docId, teamId } };
    } catch (error) {
      logger.error('[UpdateTeamNewsTool] Failed to update news', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        teamId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update news.',
      };
    }
  }
}
