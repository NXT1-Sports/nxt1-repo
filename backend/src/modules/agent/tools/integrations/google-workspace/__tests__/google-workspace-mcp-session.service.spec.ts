import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
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
});
