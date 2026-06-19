import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { cleanupStaleAgentJobs } from '../agent/cron.routes.js';

const cronListenersMocks = vi.hoisted(() => ({
  runWeeklyPlaybooks: vi.fn<() => Promise<void>>(),
  runWeeklySuggestedActions: vi.fn<() => Promise<void>>(),
  runPlaybookNudge: vi.fn<() => Promise<void>>(),
  runWeeklyRecaps: vi.fn<
    () => Promise<{
      totalUsers: number;
      eligible: number;
      enqueued: number;
      skippedAlreadyDispatched: number;
      skippedEmailOptOut: number;
      failed: number;
      weekKey: string;
    }>
  >(),
}));

vi.mock('../../modules/agent/triggers/trigger.listeners.js', () => ({
  runWeeklyPlaybooks: cronListenersMocks.runWeeklyPlaybooks,
  runWeeklySuggestedActions: cronListenersMocks.runWeeklySuggestedActions,
  runPlaybookNudge: cronListenersMocks.runPlaybookNudge,
  runWeeklyRecaps: cronListenersMocks.runWeeklyRecaps,
}));

import app from '../../test-app.js';

interface MockAgentJobDoc {
  id: string;
  status: 'queued' | 'paused' | 'awaiting_input' | 'awaiting_approval';
  createdAt: string;
  origin?: string | null;
  threadId?: string | null;
}

