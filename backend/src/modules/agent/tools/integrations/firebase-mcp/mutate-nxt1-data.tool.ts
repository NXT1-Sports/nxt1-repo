/**
 * @fileoverview MutateNxt1DataTool — Single LLM-callable mutation tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firebase-mcp
 *
 * Replaces 26 one-off write/update/delete tools for non-post collections.
 * All ownership verification and field allow-listing is enforced inside the
 * MCP server process via mutation-policy.ts — the LLM only supplies
 * collection, documentId, operation, and an optional patch payload.
 *
 * Posts (TimelinePosts, TeamPosts) continue to be handled by dedicated
 * write_timeline_post / update_timeline_post / delete_timeline_post tools
 * which have richer validation (media, visibility, mentions).
 */

import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import type { FirebaseMcpBridgeService } from './firebase-mcp-bridge.service.js';
import { ALLOWED_MUTATION_COLLECTIONS } from './mutation-policy.js';

const MutateNxt1DataInputSchema = z.object({
  operation: z
    .enum(['update', 'delete'])
    .describe(
      'The mutation to perform. Use "update" to patch one or more fields; use "delete" to remove the document.'
    ),
  collection: z
    .string()
    .trim()
    .min(1)
    .describe(
      `Firestore collection containing the document. Must be one of: ${ALLOWED_MUTATION_COLLECTIONS.join(', ')}.`
    ),
  documentId: z.string().trim().min(1).describe('Firestore document ID of the record to mutate.'),
  patch: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Fields to merge into the document. Required when operation is "update". ' +
        'Ownership and immutable fields (userId, teamId, ownerId, createdAt) are stripped server-side.'
    ),
});

export class MutateNxt1DataTool extends BaseTool {
  readonly name = 'mutate_nxt1_data';

  readonly description =
    'Update or delete an NXT1 Firestore document in a permitted collection. ' +
    'Ownership is verified server-side — the authenticated user must own the document. ' +
    'Use this for Awards, Rankings, CombineMetrics, PlayerStats, Recruiting, Organizations, ' +
    'Schedule, Roster, TeamStats, TeamNews, Calendar, Events, and similar structured profile data. ' +
    'Do NOT use this for timeline posts — use write_timeline_post / delete_timeline_post instead.';

  readonly parameters = MutateNxt1DataInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;

  constructor(private readonly bridge: FirebaseMcpBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = MutateNxt1DataInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const { operation, collection, documentId, patch } = parsed.data;

    logger.info('[MutateNxt1DataTool] Executing mutation', {
      operation,
      collection,
      documentId,
      userId: context.userId,
      hasPatch: !!patch,
    });

    try {
      const result = await this.bridge.mutate(
        { operation, collection, documentId, patch },
        context
      );

      if (!result.success) {
        return { success: false, error: result.message ?? 'Mutation failed.' };
      }

      return {
        success: true,
        data: {
          collection,
          documentId,
          operation,
          message: result.message,
        },
      };
    } catch (error) {
      logger.error('[MutateNxt1DataTool] Mutation failed', {
        error: error instanceof Error ? error.message : String(error),
        collection,
        documentId,
        operation,
        userId: context.userId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mutation failed.',
      };
    }
  }
}
