import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { DrawioDiagramService } from './drawio-diagram.service.js';
import { CreatePlayDiagramInputSchema } from './schemas.js';

export class CreatePlayDiagramTool extends BaseTool {
  readonly name = 'create_play_diagram';
  readonly description =
    'Create a professional sports play diagram as a PNG image. ' +
    'Use this when a coach or athlete asks to "draw a play", "diagram a route tree", ' +
    '"create a formation diagram", "show me a blitz scheme", or "build a playbook diagram". ' +
    'The tool generates valid draw.io mxGraphModel XML via AI, exports it to a PNG, ' +
    'and returns the image URL plus the raw XML so coaches can fine-tune the diagram later. ' +
    'Supports all sports: football, basketball, soccer, lacrosse, hockey, etc. ' +
    'After generating, pass imageUrl as diagramUrl into write_playbooks to attach to a play entry.';

  readonly parameters = CreatePlayDiagramInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly diagramService: DrawioDiagramService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreatePlayDiagramInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'create_play_diagram',
    });

    try {
      const result = await this.diagramService.createDiagram(parsed.data, context);
      const imageName = `${result.title.replace(/\s+/g, '-').toLowerCase()}-diagram.png`;
      const markdown = `![${result.title}](${result.imageUrl})`;

      return {
        success: true,
        data: {
          // Primary image output — display in chat and pass as diagramUrl to write_playbooks
          imageUrl: result.imageUrl,
          diagramUrl: result.imageUrl,
          mimeType: 'image/png',
          imageUrls: [result.imageUrl],
          mediaUrls: [result.imageUrl],
          markdown,

          // XML — MUST be persisted in Firestore so coaches can reload into editor
          xmlContent: result.xmlContent,

          // Editor URL — open in iframe for coach fine-tuning
          editUrl: result.editUrl,

          title: result.title,

          ...(result.storagePath ? { storagePath: result.storagePath } : {}),

          files: [
            {
              url: result.imageUrl,
              downloadUrl: result.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          attachments: [
            {
              url: result.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          mediaArtifact: {
            url: result.imageUrl,
            type: 'image',
            mimeType: 'image/png',
            name: imageName,
            source: 'drawio_export',
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Play diagram generation failed',
      };
    }
  }
}
