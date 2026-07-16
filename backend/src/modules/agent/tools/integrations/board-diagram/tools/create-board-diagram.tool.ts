/**
 * @fileoverview create_board_diagram tool.
 *
 * Generates a new drill diagram as a PNG, persists it as a first-class Firestore
 * asset, and returns the image URL, diagrams.net editor URL, XML, and the stable
 * assetId needed for future update/delete operations.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { CreateBoardDiagramInputSchema } from '../schemas.js';

function isValidMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

const PLAY_REQUEST_KEYWORDS = [
  'cover ',
  'coverage',
  'route tree',
  'route concept',
  'pass concept',
  'run play',
  'playbook',
  'formation',
  'blitz',
  'mesh',
  'verts',
  'flood',
  'sail',
  'slant',
  'flat',
  'beater',
  'read progression',
  'scheme',
];

const DRILL_REQUEST_KEYWORDS = [
  'drill',
  'station',
  'warmup',
  'skill work',
  'conditioning',
  'footwork',
  'agility',
  'cone',
  'progression',
  'repetition',
  'practice',
  'training',
];

function looksLikePlayRequest(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  const hasPlaySignal = PLAY_REQUEST_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const hasDrillSignal = DRILL_REQUEST_KEYWORDS.some((keyword) => normalized.includes(keyword));

  return hasPlaySignal && !hasDrillSignal;
}

export class CreateBoardDiagramTool extends BaseTool {
  readonly name = 'create_board_diagram';
  readonly description =
    'Create a professional sports board diagram as a PNG image. ' +
    'Use this for DRILL diagrams: cone drills, agility work, PnR mechanics, team warmups, and skill progressions. ' +
    'Standard play requests should use create_play_diagram instead. ' +
    'Set kind="sport_drill" for every request because this tool is drill-only. ' +
    'Returns a display-ready image URL for the user; editor metadata is for follow-up edits only unless explicitly requested. ' +
    'the raw mxGraph XML, and a stable assetId for update/delete. ' +
    'The diagram is saved as a first-class asset — use imageUrl in Team Files strategy documents, saved drill artifacts, or exports when persistence is needed. ' +
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

    const requestText = [parsed.data.title, parsed.data.description].filter(Boolean).join(' ');
    if (looksLikePlayRequest(requestText)) {
      return {
        success: false,
        error:
          'create_board_diagram is drill-only. This request looks like a play or coverage concept, so use create_play_diagram instead and verify the returned image with analyze_image before responding.',
      };
    }

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'create_board_diagram',
    });

    try {
      const asset = await this.boardDiagramService.createDiagram(parsed.data, context);
      const hasImage = isValidMediaUrl(asset.imageUrl);
      const includeVisual = hasImage;
      const imageName = `${asset.title.replace(/\s+/g, '-').toLowerCase()}-diagram.png`;

      return {
        success: true,
        data: {
          // Asset identity — required for update_board_diagram / delete_board_diagram
          assetId: asset.id,
          kind: asset.kind,
          sport: asset.sport,

          // Primary image output
          imageUrl: includeVisual ? asset.imageUrl : '',
          ...(includeVisual ? { diagramUrl: asset.imageUrl } : {}),
          ...(includeVisual ? { mimeType: 'image/png' } : {}),
          ...(includeVisual ? { imageUrls: [asset.imageUrl] } : {}),
          ...(includeVisual ? { mediaUrls: [asset.imageUrl] } : {}),
          hasVisual: includeVisual,
          ...(includeVisual
            ? {}
            : {
                visualWarning:
                  'No relevant drill board image was generated for this request. Retry with tighter drill wording or reduce the concept scope.',
              }),
          ...(asset.svgUrl ? { svgUrl: asset.svgUrl } : {}),

          // Editor access — open in diagrams.net for manual fine-tuning
          editUrl: asset.editUrl,
          xmlContent: asset.xmlContent,

          title: asset.title,
          storagePath: asset.storagePath,
          ...(asset.svgStoragePath ? { svgStoragePath: asset.svgStoragePath } : {}),

          ...(includeVisual
            ? {
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
              }
            : {}),
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
