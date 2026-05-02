import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { QueryNxt1DataTool } from '../firebase-mcp/query-user-firebase-data.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';

describe('QueryNxt1DataTool', () => {
  const queryView = vi.fn();
  const bridge = { queryView } as never;
  const context: ToolExecutionContext = {
    userId: 'user_123',
    threadId: 'thread_456',
    sessionId: 'session_789',
    emitStage: vi.fn(),
  };

  let tool: QueryNxt1DataTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new QueryNxt1DataTool(bridge);
  });

  it('exposes the expected tool metadata', () => {
    expect(tool.name).toBe('query_nxt1_data');
    expect(tool.isMutation).toBe(false);
    expect(tool.category).toBe('system');
    expect(tool.allowedAgents).toContain('*');
  });

  it('passes only named view arguments and trusted context to the bridge', async () => {
    queryView.mockResolvedValue({
      view: 'user_recruiting_status',
      count: 1,
      items: [{ id: 'rec_1', category: 'offer' }],
    });

    const result = await tool.execute(
      {
        view: 'user_recruiting_status',
        filters: { category: 'offer' },
        limit: 5,
        userId: 'attacker_999',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(queryView).toHaveBeenCalledWith(
      {
        view: 'user_recruiting_status',
        filters: { category: 'offer' },
        limit: 5,
      },
      context
    );
  });

  it('rejects execution without trusted user context', async () => {
    const result = await tool.execute({ view: 'user_profile_snapshot' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authenticated user context');
  });

  it('emits staged progress updates for the accordion lifecycle', async () => {
    queryView.mockResolvedValue({
      view: 'team_roster_members',
      count: 2,
      items: [{ id: 'roster_1' }, { id: 'roster_2' }],
    });

    await tool.execute({ view: 'team_roster_members' }, context);

    expect(context.emitStage).toHaveBeenNthCalledWith(1, 'fetching_data', {
      icon: 'database',
      view: 'team_roster_members',
      phase: 'prepare_request',
    });
    expect(context.emitStage).toHaveBeenLastCalledWith('persisting_result', {
      icon: 'database',
      view: 'team_roster_members',
      phase: 'format_results',
    });
  });

  it('rejects unsupported views before calling the bridge', async () => {
    const result = await tool.execute({ view: 'raw_firestore_access' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid option');
    expect(queryView).not.toHaveBeenCalled();
  });
});
