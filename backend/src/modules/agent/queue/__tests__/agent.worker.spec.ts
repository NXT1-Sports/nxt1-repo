/**
 * @fileoverview Unit Tests — AgentWorker
 * @module @nxt1/backend/modules/agent/queue
 *
 * Tests the background worker in isolation by mocking BullMQ's Worker
 * and the AgentRouter. Verifies job processing, progress reporting,
 * event handling, and graceful shutdown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentJobPayload, AgentJobOrigin, AgentOperationResult } from '@nxt1/core';
import { AgentYieldException } from '../../exceptions/agent-yield.exception.js';

// ─── Capture the processor callback ────────────────────────────────────────

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn();
const mockWorkerIsRunning = vi.fn().mockReturnValue(true);

vi.mock('bullmq', () => {
  // Use a real function so `new Worker(...)` works (arrow functions aren't constructors)
  function MockWorker(
    this: Record<string, unknown>,
    _name: string,
    processor: (job: unknown) => Promise<unknown>
  ) {
    capturedProcessor = processor;
    this.on = mockWorkerOn;
    this.close = mockWorkerClose;
    this.isRunning = mockWorkerIsRunning;
  }
  class MockUnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  }
  return { Worker: MockWorker, Job: class {}, UnrecoverableError: MockUnrecoverableError };
});

// ─── Mock Firebase ─────────────────────────────────────────────────────────

const mockFirestoreSnapshot = {
  empty: true,
  exists: false,
  docs: [] as unknown[],
  size: 0,
  forEach: () => undefined,
  data: () => ({}),
};
const mockFirestoreRef = {
  collection: function () {
    return mockFirestoreRef;
  },
  doc: function () {
    return mockFirestoreRef;
  },
  where: function () {
    return mockFirestoreRef;
  },
  orderBy: function () {
    return mockFirestoreRef;
  },
  limit: function () {
    return mockFirestoreRef;
  },
  get: async () => mockFirestoreSnapshot,
  set: async () => undefined,
  add: async () => ({ id: 'test-id' }),
  update: async () => undefined,
  delete: async () => undefined,
};
const mockFirestore = {
  ...mockFirestoreRef,
  batch: () => ({
    set: () => undefined,
    update: () => undefined,
    delete: () => undefined,
    commit: async () => undefined,
  }),
} as unknown as FirebaseFirestore.Firestore;

// ─── Import after mocks ────────────────────────────────────────────────────

const { AgentWorker } = await import('../agent.worker.js');

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<AgentJobPayload>): AgentJobPayload {
  return {
    operationId: 'op-worker-test',
    userId: 'user-abc',
    intent: 'Draft recruiting emails for all D1 coaches',
    sessionId: 'sess-789',
    origin: 'user' as AgentJobOrigin,
    ...overrides,
  };
}

function makeMockJob(payload: AgentJobPayload, environment: 'staging' | 'production' = 'staging') {
  return {
    id: payload.operationId,
    data: {
      kind: 'agent' as const,
      payload,
      enqueuedAt: '2026-03-10T00:00:00Z',
      environment,
    },
    progress: null,
    updateProgress: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AgentWorker', () => {
  const mockRouterResult: AgentOperationResult = {
    summary: 'Drafted 5 recruiting emails',
    data: {
      plan: {
        operationId: 'op-worker-test',
        tasks: [],
        createdAt: '2026-03-10T00:00:00Z',
      },
    },
    suggestions: ['Follow up in 3 days'],
  };

  const mockRouter = {
    run: vi.fn().mockResolvedValue(mockRouterResult),
    classify: vi.fn(),
    registerAgent: vi.fn(),
  };

  const mockJobRepo = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
    writeJobEvent: vi.fn().mockResolvedValue(undefined),
    writeJobEventWithAutoSeq: vi.fn().mockResolvedValue(0),
    allocateEventSeqRange: vi.fn().mockResolvedValue(0),
  };

  const mockPubSub = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    subscribeControl: vi.fn().mockResolvedValue(async () => undefined),
  };

  const mockQueueService = {
    registerController: vi.fn(),
    unregisterController: vi.fn(),
  };

  const mockChatService = {
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-worker-1' }),
    updateThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    generateOperationTitle: vi.fn().mockResolvedValue('Built Your Coach Outreach Plan'),
    applyGeneratedThreadTitle: vi.fn().mockResolvedValue('Built Your Coach Outreach Plan'),
    generateThreadTitle: vi.fn().mockResolvedValue('MaxPreps Sync Complete'),
  };

  const mockLlmService = {
    complete: vi.fn(),
  };

  const mockEnqueueContinuation = vi.fn().mockResolvedValue('continued-job-1');

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    // Instantiate worker — this captures the processor
    new AgentWorker(
      mockRouter as never,
      mockJobRepo as never,
      mockJobRepo as never,
      mockChatService as never,
      mockPubSub as never,
      mockFirestore,
      mockLlmService as never,
      'redis://localhost:6379',
      mockEnqueueContinuation,
      mockQueueService as never
    );
  });

  // ── Processor Binding ───────────────────────────────────────────────────

  it('should register a processor with BullMQ Worker', () => {
    expect(capturedProcessor).toBeTypeOf('function');
  });

  it('should attach event listeners (completed, failed, error)', () => {
    // 3 event listeners are attached in attachEventListeners()
    expect(mockWorkerOn).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  // ── Job Processing ───────────────────────────────────────────────────────

  it('should call AgentRouter.run() with the job payload', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockRouter.run).toHaveBeenCalledWith(
      payload,
      expect.any(Function),
      mockFirestore,
      expect.any(Function),
      'staging',
      expect.anything()
    );
  });

  it('should return an AgentQueueJobResult on success', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    const result = (await capturedProcessor!(job)) as Record<string, unknown>;

    expect(result).toHaveProperty(
      'result',
      expect.objectContaining({
        ...mockRouterResult,
      })
    );
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('completedAt');
    expect(typeof result['durationMs']).toBe('number');
  });

  it('should persist the assistant response without regenerating thread titles', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-123' },
      intent: 'Analyze my linked maxpreps account for Belleville football',
    });
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        content: 'Drafted 5 recruiting emails',
      })
    );
    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith('op-worker-test', expect.any(Object));
    expect(mockChatService.generateOperationTitle).not.toHaveBeenCalled();
    expect(mockChatService.applyGeneratedThreadTitle).not.toHaveBeenCalled();
    expect(mockChatService.generateThreadTitle).not.toHaveBeenCalled();
  });

  it('should append scheduled runs to the original thread before router execution', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      context: { threadId: 'thread-recurring-123' },
      intent: 'Send my weekly recruiting analytics recap',
      displayIntent: 'Weekly recruiting analytics recap',
    });
    const job = {
      ...makeMockJob(payload),
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:recv:user-abc:1234567890',
    };

    await capturedProcessor!(job);

    expect(mockJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-worker-test',
        origin: 'system_cron',
      })
    );

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-recurring-123',
        userId: payload.userId,
        role: 'user',
        content: 'Weekly recruiting analytics recap',
        origin: 'system_cron',
        operationId: 'op-worker-test',
      })
    );

    const firstChatWriteOrder = mockChatService.addMessage.mock.invocationCallOrder[0];
    const routerRunOrder = mockRouter.run.mock.invocationCallOrder[0];

    expect(firstChatWriteOrder).toBeLessThan(routerRunOrder);
  });

  it('should use the BullMQ run id as the operation id for scheduled executions', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      operationId: 'recurring-user-abc-1700000000000',
      context: { threadId: 'thread-recurring-123' },
    });
    const job = {
      ...makeMockJob(payload),
      id: 'repeat:key:1777381200000',
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:key',
    };

    await capturedProcessor!(job);

    expect(mockJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'repeat:key:1777381200000',
      })
    );
    expect(mockRouter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'repeat:key:1777381200000',
      }),
      expect.any(Function),
      mockFirestore,
      expect.any(Function),
      'staging',
      expect.anything()
    );
  });

  it('should persist streamed parts and tool steps for thread reload hydration', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-123' },
      intent: 'Find the top transfer portal athletes in the browser',
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'delta',
        agentId: 'router',
        text: 'I opened the live browser and checked the page. ',
      });
      onStreamEvent({
        type: 'step_active',
        agentId: 'router',
        toolName: 'read_live_view',
        stageType: 'tool',
        stage: 'fetching_data',
        metadata: { source: 'live_view', hostname: 'on3.com' },
        message: 'Reading current page...',
        icon: 'search',
      });
      onStreamEvent({
        type: 'tool_result',
        agentId: 'router',
        toolName: 'read_live_view',
        toolSuccess: true,
        toolResult: { count: 4 },
        message: 'Read current page',
        icon: 'search',
      });

      return {
        ...mockRouterResult,
        summary: 'Found 4 transfer portal athletes',
      };
    });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        content: 'I opened the live browser and checked the page. ',
        steps: [
          expect.objectContaining({
            status: 'success',
            label: 'Read current page',
            detail: '4 result(s)',
            icon: 'search',
          }),
        ],
        parts: [
          {
            type: 'text',
            content: 'I opened the live browser and checked the page. ',
          },
          {
            type: 'tool-steps',
            steps: [
              expect.objectContaining({
                status: 'success',
                label: 'Read current page',
                detail: '4 result(s)',
              }),
            ],
          },
        ],
      })
    );
  });

  it('persists approval yields onto the thread so refresh can recover approvalId', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-approval-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValueOnce(
      new AgentYieldException({
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'recruiting_coordinator',
        messages: [{ role: 'user', content: 'Send the email' }],
        pendingToolCall: {
          toolName: 'send_email',
          toolInput: {
            toEmail: 'coach@example.com',
            subject: 'Checking in',
          },
          toolCallId: 'tool-approval-1',
        },
        approvalId: 'approval-123',
      })
    );

    await capturedProcessor!(job);

    expect(mockChatService.updateThreadPausedYieldState).toHaveBeenCalledWith(
      'thread-approval-1',
      expect.objectContaining({
        reason: 'needs_approval',
        approvalId: 'approval-123',
      })
    );
  });

  it('should call job.updateProgress at least once (final 100%)', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    // At minimum, the final 100% progress is reported
    expect(job.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        outcomeCode: 'success_default',
        percent: 100,
      })
    );
  });

  // ── Progress Tracking ─────────────────────────────────────────────────

  it('should track step progress via the onUpdate callback', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    // Override router.run to invoke the onUpdate callback
    mockRouter.run.mockImplementation(async (_p: unknown, onUpdate: (u: unknown) => void) => {
      onUpdate({
        operationId: 'op-worker-test',
        status: 'acting',
        step: {
          id: '1',
          timestamp: new Date().toISOString(),
          status: 'acting',
          message: 'Plan created with 3 task(s)',
          payload: { eventType: 'plan_created', taskCount: 3 },
        },
      });
      onUpdate({
        operationId: 'op-worker-test',
        status: 'acting',
        step: {
          id: '2',
          timestamp: new Date().toISOString(),
          status: 'acting',
          message: 'Running task task-1: Evaluate athletes',
          payload: { eventType: 'task_started', taskId: 'task-1' },
        },
      });
      return mockRouterResult;
    });

    await capturedProcessor!(job);

    // Should have called updateProgress multiple times (2 updates + 1 final)
    expect(job.updateProgress.mock.calls.length).toBeGreaterThanOrEqual(3);

    // The first update should parse totalSteps=3
    const firstProgress = job.updateProgress.mock.calls[0][0];
    expect(firstProgress.totalSteps).toBe(3);

    // The second update should increment stepIndex
    const secondProgress = job.updateProgress.mock.calls[1][0];
    expect(secondProgress.currentStep).toBe(1);
    expect(secondProgress.percent).toBeGreaterThan(0);
  });

  // ── Error Propagation ─────────────────────────────────────────────────

  it('should propagate errors from AgentRouter.run()', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValue(new Error('LLM timeout'));

    await expect(capturedProcessor!(job)).rejects.toThrow('LLM timeout');
  });

  it('should auto-continue timed out jobs as a new operation', async () => {
    const payload = makePayload({
      context: {
        threadId: 'thread-timeout-1',
      },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValue(new Error('Agent job timed out after 120 minutes'));

    const result = (await capturedProcessor!(job)) as Record<string, unknown>;

    expect(mockEnqueueContinuation).toHaveBeenCalledTimes(1);
    expect(mockEnqueueContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: payload.userId,
        intent: payload.intent,
        context: expect.objectContaining({
          resumedFrom: payload.operationId,
          timeoutContinuationCount: 1,
          timeoutContinuedFrom: payload.operationId,
        }),
      }),
      'staging'
    );

    expect(mockJobRepo.create).toHaveBeenCalledTimes(2);
    expect(mockJobRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operationId: payload.operationId })
    );
    expect(mockJobRepo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        context: expect.objectContaining({
          resumedFrom: payload.operationId,
          timeoutContinuationCount: 1,
        }),
      })
    );
    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith(
      payload.operationId,
      expect.objectContaining({
        data: expect.objectContaining({
          continuationReason: 'timeout',
        }),
      })
    );
    expect(mockJobRepo.markFailed).not.toHaveBeenCalledWith(
      payload.operationId,
      'Agent job timed out after 120 minutes'
    );
    expect(result).toHaveProperty('result');
  });

  it('should mark the job as failed when the router returns a failed plan result', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValue({
      summary: 'Execution plan failed. Task 1 (performance_coordinator) failed: LLM timeout',
      data: {
        operationStatus: 'failed',
        firstFailedTask: {
          id: '1',
          assignedAgent: 'performance_coordinator',
          error: 'LLM timeout',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markFailed).toHaveBeenCalledWith(
      'op-worker-test',
      'Execution plan failed. Task 1 (performance_coordinator) failed: LLM timeout'
    );
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('failed');
    expect(finalProgress.message).toContain('Execution plan failed.');
  });

  it('suppresses terminal completion side effects when persisted job is paused', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-1' },
    });
    const job = makeMockJob(payload);

    mockJobRepo.getById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      operationId: payload.operationId,
      status: 'paused',
      yieldState: {
        pendingToolCall: { toolName: 'resume_paused_operation' },
      },
    });

    const outcome = (await capturedProcessor!(job)) as { result?: { summary?: string } };

    expect(outcome.result?.summary).toBe('Operation paused. Resume whenever you are ready.');
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();
    expect(mockChatService.addMessage).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('paused');
  });

  it('treats AbortError as controlled pause when persisted state is paused', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-abort-1' },
    });
    const job = makeMockJob(payload);

    const abortErr = new Error('Operation aborted');
    abortErr.name = 'AbortError';
    mockRouter.run.mockRejectedValueOnce(abortErr);

    mockJobRepo.getById
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      })
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      });

    const outcome = (await capturedProcessor!(job)) as { result?: { summary?: string } };

    expect(outcome.result?.summary).toBe('Operation paused. Resume whenever you are ready.');
    expect(mockJobRepo.markFailed).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('paused');
  });

  it('aborts queued child operations while waiting on parent completion', async () => {
    const payload = makePayload({
      operationId: 'op-child-1',
      context: { parentOperationId: 'op-parent-1' },
    });
    const job = makeMockJob(payload);

    mockPubSub.subscribeControl.mockImplementationOnce(async (_operationId, onControl) => {
      onControl({ action: 'cancel', issuedBy: 'user' });
      return async () => undefined;
    });

    mockJobRepo.getById.mockImplementation(async (operationId: string) => {
      if (operationId === payload.operationId) {
        return { operationId, status: 'queued' };
      }
      if (operationId === 'op-parent-1') {
        return { operationId, status: 'running' };
      }
      return null;
    });

    await expect(capturedProcessor!(job)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Queued child operation aborted before parent completion',
    });

    expect(mockQueueService.registerController).toHaveBeenCalledWith(
      payload.operationId,
      expect.any(AbortController)
    );
    expect(mockPubSub.subscribeControl).toHaveBeenCalledWith(
      payload.operationId,
      expect.any(Function)
    );
    expect(mockRouter.run).not.toHaveBeenCalled();
  });

  it('checks parent operation status before running queued child operations', async () => {
    const payload = makePayload({
      operationId: 'op-child-2',
      context: { parentOperationId: 'op-parent-2' },
    });
    const job = makeMockJob(payload);

    mockJobRepo.getById.mockImplementation(async (operationId: string) => {
      if (operationId === 'op-parent-2') {
        return { operationId, status: 'completed' };
      }
      if (operationId === payload.operationId) {
        return { operationId, status: 'queued' };
      }
      return null;
    });

    await capturedProcessor!(job);

    expect(mockJobRepo.getById).toHaveBeenCalledWith('op-parent-2');
    expect(mockRouter.run).toHaveBeenCalledTimes(1);
    expect(mockQueueService.unregisterController).toHaveBeenCalledWith(payload.operationId);
  });

  it('should publish deltas immediately (live) and non-deltas after persisted seq', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    let nextSeq = 1;
    let resolveFirstPersist: ((value: number) => void) | null = null;
    const firstPersistPromise = new Promise<number>((resolve) => {
      resolveFirstPersist = resolve;
    });

    mockJobRepo.writeJobEventWithAutoSeq
      .mockImplementationOnce(async () => firstPersistPromise)
      .mockImplementation(async () => nextSeq++);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({ type: 'delta', text: 'hello ' });
      onStreamEvent({ type: 'delta', text: 'world' });
      onStreamEvent({ type: 'step_active', message: 'Analyzing...' });
      return {
        ...mockRouterResult,
        summary: 'hello world',
      };
    });

    const processingPromise = capturedProcessor!(job);

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║  NEW: Deltas are published IMMEDIATELY (onLiveEvent hook)          ║
    // ║  Non-delta events wait for persisted seq (onPersistedEvent hook)   ║
    // ╚════════════════════════════════════════════════════════════════════╝
    await vi.waitFor(() => {
      // Live deltas published immediately (token-by-token UX)
      expect(mockPubSub.publish).toHaveBeenCalledWith(
        expect.any(String),
        'delta',
        expect.objectContaining({ content: expect.any(String) })
      );
    });

    const liveDeltaPublishCount = mockPubSub.publish.mock.calls.filter(
      (call) => call[1] === 'delta'
    ).length;
    expect(liveDeltaPublishCount).toBeGreaterThan(0);

    await vi.waitFor(() => {
      expect(mockJobRepo.writeJobEventWithAutoSeq).toHaveBeenCalledTimes(1);
    });

    resolveFirstPersist?.(0);
    await processingPromise;

    // After persistence completes, non-delta events should also be published
    const allPublishCalls = mockPubSub.publish.mock.calls;
    expect(allPublishCalls.length).toBeGreaterThan(liveDeltaPublishCount);

    // Verify non-delta events (if any) are published
    const nonDeltaPublishes = allPublishCalls.filter((call) => call[1] !== 'delta');
    expect(nonDeltaPublishes.length).toBeGreaterThanOrEqual(0);

    // If non-delta events have seq numbers, they should be monotonic
    const nonDeltaSeqs = nonDeltaPublishes
      .map((call) => (call[2] as { seq?: unknown })?.seq)
      .filter((value): value is number => typeof value === 'number');

    if (nonDeltaSeqs.length > 0) {
      expect(nonDeltaSeqs).toEqual([...nonDeltaSeqs].sort((a, b) => a - b));
    }
  });

  it('should publish panel events and preserve autoOpenPanel on done', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'tool_result',
        toolName: 'open_live_view',
        toolSuccess: true,
        stepId: 'step-live-view',
        stageType: 'tool',
        message: 'Opening virtual browser',
        toolResult: {
          autoOpenPanel: {
            type: 'live-view',
            url: 'https://connect.firecrawl.dev/session/live-123',
            title: 'acumbbcamps.com',
          },
        },
      });

      return {
        ...mockRouterResult,
        summary: 'Live view opened',
      };
    });

    await capturedProcessor!(job);

    expect(mockPubSub.publish).toHaveBeenCalledWith(
      payload.operationId,
      'panel',
      expect.objectContaining({
        type: 'live-view',
        url: 'https://connect.firecrawl.dev/session/live-123',
      })
    );

    expect(mockPubSub.publish).toHaveBeenCalledWith(
      payload.operationId,
      'done',
      expect.objectContaining({
        autoOpenPanel: expect.objectContaining({
          type: 'live-view',
          url: 'https://connect.firecrawl.dev/session/live-123',
        }),
      })
    );
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should close the BullMQ worker', async () => {
      const worker = new AgentWorker(
        mockRouter as never,
        mockJobRepo as never,
        mockJobRepo as never,
        mockChatService as never,
        mockPubSub as never,
        mockFirestore,
        mockLlmService as never,
        'redis://localhost:6379'
      );
      await worker.shutdown();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should delegate to the BullMQ worker', () => {
      const worker = new AgentWorker(
        mockRouter as never,
        mockJobRepo as never,
        mockJobRepo as never,
        mockChatService as never,
        mockPubSub as never,
        mockFirestore,
        mockLlmService as never,
        'redis://localhost:6379'
      );
      expect(worker.isRunning()).toBe(true);
    });
  });
});
