import type {
  AgentXAttachment,
  AgentIdentifier,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentToolAccessContext,
  AgentXSelectedContext,
  AgentUserContext,
} from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import type { PlannerAgent } from '../agents/planner.agent.js';
import { PrimaryAgent } from '../agents/primary.agent.js';
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

type SessionFileAttachment = NonNullable<AgentSessionContext['attachments']>[number];
type SessionVideoAttachment = NonNullable<AgentSessionContext['videoAttachments']>[number];

const VIDEO_URL_HINT_PATTERN =
  /(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com|\.(?:mp4|mov|m4v|webm|avi|mkv))(?:$|[?#/])/i;

function isVideoAttachmentLike(attachment: {
  readonly mimeType?: string;
  readonly type?: string;
  readonly url?: string;
}): boolean {
  if (typeof attachment.mimeType === 'string' && attachment.mimeType.startsWith('video/')) {
    return true;
  }
  if (attachment.type === 'video') return true;
  return typeof attachment.url === 'string' && VIDEO_URL_HINT_PATTERN.test(attachment.url);
}

function toSessionFileAttachment(value: unknown): SessionFileAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['url'] !== 'string' || typeof record['mimeType'] !== 'string') {
    return null;
  }
  if (record['type'] === 'app' || isVideoAttachmentLike(record)) {
    return null;
  }
  return {
    url: record['url'],
    mimeType: record['mimeType'],
    ...(typeof record['storagePath'] === 'string' ? { storagePath: record['storagePath'] } : {}),
    ...(typeof record['name'] === 'string' ? { name: record['name'] } : {}),
  };
}

function toSessionVideoAttachment(value: unknown): SessionVideoAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record['url'] !== 'string' ||
    typeof record['mimeType'] !== 'string' ||
    !isVideoAttachmentLike(record)
  ) {
    return null;
  }
  const name = typeof record['name'] === 'string' ? record['name'] : 'video';
  return {
    url: record['url'],
    mimeType: record['mimeType'],
    name,
    ...(typeof record['storagePath'] === 'string' ? { storagePath: record['storagePath'] } : {}),
    ...(typeof record['cloudflareVideoId'] === 'string'
      ? { cloudflareVideoId: record['cloudflareVideoId'] }
      : {}),
    ...(typeof record['cloudflareStatus'] === 'string'
      ? { cloudflareStatus: record['cloudflareStatus'] }
      : {}),
    ...(typeof record['readyToStream'] === 'boolean'
      ? { readyToStream: record['readyToStream'] }
      : {}),
    ...(typeof record['thumbnailUrl'] === 'string' ? { thumbnailUrl: record['thumbnailUrl'] } : {}),
  };
}

function collectSessionFileAttachments(values: unknown): SessionFileAttachment[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toSessionFileAttachment(value))
    .filter((value): value is SessionFileAttachment => value !== null);
}

function collectSessionVideoAttachments(values: unknown): SessionVideoAttachment[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toSessionVideoAttachment(value))
    .filter((value): value is SessionVideoAttachment => value !== null);
}

