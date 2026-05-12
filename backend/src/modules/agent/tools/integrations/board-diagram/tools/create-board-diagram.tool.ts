/**
 * @fileoverview create_board_diagram tool.
 *
 * Generates a new play or drill diagram as a PNG, persists it as a first-class
 * Firestore asset, and returns the image URL, diagrams.net editor URL, XML, and
 * the stable assetId needed for future update/delete operations.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { CreateBoardDiagramInputSchema } from '../schemas.js';

export class CreateBoardDiagramTool extends BaseTool {
  readonly name = 'create_board_diagram';
  readonly description =
    'Create a professional sports board diagram as a PNG image. ' +
    'Covers PLAY diagrams (route trees, formations, blitz schemes, coverage maps, zone packages) ' +
    'and DRILL diagrams (cone drills, agility work, PnR mechanics, team warmups, skill progressions). ' +
    'Set kind="sport_play" for competitive play diagrams (default), kind="sport_drill" for training drills. ' +
    'Returns a display-ready image URL for the user; editor metadata is for follow-up edits only unless explicitly requested. ' +
    'the raw mxGraph XML, and a stable assetId for update/delete. ' +
    'The diagram is saved as a first-class asset — pass imageUrl as diagramUrl to write_playbooks. ' +
    'Supports football, basketball, soccer, baseball, and softball.';

  readonly parameters = CreateBoardDiagramInputSchema;
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
    const parsed = CreateBoardDiagramInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'create_board_diagram',
    });

    try {
      const asset = await this.boardDiagramService.createDiagram(parsed.data, context);
      const imageName = `${asset.title.replace(/\s+/g, '-').toLowerCase()}-diagram.png`;

      return {
        success: true,
        data: {
          // Asset identity — required for update_board_diagram / delete_board_diagram
          assetId: asset.id,
          kind: asset.kind,
          sport: asset.sport,

          // Primary image output
          imageUrl: asset.imageUrl,
          diagramUrl: asset.imageUrl,
          mimeType: 'image/png',
          imageUrls: [asset.imageUrl],
          mediaUrls: [asset.imageUrl],

          // Editor access — open in diagrams.net for manual fine-tuning
          editUrl: asset.editUrl,
          xmlContent: asset.xmlContent,

          title: asset.title,
          storagePath: asset.storagePath,

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
        error: error instanceof Error ? error.message : 'Board diagram generation failed',
      };
    }
  }
}
