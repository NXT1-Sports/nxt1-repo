/**
 * @fileoverview Operation Memory Service (Tier 5)
 * @module @nxt1/backend/modules/agent/services
 *
 * Maintains a per-operation in-memory record of:
 *  - Every tool execution (agent, toolName, inputHash, outcome)
 *  - Every artifact produced (key, value, source agent)
 *  - Every coordinator dispatch (coordinatorId, goal, artifacts produced)
 *
 * Provides deterministic duplicate detection via `hasExecuted()` so that
 * when Primary delegates to a coordinator, the coordinator can skip any
 * tool it knows Primary already ran — regardless of context pruning.
 *
 * Lifecycle:
 *  - `init(operationId, enrichedIntent)` — call once at operation start
 *  - `logEvent / logArtifact / logCoordinatorExecution` — call throughout
 *  - `hasExecuted` — query before dispatching a potentially redundant tool
 *  - `flush(operationId)` — call at operation end to free memory
 *
 * Thread-safety: operations run serially within a single worker process;
 * the Map is safe for concurrent-ish access via the single-threaded Node.js
 * event loop. For multi-process deployments, promote this to Redis.
 *
 * @example
 * ```ts
 * const memory = getOperationMemoryService();
 * memory.init('op-123', enrichedIntent);
 * memory.logArtifact('op-123', { key: 'mediaArtifact', value: {...}, sourceAgent: 'router' });
 * memory.hasExecuted('op-123', 'performance_coordinator', 'extract_live_view_media', hash);
 * // → true if already ran
 * ```
 */

import { createHash } from 'node:crypto';
import { logger } from '../../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OperationEvent {
  readonly timestamp: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly inputHash: string;
  readonly outcome: 'success' | 'failure' | 'skip';
  readonly durationMs?: number;
}

export interface ArtifactEntry {
  readonly timestamp: string;
  readonly key: string;
  readonly value: unknown;
  readonly sourceAgent: string;
  readonly sourceTool: string;
}

export interface CoordinatorTraceEntry {
  readonly timestamp: string;
  readonly coordinatorId: string;
  readonly goal: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly success?: boolean;
  readonly artifactsProduced: string[];
}

interface OperationState {
  readonly operationId: string;
  readonly enrichedIntent: string;
  readonly createdAt: string;
  lastActiveAt: string;
  readonly events: OperationEvent[];
  readonly artifactLedger: ArtifactEntry[];
  readonly coordinatorTrace: CoordinatorTraceEntry[];
  /** Dedupe set: `${agentId}::${toolName}::${inputHash}` */
  readonly executionSet: Set<string>;
  /** Cached successful result keyed by `${toolName}::${inputHash}` for duplicate short-circuiting. */
  readonly successfulResults: Map<string, unknown>;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * In-memory operation memory store. One instance per Node.js process.
 * Accessed via the module-level singleton `getOperationMemoryService()`.
 */
class OperationMemoryService {
  /** operationId → state */
  private readonly store = new Map<string, OperationState>();

  /** Max number of concurrent operations to track before oldest is evicted. */
  private readonly maxOperations = 100;

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Initialise memory for a new operation. Idempotent — safe to call multiple
   * times for the same operationId (subsequent calls are no-ops).
   */
  init(operationId: string, enrichedIntent: string): void {
    if (this.store.has(operationId)) return;

    // Evict oldest entry when at capacity
    if (this.store.size >= this.maxOperations) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey) {
        this.store.delete(oldestKey);
        logger.warn('[OperationMemory] Evicted oldest operation to stay within capacity', {
          evictedOperationId: oldestKey,
        });
      }
    }

