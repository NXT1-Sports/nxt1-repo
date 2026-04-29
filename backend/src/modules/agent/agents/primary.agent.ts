/**
 * @fileoverview Primary Agent — The Single Front-Door Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Replaces the legacy 3-agent triage pipeline (Classifier → Conversation →
 * Planner) with a single, streaming, native tool-calling agent. Modeled after
 * OpenAI Assistants v2 / Anthropic Computer Use / Cursor.
 *
 * Architecture:
 *  - Reuses the BaseAgent ReAct loop verbatim — streaming, tool validation,
 *    yield/approval handling all unchanged.
 *  - System prompt is composed from {@link AGENT_X_IDENTITY} + the live
 *    {@link CapabilityRegistry} compact card + a one-paragraph user summary.
 *    No template strings; the model writes its own transitions.
 *  - Available tools = lazy-context tools + delegate-to-coordinator +
 *    plan-and-execute + whoami_capabilities + a curated fast-path set.
 *  - Coordinators are NOT in the Primary's tool list directly; they're
 *    dispatched via {@link DelegateToCoordinatorTool} which throws a
 *    control-flow exception this class intercepts and routes through the
 *    {@link PrimaryDispatcher}.
 *
 * Identity: keeps `id = 'router'` for event back-compat with the existing
 * frontend (which keys 5-phase progress UI off the `router` agentId). The
 * class name and behavior, not the wire-level identifier, is what changes.
 */

import {
  AGENT_X_IDENTITY,
  buildSystemPrompt,
  type AgentIdentifier,
  type AgentSessionContext,
  type AgentToolDefinition,
  type ModelRoutingConfig,
  MODEL_ROUTING_DEFAULTS,
} from '@nxt1/core';
import { BaseAgent, type ToolSessionContext } from './base.agent.js';
import type { CapabilityRegistry } from '../capabilities/capability-registry.js';
import { getToolLoopDetector } from '../services/tool-loop-detector.service.js';
import type { PrimaryDispatcher, PrimaryDispatchContext } from './primary-dispatcher.js';
import {
  DelegateToCoordinatorException,
  isDelegateToCoordinator,
} from '../exceptions/delegate-to-coordinator.exception.js';
import {
  PlanAndExecuteException,
  isPlanAndExecute,
} from '../exceptions/plan-and-execute.exception.js';
import type { LLMToolCall, LLMMessage } from '../llm/llm.types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { AskUserToolContext } from '../tools/system/ask-user.tool.js';
import { getCachedAgentAppConfig } from '../config/agent-app-config.js';

/**
 * Curated fast-path tool set for the Primary. These are read-only or low-risk
 * one-shot tools the Primary can call directly without going through a
 * coordinator. Mutation-heavy tools always route through coordinators.
 */
const PRIMARY_FAST_PATH_TOOLS: readonly string[] = [
  // Lazy context (Tier B)
  'get_user_profile',
  'get_active_threads',
  'get_other_thread_history',
  'get_recent_sync_summaries',
  'search_memory',
  'search_memories',
  // Self-knowledge & orchestration
  'whoami_capabilities',
  'delegate_to_coordinator',
  'plan_and_execute',
  // Direct one-shot fast-path (read-only or trivial)
  'open_live_view',
  // Read-only data lookup — Primary calls these DIRECTLY for factual
  // questions to avoid hallucination. Delegating a simple lookup to a
  // coordinator just adds latency without value.
  'search_nxt1_platform',
  'query_nxt1_platform_data',
  'search_web',
  'firecrawl_search_web',
  'scrape_webpage',
  'get_college_logos',
  'get_conference_logos',
  'get_analytics_summary',
  'scan_timeline_posts',
];

interface PrimaryAgentSessionState {
  readonly operationId: string;
  readonly userId: string;
  readonly sessionContext: AgentSessionContext;
  readonly enrichedIntent: string;
  readonly approvalGate?: ApprovalGateService;
  readonly onStreamEvent?: OnStreamEvent;
  readonly signal?: AbortSignal;
}

