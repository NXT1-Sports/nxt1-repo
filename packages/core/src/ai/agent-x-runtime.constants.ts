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
    attachmentWaitTimeoutMs: 300_000,
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
    provisionMaxAttempts: 3,
    provisionRetryDelayMs: 900,
    provisionRequestTimeoutMs: 12_000,
    directPutMaxAttempts: 2,
    directPutRetryDelayMs: 700,
    directPutTimeoutMs: 180_000,
  },
  playbookAsync: {
    pollIntervalMs: 1_500,
    pollMaxAttempts: 100,
  },
  controlPanelHealth: {
    pollIntervalMs: 60_000,
    recoveryDelayMs: 30_000,
    failureThreshold: 3,
  },
  /**
   * UI feature flags — set to `false` to hide a panel from all users.
   * Flip to `true` when the feature is ready to ship.
   */
  featureFlags: {
    /** Diagrams Lab panel (Agent X side panel) */
    diagramsPanel: false,
    /** Live View (Firecrawl interactive browser panel) */
    liveView: false,
    /** Game Plans panel */
    gamePlans: false,
    /** Practice Scripts panel */
    practiceScripts: false,
  },
} as const;
