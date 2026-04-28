import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import { Microsoft365McpSessionService } from '../microsoft-365-mcp-session.service.js';

function createContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    environment: 'staging',
    ...overrides,
  };
}

describe('Microsoft365McpSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when MCP tool returns an error payload', async () => {
    const service = new Microsoft365McpSessionService({} as never, 'http://127.0.0.1:3000/mcp');
    const bridge = {
      executeTool: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: '{"error":"Missing Microsoft credentials"}' }],
      }),
      listToolDefinitions: vi.fn().mockResolvedValue([{ name: 'list-mail-messages' }]),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(service as never, 'getSession').mockResolvedValue({
      bridge,
      userId: 'test-user-123',
      microsoftEmail: 'coach@example.com',
      environment: 'staging',
      lastUsedAtMs: Date.now(),
      cacheKey: null,
    });
    vi.spyOn(service as never, 'releaseEphemeralSession').mockResolvedValue(undefined);

    await expect(
      service.executeAllowedTool(
        'list-mail-messages',
        {
          top: 10,
        },
        createContext()
      )
    ).rejects.toThrow('Missing Microsoft credentials');

    expect(bridge.executeTool).toHaveBeenCalledTimes(1);
  });
});
