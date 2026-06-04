import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

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
});