function partitionPersistedAttachments(attachments: readonly AgentXAttachment[]): {
  readonly attachments: SessionFileAttachment[];
  readonly videoAttachments: SessionVideoAttachment[];
} {
  const fileAttachments: SessionFileAttachment[] = [];
  const videoAttachments: SessionVideoAttachment[] = [];

  for (const attachment of attachments) {
    const videoAttachment = toSessionVideoAttachment(attachment);
    if (videoAttachment) {
      videoAttachments.push(videoAttachment);
      continue;
    }
    const fileAttachment = toSessionFileAttachment(attachment);
    if (fileAttachment) {
      fileAttachments.push(fileAttachment);
    }
  }

  return { attachments: fileAttachments, videoAttachments };
}

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
    private readonly sessionMemory?: SessionMemoryService,
    private readonly getPrimaryAgent?: () => PrimaryAgent | undefined
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

    const primaryAgent = yieldState.agentId === 'router' ? this.getPrimaryAgent?.() : undefined;
    const agent =
      primaryAgent ?? (yieldState.agentId === 'router' ? planner : agents.get(yieldState.agentId));
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
    const executionMode =
      (resumeContextObj as Record<string, unknown>)['executionMode'] === 'plan'
        ? 'plan'
        : undefined;
    const rawEffortLevel = (resumeContextObj as Record<string, unknown>)['effortLevel'];
    const effortLevel =
      rawEffortLevel === 'high' || rawEffortLevel === 'medium' || rawEffortLevel === 'low'
        ? rawEffortLevel
        : undefined;
    const resumeThreadId =
      typeof (resumeContextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;
    const selectedContexts = Array.isArray(
      (resumeContextObj as Record<string, unknown>)['selectedContexts']
    )
      ? ((resumeContextObj as Record<string, unknown>)[
          'selectedContexts'
        ] as readonly AgentXSelectedContext[])
      : undefined;
    const contextAttachments = collectSessionFileAttachments(
      (resumeContextObj as Record<string, unknown>)['attachments']
    );
    const contextVideoAttachments = collectSessionVideoAttachments(
      (resumeContextObj as Record<string, unknown>)['videoAttachments']
    );

    let resumedAttachments = contextAttachments;
    let resumedVideoAttachments = contextVideoAttachments;

    if (
      resumeThreadId &&
      resumedAttachments.length === 0 &&
      resumedVideoAttachments.length === 0 &&
      typeof this.contextBuilder.getLatestThreadUserAttachments === 'function'
    ) {
      try {
        const persistedAttachments =
          await this.contextBuilder.getLatestThreadUserAttachments(resumeThreadId);
        const partitioned = partitionPersistedAttachments(persistedAttachments);
        resumedAttachments = partitioned.attachments;
        resumedVideoAttachments = partitioned.videoAttachments;
      } catch {
        // Non-critical — continue without recovered attachments.
      }
    }

    let resumeSessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        resumeSessionContext = await this.sessionMemory.getOrCreate(userId, resumeThreadId);
      } catch {
        // Non-critical — continue without history.
      }
    }

    const buildResumeSessionContext = this.routerContext.buildSessionContext as unknown as (
      userId: string,
      sessionId?: string,
      operationId?: string,
      threadId?: string,
      environment?: 'staging' | 'production',
      appBaseUrl?: string,
      agentRouteBase?: string,
      timezone?: string,
      signal?: AbortSignal,
      mode?: string,
      executionMode?: 'execute' | 'plan',
      attachments?: readonly SessionFileAttachment[],
      videoAttachments?: readonly SessionVideoAttachment[],
      conversationHistory?: AgentSessionContext['conversationHistory'],
      selectedContexts?: readonly AgentXSelectedContext[]
    ) => AgentSessionContext;

    const context = buildResumeSessionContext(
      userId,
      resumeSessionContext?.sessionId ?? job.sessionId,
      operationId,
      resumeThreadId,
      environment,
      typeof (resumeContextObj as Record<string, unknown>)['appBaseUrl'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['appBaseUrl'] as string)
        : undefined,
      typeof (resumeContextObj as Record<string, unknown>)['agentRouteBase'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['agentRouteBase'] as string)
        : undefined,
      typeof (resumeContextObj as Record<string, unknown>)['timezone'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['timezone'] as string)
        : undefined,
      signal,
      undefined,
      executionMode,
      resumedAttachments.length > 0 ? resumedAttachments : undefined,
      resumedVideoAttachments.length > 0 ? resumedVideoAttachments : undefined,
      resumeSessionContext?.conversationHistory,
      undefined
    );
    const defaultGameAnalysisContext = buildDefaultGameAnalysisContext(userContext);
    const {
      effortLevel: _discardedEffortLevel,
      attachments: _discardedAttachments,
      videoAttachments: _discardedVideoAttachments,
      ...contextBase
    } = context;
    const contextWithDefaults: AgentSessionContext = {
      ...contextBase,
      ...(effortLevel ? { effortLevel } : {}),
      ...(resumedAttachments.length > 0 ? { attachments: resumedAttachments } : {}),
      ...(resumedVideoAttachments.length > 0 ? { videoAttachments: resumedVideoAttachments } : {}),
      ...(selectedContexts?.length ? { selectedContexts } : {}),
      ...(defaultGameAnalysisContext ? { defaultGameAnalysisContext } : {}),
    };
    const approvalId =
      typeof (resumeContextObj as Record<string, unknown>)['approvalId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['approvalId'] as string)
        : undefined;

    let resumeActiveThreadsSummary = '';
    try {
      resumeActiveThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it.
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
      const isPrimaryResume = Boolean(primaryAgent);
      let toolDefs = isPrimaryResume
        ? PrimaryAgent.buildPrimaryToolDefinitions(this.toolRegistry, {
            ...toolAccessContext,
            executionMode: contextWithDefaults.executionMode,
          })
        : this.toolRegistry.getDefinitions(agent.id, toolAccessContext);

      if (!isPrimaryResume) {
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
      }

      if (primaryAgent) {
        primaryAgent.beginRun({
          operationId,
          userId,
          sessionContext: contextWithDefaults,
          enrichedIntent,
          ...(approvalGate ? { approvalGate } : {}),
          ...(onStreamEvent ? { onStreamEvent } : {}),
          ...(signal ? { signal } : {}),
        });
      }

      let result: AgentOperationResult;
      try {
        result = await agent.resumeExecution(
          yieldState,
          contextWithDefaults,
          toolDefs,
          this.llm,
          this.toolRegistry,
          this.skillRegistry,
          onStreamEvent,
          approvalGate,
          approvalId
        );
      } finally {
        primaryAgent?.endRun(operationId);
      }

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

function buildDefaultGameAnalysisContext(
  userContext: AgentUserContext
): AgentSessionContext['defaultGameAnalysisContext'] | undefined {
  const ownTeamName = userContext.ownTeamName ?? userContext.school ?? userContext.coachProgram;
  const ownTeamColor = userContext.ownTeamPrimaryColor;
  const ownTeamSecondaryColor = userContext.ownTeamSecondaryColor;
  const perspectiveTeam = userContext.defaultTeamPerspective;

  if (
    !userContext.teamId &&
    !ownTeamName &&
    !ownTeamColor &&
    !ownTeamSecondaryColor &&
    !perspectiveTeam
  ) {
    return undefined;
  }

  return {
    ...(userContext.teamId ? { ownTeamId: userContext.teamId } : {}),
    ...(ownTeamName ? { ownTeamName } : {}),
    ...(ownTeamColor ? { ownTeamColor } : {}),
    ...(ownTeamSecondaryColor ? { ownTeamSecondaryColor } : {}),
    ...(perspectiveTeam ? { perspectiveTeam } : {}),
  };
}
