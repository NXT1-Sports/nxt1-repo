import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../base.tool.js';
import { GetUserProfileTool } from '../get-user-profile.tool.js';
import { GetActiveThreadsTool } from '../get-active-threads.tool.js';
import { GetOtherThreadHistoryTool } from '../get-other-thread-history.tool.js';
import { SearchMemoriesTool } from '../search-memories.tool.js';

describe('Context tools', () => {
  const buildContext = vi.fn();
  const getActiveThreadsSummary = vi.fn();
  const getRecentThreadHistory = vi.fn();
  const recallByScope = vi.fn();

  const contextBuilder = {
    buildContext,
    getActiveThreadsSummary,
    getRecentThreadHistory,
  } as never;

  const vectorMemory = {
    recallByScope,
  } as never;

  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-current',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    buildContext.mockResolvedValue({
      userId: 'user-123',
      role: 'athlete',
      displayName: 'Jordan',
      sport: 'football',
      position: 'QB',
      teamId: 'team-1',
      organizationId: 'org-1',
      activeGoals: ['Increase velocity'],
      currentPlaybookSummary: { completed: 2, total: 5, snoozed: 1 },
    });

    getActiveThreadsSummary.mockResolvedValue(
      '## Active Threads\n\n- thread-a: Recruiting outreach'
    );
    getRecentThreadHistory.mockResolvedValue('User: Analyze this film\nAssistant: Here are notes');
    recallByScope.mockResolvedValue({
      user: [
        {
          id: 'mem-user-1',
          target: 'user',
          content: 'Prefers SEC schools',
          category: 'preference',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      team: [
        {
          id: 'mem-team-1',
          target: 'team',
          teamId: 'team-1',
          content: 'Team prioritizes spring showcases',
          category: 'goal',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      organization: [],
    });
  });

  it('GetUserProfileTool uses execution context userId and formats markdown', async () => {
    const tool = new GetUserProfileTool(contextBuilder);

    const result = await tool.execute({}, context);

    expect(result.success).toBe(true);
    expect(buildContext).toHaveBeenCalledWith('user-123');
    expect(result.markdown).toContain('## User Profile');
    expect(result.markdown).toContain('- role: athlete');
    expect(result.markdown).toContain('- playbook: 2/5 complete (1 snoozed)');
  });

  it('GetUserProfileTool returns error when userId is missing from both input and context', async () => {
    const tool = new GetUserProfileTool(contextBuilder);

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('userId is required');
    expect(buildContext).not.toHaveBeenCalled();
  });

  it('GetActiveThreadsTool forwards maxThreads and returns fallback markdown when empty', async () => {
    const tool = new GetActiveThreadsTool(contextBuilder);
    getActiveThreadsSummary.mockResolvedValueOnce('');

    const result = await tool.execute({ maxThreads: 8 }, context);

    expect(result.success).toBe(true);
    expect(getActiveThreadsSummary).toHaveBeenCalledWith('user-123', 8);
    expect(result.markdown).toContain('No other active threads.');
  });

  it('GetOtherThreadHistoryTool refuses current thread fetch and avoids contextBuilder calls', async () => {
    const tool = new GetOtherThreadHistoryTool(contextBuilder);

    const result = await tool.execute({ threadId: 'thread-current' }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Refusing to read the current thread');
    expect(getRecentThreadHistory).not.toHaveBeenCalled();
  });

  it('GetOtherThreadHistoryTool fetches another thread and formats transcript markdown', async () => {
    const tool = new GetOtherThreadHistoryTool(contextBuilder);

    const result = await tool.execute({ threadId: 'thread-other', maxMessages: 10 }, context);

    expect(result.success).toBe(true);
    expect(getRecentThreadHistory).toHaveBeenCalledWith('thread-other', 10);
    expect(result.markdown).toContain('Thread `thread-other` — Recent History');
    expect(result.markdown).toContain('Analyze this film');
  });

  it('SearchMemoriesTool aggregates scoped memories and emits structured data', async () => {
    const tool = new SearchMemoriesTool(vectorMemory);

    const result = await tool.execute(
      {
        query: 'recruiting priorities',
        k: 6,
        teamId: 'team-1',
        organizationId: 'org-1',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(recallByScope).toHaveBeenCalledWith('user-123', 'recruiting priorities', {
      perTargetLimit: 6,
      targets: ['user', 'team', 'organization'],
      teamId: 'team-1',
      organizationId: 'org-1',
    });

    const data = result.data as { count: number; memories: Array<{ id: string; target: string }> };
    expect(data.count).toBe(2);
    expect(data.memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mem-user-1', target: 'user' }),
        expect.objectContaining({ id: 'mem-team-1', target: 'team' }),
      ])
    );
    expect(result.markdown).toContain('Memory Search Results for "recruiting priorities"');
  });

  it('SearchMemoriesTool returns no-results markdown when recall returns empty sets', async () => {
    const tool = new SearchMemoriesTool(vectorMemory);
    recallByScope.mockResolvedValueOnce({ user: [], team: [], organization: [] });

    const result = await tool.execute({ query: 'nothing found' }, context);

    expect(result.success).toBe(true);
    expect(result.markdown).toContain('No matching memories found.');
  });
});
