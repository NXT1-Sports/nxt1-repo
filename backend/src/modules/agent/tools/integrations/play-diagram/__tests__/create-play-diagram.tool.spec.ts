import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../../base.tool.js';
import type { PlayDiagramService } from '../play-diagram.service.js';
import { CreatePlayDiagramTool } from '../create-play-diagram.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

const MOCK_RESULT = {
  imageUrl:
    'https://storage.googleapis.com/nxt1-prod/Users/user-1/threads/thread-1/media/play-diagrams/1234-abcd.png',
  xmlContent:
    '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
  editUrl: 'https://app.diagrams.net/#create=base64encodedxml==',
  title: 'Red Zone Mesh',
  storagePath: 'Users/user-1/threads/thread-1/media/play-diagrams/1234-abcd.png',
  resultStatus: 'candidate_found',
};

describe('CreatePlayDiagramTool', () => {
  const diagramService = {
    createDiagram: vi.fn(),
  } satisfies Pick<PlayDiagramService, 'createDiagram'>;

  let tool: CreatePlayDiagramTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new CreatePlayDiagramTool(diagramService as unknown as PlayDiagramService);
  });

  it('returns image + xml when service succeeds', async () => {
    diagramService.createDiagram.mockResolvedValue(MOCK_RESULT);

    const result = await tool.execute(
      { description: 'Red zone mesh concept against man coverage', sport: 'football' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(diagramService.createDiagram).toHaveBeenCalledTimes(1);

    const data = result.data as Record<string, unknown>;
    expect(data['imageUrl']).toBe(MOCK_RESULT.imageUrl);
    expect(data['diagramUrl']).toBe(MOCK_RESULT.imageUrl);
    expect(data['xmlContent']).toBe(MOCK_RESULT.xmlContent);
    expect(data['mimeType']).toBe('image/png');
    expect(data['title']).toBe('Red Zone Mesh');
    expect(data['storagePath']).toBe(MOCK_RESULT.storagePath);
    expect(data['verificationRequired']).toBe(true);
    expect(data['verificationTool']).toBe('analyze_image');
    expect(data['resultStatus']).toBe('candidate_found');
    expect(data['verificationPrompt']).toEqual(expect.stringContaining('VERDICT: PASS or FAIL'));
    expect(data['verificationPrompt']).toEqual(
      expect.stringContaining(
        'Requested play description: Red zone mesh concept against man coverage'
      )
    );
    expect(data['workflowRequirement']).toBe(
      'Call analyze_image on imageUrl before presenting this play diagram candidate to the user.'
    );
    expect(data['toolRouting']).toBe(
      'Use create_play_diagram for plays. create_board_diagram is reserved for drills only.'
    );
    expect(data['mediaArtifact']).toEqual(
      expect.objectContaining({ source: 'play_diagram_export', mimeType: 'image/png' })
    );
  });

  it('emits processing_media stage before calling service', async () => {
    diagramService.createDiagram.mockResolvedValue(MOCK_RESULT);
    const emitStage = vi.fn();
    await tool.execute(
      { description: 'Post route combo', sport: 'football' },
      { ...TEST_CONTEXT, emitStage }
    );
    expect(emitStage).toHaveBeenCalledWith('processing_media', {
      icon: 'media',
      phase: 'create_play_diagram',
    });
  });

  it('fails validation when description is missing', async () => {
    const result = await tool.execute({ sport: 'football' }, TEST_CONTEXT);
    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
    expect(diagramService.createDiagram).not.toHaveBeenCalled();
  });

  it('returns failure when service throws', async () => {
    diagramService.createDiagram.mockRejectedValue(
      new Error('diagrams.net export API returned 503')
    );
    const result = await tool.execute(
      { description: 'Inside zone run', sport: 'football' },
      TEST_CONTEXT
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('diagrams.net export API returned 503');
  });

  it('passes sport and title to the diagram service', async () => {
    diagramService.createDiagram.mockResolvedValue({ ...MOCK_RESULT, title: 'RPO Quick Game' });
    await tool.execute(
      { description: 'RPO quick screen', sport: 'football', title: 'RPO Quick Game' },
      TEST_CONTEXT
    );
    expect(diagramService.createDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football', title: 'RPO Quick Game' }),
      expect.anything()
    );
  });

  it('distinguishes no-candidate results from search failures', async () => {
    diagramService.createDiagram
      .mockResolvedValueOnce({
        ...MOCK_RESULT,
        imageUrl: '',
        resultStatus: 'no_candidate_found',
        failureReason:
          'Web search completed, but no candidate image met the play-diagram match threshold for this request.',
      })
      .mockResolvedValueOnce({
        ...MOCK_RESULT,
        imageUrl: '',
        resultStatus: 'search_failed',
        failureReason: 'Play-diagram web search failed: network down',
      });

    const noCandidate = await tool.execute(
      { description: 'Flood concept', sport: 'football' },
      TEST_CONTEXT
    );
    const noCandidateData = noCandidate.data as Record<string, unknown>;
    expect(noCandidateData['resultStatus']).toBe('no_candidate_found');
    expect(noCandidateData['verificationPrompt']).toBeUndefined();
    expect(noCandidateData['failureReason']).toBe(
      'Web search completed, but no candidate image met the play-diagram match threshold for this request.'
    );
    expect(noCandidateData['visualWarning']).toBe(
      'Web search completed, but no relevant visual image met the play-diagram match threshold for this request. Use returned concept text or retry with tighter play wording. Do not substitute create_board_diagram for a normal play request.'
    );

    const searchFailed = await tool.execute(
      { description: 'Smash concept', sport: 'football' },
      TEST_CONTEXT
    );
    const searchFailedData = searchFailed.data as Record<string, unknown>;
    expect(searchFailedData['resultStatus']).toBe('search_failed');
    expect(searchFailedData['verificationPrompt']).toBeUndefined();
    expect(searchFailedData['failureReason']).toBe('Play-diagram web search failed: network down');
    expect(searchFailedData['visualWarning']).toBe(
      'The play-diagram web search failed before a candidate image could be reviewed. Report the search failure directly instead of calling the tool unavailable for a generic no-match case.'
    );
  });
});
