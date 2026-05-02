/**
 * @fileoverview Tool Loop Detector
 * @module @nxt1/backend/modules/agent/services
 *
 * Detects when an agent calls the same tool with identical arguments
 * repeatedly with failed results — a classic "stuck loop" failure mode.
 *
 * Algorithm (cheap, deterministic):
 *  - Track the last `windowSize` tool-call signatures per operationId.
 *  - A signature is `${toolName}::${sha256(JSON.stringify(args))}`.
 *  - Only failed results count toward the threshold (success resets).
 *  - When the same signature appears `>= threshold` times in the window,
 *    the tool is locked out for the rest of this operation.
 *
 * On lockout the next observation prepended for the model is:
 *   `"You called <tool> with the same args N times unsuccessfully.
 *    Try a different approach."`
 *
 * The operation continues — only the misbehaving tool is blocked.
 *
 * Configuration: read from `agentRunConfig.primary.toolLoopDetector` at
 * service-construction time. When `enabled=false`, all methods become no-ops.
 */

import { createHash } from 'node:crypto';
import { logger } from '../../../utils/logger.js';
import { getCachedAgentAppConfig } from '../config/agent-app-config.js';

interface OperationLoopState {
  /** Ring buffer of recent signatures (bounded by windowSize). */
  signatures: string[];
  /** Failed-call counter per signature. Resets on success. */
  failureCounts: Map<string, number>;
  /** Locked tool names (any further call returns the lockout message). */
  lockedTools: Set<string>;
  /**
   * Consecutive empty-result counter per tool name.
   * Tracks calls that return success:true but with null/empty data.
   * These are NOT failures (so failure tracking can't catch them) but they
   * indicate the agent is searching for data that doesn't exist — a futile
   * search spiral that burns iterations just as badly as a failure loop.
   * Resets to 0 on the first non-empty success for that tool.
   */
  emptyResultCounts: Map<string, number>;
  /** Tools that have been advisory-warned for empty results (one-shot). */
  emptyAdvisedTools: Set<string>;
}

export interface ToolLoopDetectorConfig {
  readonly enabled: boolean;
  readonly windowSize: number;
  readonly threshold: number;
  /** How many consecutive empty-result calls (across any args) before advisory fires. */
  readonly emptyThreshold: number;
}

export class ToolLoopDetector {
  private readonly states = new Map<string, OperationLoopState>();

  /**
   * Resolve config lazily so live AppConfig changes are picked up between
   * operations without requiring a rebuild of the worker.
   */
  private getConfig(): ToolLoopDetectorConfig {
    const cfg = getCachedAgentAppConfig();
    const detector = cfg.primary?.toolLoopDetector;
    return {
      enabled: detector?.enabled ?? true,
      windowSize: detector?.windowSize ?? 5,
      threshold: detector?.threshold ?? 3,
      emptyThreshold: detector?.emptyThreshold ?? 4,
    };
  }

  /**
   * Hash tool arguments deterministically. Returns the same value for two
   * objects with the same key set (JSON.stringify is order-preserving for
   * objects literal-defined the same way).
   */
  static signature(toolName: string, args: string): string {
    const argsHash = createHash('sha256').update(args).digest('hex').slice(0, 16);
    return `${toolName}::${argsHash}`;
  }

  /**
   * Check whether this tool is currently locked out for the given operation.
   * Returns the lockout message if locked, null otherwise.
   */
  checkLockout(operationId: string | undefined, toolName: string): string | null {
    if (!operationId) return null;
    const state = this.states.get(operationId);
    if (!state || !state.lockedTools.has(toolName)) return null;
    return JSON.stringify({
      success: false,
      error: 'tool_loop_aborted',
      message:
        `Tool \`${toolName}\` is locked for this operation due to repeated failures with identical args. ` +
        `Do NOT call it again with the same arguments. ` +
        `Try a fundamentally different tool, ask the user for clarifying information (e.g. exact ID), ` +
        `or conclude the task with what you already have.`,
    });
  }

