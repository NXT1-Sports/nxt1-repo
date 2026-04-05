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
  return { Worker: MockWorker, Job: class {} };
});

// ─── Mock Firebase ─────────────────────────────────────────────────────────

const mockFirestoreSnapshot = {
  empty: true,
  docs: [] as unknown[],
  size: 0,
  forEach: () => undefined,
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
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    // Instantiate worker — this captures the processor
    new AgentWorker(
      mockRouter as never,
      mockJobRepo as never,
      mockJobRepo as never,
      null as never,
      mockFirestore,
      'redis://localhost:6379'
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

    expect(mockRouter.run).toHaveBeenCalledWith(payload, expect.any(Function), mockFirestore);
  });

  it('should return an AgentQueueJobResult on success', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    const result = (await capturedProcessor!(job)) as Record<string, unknown>;

    expect(result).toHaveProperty('result', mockRouterResult);
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('completedAt');
    expect(typeof result['durationMs']).toBe('number');
  });

  it('should call job.updateProgress at least once (final 100%)', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    // At minimum, the final 100% progress is reported
    expect(job.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
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

  // ── Lifecycle ─────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should close the BullMQ worker', async () => {
      const worker = new AgentWorker(
        mockRouter as never,
        mockJobRepo as never,
        mockJobRepo as never,
        null as never,
        mockFirestore,
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
        null as never,
        mockFirestore,
        'redis://localhost:6379'
      );
      expect(worker.isRunning()).toBe(true);
    });
  });
});
