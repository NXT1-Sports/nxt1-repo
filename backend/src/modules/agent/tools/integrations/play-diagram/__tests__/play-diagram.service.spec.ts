import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayDiagramService } from '../play-diagram.service.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const CANDIDATE_URL = 'https://images.example.com/cover2-diagram.png';

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('PlayDiagramService', () => {
  let service: PlayDiagramService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock = vi.fn(async (url: string) => {
      if (url === TAVILY_URL) {
        return createJsonResponse({
          query: 'cover 2 football playbook diagram',
          images: [
            {
              url: CANDIDATE_URL,
              description: 'Football cover 3 beater playbook diagram showing flood spacing',
            },
          ],
          results: [
            {
              title: 'Cover 2 Breakdown',
              url: 'https://images.example.com/cover2',
              content: 'Two deep safeties with corners pressing flats.',
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    service = new PlayDiagramService({} as OpenRouterService);
  });

  it('returns the best heuristic play image candidate from Tavily search', async () => {
    const result = await service.createDiagram({
      description: 'Cover 3 beater flood concept versus single-high zone',
      sport: 'football',
      title: 'Flood Right',
    });

    expect(result.imageUrl).toBe(CANDIDATE_URL);
    expect(result.resultStatus).toBe('candidate_found');
    expect(result.xmlContent).toContain('Web Search Results for Play Diagram Generation');
  });

  it('retries once with the fallback query when the primary search finds no usable candidate', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          query: 'mesh football playbook diagram',
          images: ['https://other.example.com/random.png'],
          results: [
            {
              title: 'Generic football article',
              url: 'https://coaching.example.com/mesh',
              content: 'An article about offensive philosophy without diagrams.',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          query: 'Bunch Mesh football diagram',
          images: ['https://other.example.com/random-2.png'],
          results: [
            {
              title: 'Another generic football article',
              url: 'https://coaching.example.com/bunch-mesh',
              content: 'Still no concrete tactical diagram in these results.',
            },
          ],
        })
      );

    const result = await service.createDiagram({
      description: 'Trips bunch mesh concept versus man coverage',
      sport: 'football',
      title: 'Bunch Mesh',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.imageUrl).toBe('');
    expect(result.resultStatus).toBe('no_candidate_found');
    expect(result.failureReason).toContain('including one fallback retry');
    expect(result.xmlContent).toContain(
      'Fallback query retried because no usable candidate was found in the primary search.'
    );
  });

  it('returns a fallback candidate when the retry query finds a usable image', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          query: 'mesh football playbook diagram',
          images: ['https://other.example.com/random.png'],
          results: [
            {
              title: 'Generic football article',
              url: 'https://coaching.example.com/mesh',
              content: 'An article about offensive philosophy without diagrams.',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          query: 'Bunch Mesh football diagram',
          images: [
            {
              url: 'https://images.example.com/bunch-mesh-diagram.png',
              description: 'Football bunch mesh playbook diagram showing crossers and seam release',
            },
          ],
          results: [
            {
              title: 'Bunch Mesh Breakdown',
              url: 'https://images.example.com/bunch-mesh',
              content: 'Detailed bunch mesh tactical diagram against man coverage.',
            },
          ],
        })
      );

    const result = await service.createDiagram({
      description: 'Trips bunch mesh concept versus man coverage',
      sport: 'football',
      title: 'Bunch Mesh',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.imageUrl).toBe('https://images.example.com/bunch-mesh-diagram.png');
    expect(result.resultStatus).toBe('candidate_found');
    expect(result.xmlContent).toContain(
      'Fallback query retried because no usable candidate was found in the primary search.'
    );
  });

  it('returns search_failed when Tavily request itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const result = await service.createDiagram({
      description: 'Smash concept versus cover 2',
      sport: 'football',
      title: 'Smash',
    });

    expect(result.imageUrl).toBe('');
    expect(result.resultStatus).toBe('search_failed');
    expect(result.failureReason).toContain('network down');
    expect(result.xmlContent).toContain('Web Search Failed');
  });
});