function createMockAgentJobsDb(docs: MockAgentJobDoc[]) {
  const applyFilters = (
    source: MockAgentJobDoc[],
    filters: Array<{ field: string; operator: string; value: unknown }>
  ) => {
    return source.filter((doc) => {
      return filters.every((filter) => {
        if (filter.field === 'status' && filter.operator === '==') {
          return doc.status === filter.value;
        }

        if (
          filter.field === 'createdAt' &&
          filter.operator === '<' &&
          filter.value instanceof Date
        ) {
          return new Date(doc.createdAt).getTime() < filter.value.getTime();
        }

        return false;
      });
    });
  };

  const buildQuery = (
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    limitCount = Number.POSITIVE_INFINITY
  ) => ({
    where(field: string, operator: string, value: unknown) {
      return buildQuery([...filters, { field, operator, value }], limitCount);
    },
    limit(count: number) {
      return buildQuery(filters, count);
    },
    async get() {
      const filtered = applyFilters(docs, filters).slice(0, limitCount);
      return {
        docs: filtered.map((doc) => ({
          id: doc.id,
          data: () => ({
            createdAt: doc.createdAt,
            origin: doc.origin ?? null,
            threadId: doc.threadId ?? null,
          }),
        })),
      };
    },
  });

  return {
    collection(name: string) {
      expect(name).toBe('AgentJobs');
      return buildQuery();
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

describe('Agent X Cron Routes Smoke', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    cronListenersMocks.runWeeklyPlaybooks.mockReset().mockResolvedValue(undefined);
    cronListenersMocks.runWeeklySuggestedActions.mockReset().mockResolvedValue(undefined);
    cronListenersMocks.runPlaybookNudge.mockReset().mockResolvedValue(undefined);
    cronListenersMocks.runWeeklyRecaps.mockReset().mockResolvedValue({
      totalUsers: 10,
      eligible: 8,
      enqueued: 8,
      skippedAlreadyDispatched: 0,
      skippedEmailOptOut: 2,
      failed: 0,
      weekKey: '2026-W23',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects cron routes without secret', async () => {
    const response = await request(app).post('/api/v1/agent-x/cron/weekly-playbooks').send({});

    expect(response.status).toBe(403);
  });

  it('starts weekly playbooks asynchronously and returns running', async () => {
    const startedAt = Date.now();

    const response = await request(app)
      .post('/api/v1/agent-x/cron/weekly-playbooks')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const durationMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'running',
    });
    expect(durationMs).toBeLessThan(1500);
    expect(cronListenersMocks.runWeeklyPlaybooks).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping weekly playbooks runs', async () => {
    let releaseRun: (() => void) | null = null;
    const pendingRun = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    cronListenersMocks.runWeeklyPlaybooks.mockImplementation(async () => pendingRun);

    const first = await request(app)
      .post('/api/v1/agent-x/cron/weekly-playbooks')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const second = await request(app)
      .post('/api/v1/agent-x/cron/weekly-playbooks')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('running');
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_running');
    expect(cronListenersMocks.runWeeklyPlaybooks).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await Promise.resolve();
  });

  it('starts weekly suggested actions asynchronously and returns running', async () => {
    const response = await request(app)
      .post('/api/v1/agent-x/cron/suggested-actions')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'running',
    });
    expect(cronListenersMocks.runWeeklySuggestedActions).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping weekly suggested actions runs', async () => {
    let releaseRun: (() => void) | null = null;
    const pendingRun = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    cronListenersMocks.runWeeklySuggestedActions.mockImplementation(async () => pendingRun);

    const first = await request(app)
      .post('/api/v1/agent-x/cron/suggested-actions')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const second = await request(app)
      .post('/api/v1/agent-x/cron/suggested-actions')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('running');
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_running');
    expect(cronListenersMocks.runWeeklySuggestedActions).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await Promise.resolve();
  });

  it('starts playbook nudge asynchronously and returns running', async () => {
    const response = await request(app)
      .post('/api/v1/agent-x/cron/playbook-nudge')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'running',
    });
    expect(cronListenersMocks.runPlaybookNudge).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping playbook nudge runs', async () => {
    let releaseRun: (() => void) | null = null;
    const pendingRun = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    cronListenersMocks.runPlaybookNudge.mockImplementation(async () => pendingRun);

    const first = await request(app)
      .post('/api/v1/agent-x/cron/playbook-nudge')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const second = await request(app)
      .post('/api/v1/agent-x/cron/playbook-nudge')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('running');
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_running');
    expect(cronListenersMocks.runPlaybookNudge).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await Promise.resolve();
  });

  it('starts weekly recaps asynchronously and returns running', async () => {
    const response = await request(app)
      .post('/api/v1/agent-x/cron/weekly-recaps')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'running',
    });
    expect(cronListenersMocks.runWeeklyRecaps).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping weekly recap runs', async () => {
    let releaseRun: (() => void) | null = null;
    const pendingRun = new Promise<{
      totalUsers: number;
      eligible: number;
      enqueued: number;
      skippedAlreadyDispatched: number;
      skippedEmailOptOut: number;
      failed: number;
      weekKey: string;
    }>((resolve) => {
      releaseRun = () =>
        resolve({
          totalUsers: 10,
          eligible: 8,
          enqueued: 8,
          skippedAlreadyDispatched: 0,
          skippedEmailOptOut: 2,
          failed: 0,
          weekKey: '2026-W23',
        });
    });
    cronListenersMocks.runWeeklyRecaps.mockImplementation(async () => pendingRun);

    const first = await request(app)
      .post('/api/v1/agent-x/cron/weekly-recaps')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const second = await request(app)
      .post('/api/v1/agent-x/cron/weekly-recaps')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('running');
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_running');
    expect(cronListenersMocks.runWeeklyRecaps).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await Promise.resolve();
  });

  it('cleans up stale queued and yielded jobs with separate thresholds', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const jobRepository = {
      markFailed: vi.fn().mockResolvedValue(undefined),
      markCancelled: vi.fn().mockResolvedValue(undefined),
    };
    const clearThreadPausedYieldState = vi.fn().mockResolvedValue(true);

    const result = await cleanupStaleAgentJobs({
      db: createMockAgentJobsDb([
        {
          id: 'queued-old',
          status: 'queued',
          createdAt: '2026-06-01T10:00:00.000Z',
        },
        {
          id: 'queued-fresh',
          status: 'queued',
          createdAt: '2026-06-01T11:10:00.000Z',
        },
        {
          id: 'paused-system-old',
          status: 'paused',
          origin: 'system_cron',
          threadId: 'thread-system',
          createdAt: '2026-05-28T11:00:00.000Z',
        },
        {
          id: 'awaiting-user-old',
          status: 'awaiting_input',
          origin: 'user',
          threadId: 'thread-user',
          createdAt: '2026-05-24T11:00:00.000Z',
        },
        {
          id: 'paused-user-recent',
          status: 'paused',
          origin: 'user',
          threadId: 'thread-recent',
          createdAt: '2026-05-31T11:00:00.000Z',
        },
        {
          id: 'approval-other-origin',
          status: 'awaiting_approval',
          origin: 'system',
          threadId: 'thread-skip',
          createdAt: '2026-05-20T11:00:00.000Z',
        },
      ]),
      now,
      jobRepository,
      clearThreadPausedYieldState,
    });

    expect(jobRepository.markFailed).toHaveBeenCalledTimes(1);
    expect(jobRepository.markFailed).toHaveBeenCalledWith(
      'queued-old',
      'Job timed out - no activity for over 100 minutes'
    );
    expect(jobRepository.markCancelled).toHaveBeenCalledTimes(2);
    expect(jobRepository.markCancelled).toHaveBeenCalledWith('paused-system-old', {
      message: 'Operation auto-cancelled after waiting more than 72 hours for scheduled follow-up.',
    });
    expect(jobRepository.markCancelled).toHaveBeenCalledWith('awaiting-user-old', {
      message: 'Operation auto-cancelled after waiting more than 7 days for user follow-up.',
    });
    expect(clearThreadPausedYieldState).toHaveBeenCalledTimes(2);
    expect(clearThreadPausedYieldState).toHaveBeenCalledWith('thread-system');
    expect(clearThreadPausedYieldState).toHaveBeenCalledWith('thread-user');
    expect(result).toEqual({
      scanned: 4,
      queuedScanned: 1,
      yieldedScanned: 3,
      markedFailed: 1,
      cancelled: 2,
      cancelledSystemCronYielded: 1,
      cancelledUserYielded: 1,
      skippedYielded: 1,
      failedToUpdate: 0,
      threadStateClearFailures: 0,
    });
  });
});
