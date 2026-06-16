import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendSlackAlert } from '../alert.service.js';

describe('sendSlackAlert', () => {
  afterEach(() => {
    delete process.env['SLACK_ALERT_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_ALERT_WEBHOOK_URL'];
    delete process.env['SLACK_SENTRY_ALERT_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_SENTRY_ALERT_WEBHOOK_URL'];
    delete process.env['SLACK_AGENT_ALERT_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_AGENT_ALERT_WEBHOOK_URL'];
    delete process.env['SLACK_SALES_ALERT_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_SALES_ALERT_WEBHOOK_URL'];
    delete process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_NEW_ATHLETES_WEBHOOK_URL'];
    delete process.env['SLACK_NEW_TEAMS_WEBHOOK_URL'];
    delete process.env['STAGING_SLACK_NEW_TEAMS_WEBHOOK_URL'];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('uses the dedicated athlete signup webhook when configured', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';
    process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'] = 'https://hooks.slack.test/athletes';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/athletes',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('falls back to the default webhook for athlete signup alerts when the dedicated webhook is missing', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      environment: 'production',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/default',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('uses the shared production signup webhook for staging signup alerts too', async () => {
    process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'] = 'https://hooks.slack.test/athletes-shared';
    process.env['STAGING_SLACK_NEW_ATHLETES_WEBHOOK_URL'] =
      'https://hooks.slack.test/athletes-legacy-staging';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      environment: 'staging',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/athletes-shared',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('keeps the legacy staging signup webhook as a compatibility fallback', async () => {
    process.env['STAGING_SLACK_NEW_ATHLETES_WEBHOOK_URL'] =
      'https://hooks.slack.test/athletes-legacy-staging';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      environment: 'production',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/athletes-legacy-staging',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls back to the default webhook for team signup alerts when the dedicated webhook is missing', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_team',
      environment: 'production',
      severity: 'info',
      title: 'New Team / Staff Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/default',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('retries the default webhook when a dedicated signup webhook fails', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';
    process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'] = 'https://hooks.slack.test/athletes';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('invalid_hook', { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      environment: 'production',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://hooks.slack.test/athletes',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://hooks.slack.test/default',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('retries the agent webhook when the default webhook fails', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';
    process.env['SLACK_AGENT_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/agent';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('invalid_hook', { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'default',
      environment: 'production',
      severity: 'info',
      title: 'Sales Signup Alert',
      summary: 'A sales alert completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://hooks.slack.test/default',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://hooks.slack.test/agent',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses the dedicated sales webhook when configured', async () => {
    process.env['SLACK_SALES_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/sales';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'sales',
      environment: 'production',
      severity: 'info',
      title: 'Payment Received',
      summary: 'A customer payment completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/sales',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses the staging sales webhook when configured', async () => {
    process.env['STAGING_SLACK_SALES_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/sales-staging';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'sales',
      environment: 'staging',
      severity: 'info',
      title: 'Payment Received',
      summary: 'A customer payment completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/sales-staging',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses the agent webhook as a last resort when signup and default webhooks are missing', async () => {
    process.env['SLACK_AGENT_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/agent';

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_team',
      environment: 'production',
      severity: 'info',
      title: 'New Team / Staff Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/agent',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
