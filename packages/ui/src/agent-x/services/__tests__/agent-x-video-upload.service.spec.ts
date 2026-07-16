import { describe, expect, it } from 'vitest';
import {
  isRetryableVideoProvisionFailure,
  resolveFastUploadCompletionDelayMs,
  smoothFastUploadPercent,
  shouldUseCloudflareUpload,
  stepNativeUploadDisplayPercent,
} from '../agent-x-video-upload.service';

describe('agent-x-video-upload helpers', () => {
  it('uses Firebase below the Cloudflare cutoff', () => {
    expect(shouldUseCloudflareUpload(100)).toBe(false);
    expect(shouldUseCloudflareUpload(1024 * 1024 * 1024 - 1)).toBe(false);
    expect(shouldUseCloudflareUpload(1024 * 1024 * 1024)).toBe(true);
    expect(shouldUseCloudflareUpload(1_200_000_000)).toBe(true);
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

  it('front-loads tiny native progress updates so the UI does not sit at 5%', () => {
    expect(
      stepNativeUploadDisplayPercent({
        displayedPercent: 5,
        actualProgress: 0.02,
        idleMs: 0,
      })
    ).toBeGreaterThan(5);
  });

  it('allows native upload progress to creep forward between sparse plugin callbacks', () => {
    expect(
      stepNativeUploadDisplayPercent({
        displayedPercent: 5,
        actualProgress: null,
        idleMs: 2_700,
      })
    ).toBeGreaterThan(5);
  });

  it('never lets the smoothed native progress exceed the soft cap before completion', () => {
    expect(
      stepNativeUploadDisplayPercent({
        displayedPercent: 97,
        actualProgress: 1,
        idleMs: 10_000,
      })
    ).toBeLessThanOrEqual(98);
  });

  it('caps ultra-fast web upload progress so tiny files do not jump straight to 100%', () => {
    expect(
      smoothFastUploadPercent({
        previousPercent: 0,
        rawPercent: 99,
        elapsedMs: 40,
      })
    ).toBeLessThan(99);
  });

  it('allows upload progress to catch up once the minimum display window has passed', () => {
    expect(
      smoothFastUploadPercent({
        previousPercent: 52,
        rawPercent: 99,
        elapsedMs: 900,
      })
    ).toBe(99);
  });

  it('holds completion briefly for very fast uploads', () => {
    expect(resolveFastUploadCompletionDelayMs(50)).toBeGreaterThan(0);
    expect(resolveFastUploadCompletionDelayMs(900)).toBe(0);
  });
});
