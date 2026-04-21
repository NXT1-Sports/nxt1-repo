/**
 * @fileoverview Agent Run Configuration — Firestore-backed tuning knobs.
 *
 * All agent task-running limits are read at runtime from:
 *   Firestore → `AppConfig/agentConfig`
 *
 * Field reference:
 * ┌──────────────────────┬───────┬──────────────────────────────────────────────┐
 * │ Field                │ Type  │ Description                                  │
 * ├──────────────────────┼───────┼──────────────────────────────────────────────┤
 * │ taskMaxRetries       │ int64 │ Per-task self-correction retries in the DAG  │
 * │ maxDelegationDepth   │ int64 │ Max agent delegation hops before giving up   │
 * │ maxAgenticTurns      │ int64 │ Max agentic loop turns per SSE chat request  │
 * │ maxJobAttempts       │ int64 │ BullMQ job-level retry attempts              │
 * │ retryBackoffMs       │ int64 │ BullMQ exponential backoff seed (ms)         │
 * └──────────────────────┴───────┴──────────────────────────────────────────────┘
 *
 * All fields are optional — missing or invalid values fall back to built-in defaults.
 * No code deploy is needed to change these values.
 */

import type { Firestore } from 'firebase-admin/firestore';

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_CONFIG_COLLECTION = 'AppConfig';
const AGENT_CONFIG_DOC_ID = 'agentConfig';

/** Fallback values — used when the Firestore doc is missing or a field is invalid. */
const FALLBACK_TASK_MAX_RETRIES = 2;
const FALLBACK_MAX_DELEGATION_DEPTH = 2;
const FALLBACK_MAX_AGENTIC_TURNS = 6;
const FALLBACK_MAX_JOB_ATTEMPTS = 2;
const FALLBACK_RETRY_BACKOFF_MS = 5_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentRunConfig {
  /** Per-task self-correction retries inside the DAG runner. */
  readonly taskMaxRetries: number;
  /** Maximum agent delegation hops before the router aborts. */
  readonly maxDelegationDepth: number;
  /** Maximum agentic loop turns per SSE chat request. */
  readonly maxAgenticTurns: number;
  /** BullMQ job-level retry attempts. */
  readonly maxJobAttempts: number;
  /** BullMQ exponential backoff seed in milliseconds. */
  readonly retryBackoffMs: number;
}

/** Built-in defaults used when the Firestore doc is absent or a field is invalid. */
export const DEFAULT_AGENT_RUN_CONFIG: AgentRunConfig = {
  taskMaxRetries: FALLBACK_TASK_MAX_RETRIES,
  maxDelegationDepth: FALLBACK_MAX_DELEGATION_DEPTH,
  maxAgenticTurns: FALLBACK_MAX_AGENTIC_TURNS,
  maxJobAttempts: FALLBACK_MAX_JOB_ATTEMPTS,
  retryBackoffMs: FALLBACK_RETRY_BACKOFF_MS,
};

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Read agent task-running configuration from Firestore (`AppConfig/agentConfig`).
 * Falls back to `DEFAULT_AGENT_RUN_CONFIG` if the document is absent or a field
 * is not a valid non-negative integer.
 */
export async function getAgentRunConfig(db: Firestore): Promise<AgentRunConfig> {
  try {
    const snap = await db.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID).get();
    const data = snap.data();

    /** Accept only non-negative integers; fall back to the given default otherwise. */
    const int = (val: unknown, fallback: number): number =>
      typeof val === 'number' && Number.isInteger(val) && val >= 0 ? val : fallback;

    return {
      taskMaxRetries: int(data?.['taskMaxRetries'], FALLBACK_TASK_MAX_RETRIES),
      maxDelegationDepth: int(data?.['maxDelegationDepth'], FALLBACK_MAX_DELEGATION_DEPTH),
      maxAgenticTurns: int(data?.['maxAgenticTurns'], FALLBACK_MAX_AGENTIC_TURNS),
      maxJobAttempts: int(data?.['maxJobAttempts'], FALLBACK_MAX_JOB_ATTEMPTS),
      retryBackoffMs: int(data?.['retryBackoffMs'], FALLBACK_RETRY_BACKOFF_MS),
    };
  } catch {
    return DEFAULT_AGENT_RUN_CONFIG;
  }
}
