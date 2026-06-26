import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRouterResumeService } from '../agent-router-resume.service.js';

describe('AgentRouterResumeService', () => {
  const llm = {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  } as never;

  const toolRegistry = {
    getDefinitions: vi.fn().mockReturnValue([]),
    match: vi.fn().mockResolvedValue([]),
  } as never;

  const contextBuilder = {
    buildContext: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'athlete' }),
    getActiveThreadsSummary: vi.fn().mockResolvedValue(''),
  } as never;

  const routerContext = {
    buildSessionContext: vi.fn().mockReturnValue({ userId: 'user-1', operationId: 'op-1' }),
    enrichIntentWithContext: vi.fn().mockImplementation((intent: string) => intent),
    appendAssistantMessage: vi.fn(),
  } as never;

  const telemetry = {
    emitUpdate: vi.fn(),
  } as never;

  const buildToolAccessContext = vi.fn().mockReturnValue({});

  const makeFirestore = (status: string | undefined): FirebaseFirestore.Firestore =>
    ({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: status !== undefined,
            get: (field: string) => (field === 'status' ? status : undefined),
          }),
        }),
      }),
    }) as unknown as FirebaseFirestore.Firestore;

  const planner = {} as never;

  const makeYieldState = () =>
    ({
      reason: 'needs_input',
      agentId: 'recruiting_coordinator',
      promptToUser: 'Need more detail',
      messages: [],
      pendingToolCall: {
        toolName: 'ask_user',
        toolInput: {},
        toolCallId: 'ask-1',
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) as never;

  const makeJob = () =>
    ({
      operationId: 'op-1',
      userId: 'user-1',
      intent: 'Resume recruiting workflow',
      context: { threadId: 'thread-1', executionMode: 'plan' },
    }) as never;

  const makeAgent = () =>
    ({
      resumeExecution: vi.fn().mockResolvedValue({
        summary: 'Resumed successfully',
        data: { ok: true },
      }),
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cancelled result and skips resumeExecution when persisted status is cancelled', async () => {
    const service = new AgentRouterResumeService(
      llm,
      toolRegistry,
      contextBuilder,
      routerContext,
      telemetry,
      buildToolAccessContext
    );

    const agent = makeAgent();
    const result = await service.runResumed({
      job: makeJob(),
      yieldState: makeYieldState(),
      planner,
      agents: new Map([['recruiting_coordinator', agent]]),
      firestore: makeFirestore('cancelled'),
    });

    expect(result.summary).toContain('Resume cancelled before execution began.');
    expect((result.data as { cancelled?: boolean })?.cancelled).toBe(true);
    expect(agent.resumeExecution).not.toHaveBeenCalled();
  });

  it('continues into agent.resumeExecution when persisted status is not cancelled', async () => {
    const service = new AgentRouterResumeService(
      llm,
      toolRegistry,
      contextBuilder,
      routerContext,
      telemetry,
      buildToolAccessContext
    );

    const agent = makeAgent();
    const result = await service.runResumed({
      job: makeJob(),
      yieldState: makeYieldState(),
      planner,
      agents: new Map([['recruiting_coordinator', agent]]),
      firestore: makeFirestore('awaiting_input'),
    });

    expect(agent.resumeExecution).toHaveBeenCalledTimes(1);
    expect(routerContext.buildSessionContext).toHaveBeenCalledWith(
      'user-1',
      undefined,
      'op-1',
      'thread-1',
      'production',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'plan',
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(toolRegistry.getDefinitions).toHaveBeenCalled();
    expect(toolRegistry.match).toHaveBeenCalled();
    expect(result.summary).toBe('Resumed successfully');
  });

  it('resumes router yields through Primary with per-run dispatch state', async () => {
    const primary = {
      id: 'router',
      beginRun: vi.fn(),
      endRun: vi.fn(),
      resumeExecution: vi.fn().mockResolvedValue({
        summary: 'Primary resumed',
        data: { ok: true },
      }),
    } as never;
    const service = new AgentRouterResumeService(
      llm,
      toolRegistry,
      contextBuilder,
      routerContext,
      telemetry,
      buildToolAccessContext,
      undefined,
      undefined,
      () => primary
    );

    const routerYieldState = {
      ...makeYieldState(),
      agentId: 'router',
    } as never;

    const result = await service.runResumed({
      job: makeJob(),
      yieldState: routerYieldState,
      planner,
      agents: new Map(),
      firestore: makeFirestore('awaiting_input'),
    });

    expect(primary.beginRun).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-1',
        userId: 'user-1',
        enrichedIntent: 'Resume recruiting workflow',
      })
    );
    expect(primary.resumeExecution).toHaveBeenCalledTimes(1);
    expect(primary.endRun).toHaveBeenCalledWith('op-1');
    expect(toolRegistry.match).not.toHaveBeenCalled();
    expect(result.summary).toBe('Primary resumed');
  });
});
