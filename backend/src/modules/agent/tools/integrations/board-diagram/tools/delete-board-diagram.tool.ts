/**
 * @fileoverview delete_board_diagram tool.
 *
 * Soft-deletes the Firestore asset record and removes the backing PNG from
 * Firebase Storage. This action is irreversible from the agent's perspective.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { DeleteBoardDiagramInputSchema } from '../schemas.js';

export class DeleteBoardDiagramTool extends BaseTool {
  readonly name = 'delete_board_diagram';
  readonly description =
    'Delete a saved board diagram. ' +
    'Soft-deletes the Firestore asset record and removes the backing PNG from Firebase Storage. ' +
    'The diagram will no longer be accessible. This action cannot be undone. ' +
    'Requires the assetId returned by create_board_diagram or update_board_diagram. ' +
    'Only confirm deletion after explicit user approval — do not delete without asking first.';

  readonly parameters = DeleteBoardDiagramInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly boardDiagramService: BoardDiagramService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // Merge userId from context when not explicitly provided in the input
    const parsed = DeleteBoardDiagramInputSchema.safeParse({
      ...input,
      userId: input['userId'] ?? context?.userId,
    });
    if (!parsed.success) return this.zodError(parsed.error);

    try {
      await this.boardDiagramService.deleteDiagram(parsed.data, context);

      return {
        success: true,
        data: {
          assetId: parsed.data.assetId,
          deleted: true,
          message: 'Diagram deleted successfully.',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Board diagram deletion failed',
      };
    }
  }
}
