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
}

export interface ToolLoopDetectorConfig {
  readonly enabled: boolean;
  readonly windowSize: number;
  readonly threshold: number;
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
      message: `Tool \`${toolName}\` is locked for this operation due to repeated failures with identical args. Try a different approach or different arguments.`,
    });
  }

  /**
   * Record the outcome of a tool call. On the threshold-th repeated failure,
   * the tool is locked and a one-time advisory message is returned (caller
   * should append it to the next system note for the model).
   */
  record(
    operationId: string | undefined,
    toolName: string,
    argsString: string,
    outcome: 'success' | 'failure'
  ): { advisory: string | null } {
    const cfg = this.getConfig();
    if (!cfg.enabled || !operationId) return { advisory: null };

    let state = this.states.get(operationId);
    if (!state) {
      state = {
        signatures: [],
        failureCounts: new Map(),
        lockedTools: new Set(),
      };
      this.states.set(operationId, state);
    }

    const sig = ToolLoopDetector.signature(toolName, argsString);

    // Slide the ring buffer.
    state.signatures.push(sig);
    if (state.signatures.length > cfg.windowSize) {
      const evicted = state.signatures.shift();
      if (evicted && state.failureCounts.has(evicted)) {
        const c = state.failureCounts.get(evicted) ?? 0;
        if (c <= 1) state.failureCounts.delete(evicted);
        else state.failureCounts.set(evicted, c - 1);
      }
    }

    if (outcome === 'success') {
      // Success on this signature resets its failure counter; it stays in
      // the buffer but no longer contributes to lockout.
      state.failureCounts.delete(sig);
      return { advisory: null };
    }

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
        advisory: `Tool \`${toolName}\` was called ${next} times with identical args and failed each time. It is now locked for this operation. Choose a different tool or different arguments.`,
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
