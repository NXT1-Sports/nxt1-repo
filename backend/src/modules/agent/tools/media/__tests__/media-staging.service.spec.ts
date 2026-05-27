import { describe, expect, it } from 'vitest';

import { MediaStagingService } from '../media-staging.service.js';

interface MediaStagingInternals {
  isPlausibleVideoPayload(sample: Buffer): boolean;
}

describe('MediaStagingService', () => {
  const service = new MediaStagingService() as unknown as MediaStagingInternals;

  it('accepts MP4 payload signatures', () => {
    const sample = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(64),
    ]);

    expect(service.isPlausibleVideoPayload(sample)).toBe(true);
  });

  it('rejects html and json payloads staged as video', () => {
    expect(service.isPlausibleVideoPayload(Buffer.from('<!doctype html><html></html>'))).toBe(
      false
    );
    expect(service.isPlausibleVideoPayload(Buffer.from('{"error":"not authorized"}'))).toBe(false);
  });
});
