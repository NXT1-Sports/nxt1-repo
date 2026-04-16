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

/** Maximum number of active recurring schedules per user. */
export const MAX_RECURRING_JOBS_PER_USER = 10 as const;

/** Minimum interval between recurring job executions (1 hour in ms). */
export const MIN_RECURRING_INTERVAL_MS = 3_600_000 as const;

/** Delayed idle window before a thread is summarized into memory (1 hour in ms). */
export const THREAD_SUMMARIZATION_DELAY_MS = 3_600_000 as const;

/** BullMQ job name for event-driven idle thread summarization. */
export const THREAD_SUMMARIZATION_JOB_NAME = 'THREAD_SUMMARIZATION' as const;

/**
 * How long BullMQ holds the lock on an active job (ms).
 * Must exceed the longest expected agent execution time.
 * Agent jobs involve multiple LLM calls (60s each) + scraper calls (15s each)
 * across up to 10 ReAct iterations, so 5 minutes is a safe ceiling.
 */
export const JOB_LOCK_DURATION_MS = 300_000 as const;

/**
 * Overall timeout for a single agent job (ms).
 * If the job hasn't completed within this window, it's force-failed.
 */
export const JOB_TIMEOUT_MS = 300_000 as const;

// ─── Job Data Shapes ────────────────────────────────────────────────────────

/** Queue payload for a normal Agent X background execution. */
export interface StandardAgentQueueJobData {
  /** Discriminator for the worker. */
  readonly kind: 'agent';
  /** The original job payload from the API request or trigger. */
  readonly payload: AgentJobPayload;
  /** ISO timestamp of when the job was enqueued. */
  readonly enqueuedAt: string;
  /** Which Firestore the job document lives in — used by the worker to write back to the correct DB. */
  readonly environment: 'staging' | 'production';
}

/** Queue payload for delayed thread summarization after the chat goes idle. */
export interface ThreadSummarizationQueueJobData {
  /** Discriminator for the worker. */
  readonly kind: 'thread_summarization';
  /** Mongo thread id to summarize. */
  readonly threadId: string;
  /** Owner of the thread. */
  readonly userId: string;
  /** Delay used when the job was scheduled (ms). */
  readonly delayMs: number;
  /** ISO timestamp of when the job was enqueued. */
  readonly enqueuedAt: string;
  /** Which Firestore environment the queue is operating against. */
  readonly environment: 'staging' | 'production';
}

/** Union of all BullMQ payloads handled by the agent queue worker. */
export type AgentQueueJobData = StandardAgentQueueJobData | ThreadSummarizationQueueJobData;

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

// ─── Recurring Job Shapes ───────────────────────────────────────────────────

/**
 * Frontend-facing summary of a single recurring schedule.
 * Returned by the list_recurring_tasks tool and the REST API.
 * Metadata is persisted in Firestore (`RecurringTasks/{key}`).
 */
export interface RecurringJobInfo {
  /** The BullMQ repeatable job key (used for removal). */
  readonly key: string;
  /** Human-readable action description. */
  readonly actionSummary: string;
  /** The cron pattern controlling execution. */
  readonly cronExpression: string;
  /** ISO timestamp of the next scheduled execution (null if paused/unknown). */
  readonly nextRun: string | null;
  /** ISO timestamp of when the schedule was created. */
  readonly createdAt: string;
}

/**
 * Granular stream event written to the `events` subcollection
 * simulating an SSE stream for the Optimistic Background Pattern.
 */
export type AgentJobEvent =
  | { type: 'step_active'; tool: string; input: Record<string, unknown>; timestamp: number }
  | { type: 'step_success'; tool: string; result: string; timestamp: number }
  | { type: 'step_error'; tool: string; error: string; timestamp: number }
  | { type: 'delta'; text: string; timestamp: number }
  | { type: 'done'; timestamp: number };
