/**
 * @fileoverview update_board_diagram tool.
 *
 * Regenerates an existing diagram asset with a new description or title.
 * The diagram is re-rendered as a new PNG, the Firestore record is patched,
 * and the old PNG is removed from storage. The asset ID remains stable.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { UpdateBoardDiagramInputSchema } from '../schemas.js';

export class UpdateBoardDiagramTool extends BaseTool {
  readonly name = 'update_board_diagram';
  readonly description =
    'Update an existing board diagram by regenerating it with a new description or title. ' +
    'The diagram is re-rendered as a new PNG, the Firestore asset record is patched, ' +
    'and the old PNG is deleted from storage. The assetId remains stable. ' +
    'Use this when a coach wants to refine a play, adjust a drill description, or rename a diagram. ' +
    'Requires the assetId returned by create_board_diagram.';

  readonly parameters = UpdateBoardDiagramInputSchema;
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
    const parsed = UpdateBoardDiagramInputSchema.safeParse({
      ...input,
      userId: input['userId'] ?? context?.userId,
    });
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'update_board_diagram',
    });

    try {
      const asset = await this.boardDiagramService.updateDiagram(parsed.data, context);
      const imageName = `${asset.title.replace(/\s+/g, '-').toLowerCase()}-diagram.png`;

      return {
        success: true,
        data: {
          assetId: asset.id,
          kind: asset.kind,
          sport: asset.sport,

          imageUrl: asset.imageUrl,
          diagramUrl: asset.imageUrl,
          mimeType: 'image/png',
          imageUrls: [asset.imageUrl],
          mediaUrls: [asset.imageUrl],
          ...(asset.svgUrl ? { svgUrl: asset.svgUrl } : {}),

          editUrl: asset.editUrl,
          xmlContent: asset.xmlContent,

          title: asset.title,
          storagePath: asset.storagePath,
          ...(asset.svgStoragePath ? { svgStoragePath: asset.svgStoragePath } : {}),
          updatedAt: asset.updatedAt,

          files: [
            {
              url: asset.imageUrl,
              downloadUrl: asset.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          attachments: [
            {
              url: asset.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          mediaArtifact: {
            url: asset.imageUrl,
            type: 'image',
            mimeType: 'image/png',
            name: imageName,
            source: 'board_diagram_export',
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Board diagram update failed',
      };
    }
  }
}
