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

const sendSlackAlertMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('../../services/platform/alert.service.js', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

vi.mock('../../modules/agent/triggers/trigger.listeners.js', () => ({
  runWeeklyPlaybooks: cronListenersMocks.runWeeklyPlaybooks,
  runWeeklySuggestedActions: cronListenersMocks.runWeeklySuggestedActions,
  runPlaybookNudge: cronListenersMocks.runPlaybookNudge,
  runWeeklyRecaps: cronListenersMocks.runWeeklyRecaps,
}));

// ─── Mocks for /cron/summarize-threads ───────────────────────────────────────

const summarizeInactiveThreadsMock = vi.hoisted(() =>
  vi.fn<
    () => Promise<{
      threadsProcessed: number;
      memoriesCreated: number;
      threadsSkipped: number;
      errors: number;
    }>
  >()
);

const scanActiveUsersMock = vi.hoisted(() =>
  vi.fn<
    () => Promise<{
      usersScanned: number;
      totalMemoriesStored: number;
      usersSkipped: number;
      errors: number;
    }>
  >()
);

vi.mock('../../modules/agent/memory/memory-summarization.service.js', () => ({
  MemorySummarizationService: vi.fn().mockImplementation(function () {
    return {
      summarizeInactiveThreads: summarizeInactiveThreadsMock,
    };
  }),
}));

vi.mock('../../modules/agent/memory/timeline-scan.service.js', () => ({
  TIMELINE_SCAN_LOOKBACK_HOURS: 24,
  MAX_USERS_PER_CRON_RUN: 10,
  TimelineScanService: vi.fn().mockImplementation(function () {
    return {
      scanActiveUsers: scanActiveUsersMock,
    };
  }),
}));

vi.mock('../../modules/agent/memory/vector.service.js', () => ({
  VectorMemoryService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('../../config/runtime-environment.js', () => ({
  getRuntimeEnvironment: vi.fn().mockReturnValue('test'),
}));

vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../utils/firebase-staging.js', () => ({ stagingDb: {} }));

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
    sendSlackAlertMock.mockReset().mockResolvedValue(true);
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
    let releaseRun!: () => void;
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

    releaseRun();
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
    let releaseRun!: () => void;
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

    releaseRun();
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
    let releaseRun!: () => void;
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

    releaseRun();
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
    let releaseRun!: () => void;
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

    releaseRun();
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

// ─── /cron/summarize-threads ──────────────────────────────────────────────────

describe('POST /cron/summarize-threads', () => {
  let setAgentDependencies: typeof import('../../routes/agent/shared.js').setAgentDependencies;

  beforeEach(async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    sendSlackAlertMock.mockReset().mockResolvedValue(true);
    summarizeInactiveThreadsMock.mockReset().mockResolvedValue({
      threadsProcessed: 3,
      memoriesCreated: 7,
      threadsSkipped: 0,
      errors: 0,
    });

    const shared = await import('../../routes/agent/shared.js');
    setAgentDependencies = shared.setAgentDependencies;
    setAgentDependencies({
      llmService: { complete: vi.fn() } as never,
      queueService: { enqueue: vi.fn(), cancel: vi.fn() } as never,
      jobRepository: {} as never,
      chatService: {} as never,
      pubsub: null,
      contextBuilder: {} as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects without cron secret (403)', async () => {
    const res = await request(app).post('/api/v1/agent-x/cron/summarize-threads').send({});
    expect(res.status).toBe(403);
  });

  it('responds immediately with success:true and status:running', async () => {
    const startedAt = Date.now();

    const res = await request(app)
      .post('/api/v1/agent-x/cron/summarize-threads')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const durationMs = Date.now() - startedAt;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'running' });
    // Must respond well under the 30-second gateway timeout threshold
    expect(durationMs).toBeLessThan(1500);
  });

  it('does not block the HTTP response while summarization runs in background', async () => {
    // The key behavioral guarantee: the route must respond immediately regardless
    // of how long MemorySummarizationService takes. Simulate a slow summarizer
    // by having the mock hang for 5 seconds — the HTTP response must still arrive
    // well before that.
    let resolveSlowRun!: () => void;
    summarizeInactiveThreadsMock.mockReturnValue(
      new Promise<{
        threadsProcessed: number;
        memoriesCreated: number;
        threadsSkipped: number;
        errors: number;
      }>((resolve) => {
        resolveSlowRun = () =>
          resolve({ threadsProcessed: 0, memoriesCreated: 0, threadsSkipped: 0, errors: 0 });
      })
    );

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/v1/agent-x/cron/summarize-threads')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});
    const durationMs = Date.now() - startedAt;

    // HTTP response must arrive immediately — not after the summarizer finishes
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'running' });
    expect(durationMs).toBeLessThan(1500);

    // Clean up the hanging promise so the test does not leak
    resolveSlowRun();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('returns 503 when llmService is not initialized', async () => {
    setAgentDependencies({
      llmService: null as never,
      queueService: { enqueue: vi.fn(), cancel: vi.fn() } as never,
      jobRepository: {} as never,
      chatService: {} as never,
      pubsub: null,
      contextBuilder: {} as never,
    });

    const res = await request(app)
      .post('/api/v1/agent-x/cron/summarize-threads')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false });
  });

  it('still responds 200 even when summarizeInactiveThreads rejects', async () => {
    summarizeInactiveThreadsMock.mockRejectedValue(new Error('LLM quota exceeded'));

    const res = await request(app)
      .post('/api/v1/agent-x/cron/summarize-threads')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    // HTTP response is sent before the background task runs — must still be 200
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'running' });

    // Flush so the rejection is handled (and doesn't leak as unhandled)
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

// ─── /cron/scan-timeline-posts ────────────────────────────────────────────────

describe('POST /cron/scan-timeline-posts', () => {
  let setAgentDependencies: typeof import('../../routes/agent/shared.js').setAgentDependencies;

  beforeEach(async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    sendSlackAlertMock.mockReset().mockResolvedValue(true);
    scanActiveUsersMock.mockReset().mockResolvedValue({
      usersScanned: 2,
      totalMemoriesStored: 3,
      usersSkipped: 0,
      errors: 0,
    });

    const shared = await import('../../routes/agent/shared.js');
    setAgentDependencies = shared.setAgentDependencies;
    setAgentDependencies({
      llmService: { complete: vi.fn() } as never,
      queueService: { enqueue: vi.fn(), cancel: vi.fn() } as never,
      jobRepository: {} as never,
      chatService: {} as never,
      pubsub: null,
      contextBuilder: {} as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('responds immediately with success:true and status:running', async () => {
    const startedAt = Date.now();

    const res = await request(app)
      .post('/api/v1/agent-x/cron/scan-timeline-posts')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const durationMs = Date.now() - startedAt;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'running' });
    expect(durationMs).toBeLessThan(1500);
  });

  it('does not block the HTTP response while the timeline scan runs in background', async () => {
    let resolveSlowRun!: () => void;
    scanActiveUsersMock.mockReturnValue(
      new Promise<{
        usersScanned: number;
        totalMemoriesStored: number;
        usersSkipped: number;
        errors: number;
      }>((resolve) => {
        resolveSlowRun = () =>
          resolve({
            usersScanned: 1,
            totalMemoriesStored: 1,
            usersSkipped: 0,
            errors: 0,
          });
      })
    );

    const first = await request(app)
      .post('/api/v1/agent-x/cron/scan-timeline-posts')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    const second = await request(app)
      .post('/api/v1/agent-x/cron/scan-timeline-posts')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, status: 'running' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ success: true, status: 'already_running' });
    expect(scanActiveUsersMock).toHaveBeenCalledTimes(1);

    resolveSlowRun();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('returns 503 when llmService is not initialized', async () => {
    setAgentDependencies({
      llmService: null as never,
      queueService: { enqueue: vi.fn(), cancel: vi.fn() } as never,
      jobRepository: {} as never,
      chatService: {} as never,
      pubsub: null,
      contextBuilder: {} as never,
    });

    const res = await request(app)
      .post('/api/v1/agent-x/cron/scan-timeline-posts')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false });
  });

  it('still responds 200 even when scanActiveUsers rejects', async () => {
    scanActiveUsersMock.mockRejectedValue(new Error('LLM timeout'));

    const res = await request(app)
      .post('/api/v1/staging/agent-x/cron/scan-timeline-posts')
      .set('x-cron-secret', 'test-cron-secret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'running' });

    await vi.waitFor(() => {
      expect(sendSlackAlertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'agent',
          environment: 'staging',
          severity: 'error',
          title: 'Timeline Post Scan Failed',
          fields: expect.arrayContaining([
            { label: 'Route', value: '/api/v1/agent-x/cron/scan-timeline-posts' },
            { label: 'Environment', value: 'staging' },
            { label: 'Error', value: 'LLM timeout' },
          ]),
        })
      );
    });
  });
});
