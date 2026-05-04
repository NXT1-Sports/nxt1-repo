import { afterEach, describe, expect, it } from 'vitest';
import { AgentEphemeralStateService } from '../agent-ephemeral-state.service.js';

describe('AgentEphemeralStateService', () => {
  afterEach(() => {
    delete process.env['MEDIA_PROXY_HMAC_SECRET'];
  });

  it('builds signed read URLs that validate successfully', () => {
    process.env['MEDIA_PROXY_HMAC_SECRET'] = 'test-media-proxy-secret';

    const { url } = AgentEphemeralStateService.buildSignedReadUrl({
      uploadId: 'upload-123',
      fileName: 'clip.mp4',
      routeBase: 'https://api.nxt1sports.com/api/v1/agent-x',
      ttlMs: 60_000,
    });

    const parsed = new URL(url);

    expect(parsed.pathname).toContain('/media-proxy/temp/upload-123/clip.mp4');
    expect(
      AgentEphemeralStateService.validateSignedReadRequest(
        'upload-123',
        parsed.searchParams.get('exp'),
        parsed.searchParams.get('sig')
      )
    ).toBe(true);
  });

  it('rejects tampered signatures', () => {
    process.env['MEDIA_PROXY_HMAC_SECRET'] = 'test-media-proxy-secret';

    const { url } = AgentEphemeralStateService.buildSignedReadUrl({
      uploadId: 'upload-456',
      fileName: 'clip.mp4',
      routeBase: 'https://api.nxt1sports.com/api/v1/agent-x',
      ttlMs: 60_000,
    });

    const parsed = new URL(url);

    expect(
      AgentEphemeralStateService.validateSignedReadRequest(
        'upload-456',
        parsed.searchParams.get('exp'),
        'bad-signature'
      )
    ).toBe(false);
  });
});