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
  type AgentOperationResult,
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
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { AskUserToolContext } from '../tools/system/ask-user.tool.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import { getCachedAgentAppConfig } from '../config/agent-app-config.js';
import { getRouterToolPolicy } from './tool-policy.js';

/**
 * System-only tools the Primary has in addition to the shared router policy.
 * These are never in the policy (they bypass policy checks via category =
 * 'system' in BaseAgent) but are listed here so buildPrimaryToolDefinitions
 * can include them by name when filtering the registry.
 */
const PRIMARY_SYSTEM_TOOLS: readonly string[] = [
  'whoami_capabilities',
  'delegate_to_coordinator',
  'plan_and_execute',
];

const PRIMARY_REASONING_CONTRACT = [
  '## Primary Reasoning Contract (2026)',
  '1) Decide request class first: simple_routing | ambiguous | numeric_or_aggregation | safety_or_mutation.',
  '2) For simple_routing: route immediately, no clarification overhead.',
  '3) For ambiguous or safety_or_mutation: ask concise clarification questions before acting.',
  '4) For numeric_or_aggregation: prefer deterministic tool-backed computation before answering.',
  '5) Never hallucinate counts/totals; if data is missing, ask for the minimum missing detail.',
  '6) When delegating, provide a single objective sentence as the handoff payload.',
].join('\n');

interface PrimaryToolSelectionTrace {
  readonly toolName: string;
  readonly reasonPath: 'direct_lookup' | 'delegation' | 'planning' | 'system';
  readonly score: null;
  readonly timestamp: string;
}

interface PrimaryToolExposureTrace {
  readonly exposedTools: readonly string[];
  readonly selectedTools: readonly PrimaryToolSelectionTrace[];
}

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
  private readonly toolExposureTraceByOperation = new Map<string, PrimaryToolExposureTrace>();

  constructor(
    private readonly capabilities: CapabilityRegistry,
    private readonly dispatcher: PrimaryDispatcher
  ) {
    super();
  }

  // ─── Per-run state binding ──────────────────────────────────────────────

  beginRun(state: PrimaryAgentSessionState): void {
    this.sessionStates.set(state.operationId, state);
    this.toolExposureTraceByOperation.set(state.operationId, {
      exposedTools: [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS],
      selectedTools: [],
    });
  }

  endRun(operationId: string): void {
    this.sessionStates.delete(operationId);
    this.toolExposureTraceByOperation.delete(operationId);
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
    return [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS];
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

    return this.applyConfiguredPrimaryPrompt(`${prompt}\n\n${PRIMARY_REASONING_CONTRACT}`);
  }

  override async execute(
    intent: string,
    context: AgentSessionContext,
    toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    const result = await super.execute(
      intent,
      context,
      toolDefinitions,
      llm,
      toolRegistry,
      skillRegistry,
      onStreamEvent,
      approvalGate
    );

    const operationId = context.operationId;
    if (!operationId) return result;

    const trace = this.toolExposureTraceByOperation.get(operationId);
    if (!trace) return result;

    const currentData = result.data ?? {};
    const currentDebug =
      currentData['debug'] && typeof currentData['debug'] === 'object'
        ? (currentData['debug'] as Record<string, unknown>)
        : {};

    return {
      ...result,
      data: {
        ...currentData,
        debug: {
          ...currentDebug,
          toolExposureTrace: {
            exposedTools: trace.exposedTools,
            selectedTools: trace.selectedTools,
          },
        },
      },
    };
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
    this.recordToolSelectionTrace(sessionContext?.operationId, toolCall.function.name);
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

  private recordToolSelectionTrace(operationId: string | undefined, toolName: string): void {
    if (!operationId) return;
    const trace = this.toolExposureTraceByOperation.get(operationId);
    if (!trace) return;

    const reasonPath: PrimaryToolSelectionTrace['reasonPath'] =
      toolName === 'delegate_to_coordinator'
        ? 'delegation'
        : toolName === 'plan_and_execute'
          ? 'planning'
          : toolName === 'whoami_capabilities'
            ? 'system'
            : 'direct_lookup';

    const selectedTools = [
      ...trace.selectedTools,
      {
        toolName,
        reasonPath,
        score: null,
        timestamp: new Date().toISOString(),
      },
    ];

    this.toolExposureTraceByOperation.set(operationId, {
      exposedTools: trace.exposedTools,
      selectedTools,
    });
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
    return [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS];
  }

  /**
   * Used by callers that build `AgentToolDefinition[]` arrays for direct
   * Primary execution (e.g. the eventual `runPrimary` path). Delegates to
   * the registry; included here so callers don't need to know the curated
   * list manually.
   */
  static buildPrimaryToolDefinitions(registry: ToolRegistry): readonly AgentToolDefinition[] {
    const allowed = new Set([...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS]);
    return registry
      .getDefinitions('router')
      .filter((def) => def.category === 'system' || allowed.has(def.name));
  }
}
