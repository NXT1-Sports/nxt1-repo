import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendSlackAlert } from '../alert.service.js';

describe('sendSlackAlert', () => {
  afterEach(() => {
    delete process.env['SLACK_ALERT_WEBHOOK_URL'];
    delete process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'];
    delete process.env['SLACK_NEW_TEAMS_WEBHOOK_URL'];
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

  it('does not fall back to the default webhook for athlete signup alerts', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_athlete',
      severity: 'info',
      title: 'New Athlete Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fall back to the default webhook for team signup alerts', async () => {
    process.env['SLACK_ALERT_WEBHOOK_URL'] = 'https://hooks.slack.test/default';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const delivered = await sendSlackAlert({
      target: 'signup_team',
      severity: 'info',
      title: 'New Team / Staff Signup',
      summary: 'A signup completed.',
    });

    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
