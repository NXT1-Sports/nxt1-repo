/**
 * @fileoverview Delete Connected Source Tool — Hard delete connected data sources
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const CONNECTED_SOURCES_COLLECTION = 'ConnectedSources';

const DeleteConnectedSourceInputSchema = z.object({
  docId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
});

export class DeleteConnectedSourceTool extends BaseTool {
  readonly name = 'delete_connected_source';
  readonly description = 'Hard deletes a connected data source.';
  readonly parameters = DeleteConnectedSourceInputSchema;
  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'organization_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteConnectedSourceInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, organizationId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    // Verify access to organization
    const orgDoc = await this.db.collection('Organizations').doc(organizationId).get();
    if (!orgDoc.exists) return { success: false, error: 'Organization not found.' };

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'delete_connected_source' });

    const docRef = this.db.collection(CONNECTED_SOURCES_COLLECTION).doc(docId);

    try {
      await docRef.delete();
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`org:${organizationId}:`)]);

      logger.info('[DeleteConnectedSourceTool] Source deleted', { docId, organizationId });
      return { success: true, data: { docId, organizationId, deleted: true } };
    } catch (error) {
      logger.error('[DeleteConnectedSourceTool] Failed to delete source', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        organizationId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete source.',
      };
    }
  }
}
