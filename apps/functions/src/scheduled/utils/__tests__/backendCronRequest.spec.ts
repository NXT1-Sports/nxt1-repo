import { afterEach, describe, expect, it } from 'vitest';
import { buildBackendUrl, resolveBackendEndpointPath } from '../backendCronRequest';

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
});
