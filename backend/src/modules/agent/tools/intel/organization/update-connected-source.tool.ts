/**
 * @fileoverview Update Connected Source Tool — Partial-patch connected data sources
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const CONNECTED_SOURCES_COLLECTION = 'ConnectedSources';

const UpdateConnectedSourceInputSchema = z.object({
  docId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  platform: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  accessToken: z.string().trim().min(1).optional(),
  refreshToken: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

export class UpdateConnectedSourceTool extends BaseTool {
  readonly name = 'update_connected_source';
  readonly description = 'Partial-updates a connected data source.';
  readonly parameters = UpdateConnectedSourceInputSchema;
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
    const parsed = UpdateConnectedSourceInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, organizationId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    // Verify access to organization
    const orgDoc = await this.db.collection('Organizations').doc(organizationId).get();
    if (!orgDoc.exists) return { success: false, error: 'Organization not found.' };

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_connected_source' });

    const docRef = this.db.collection(CONNECTED_SOURCES_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.platform !== undefined) patch['platform'] = parsed.data.platform;
    if (parsed.data.accountId !== undefined) patch['accountId'] = parsed.data.accountId;
    if (parsed.data.accessToken !== undefined) patch['accessToken'] = parsed.data.accessToken;
    if (parsed.data.refreshToken !== undefined) patch['refreshToken'] = parsed.data.refreshToken;
    if (parsed.data.isActive !== undefined) patch['isActive'] = parsed.data.isActive;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { docId, organizationId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`org:${organizationId}:`)]);

      logger.info('[UpdateConnectedSourceTool] Source updated', { docId, organizationId });
      return { success: true, data: { docId, organizationId } };
    } catch (error) {
      logger.error('[UpdateConnectedSourceTool] Failed to update source', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        organizationId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update source.',
      };
    }
  }
}
