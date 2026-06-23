import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { PlayDiagramService } from './play-diagram.service.js';
import { CreatePlayDiagramInputSchema } from './schemas.js';

function isValidMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

export class CreatePlayDiagramTool extends BaseTool {
  readonly name = 'create_play_diagram';
  readonly description =
    'Create a professional sports play diagram as a PNG image. ' +
    'Use this when a coach or athlete asks to "draw a play", "diagram a route tree", ' +
    '"create a formation diagram", "show me a blitz scheme", or "build a playbook diagram". ' +
    'The tool generates valid mxGraphModel XML via AI, exports it to a PNG, ' +
    'and returns the image URL as the user-facing deliverable; editor metadata is for follow-up edits only unless explicitly requested. ' +
    'Supports football, basketball, soccer, baseball, and softball. ' +
    'After generating, pass imageUrl as diagramUrl into write_playbooks to attach to a play entry.';

  readonly parameters = CreatePlayDiagramInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly diagramService: PlayDiagramService) {
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
      const hasImage = isValidMediaUrl(result.imageUrl);
      const imageName = `${result.title.replace(/\s+/g, '-').toLowerCase()}-diagram.png`;

      return {
        success: true,
        data: {
          // Primary image output — display in chat and pass as diagramUrl to write_playbooks
          imageUrl: hasImage ? result.imageUrl : '',
          ...(hasImage ? { diagramUrl: result.imageUrl } : {}),
          ...(hasImage ? { mimeType: 'image/png' } : {}),
          ...(hasImage ? { imageUrls: [result.imageUrl] } : {}),
          ...(hasImage ? { mediaUrls: [result.imageUrl] } : {}),
          hasVisual: hasImage,
          ...(hasImage
            ? {}
            : {
                visualWarning:
                  'No relevant visual image was found for this play request. Use returned concept text or retry with tighter play wording.',
              }),

          // Edit URL — opens diagram directly in diagrams.net for fine-tuning
          editUrl: result.editUrl,

          // XML — persisted for potential future editor use
          xmlContent: result.xmlContent,

          title: result.title,
          generationMode: result.generationMode,

          ...(result.storagePath ? { storagePath: result.storagePath } : {}),

          ...(hasImage
            ? {
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
                  source: 'play_diagram_export',
                },
              }
            : {}),
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
