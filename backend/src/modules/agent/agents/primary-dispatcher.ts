/**
 * @fileoverview Primary Agent Dispatcher Interface
 * @module @nxt1/backend/modules/agent/agents
 *
 * Decoupled handler the {@link PrimaryAgent} uses to dispatch sub-tasks
 * (specialist coordinators, multi-step plans) without taking a hard
 * dependency on the {@link AgentRouter}. The router implements this by
 * closing over its execution service, agents map, and approval gate.
 *
 * Each dispatch returns a markdown observation string ready to be fed
 * back into the Primary's ReAct loop as the next tool result.
 */

import type { AgentIdentifier, AgentSessionContext } from '@nxt1/core';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';

export interface PrimaryDispatchContext {
  readonly operationId: string;
  readonly userId: string;
  readonly enrichedIntent: string;
  readonly sessionContext: AgentSessionContext;
  readonly approvalGate?: ApprovalGateService;
  readonly onStreamEvent?: OnStreamEvent;
  readonly signal?: AbortSignal;
}

export interface PrimaryDispatchResult {
  readonly success: boolean;
  readonly observation: string;
  readonly dispatchKind?: 'coordinator' | 'plan' | 'saved_plan';
  readonly userAlreadyReceivedResponse?: boolean;
  readonly streamedDeltaCount?: number;
  readonly streamedCharCount?: number;
  /** Artifacts produced by the coordinator(s) — forwarded back to Primary for chained reasoning (Tier 4). */
  readonly coordinatorArtifacts?: Record<string, unknown>;
}

export interface PrimaryDispatcher {
  /**
   * Run a single specialist coordinator with a focused goal. Streams
   * sub-events back through the parent operation's `onStreamEvent`.
   */
  runCoordinator(
    coordinatorId: Exclude<AgentIdentifier, 'router'>,
    goal: string,
    ctx: PrimaryDispatchContext,
    structuredPayload?: Record<string, unknown>
  ): Promise<PrimaryDispatchResult>;

  /**
   * Build a multi-step DAG plan and pause for explicit user approval before
   * execution begins.
   */
  runPlan(goal: string, ctx: PrimaryDispatchContext): Promise<PrimaryDispatchResult>;

  /**
   * Execute a previously saved plan after user approval has been granted.
   */
  runApprovedPlan(planId: string, ctx: PrimaryDispatchContext): Promise<PrimaryDispatchResult>;
}
