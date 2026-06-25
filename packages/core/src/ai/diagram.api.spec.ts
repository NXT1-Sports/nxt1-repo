import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createDiagramAssetApi } from './diagram.api';
import type { HttpAdapter } from '../api/http-adapter.js';

describe('createDiagramAssetApi', () => {
  const http: HttpAdapter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads diagram assets with sport and kind filters', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        diagrams: [
          {
            id: 'diagram-1',
            kind: 'sport_play',
            sport: 'football',
            title: 'Mesh',
            description: 'Mesh concept',
            imageUrl: 'https://cdn.example.com/mesh.png',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        count: 1,
      },
    });

    const api = createDiagramAssetApi(http, '/agent-x');
    const diagrams = await api.listDiagrams({ sport: 'football', kind: 'sport_play', limit: 25 });

    expect(http.get).toHaveBeenCalledWith(
      '/agent-x/diagram-assets?sport=football&kind=sport_play&limit=25'
    );
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0]?.title).toBe('Mesh');
  });

  it('throws on failed list response', async () => {
    vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Nope' });

    const api = createDiagramAssetApi(http, '/agent-x');

    await expect(api.listDiagrams()).rejects.toThrow('Nope');
  });

  it('loads a diagram detail with svg content when available', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        diagram: {
          id: 'diagram-1',
          kind: 'sport_play',
          sport: 'football',
          title: 'Mesh',
          description: 'Mesh concept',
          imageUrl: 'https://cdn.example.com/mesh.png',
          svgContent: '<svg viewBox="0 0 10 10"></svg>',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    });

    const api = createDiagramAssetApi(http, '/agent-x');
    const diagram = await api.getDiagram('diagram-1');

    expect(http.get).toHaveBeenCalledWith('/agent-x/diagram-assets/diagram-1');
    expect(diagram.svgContent).toContain('<svg');
  });

  it('updates a diagram asset', async () => {
    vi.mocked(http.patch).mockResolvedValue({
      success: true,
      data: {
        diagram: {
          id: 'diagram-1',
          kind: 'sport_play',
          sport: 'football',
          title: 'Updated',
          description: 'Updated description',
          imageUrl: 'https://cdn.example.com/mesh.png',
          createdAt: 1,
          updatedAt: 3,
        },
      },
    });

    const api = createDiagramAssetApi(http, '/agent-x');
    const updated = await api.updateDiagram('diagram-1', { title: 'Updated' });

    expect(http.patch).toHaveBeenCalledWith('/agent-x/diagram-assets/diagram-1', {
      title: 'Updated',
    });
    expect(updated.updatedAt).toBe(3);
  });

  it('passes source layout edits through updateDiagram', async () => {
    vi.mocked(http.patch).mockResolvedValue({
      success: true,
      data: {
        diagram: {
          id: 'diagram-1',
          kind: 'sport_play',
          sport: 'football',
          title: 'Updated',
          description: 'Updated description',
          imageUrl: 'https://cdn.example.com/mesh.png',
          sourceLayout: {
            sport: 'football',
            title: 'Updated',
            fieldWidth: 600,
            fieldHeight: 440,
            losY: 300,
            fieldStyle: 'blueprint',
            players: [],
            routes: [],
          },
          createdAt: 1,
          updatedAt: 3,
        },
      },
    });

    const api = createDiagramAssetApi(http, '/agent-x');

    await api.updateDiagram('diagram-1', {
      sourceLayout: {
        sport: 'football',
        title: 'Updated',
        fieldWidth: 600,
        fieldHeight: 440,
        losY: 300,
        fieldStyle: 'blueprint',
        players: [],
        routes: [],
      },
    });

    expect(http.patch).toHaveBeenCalledWith('/agent-x/diagram-assets/diagram-1', {
      sourceLayout: {
        sport: 'football',
        title: 'Updated',
        fieldWidth: 600,
        fieldHeight: 440,
        losY: 300,
        fieldStyle: 'blueprint',
        players: [],
        routes: [],
      },
    });
  });
});
