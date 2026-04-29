import type {
  AgentIdentifier,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentToolAccessContext,
  AgentUserContext,
} from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import type { PlannerAgent } from '../agents/planner.agent.js';
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ContextBuilder } from '../memory/context-builder.js';
import type { SessionMemoryService } from '../memory/session.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import { ApprovalGateService } from '../services/approval-gate.service.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';

type RouterContextDeps = Pick<
  AgentRouterContextService,
  'appendAssistantMessage' | 'buildSessionContext' | 'enrichIntentWithContext'
>;

type TelemetryDeps = Pick<AgentRouterTelemetryService, 'emitUpdate'>;

export class AgentRouterResumeService {
  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly routerContext: RouterContextDeps,
    private readonly telemetry: TelemetryDeps,
    private readonly buildToolAccessContext: (
      userContext: AgentUserContext
    ) => AgentToolAccessContext,
    private readonly skillRegistry?: SkillRegistry,
    private readonly sessionMemory?: SessionMemoryService
  ) {}

  async runResumed(payload: {
    readonly job: AgentJobPayload;
    readonly yieldState: import('@nxt1/core').AgentYieldState;
    readonly planner: PlannerAgent;
    readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly firestore?: FirebaseFirestore.Firestore;
    readonly onStreamEvent?: OnStreamEvent;
    readonly environment?: 'staging' | 'production';
    readonly signal?: AbortSignal;
  }): Promise<AgentOperationResult> {
    const {
      job,
      yieldState,
      planner,
      agents,
      onUpdate,
      firestore,
      onStreamEvent,
      environment = 'production',
      signal,
    } = payload;

    const { operationId, userId, intent } = job;
    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      'Resuming from your response...',
      undefined,
      {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
      }
    );

    const agent = yieldState.agentId === 'router' ? planner : agents.get(yieldState.agentId);
    if (!agent) {
      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Cannot resume: no agent registered for "${yieldState.agentId}".`,
        undefined,
        {
          agentId: 'router',
          stage: 'resuming_user_input',
          outcomeCode: 'routing_failed',
          metadata: { targetAgentId: yieldState.agentId },
        }
      );
      return {
        summary: `Cannot resume: agent "${yieldState.agentId}" is not registered.`,
        suggestions: ['Contact support or try submitting the request again.'],
      };
    }

    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId, firestore);
    } catch {
      userContext = { userId } as AgentUserContext;
    }

    const resumeContextObj =
      typeof job.context === 'object' && job.context !== null ? job.context : {};
    const resumeThreadId =
      typeof (resumeContextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    let resumeSessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        resumeSessionContext = await this.sessionMemory.getOrCreate(userId, resumeThreadId);
      } catch {
        // Non-critical — continue without history
      }
    }

    const context = this.routerContext.buildSessionContext(
      userId,
      resumeSessionContext?.sessionId ?? job.sessionId,
      operationId,
      resumeThreadId,
      environment,
      signal,
      undefined,
      undefined,
      undefined,
      resumeSessionContext?.conversationHistory
    );
    const approvalId =
      typeof (resumeContextObj as Record<string, unknown>)['approvalId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['approvalId'] as string)
        : undefined;

    let resumeActiveThreadsSummary = '';
    try {
      resumeActiveThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    const enrichedIntent = this.routerContext.enrichIntentWithContext(
      intent,
      userContext,
      job.context,
      undefined,
      undefined,
      undefined,
      resumeActiveThreadsSummary
    );
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;

    if (firestore) {
      try {
        const persistedJob = await firestore.collection('AgentJobs').doc(operationId).get();
        const persistedStatus = persistedJob.exists ? persistedJob.get('status') : undefined;
        if (persistedStatus === 'cancelled') {
          this.telemetry.emitUpdate(
            onUpdate,
            operationId,
            'failed',
            'Resume cancelled before execution began.',
            undefined,
            {
              agentId: yieldState.agentId,
              stage: 'resuming_user_input',
              outcomeCode: 'cancelled',
            }
          );
          return {
            summary: 'Resume cancelled before execution began.',
            data: {
              cancelled: true,
              operationStatus: 'cancelled',
            },
            suggestions: ['Send a new message to start a fresh operation.'],
          };
        }
      } catch {
        // Non-critical — continue with resume if the guard read fails.
      }
    }

    try {
      const toolAccessContext = this.buildToolAccessContext(userContext);
      let toolDefs = this.toolRegistry.getDefinitions(agent.id, toolAccessContext);

      try {
        const intentEmbedding = await this.llm.embed(enrichedIntent);
        toolDefs = await this.toolRegistry.match(
          intentEmbedding,
          (text) => this.llm.embed(text),
          agent.id,
          toolAccessContext
        );
      } catch {
        // Ignore embedding failures during resume and pass all possible tools.
      }

      const result = await agent.resumeExecution(
        yieldState,
        context,
        toolDefs,
        this.llm,
        this.toolRegistry,
        this.skillRegistry,
        onStreamEvent,
        approvalGate,
        approvalId
      );

      this.telemetry.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'success_default',
      });
      this.routerContext.appendAssistantMessage(userId, resumeThreadId, result.summary);
      return result;
    } catch (err) {
      if (isAgentYield(err)) throw err;
      const message = err instanceof Error ? err.message : 'Resume execution failed';
      this.telemetry.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'task_failed',
      });
      return {
        summary: `Resumed agent "${yieldState.agentId}" failed: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }
  }
}
