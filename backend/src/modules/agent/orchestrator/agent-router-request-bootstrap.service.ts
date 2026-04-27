import type {
  AgentIdentifier,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentToolAccessContext,
  AgentUserContext,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import { isAgentDelegation } from '../exceptions/agent-delegation.exception.js';
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { SemanticCacheService } from '../memory/semantic-cache.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterPolicyService } from './agent-router-policy.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { logger } from '../../../utils/logger.js';

type ContextDeps = Pick<AgentRouterContextService, 'appendAssistantMessage'>;
type PolicyDeps = Pick<
  AgentRouterPolicyService,
  'buildToolAccessContext' | 'isRoutableCoordinatorAgent'
>;
type TelemetryDeps = Pick<AgentRouterTelemetryService, 'emitUpdate'>;

export class AgentRouterRequestBootstrapService {
  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly semanticCache: SemanticCacheService,
    private readonly context: ContextDeps,
    private readonly telemetry: TelemetryDeps,
    private readonly policy: PolicyDeps,
    private readonly skillRegistry?: SkillRegistry
  ) {}

  buildScopedCacheKey(intent: string, userContext: AgentUserContext | undefined): string {
    const role = userContext?.role ?? 'unknown';
    const sport = userContext?.sport ?? 'general';
    return `[${role}|${sport}] ${intent}`;
  }

  async trySemanticCache(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly intent: string;
    readonly scopedIntent: string;
    readonly userContext: AgentUserContext;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
  }): Promise<AgentOperationResult | null> {
    const { operationId, userId, intent, scopedIntent, userContext, onUpdate } = payload;

    try {
      const cacheHit = await this.semanticCache.check(scopedIntent);
      if (!cacheHit) {
        return null;
      }

      logger.info('[AgentRouter] Semantic cache hit — personalizing for user', {
        operationId,
        score: cacheHit.score,
        cachedIntent: cacheHit.cachedIntent.slice(0, 80),
        userId,
      });

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        'Found a cached answer — personalizing...',
        undefined,
        {
          agentId: 'router',
          stage: 'agent_thinking',
          metadata: { source: 'semantic_cache' },
        }
      );

      const personalized = await this.semanticCache.personalize(
        cacheHit.result,
        userContext,
        intent,
        operationId
      );

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'completed',
        personalized.summary,
        undefined,
        {
          agentId: 'router',
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { source: 'semantic_cache' },
        }
      );

      return personalized;
    } catch {
      return null;
    }
  }

  async runDirectAgentPath(payload: {
    readonly job: AgentJobPayload;
    readonly operationId: string;
    readonly userId: string;
    readonly threadId?: string;
    readonly contextObj: Record<string, unknown>;
    readonly context: AgentSessionContext;
    readonly enrichedIntent: string;
    readonly toolAccessContext: AgentToolAccessContext;
    readonly approvalGate?: ApprovalGateService;
    readonly maxDelegationDepth: number;
    readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly rerunWithDelegatedPayload: (payload: AgentJobPayload) => Promise<AgentOperationResult>;
  }): Promise<AgentOperationResult | null> {
    const {
      job,
      operationId,
      userId,
      threadId,
      contextObj,
      context,
      enrichedIntent,
      toolAccessContext,
      approvalGate,
      maxDelegationDepth,
      agents,
      onUpdate,
      onStreamEvent,
      rerunWithDelegatedPayload,
    } = payload;

    const directAgentId = job.agent;
    if (!directAgentId) {
      return null;
    }

    if (!this.policy.isRoutableCoordinatorAgent(directAgentId)) {
      const message =
        `Direct routing target "${directAgentId}" is not allowed. ` +
        `Allowed coordinator ids: ${COORDINATOR_AGENT_IDS.join(', ')}.`;
      this.telemetry.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'routing_failed',
        metadata: {
          targetAgentId: directAgentId,
          allowedAgentIds: COORDINATOR_AGENT_IDS,
        },
      });

      return {
        summary: message,
        suggestions: ['Select one of the supported coordinator commands and try again.'],
      };
    }

    const directAgent = agents.get(directAgentId);
    if (!directAgent) {
      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `No agent registered for "${directAgentId}".`,
        undefined,
        {
          agentId: 'router',
          stage: 'routing_to_agent',
          outcomeCode: 'routing_failed',
          metadata: { targetAgentId: directAgentId },
        }
      );
      return {
        summary: `No agent registered for "${directAgentId}".`,
        suggestions: ['Check agent configuration or contact support.'],
      };
    }

    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      `Routing directly to ${directAgentId}...`,
      undefined,
      {
        agentId: directAgentId,
        stage: 'routing_to_agent',
        metadata: { targetAgentId: directAgentId },
      }
    );

    try {
      let toolDefs = this.toolRegistry.getDefinitions(directAgent.id, toolAccessContext);

      try {
        const intentEmbedding = await this.llm.embed(enrichedIntent);
        toolDefs = await this.toolRegistry.match(
          intentEmbedding,
          (definition) => this.llm.embed(definition),
          directAgent.id,
          toolAccessContext
        );
      } catch {
        // Keep default tool set when embeddings are unavailable.
      }

      const result = await directAgent.execute(
        enrichedIntent,
        context,
        toolDefs,
        this.llm,
        this.toolRegistry,
        this.skillRegistry,
        onStreamEvent,
        approvalGate
      );

      this.telemetry.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
        agentId: directAgentId,
        stage: 'agent_thinking',
        outcomeCode: 'success_default',
        metadata: { executionMode: 'direct' },
      });
      this.context.appendAssistantMessage(userId, threadId, result.summary);
      return result;
    } catch (err) {
      if (isAgentYield(err)) throw err;

      if (isAgentDelegation(err)) {
        const delegationCount =
          (typeof contextObj['delegationCount'] === 'number'
            ? (contextObj['delegationCount'] as number)
            : 0) + 1;

        if (delegationCount > maxDelegationDepth) {
          logger.warn('[AgentRouter] Delegation depth exceeded — aborting', {
            operationId,
            delegationCount,
            sourceAgent: directAgentId,
          });
          this.telemetry.emitUpdate(
            onUpdate,
            operationId,
            'failed',
            'Unable to route this request.',
            undefined,
            {
              agentId: 'router',
              stage: 'routing_to_agent',
              outcomeCode: 'routing_failed',
            }
          );
          return {
            summary:
              "I'm having trouble finding the right specialist for this request. " +
              'Please try rephrasing or submit it from the main Agent X chat.',
            suggestions: ['Try asking from the main Agent X input bar.'],
          };
        }

        logger.info('[AgentRouter] Delegation handoff — re-dispatching through Planner', {
          operationId,
          sourceAgent: directAgentId,
          forwardingIntent: err.payload.forwardingIntent.slice(0, 100),
          delegationCount,
        });

        this.telemetry.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          'Transferring your request to the right specialist...',
          undefined,
          {
            agentId: 'router',
            stage: 'routing_to_agent',
          }
        );

        const sourceAgentId = (job.agent ?? err.payload.sourceAgent) as AgentIdentifier;
        const routingHint = sourceAgentId
          ? `\n\n[System: The "${sourceAgentId}" agent could not handle this. Route to a different specialist.]`
          : '';

        const delegatedPayload: AgentJobPayload = {
          ...job,
          agent: undefined,
          intent: `${err.payload.forwardingIntent}${routingHint}`,
          context: {
            ...contextObj,
            delegationCount,
            delegatedFrom: directAgentId,
          },
        };

        return rerunWithDelegatedPayload(delegatedPayload);
      }

      if (err instanceof Error && err.name === 'AbortError') throw err;

      const message = err instanceof Error ? err.message : 'Agent execution failed';
      this.telemetry.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: directAgentId,
        stage: 'agent_thinking',
        outcomeCode: 'task_failed',
        metadata: { executionMode: 'direct' },
      });
      return {
        summary: `Agent ${directAgentId} failed: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }
  }
}
