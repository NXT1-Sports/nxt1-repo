/**
 * @fileoverview Agent X Runtime Constants
 * @module @nxt1/core/ai
 *
 * Single source of truth for Agent X operation runtime timing/retry policy.
 * Values here are consumed by backend queue/routes and frontend recovery UX.
 */

export const AGENT_X_RUNTIME_CONFIG = {
  operationStream: {
    pollBackoffInitialMs: 1_200,
    pollBackoffMaxMs: 30_000,
    fallbackAlertThresholdMs: 30_000,
    idleTimeoutMs: 10 * 60 * 1_000,
    attachmentWaitTimeoutMs: 90_000,
    liveBufferMaxEvents: 500,
  },
  operationQueue: {
    jobTimeoutMs: 7_200_000,
    lockDurationMs: 1_800_000,
    maxTimeoutAutoContinuations: 6,
    parentOperationPollMs: 1_000,
    parentOperationTimeoutBufferMs: 5 * 60_000,
    viewerHeartbeatFreshnessMs: 60_000,
  },
  clientRecovery: {
    streamLimitRetryBackoffMs: 900,
    activityGapTimeoutMs: 2_500,
    streamLatencyClampMs: 120_000,
    abortControllerSweepIntervalMs: 60_000,
    abortControllerTtlMs: 10 * 60 * 1_000,
  },
  attachmentTransport: {
    messageSyncRetryMs: 400,
    preSendBackgroundUploadWaitMs: 12_000,
    uploadTimeoutMs: 20_000,
    uploadMaxAttempts: 2,
    /** Max time (ms) to wait for the SSE onThread event before falling back to unbound storage */
    threadIdResolveWaitMs: 8_000,
  },
  videoUpload: {
    directPutMaxAttempts: 2,
    directPutRetryDelayMs: 700,
    directPutTimeoutMs: 180_000,
  },
  playbookAsync: {
    pollIntervalMs: 1_500,
    pollMaxAttempts: 50,
  },
  controlPanelHealth: {
    pollIntervalMs: 60_000,
    recoveryDelayMs: 30_000,
    failureThreshold: 3,
  },
} as const;
