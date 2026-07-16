import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBackendUrl,
  postBackendCronJson,
  resolveBackendEndpointPath,
} from '../backendCronRequest';

const ORIGINAL_GCLOUD_PROJECT = process.env['GCLOUD_PROJECT'];
const ORIGINAL_FIREBASE_CONFIG = process.env['FIREBASE_CONFIG'];

describe('backendCronRequest routing', () => {
  afterEach(() => {
    if (ORIGINAL_GCLOUD_PROJECT === undefined) {
      delete process.env['GCLOUD_PROJECT'];
    } else {
      process.env['GCLOUD_PROJECT'] = ORIGINAL_GCLOUD_PROJECT;
    }

    if (ORIGINAL_FIREBASE_CONFIG === undefined) {
      delete process.env['FIREBASE_CONFIG'];
    } else {
      process.env['FIREBASE_CONFIG'] = ORIGINAL_FIREBASE_CONFIG;
    }
  });

  it('keeps production paths unchanged for production projects', () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-v2';

    expect(resolveBackendEndpointPath('/api/v1/agent-x/cron/reconcile-job-thread-links')).toBe(
      '/api/v1/agent-x/cron/reconcile-job-thread-links'
    );
  });

  it('rewrites api paths to staging for staging projects', () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-staging-v2';

    expect(resolveBackendEndpointPath('/api/v1/agent-x/cron/reconcile-job-thread-links')).toBe(
      '/api/v1/staging/agent-x/cron/reconcile-job-thread-links'
    );
    expect(resolveBackendEndpointPath('/api/v1/marketing/cron/signup-drip')).toBe(
      '/api/v1/staging/marketing/cron/signup-drip'
    );
  });

  it('does not double-prefix paths already on the staging route surface', () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-staging-v2';

    expect(
      resolveBackendEndpointPath('/api/v1/staging/marketing/cron/signup-notion-dashboard')
    ).toBe('/api/v1/staging/marketing/cron/signup-notion-dashboard');
  });

  it('builds sanitized staging backend urls', () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-staging-v2';

    expect(
      buildBackendUrl('http://api.nxt1sports.com/', '/api/v1/agent-x/cron/daily-briefings')
    ).toBe('https://api.nxt1sports.com/api/v1/staging/agent-x/cron/daily-briefings');
  });

  it('does not retry 404 responses by default', async () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-v2';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postBackendCronJson({
        backendBaseUrl: 'https://api.nxt1sports.com',
        endpointPath: '/api/v1/agent-x/cron/approval-expiry-notifications',
        cronSecret: 'secret',
        jobName: 'testJob',
        maxAttempts: 3,
      })
    ).rejects.toThrow('testJob: backend returned 404');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 404 responses when opted in and succeeds on a later attempt', async () => {
    process.env['GCLOUD_PROJECT'] = 'nxt-1-v2';
    vi.useFakeTimers();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { notified: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = postBackendCronJson<{ success: boolean; data: { notified: number } }>({
      backendBaseUrl: 'https://api.nxt1sports.com',
      endpointPath: '/api/v1/agent-x/cron/approval-expiry-notifications',
      cronSecret: 'secret',
      jobName: 'approvalExpiryNotifications',
      maxAttempts: 3,
      retryableStatusCodes: [404, 500],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      data: { success: true, data: { notified: 1 } },
      status: 200,
    });

    vi.useRealTimers();
  });
});
