import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';

const { axiosGetMock, axiosPostMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  axiosPostMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
    post: axiosPostMock,
  },
}));

import { GoogleWorkspaceMcpSessionService } from '../google-workspace-mcp-session.service.js';

function createContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    environment: 'staging',
    ...overrides,
  };
}

describe('GoogleWorkspaceMcpSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosGetMock.mockReset();
    axiosPostMock.mockReset();
  });

  it('throws when the MCP server returns an isError tool result', async () => {
    const service = new GoogleWorkspaceMcpSessionService({} as never, 'http://127.0.0.1:8000/mcp');
    const bridge = {
      executeTool: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: '{"error":"Missing Google credentials"}' }],
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(service as never, 'getSession').mockResolvedValue({
      bridge,
      userId: 'test-user-123',
      googleEmail: 'coach@example.com',
      environment: 'staging',
      lastUsedAtMs: Date.now(),
      cacheKey: null,
    });
    vi.spyOn(service as never, 'releaseEphemeralSession').mockResolvedValue(undefined);

    await expect(
      service.executeAllowedTool(
        'calendar_get_events',
        {
          time_min: '2026-04-20T00:00:00Z',
          time_max: '2026-05-20T00:00:00Z',
          calendar_id: 'primary',
        },
        createContext()
      )
    ).rejects.toThrow('Missing Google credentials');

    expect(bridge.executeTool).toHaveBeenCalledTimes(1);
  });

  it('renders gmail_send_email body to html before MCP execution', async () => {
    const service = new GoogleWorkspaceMcpSessionService({} as never, 'http://127.0.0.1:8000/mcp');
    const bridge = {
      executeTool: vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(service as never, 'getSession').mockResolvedValue({
      bridge,
      userId: 'test-user-123',
      googleEmail: 'coach@example.com',
      environment: 'staging',
      lastUsedAtMs: Date.now(),
      cacheKey: null,
    });
    vi.spyOn(service as never, 'releaseEphemeralSession').mockResolvedValue(undefined);

    await service.executeAllowedTool(
      'gmail_send_email',
      {
        to: ['coach@example.com'],
        subject: 'Update',
        body: '# Hello\n\n- First item\n- Second item',
      },
      createContext()
    );

    expect(bridge.executeTool).toHaveBeenCalledWith(
      'gmail_send_email',
      expect.objectContaining({
        user_google_email: 'coach@example.com',
        body: expect.stringContaining('<h1'),
      }),
      expect.any(Object)
    );

    const calledArgs = bridge.executeTool.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(String(calledArgs['body'] ?? '')).toContain('<ul');
    expect(String(calledArgs['body'] ?? '')).not.toContain('# Hello');
  });

  it('normalizes docs text to readable plain text before MCP execution', async () => {
    const service = new GoogleWorkspaceMcpSessionService({} as never, 'http://127.0.0.1:8000/mcp');
    const bridge = {
      executeTool: vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(service as never, 'getSession').mockResolvedValue({
      bridge,
      userId: 'test-user-123',
      googleEmail: 'coach@example.com',
      environment: 'staging',
      lastUsedAtMs: Date.now(),
      cacheKey: null,
    });
    vi.spyOn(service as never, 'releaseEphemeralSession').mockResolvedValue(undefined);

    axiosGetMock.mockResolvedValue({
      data: {
        body: {
          content: [{ endIndex: 2 }],
        },
      },
    });
    axiosPostMock.mockResolvedValue({ data: { documentId: 'doc_123' } });

    const result = await service.executeAllowedTool(
      'docs_append_text',
      {
        document_id: 'doc_123',
        text: '# Progress Report\n\n- New film uploaded\n- Transcript attached\n\nSee [profile](https://example.com/profile)',
      },
      createContext()
    );

    expect(result).toEqual(
      expect.objectContaining({
        documentId: 'doc_123',
        formattingApplied: true,
      })
    );
    expect(bridge.executeTool).not.toHaveBeenCalled();
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://docs.googleapis.com/v1/documents/doc_123',
      expect.objectContaining({
        params: { fields: 'body/content/endIndex' },
      })
    );
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://docs.googleapis.com/v1/documents/doc_123:batchUpdate',
      expect.objectContaining({
        requests: expect.arrayContaining([
          expect.objectContaining({
            insertText: expect.objectContaining({
              text: expect.stringContaining('Progress Report\n\n'),
            }),
          }),
          expect.objectContaining({
            updateParagraphStyle: expect.objectContaining({
              paragraphStyle: { namedStyleType: 'TITLE' },
            }),
          }),
          expect.objectContaining({
            createParagraphBullets: expect.objectContaining({
              bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
            }),
          }),
        ]),
      }),
      expect.any(Object)
    );
  });
});