    const now = new Date().toISOString();
    this.store.set(operationId, {
      operationId,
      enrichedIntent,
      createdAt: now,
      lastActiveAt: now,
      events: [],
      artifactLedger: [],
      coordinatorTrace: [],
      executionSet: new Set(),
      successfulResults: new Map(),
    });
  }

  /**
   * Free memory for a completed operation.
   * Call this when the agent job finalises (success, failure, or cancellation).
   */
  flush(operationId: string): void {
    this.store.delete(operationId);
  }

  // ─── Recording ───────────────────────────────────────────────────────────

  /**
   * Record a tool execution attempt.
   * Must be called after each tool completes (success or failure).
   */
  logEvent(
    operationId: string,
    event: Omit<OperationEvent, 'timestamp' | 'inputHash'> & { input?: unknown }
  ): void {
    const state = this.store.get(operationId);
    if (!state) return;

    const inputHash = this.hashInput(event.input ?? null);
    const record: OperationEvent = {
      timestamp: new Date().toISOString(),
      agentId: event.agentId,
      toolName: event.toolName,
      inputHash,
      outcome: event.outcome,
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    };

    state.events.push(record);
    state.lastActiveAt = record.timestamp;

    if (event.outcome === 'success') {
      state.executionSet.add(`${event.agentId}::${event.toolName}::${inputHash}`);
    }
  }

  /**
   * Record an artifact produced by a tool.
   * Artifacts are indexed by key for fast retrieval via `getLatestArtifact`.
   */
  logArtifact(operationId: string, artifact: Omit<ArtifactEntry, 'timestamp'>): void {
    const state = this.store.get(operationId);
    if (!state) return;

    state.artifactLedger.push({
      timestamp: new Date().toISOString(),
      ...artifact,
    });
    state.lastActiveAt = new Date().toISOString();
  }

  /**
   * Cache a successful tool result keyed by tool name + normalized input hash.
   * Used to short-circuit duplicate expensive tool calls later in the operation.
   */
  rememberSuccessfulResult(
    operationId: string,
    toolName: string,
    input: unknown,
    result: unknown
  ): void {
    const state = this.store.get(operationId);
    if (!state) return;

    const inputHash = this.hashInput(input ?? null);
    state.successfulResults.set(`${toolName}::${inputHash}`, result);
    state.lastActiveAt = new Date().toISOString();
  }

  /**
   * Record the start of a coordinator dispatch.
   * Returns a `completeTrace` callback — call it when the coordinator finishes.
   */
  logCoordinatorExecution(
    operationId: string,
    coordinatorId: string,
    goal: string
  ): (result: { success: boolean; artifactsProduced: string[] }) => void {
    const state = this.store.get(operationId);
    const startedAt = new Date().toISOString();

    if (!state) return () => undefined;

    const trace: CoordinatorTraceEntry = {
      timestamp: startedAt,
      coordinatorId,
      goal,
      startedAt,
      artifactsProduced: [],
    };
    state.coordinatorTrace.push(trace);

    return (result) => {
      const idx = state.coordinatorTrace.indexOf(trace);
      if (idx === -1) return;
      const completed: CoordinatorTraceEntry = {
        ...trace,
        completedAt: new Date().toISOString(),
        success: result.success,
        artifactsProduced: result.artifactsProduced,
      };
      state.coordinatorTrace[idx] = completed;
    };
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /**
   * Returns `true` if `agentId` already ran `toolName` with these exact
   * arguments (by SHA-256 hash) in this operation AND it succeeded.
   *
   * Coordinators should call this before running expensive extraction tools
   * to avoid duplicating work already done by Primary.
   */
  hasExecuted(operationId: string, agentId: string, toolName: string, input?: unknown): boolean {
    const state = this.store.get(operationId);
    if (!state) return false;
    const inputHash = this.hashInput(input ?? null);
    return state.executionSet.has(`${agentId}::${toolName}::${inputHash}`);
  }

  /**
   * Retrieve a previously successful result for the same tool + normalized input,
   * regardless of which agent originally produced it.
   */
  getSuccessfulResult(operationId: string, toolName: string, input?: unknown): unknown {
    const state = this.store.get(operationId);
    if (!state) return undefined;
    const inputHash = this.hashInput(input ?? null);
    return state.successfulResults.get(`${toolName}::${inputHash}`);
  }

  /**
   * Returns the most recently produced value for `key` across ALL agents in
   * this operation, or `undefined` if no artifact with that key was recorded.
   */
  getLatestArtifact(operationId: string, key: string): unknown {
    const state = this.store.get(operationId);
    if (!state) return undefined;
    // Scan from end (most recent first)
    for (let i = state.artifactLedger.length - 1; i >= 0; i--) {
      if (state.artifactLedger[i].key === key) {
        return state.artifactLedger[i].value;
      }
    }
    return undefined;
  }

  /**
   * Returns all coordinator executions for this operation in chronological order.
   */
  getCoordinatorHistory(operationId: string): readonly CoordinatorTraceEntry[] {
    return this.store.get(operationId)?.coordinatorTrace ?? [];
  }

  /**
   * Returns a snapshot of all events for debugging / telemetry.
   */
  getEvents(operationId: string): readonly OperationEvent[] {
    return this.store.get(operationId)?.events ?? [];
  }

  /**
   * Returns the full artifact ledger for an operation.
   */
  getArtifacts(operationId: string): readonly ArtifactEntry[] {
    return this.store.get(operationId)?.artifactLedger ?? [];
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private hashInput(input: unknown): string {
    const text =
      input === null || input === undefined
        ? '__null__'
        : typeof input === 'string'
          ? input
          : JSON.stringify(input);
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
  }
}

// ─── Module-Level Singleton ──────────────────────────────────────────────────

let _instance: OperationMemoryService | null = null;

/**
 * Returns the module-level singleton OperationMemoryService.
 * All agents and the execution service use this shared instance.
 */
export function getOperationMemoryService(): OperationMemoryService {
  if (!_instance) _instance = new OperationMemoryService();
  return _instance;
}

/** Test-only reset hook for the module singleton. */
export function resetOperationMemoryServiceForTests(): void {
  _instance = null;
}
