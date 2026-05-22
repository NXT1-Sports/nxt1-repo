import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: vi.fn(),
}));

import { sendSlackAlert } from '../../../../services/platform/alert.service.js';
import sentryWebhookRoutes from '../sentry-webhook.routes.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/sentry-webhook', sentryWebhookRoutes);
  return app;
}

describe('Sentry Webhook Routes', () => {
  beforeEach(() => {
    vi.stubEnv('SLACK_ALERT_WEBHOOK_URL', 'https://hooks.slack.test/services/T/B/X');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns 200 and forwards mapped payload when Slack delivery succeeds', async () => {
    vi.mocked(sendSlackAlert).mockResolvedValue(true);

    const response = await request(createApp())
      .post('/sentry-webhook')
      .send({
        project_name: 'NXT1 Backend',
        url: 'https://sentry.io/issues/123',
        event: {
          title: 'TypeError: failed to fetch',
          environment: 'staging',
          culprit: 'routes/agent/chat.routes.ts',
        },
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
    expect(sendSlackAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sentry',
        severity: 'critical',
        title: 'Sentry Alert: NXT1 Backend',
      })
    );

    const payload = vi.mocked(sendSlackAlert).mock.calls[0]?.[0];
    expect(payload?.summary).toContain(
      'Issue: <https://sentry.io/issues/123|TypeError: failed to fetch>'
    );
    expect(payload?.fields).toEqual(
      expect.arrayContaining([
        { label: 'Environment', value: 'staging' },
        { label: 'Location', value: 'routes/agent/chat.routes.ts' },
      ])
    );
  });

  it('returns 500 when Slack delivery reports failure', async () => {
    vi.mocked(sendSlackAlert).mockResolvedValue(false);

    const response = await request(createApp()).post('/sentry-webhook').send({
      project_name: 'NXT1 Backend',
      message: 'Unhandled exception',
    });

    expect(response.status).toBe(500);
    expect(response.text).toBe('Failed to post to Slack');
  });

  it('returns 500 when Slack webhook request throws', async () => {
    vi.mocked(sendSlackAlert).mockRejectedValue(new Error('network down'));

    const response = await request(createApp()).post('/sentry-webhook').send({
      message: 'Unhandled exception',
    });

    expect(response.status).toBe(500);
    expect(response.text).toBe('Internal Error');
  });
});
