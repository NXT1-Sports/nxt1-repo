import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowedOrigins, getDefaultFrontendUrl, isAllowedOrigin } from './shared.js';

describe('auth shared origin defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the new staging custom domain by default', () => {
    expect(isAllowedOrigin('https://staging.nxt1sports.com', true)).toBe(true);
  });

  it('keeps existing hosted staging domains available by default', () => {
    const origins = getAllowedOrigins(true);

    expect(origins).toContain('https://nxt-1-staging-v2.web.app');
    expect(origins).toContain('https://nxt1-repo--nxt-1-staging-v2.us-east4.hosted.app');
  });

  it('uses the staging custom domain as the default frontend redirect target', () => {
    expect(getDefaultFrontendUrl(true)).toBe('https://nxt-1-staging-v2.web.app');
  });

  it('prefers env-configured staging origins for redirect fallbacks', () => {
    vi.stubEnv(
      'STAGING_ALLOWED_FRONTEND_ORIGINS',
      'https://staging.nxt1sports.com,https://nxt-1-staging-v2.web.app'
    );

    expect(getDefaultFrontendUrl(true)).toBe('https://staging.nxt1sports.com');
  });

  it('lets env-configured origins extend the production defaults', () => {
    vi.stubEnv('ALLOWED_FRONTEND_ORIGINS', 'https://preview.nxt1sports.com');

    const origins = getAllowedOrigins(false);

    expect(origins).toContain('https://preview.nxt1sports.com');
    expect(origins).toContain('https://nxt1sports.com');
  });
});