export class PrimaryAgent extends BaseAgent {
  /**
   * Wire-level identifier kept as `'router'` for back-compat with frontend
   * progress events. The class name and behavior are what changed.
   */
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Primary Agent';

  /**
   * Per-run state stash keyed by operationId. Set by the AgentRouter just
   * before calling `execute()`, read by the executeTool override when it
   * needs to dispatch a coordinator or multi-step plan. Cleared by the
   * router after the run terminates.
   */
  private readonly sessionStates = new Map<string, PrimaryAgentSessionState>();

  constructor(
    private readonly capabilities: CapabilityRegistry,
    private readonly dispatcher: PrimaryDispatcher
  ) {
    super();
  }

  // ─── Per-run state binding ──────────────────────────────────────────────

  beginRun(state: PrimaryAgentSessionState): void {
    this.sessionStates.set(state.operationId, state);
  }

  endRun(operationId: string): void {
    this.sessionStates.delete(operationId);
    // Release per-operation loop-detector state to prevent leaks.
    getToolLoopDetector().release(operationId);
  }

  // ─── BaseAgent contract ─────────────────────────────────────────────────

  getModelRouting(): ModelRoutingConfig {
    const cfg = getCachedAgentAppConfig();
    const tier = cfg.primary?.modelTier ?? 'routing';
    return MODEL_ROUTING_DEFAULTS[tier] ?? MODEL_ROUTING_DEFAULTS['routing'];
  }

  override getToolConcurrency(): number {
    const cfg = getCachedAgentAppConfig();
    return cfg.primary?.toolConcurrency ?? 3;
  }

  getAvailableTools(): readonly string[] {
    return PRIMARY_FAST_PATH_TOOLS;
  }

  override getSkills(): readonly string[] {
    return ['global_knowledge'];
  }

  getSystemPrompt(context: AgentSessionContext): string {
    const cfg = getCachedAgentAppConfig();
    const useCompact = cfg.capabilityCard?.useCompactInPrompt ?? true;
    const card = this.capabilities.current();
    const capabilityCard = useCompact
      ? card.rendered.compactMarkdown
      : card.rendered.detailedMarkdown;

    const userSummary = this.buildUserSummary(context);
    const modeAddendum =
      (context.mode as
        | 'chat'
        | 'creator'
        | 'analyzer'
        | 'recruiter'
        | 'planner'
        | 'commander'
        | undefined) ?? undefined;

    const prompt = buildSystemPrompt({
      identity: AGENT_X_IDENTITY,
      capabilityCard,
      userSummary,
      ...(modeAddendum ? { modeAddendum } : {}),
    });

    return this.applyConfiguredPrimaryPrompt(prompt);
  }

  // ─── Tool execution interception ────────────────────────────────────────

