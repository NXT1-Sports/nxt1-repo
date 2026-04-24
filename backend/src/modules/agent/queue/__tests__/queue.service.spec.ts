/**
 * @fileoverview Unit Tests — AgentQueueService
 * @module @nxt1/backend/modules/agent/queue
 *
 * Tests the queue service in isolation by mocking BullMQ's Queue class.
 * Verifies enqueue, status retrieval, cancellation, pause/resume, and shutdown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentJobPayload, AgentJobOrigin } from '@nxt1/core';

// ─── BullMQ Mocks ──────────────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockIsPaused = vi.fn();
const mockGetJobCounts = vi.fn();
const mockClose = vi.fn();

vi.mock('bullmq', () => {
  // Use a real class so `new Queue(...)` works (arrow functions aren't constructors)
  class MockQueue {
    add = mockAdd;
    getJob = mockGetJob;
    pause = mockPause;
    resume = mockResume;
    isPaused = mockIsPaused;
    getJobCounts = mockGetJobCounts;
    close = mockClose;
  }
  return { Queue: MockQueue };
});

// ─── Import after mocks ────────────────────────────────────────────────────

const { AgentQueueService } = await import('../queue.service.js');

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<AgentJobPayload>): AgentJobPayload {
  return {
    operationId: 'op-123',
    userId: 'user-abc',
    intent: 'Evaluate top 10 basketball recruits',
    sessionId: 'sess-456',
    origin: 'user' as AgentJobOrigin,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AgentQueueService', () => {
  let service: InstanceType<typeof AgentQueueService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentQueueService('redis://localhost:6379');
  });

  // ── Enqueue ─────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should add a job to the queue with the operationId as jobId', async () => {
      const payload = makePayload();
      mockAdd.mockResolvedValue({ id: 'op-123' });

      const jobId = await service.enqueue(payload);

      expect(jobId).toBe('op-123');
      expect(mockAdd).toHaveBeenCalledWith(
        'op-123',
        expect.objectContaining({
          payload,
          enqueuedAt: expect.any(String),
        }),
        { jobId: 'op-123' }
      );
    });

    it('should fall back to operationId if BullMQ returns no job.id', async () => {
      const payload = makePayload({ operationId: 'op-fallback' });
      mockAdd.mockResolvedValue({ id: undefined });

      const jobId = await service.enqueue(payload);

      expect(jobId).toBe('op-fallback');
    });

    it('should enqueue a delayed thread summarization job with a deterministic job id', async () => {
      mockAdd.mockResolvedValue({ id: 'summarize:thread-123' });

      const jobId = await service.enqueueThreadSummarization('thread-123', 'user-abc', 3_600_000);

      expect(jobId).toBe('summarize:thread-123');
      expect(mockAdd).toHaveBeenCalledWith(
        'THREAD_SUMMARIZATION',
        expect.objectContaining({
          threadId: 'thread-123',
          userId: 'user-abc',
          delayMs: 3_600_000,
        }),
        expect.objectContaining({
          jobId: 'summarize:thread-123',
          delay: 3_600_000,
        })
      );
    });
  });

  // ── Get Job Status ──────────────────────────────────────────────────────

  describe('getJobStatus', () => {
    it('should return null when job does not exist', async () => {
      mockGetJob.mockResolvedValue(null);

      const status = await service.getJobStatus('nonexistent');

      expect(status).toBeNull();
    });

    it('should return queued status for a waiting job', async () => {
      mockGetJob.mockResolvedValue({
        progress: null,
        returnvalue: null,
        failedReason: null,
        data: {
          kind: 'agent',
          payload: { userId: 'test-user' },
          enqueuedAt: '2026-03-10T00:00:00Z',
        },
        timestamp: Date.now(),
        getState: vi.fn().mockResolvedValue('waiting'),
      });

      const status = await service.getJobStatus('op-123');

      expect(status).not.toBeNull();
      expect(status!.status).toBe('queued');
      expect(status!.jobId).toBe('op-123');
    });

    it('should return thinking status for an active job without progress', async () => {
      mockGetJob.mockResolvedValue({
        progress: undefined,
        returnvalue: null,
        failedReason: null,
        data: {
          kind: 'agent',
          payload: { userId: 'test-user' },
          enqueuedAt: '2026-03-10T00:00:00Z',
        },
        timestamp: Date.now(),
        getState: vi.fn().mockResolvedValue('active'),
      });

      const status = await service.getJobStatus('op-123');

      expect(status!.status).toBe('thinking');
    });

    it('should return progress status for an active job with progress', async () => {
      const progress = {
        status: 'acting' as const,
        message: 'Running task 2',
        percent: 50,
        currentStep: 2,
        totalSteps: 4,
        updatedAt: '2026-03-10T00:01:00Z',
      };

      mockGetJob.mockResolvedValue({
        progress,
        returnvalue: null,
        failedReason: null,
        data: {
          kind: 'agent',
          payload: { userId: 'test-user' },
          enqueuedAt: '2026-03-10T00:00:00Z',
        },
        timestamp: Date.now(),
        getState: vi.fn().mockResolvedValue('active'),
      });

      const status = await service.getJobStatus('op-123');

      expect(status!.status).toBe('acting');
      expect(status!.progress).toEqual(progress);
    });

    it('should return completed status with result for finished job', async () => {
      const result = {
        result: { summary: 'Done', suggestions: [] },
        durationMs: 5000,
        completedAt: '2026-03-10T00:05:00Z',
      };

      mockGetJob.mockResolvedValue({
        progress: { status: 'completed', percent: 100 },
        returnvalue: result,
        failedReason: null,
        data: {
          kind: 'agent',
          payload: { userId: 'test-user' },
          enqueuedAt: '2026-03-10T00:00:00Z',
        },
        timestamp: Date.now(),
        getState: vi.fn().mockResolvedValue('completed'),
      });

      const status = await service.getJobStatus('op-123');

      expect(status!.status).toBe('completed');
      expect(status!.result).toEqual(result);
    });

    it('should return failed status with error for failed job', async () => {
      mockGetJob.mockResolvedValue({
        progress: null,
        returnvalue: null,
        failedReason: 'OpenRouter API timeout',
        data: {
          kind: 'agent',
          payload: { userId: 'test-user' },
          enqueuedAt: '2026-03-10T00:00:00Z',
        },
        timestamp: Date.now(),
        getState: vi.fn().mockResolvedValue('failed'),
      });

      const status = await service.getJobStatus('op-123');

      expect(status!.status).toBe('failed');
      expect(status!.error).toBe('OpenRouter API timeout');
    });
  });

  // ── Cancel ──────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should return false when job does not exist', async () => {
      mockGetJob.mockResolvedValue(null);

      const result = await service.cancel('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false for already-completed jobs', async () => {
      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn(),
      });

      const result = await service.cancel('op-123');

      expect(result).toBe(false);
    });

    it('should remove a waiting job and return true', async () => {
      const mockRemove = vi.fn();
      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: mockRemove,
      });

      const result = await service.cancel('op-123');

      expect(result).toBe(true);
      expect(mockRemove).toHaveBeenCalled();
    });
  });

  // ── Pause / Resume ──────────────────────────────────────────────────────

  describe('pauseAll / resumeAll', () => {
    it('should pause the queue', async () => {
      await service.pauseAll();
      expect(mockPause).toHaveBeenCalled();
    });

    it('should resume the queue', async () => {
      await service.resumeAll();
      expect(mockResume).toHaveBeenCalled();
    });

    it('should report paused state', async () => {
      mockIsPaused.mockResolvedValue(true);
      const paused = await service.isPaused();
      expect(paused).toBe(true);
    });
  });

  // ── Queue Stats ─────────────────────────────────────────────────────────

  describe('getCounts', () => {
    it('should return job counts by state', async () => {
      const counts = { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 0, paused: 0 };
      mockGetJobCounts.mockResolvedValue(counts);

      const result = await service.getCounts();

      expect(result).toEqual(counts);
    });
  });

  // ── Shutdown ────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should close the queue', async () => {
      await service.shutdown();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
