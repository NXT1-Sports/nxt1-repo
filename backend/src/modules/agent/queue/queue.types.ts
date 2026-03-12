/**
 * @fileoverview Agent Queue Types
 * @module @nxt1/backend/modules/agent/queue
 *
 * Internal types for the BullMQ-backed job queue.
 * These are backend-only — the frontend uses the shared types
 * from @nxt1/core (AgentJobPayload, AgentOperationStatus, etc.).
 */

import type {
  AgentJobPayload,
  AgentOperationStatus,
  AgentOperationResult,
  AgentExecutionPlan,
} from '@nxt1/core';

// ─── Queue Constants ────────────────────────────────────────────────────────

/** BullMQ queue name for agent jobs. */
export const AGENT_QUEUE_NAME = 'agent-jobs' as const;

/** Redis key prefix for all agent queue data (keeps namespace clean). */
export const AGENT_QUEUE_PREFIX = 'nxt1' as const;

/** Maximum number of concurrent agent jobs a single worker can process. */
export const WORKER_CONCURRENCY = 3 as const;

/** How long to keep completed job data in Redis (24 hours in seconds). */
export const COMPLETED_JOB_TTL_S = 86_400 as const;

/** How long to keep failed job data in Redis (7 days in seconds). */
export const FAILED_JOB_TTL_S = 604_800 as const;

/** Maximum number of retry attempts for a failed job. */
export const MAX_JOB_ATTEMPTS = 2 as const;

/** Backoff delay between retry attempts (exponential, in ms). */
export const RETRY_BACKOFF_MS = 5_000 as const;

// ─── Job Data Shapes ────────────────────────────────────────────────────────

/**
 * The data payload stored inside each BullMQ job.
 * This extends the core AgentJobPayload with queue-specific metadata.
 */
export interface AgentQueueJobData {
  /** The original job payload from the API request or trigger. */
  readonly payload: AgentJobPayload;
  /** ISO timestamp of when the job was enqueued. */
  readonly enqueuedAt: string;
  /** Which Firestore the job document lives in — used by the worker to write back to the correct DB. */
  readonly environment: 'staging' | 'production';
}

/**
 * The return value from a completed BullMQ job.
 * Stored by BullMQ in Redis for retrieval via GET /status/:jobId.
 */
export interface AgentQueueJobResult {
  /** Final operation result (summary, data, suggestions). */
  readonly result: AgentOperationResult;
  /** The execution plan that was produced by the PlannerAgent. */
  readonly plan?: AgentExecutionPlan;
  /** Total processing time in ms. */
  readonly durationMs: number;
  /** ISO timestamp of completion. */
  readonly completedAt: string;
}

/**
 * Progress data reported by the worker during execution.
 * This is stored by BullMQ and can be polled by the status endpoint.
 */
export interface AgentJobProgress {
  /** Current operation status. */
  readonly status: AgentOperationStatus;
  /** Human-readable status message for the frontend. */
  readonly message: string;
  /** Completion percentage (0-100). */
  readonly percent: number;
  /** The current step index (1-based). */
  readonly currentStep: number;
  /** Total number of steps in the plan. */
  readonly totalSteps: number;
  /** ISO timestamp of the last progress update. */
  readonly updatedAt: string;
}

/**
 * Full job status returned by the GET /status/:jobId endpoint.
 * Combines BullMQ's internal state with our custom progress data.
 */
export interface AgentJobStatusResponse {
  /** The BullMQ job ID (same as operationId). */
  readonly jobId: string;
  /** The user who created this job (for ownership verification). */
  readonly userId: string;
  /** High-level status. */
  readonly status: AgentOperationStatus;
  /** Detailed progress (null if job hasn't started processing). */
  readonly progress: AgentJobProgress | null;
  /** The completed result (null if still processing). */
  readonly result: AgentQueueJobResult | null;
  /** Error message if the job failed. */
  readonly error: string | null;
  /** ISO timestamp of when the job was created. */
  readonly createdAt: string;
}
