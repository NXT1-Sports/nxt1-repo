import { describe, expect, it } from 'vitest';
import {
  isRetryableVideoProvisionFailure,
  shouldUseCloudflareUpload,
} from '../agent-x-video-upload.service';

describe('agent-x-video-upload helpers', () => {
  it('uses Firebase below the Cloudflare cutoff', () => {
    expect(shouldUseCloudflareUpload(100)).toBe(false);
    expect(shouldUseCloudflareUpload(250 * 1024 * 1024)).toBe(true);
    expect(shouldUseCloudflareUpload(300_000_000)).toBe(true);
  });

  it('treats request-timeout style failures as retryable', () => {
    expect(
      isRetryableVideoProvisionFailure({
        httpStatus: 500,
      })
    ).toBe(true);

    expect(
      isRetryableVideoProvisionFailure({
        httpStatus: 429,
      })
    ).toBe(true);

    expect(
      isRetryableVideoProvisionFailure({
        errorCode: 'REQUEST_TIMEOUT',
      })
    ).toBe(true);

    expect(
      isRetryableVideoProvisionFailure({
        errorMessage: 'Request timed out while creating signed url',
      })
    ).toBe(true);
  });

  it('does not retry deterministic client errors', () => {
    expect(
      isRetryableVideoProvisionFailure({
        httpStatus: 400,
        errorMessage: 'Invalid file name',
      })
    ).toBe(false);
  });
});
