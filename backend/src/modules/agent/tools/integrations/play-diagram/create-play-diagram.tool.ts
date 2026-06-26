import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { PlayDiagramService } from './play-diagram.service.js';
import { CreatePlayDiagramInputSchema } from './schemas.js';

function isValidMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

function buildVerificationPrompt(params: {
  title: string;
  description: string;
  sport?: string;
}): string {
  const sport = params.sport?.trim() || 'unknown';
  const title = params.title.trim();
  const description = params.description.trim();

  return [
    'Verify whether this image is a correct tactical play diagram for the requested play.',
    `Requested sport: ${sport}`,
    `Requested play title: ${title}`,
    `Requested play description: ${description}`,
    '',
    'Return EXACTLY these fields in this order:',
    'VERDICT: PASS or FAIL',
    'TACTICAL_DIAGRAM: yes/no',
    'SPORT_MATCH: yes/no',
    'CONCEPT_MATCH: yes/no/partial/unclear',
    'FORMATION_OR_STRUCTURE_MATCH: yes/no/partial/unclear',
    'ROUTE_OR_ASSIGNMENT_MATCH: yes/no/partial/unclear',
    'VISIBLE_EVIDENCE: short bullet-style sentence describing what is actually visible',
    'MAJOR_PROBLEMS: short bullet-style sentence listing mismatch, ambiguity, missing routes, wrong sport, or generic board issues',
    'SHORT_REASON: one sentence summary',
    '',
    'Decision rule:',
    '- PASS only if this is clearly a tactical X-and-O diagram for the correct sport and the visible concept closely matches the requested play well enough for a coach to trust it.',
    '- FAIL if the image is generic, wrong sport, wrong scheme, missing key routes/spacing, too ambiguous, too low-quality, or only partially matches the requested concept.',
    '- If you are uncertain, return FAIL.',
  ].join('\n');
}

export class CreatePlayDiagramTool extends BaseTool {
  readonly name = 'create_play_diagram';
  readonly description =
    'Find a relevant sports play diagram image via web research. ' +
    'Use this when a coach or athlete asks to "draw a play", "diagram a route tree", ' +
    '"create a formation diagram", "show me a blitz scheme", or "build a playbook diagram". ' +
    'At this time direct diagram generation is disabled; the tool runs Tavily web search and returns the best candidate image URL it found. ' +
    'Agent workflows must call analyze_image on the returned imageUrl before presenting it to the user as a verified diagram. ' +
    'It returns the candidate image URL as the user-facing deliverable; editor metadata is for follow-up edits only unless explicitly requested. ' +
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
      const verificationPrompt = hasImage
        ? buildVerificationPrompt({
            title: result.title,
            description: parsed.data.description,
            sport: parsed.data.sport,
          })
        : undefined;

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
          verificationRequired: hasImage,
          ...(hasImage ? { verificationTool: 'analyze_image' } : {}),
          ...(verificationPrompt ? { verificationPrompt } : {}),
          workflowRequirement: hasImage
            ? 'Call analyze_image on imageUrl before presenting this play diagram candidate to the user.'
            : result.resultStatus === 'search_failed'
              ? 'The play-diagram web search failed before any candidate image could be reviewed. Report the search failure directly or retry the search; do not switch this play request to create_board_diagram.'
              : 'No candidate image was found. Do not switch this play request to create_board_diagram; either refine the play wording or report that no verified play diagram was found.',
          toolRouting:
            'Use create_play_diagram for plays. create_board_diagram is reserved for drills only.',

          // Edit URL — opens diagram directly in diagrams.net for fine-tuning
          editUrl: result.editUrl,

          // XML — persisted for potential future editor use
          xmlContent: result.xmlContent,

          title: result.title,
          resultStatus: result.resultStatus,
          ...(result.failureReason ? { failureReason: result.failureReason } : {}),
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
            : {
                visualWarning:
                  result.resultStatus === 'search_failed'
                    ? 'The play-diagram web search failed before a candidate image could be reviewed. Report the search failure directly instead of calling the tool unavailable for a generic no-match case.'
                    : 'Web search completed, but no relevant visual image met the play-diagram match threshold for this request. Use returned concept text or retry with tighter play wording. Do not substitute create_board_diagram for a normal play request.',
              }),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Play diagram research and vetting failed',
      };
    }
  }
}
