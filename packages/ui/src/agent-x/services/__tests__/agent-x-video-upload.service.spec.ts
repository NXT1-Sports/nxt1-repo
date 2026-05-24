import { describe, expect, it } from 'vitest';
import { shouldUseCloudflareUpload } from '../agent-x-video-upload.service';

describe('agent-x-video-upload helpers', () => {
  it('uses Firebase below the Cloudflare cutoff', () => {
    expect(shouldUseCloudflareUpload(100)).toBe(false);
    expect(shouldUseCloudflareUpload(250 * 1024 * 1024)).toBe(true);
    expect(shouldUseCloudflareUpload(300_000_000)).toBe(true);
  });
});