  /**
   * Intercept Primary-only control-flow exceptions thrown by
   * `delegate_to_coordinator` and `plan_and_execute` tools. Dispatch through
   * the {@link PrimaryDispatcher} and return the coordinator/plan result as
   * the next ReAct observation so the loop continues seamlessly.
   */
  protected override async executeTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: ToolSessionContext,
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService,
    onStreamEvent?: OnStreamEvent
  ): Promise<string> {
    try {
      return await super.executeTool(
        toolCall,
        registry,
        userId,
        signal,
        yieldContext,
        sessionContext,
        currentMessages,
        approvalGate,
        onStreamEvent
      );
    } catch (err) {
      if (isDelegateToCoordinator(err)) {
        const result = await this.handleCoordinatorDispatch(
          err,
          toolCall,
          userId,
          sessionContext?.operationId,
          approvalGate,
          onStreamEvent,
          signal
        );
        return result;
      }
      if (isPlanAndExecute(err)) {
        const result = await this.handlePlanDispatch(
          err,
          toolCall,
          userId,
          sessionContext?.operationId,
          approvalGate,
          onStreamEvent,
          signal
        );
        return result;
      }
      throw err;
    }
  }

  // ─── Dispatcher Integration ─────────────────────────────────────────────

  private async handleCoordinatorDispatch(
    err: DelegateToCoordinatorException,
    toolCall: LLMToolCall,
    userId: string,
    operationId: string | undefined,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined
  ): Promise<string> {
    const ctx = this.resolveDispatchContext(
      operationId,
      userId,
      approvalGate,
      onStreamEvent,
      signal
    );
    if (!ctx) {
      return JSON.stringify({
        success: false,
        error: 'Coordinator dispatch unavailable: missing per-run state.',
      });
    }
    // Mark the parent tool step complete as soon as the handoff is accepted.
    // The delegated coordinator then streams its own work as follow-on steps.
    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        delegated: true,
        coordinatorId: err.payload.coordinatorId,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });
    const result = await this.dispatcher.runCoordinator(
      err.payload.coordinatorId,
      err.payload.goal,
      ctx
    );
    return result.observation;
  }

  private async handlePlanDispatch(
    err: PlanAndExecuteException,
    toolCall: LLMToolCall,
    userId: string,
    operationId: string | undefined,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined
  ): Promise<string> {
    const ctx = this.resolveDispatchContext(
      operationId,
      userId,
      approvalGate,
      onStreamEvent,
      signal
    );
    if (!ctx) {
      return JSON.stringify({
        success: false,
        error: 'Plan dispatch unavailable: missing per-run state.',
      });
    }
    // The planning handoff itself is complete once orchestration starts.
    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        planned: true,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });
    const result = await this.dispatcher.runPlan(err.payload.goal, ctx);
    return result.observation;
  }

  private resolveDispatchContext(
    operationId: string | undefined,
    userId: string,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined
  ): PrimaryDispatchContext | null {
    if (!operationId) return null;
    const state = this.sessionStates.get(operationId);
    if (!state) return null;
    return {
      operationId,
      userId,
      enrichedIntent: state.enrichedIntent,
      sessionContext: state.sessionContext,
      ...(approvalGate ? { approvalGate } : {}),
      ...(onStreamEvent ? { onStreamEvent } : {}),
      ...(signal ? { signal } : {}),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private buildUserSummary(context: AgentSessionContext): string {
    // The router enriches the intent with profile data; this is a tiny
    // header to give the model lightweight personalization. Deeper context
    // is fetched on-demand via `get_user_profile` (Tier B).
    const parts: string[] = [];
    parts.push(`User ID: \`${context.userId}\``);
    if (context.threadId) parts.push(`Thread: \`${context.threadId}\``);
    if (context.sessionId) parts.push(`Session: \`${context.sessionId}\``);
    if (context.mode) parts.push(`Mode: ${context.mode}`);
    return parts.join(' • ');
  }

  /**
   * Helper used to apply any operator-configured prompt override (e.g.
   * `prompts.primarySystemPrompt`). Named distinctly from the base class
   * `withConfiguredSystemPrompt` to avoid privacy collisions.
   */
  private applyConfiguredPrimaryPrompt(prompt: string): string {
    const cfg = getCachedAgentAppConfig();
    const override = cfg.prompts?.primarySystemPrompt;
    return override && override.trim().length > 0 ? override : prompt;
  }

  /**
   * Toolset filter helper used by AgentRouter when building the tool
   * definitions for the Primary. The router still calls
   * `toolRegistry.getDefinitions(this.id, accessContext)` — this is just a
   * stable curated allowlist that downstream policy enforcement honors.
   */
  static curatedFastPathTools(): readonly string[] {
    return PRIMARY_FAST_PATH_TOOLS;
  }

  /**
   * Used by callers that build `AgentToolDefinition[]` arrays for direct
   * Primary execution (e.g. the eventual `runPrimary` path). Delegates to
   * the registry; included here so callers don't need to know the curated
   * list manually.
   */
  static buildPrimaryToolDefinitions(registry: ToolRegistry): readonly AgentToolDefinition[] {
    return registry
      .getDefinitions('router')
      .filter((def) => PRIMARY_FAST_PATH_TOOLS.includes(def.name));
  }
}