  /**
   * Record the outcome of a tool call.
   *
   * Outcomes:
   * - `'success'`  — tool returned data. Resets failure AND empty counters.
   * - `'failure'`  — tool returned success:false. Increments per-signature
   *                  failure count; locks the tool at threshold.
   * - `'empty'`    — tool returned success:true but data was null / [] / {}.
   *                  Increments per-tool empty count; emits a one-shot advisory
   *                  at emptyThreshold. Does NOT lock the tool (different args
   *                  could still return data) but warns the LLM to stop.
   *
   * Returns an advisory string if one should be appended to the next
   * observation so the LLM sees it, or null if no action is needed.
   */
  record(
    operationId: string | undefined,
    toolName: string,
    argsString: string,
    outcome: 'success' | 'failure' | 'empty'
  ): { advisory: string | null } {
    const cfg = this.getConfig();
    if (!cfg.enabled || !operationId) return { advisory: null };

    let state = this.states.get(operationId);
    if (!state) {
      state = {
        signatures: [],
        failureCounts: new Map(),
        lockedTools: new Set(),
        emptyResultCounts: new Map(),
        emptyAdvisedTools: new Set(),
      };
      this.states.set(operationId, state);
    }

    const sig = ToolLoopDetector.signature(toolName, argsString);

    // Slide the ring buffer (used for failure tracking only).
    state.signatures.push(sig);
    if (state.signatures.length > cfg.windowSize) {
      const evicted = state.signatures.shift();
      if (evicted && state.failureCounts.has(evicted)) {
        const c = state.failureCounts.get(evicted) ?? 0;
        if (c <= 1) state.failureCounts.delete(evicted);
        else state.failureCounts.set(evicted, c - 1);
      }
    }

    // ── Success (real data returned) ─────────────────────────────────────
    if (outcome === 'success') {
      // Non-empty success resets both the failure counter for this signature
      // AND the empty-result counter for this tool.
      state.failureCounts.delete(sig);
      state.emptyResultCounts.delete(toolName);
      return { advisory: null };
    }

    // ── Empty result (success:true but data is null / [] / {}) ──────────
    if (outcome === 'empty') {
      const emptyNext = (state.emptyResultCounts.get(toolName) ?? 0) + 1;
      state.emptyResultCounts.set(toolName, emptyNext);

      if (emptyNext >= cfg.emptyThreshold && !state.emptyAdvisedTools.has(toolName)) {
        state.emptyAdvisedTools.add(toolName);
        logger.warn('[ToolLoopDetector] empty_result_spiral_detected', {
          operationId,
          toolName,
          emptyCount: emptyNext,
          emptyThreshold: cfg.emptyThreshold,
        });
        return {
          advisory:
            `[SYSTEM NOTICE] \`${toolName}\` has returned empty or no results ${emptyNext} times in a row with different queries. ` +
            `The data you are searching for likely does not exist in the platform under any of these query variations. ` +
            `STOP searching. Either: (1) proceed with the task using only the context you already have, ` +
            `(2) use \`ask_user\` to request the exact ID or name from the user, ` +
            `or (3) clearly tell the user what you could not find and why.`,
        };
      }
      return { advisory: null };
    }

    // ── Failure (success:false) ──────────────────────────────────────────
    const next = (state.failureCounts.get(sig) ?? 0) + 1;
    state.failureCounts.set(sig, next);

    if (next >= cfg.threshold && !state.lockedTools.has(toolName)) {
      state.lockedTools.add(toolName);
      logger.warn('[ToolLoopDetector] tool_loop_aborted', {
        operationId,
        toolName,
        repeatCount: next,
        windowSize: cfg.windowSize,
        threshold: cfg.threshold,
      });
      return {
        advisory:
          `Tool \`${toolName}\` was called ${next} times with identical args and failed each time. ` +
          `It is now locked for this operation. ` +
          `Do NOT retry with the same arguments. Choose a different tool, use different parameters, ` +
          `ask the user for the exact identifier, or conclude with what you already have.`,
      };
    }

    return { advisory: null };
  }

  /** Release per-operation state when the operation terminates. */
  release(operationId: string | undefined): void {
    if (!operationId) return;
    this.states.delete(operationId);
  }
}

/** Process-wide singleton; one detector instance shared across all workers. */
let _detector: ToolLoopDetector | undefined;
export function getToolLoopDetector(): ToolLoopDetector {
  if (!_detector) _detector = new ToolLoopDetector();
  return _detector;
}
