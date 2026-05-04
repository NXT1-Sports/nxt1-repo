import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAppBaseUrl, toAbsoluteAppUrl } from './app-url.js';

describe('app-url', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers localhost host/protocol when origin and referer are absent', () => {
    const result = resolveAppBaseUrl({
      environment: 'staging',
      host: 'localhost:4200',
      protocol: 'http',
    });

    expect(result).toBe('http://localhost:4200');
  });

  it('prefers forwarded host/proto when present', () => {
    vi.stubEnv('STAGING_ALLOWED_FRONTEND_ORIGINS', 'https://staging.nxt1.test');

    const result = resolveAppBaseUrl({
      environment: 'staging',
      host: 'backend.internal',
      protocol: 'http',
      forwardedHost: 'staging.nxt1.test',
      forwardedProto: 'https',
    });

    expect(result).toBe('https://staging.nxt1.test');
  });

  it('builds absolute URLs from a localhost host-derived base URL', () => {
    const result = toAbsoluteAppUrl('/profile/mens-basketball/ngoc-son/855599', {
      environment: 'staging',
      host: 'localhost:4200',
      protocol: 'http',
    });

    expect(result).toBe('http://localhost:4200/profile/mens-basketball/ngoc-son/855599');
  });
});
