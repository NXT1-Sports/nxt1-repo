import { type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../../modules/agent/services/firecrawl-monitor-notification.service.js', () => ({
  processFirecrawlMonitorWebhook: vi.fn(),
}));

vi.mock(
  '../../../../services/communications/firecrawl-monitor/firecrawl-monitor-failure-alert.service.js',
  () => ({
    sendFirecrawlMonitorFailureAlert: vi.fn().mockResolvedValue(true),
  })
);

import { processFirecrawlMonitorWebhook } from '../../../../modules/agent/services/firecrawl-monitor-notification.service.js';
import { sendFirecrawlMonitorFailureAlert } from '../../../../services/communications/firecrawl-monitor/firecrawl-monitor-failure-alert.service.js';
import firecrawlMonitorWebhookRoutes from '../firecrawl-monitor-webhook.routes.js';

function createApp(dbMock: any = {}) {
  const app = express();
  app.use(express.json());

  // Inject fake firebase.db
  app.use((req: any, _res: Response, next: NextFunction) => {
    if (dbMock !== null) {
      req.firebase = { db: dbMock };
    }
    next();
  });

  app.use('/firecrawl-monitor', firecrawlMonitorWebhookRoutes);
  return app;
}

describe('Firecrawl Monitor Webhook Routes', () => {
  beforeEach(() => {
    vi.mocked(processFirecrawlMonitorWebhook).mockReset();
    vi.mocked(sendFirecrawlMonitorFailureAlert).mockReset();
    vi.mocked(sendFirecrawlMonitorFailureAlert).mockResolvedValue(true);
    vi.stubEnv('FIRECRAWL_MONITOR_WEBHOOK_SECRET', 'test-secret-42');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('declines request if the secret header is missing or incorrect', async () => {
    const response = await request(createApp())
      .post('/firecrawl-monitor')
      .send({ data: [{ url: 'https://example.com/test' }] });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: 'Invalid Firecrawl monitor webhook secret',
    });
  });

  it('returns 503 if Firestore db is unavailable', async () => {
    const response = await request(createApp(null))
      .post('/firecrawl-monitor')
      .set('x-firecrawl-monitor-secret', 'test-secret-42')
      .send({
        type: 'monitor.check.completed',
        id: 'evt-1',
        data: [{ monitorId: 'monitor-1', checkId: 'check-1', url: 'https://example.com/test' }],
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: 'Firestore is unavailable',
    });
    expect(sendFirecrawlMonitorFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'db_unavailable',
        eventType: 'monitor.check.completed',
        webhookEventId: 'evt-1',
        monitorIds: ['monitor-1'],
        checkIds: ['check-1'],
      })
    );
  });

  it('processes webhook and returns 200 on success', async () => {
    vi.mocked(processFirecrawlMonitorWebhook).mockResolvedValue({
      processedCount: 1,
      dispatchedCount: 1,
      ignoredCount: 0,
    });

    const response = await request(createApp({}))
      .post('/firecrawl-monitor')
      .set('x-firecrawl-monitor-secret', 'test-secret-42')
      .send({
        data: [{ url: 'https://example.com/test' }],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      received: true,
      processedCount: 1,
      dispatchedCount: 1,
      ignoredCount: 0,
    });

    expect(processFirecrawlMonitorWebhook).toHaveBeenCalledTimes(1);
    expect(sendFirecrawlMonitorFailureAlert).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws a ZodError', async () => {
    vi.mocked(processFirecrawlMonitorWebhook).mockRejectedValue(new z.ZodError([]));

    const response = await request(createApp({}))
      .post('/firecrawl-monitor')
      .set('x-firecrawl-monitor-secret', 'test-secret-42')
      .send({ invalid_payload: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Invalid Firecrawl monitor webhook payload',
    });
    expect(sendFirecrawlMonitorFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'invalid_payload',
        hasBody: true,
      })
    );
  });

  it('returns 500 when service throws a generic Error', async () => {
    vi.mocked(processFirecrawlMonitorWebhook).mockRejectedValue(new Error('DB connection failed'));

    const response = await request(createApp({}))
      .post('/firecrawl-monitor')
      .set('x-firecrawl-monitor-secret', 'test-secret-42')
      .send({ data: [{ url: 'https://example.com/test' }] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: 'Failed to process Firecrawl monitor webhook',
    });
    expect(sendFirecrawlMonitorFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'processing_failed',
        error: 'DB connection failed',
      })
    );
  });

  it('allows request if FIRECRAWL_MONITOR_WEBHOOK_SECRET is not configured', async () => {
    vi.stubEnv('FIRECRAWL_MONITOR_WEBHOOK_SECRET', '');

    vi.mocked(processFirecrawlMonitorWebhook).mockResolvedValue({
      processedCount: 0,
      dispatchedCount: 0,
      ignoredCount: 0,
    });

    const response = await request(createApp({})).post('/firecrawl-monitor').send({ data: [] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      received: true,
      processedCount: 0,
      dispatchedCount: 0,
      ignoredCount: 0,
    });
    expect(sendFirecrawlMonitorFailureAlert).not.toHaveBeenCalled();
  });
});
