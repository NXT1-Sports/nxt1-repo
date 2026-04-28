import { createHash } from 'node:crypto';
import type {
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentRetrievedMemories,
  AgentSessionContext,
  AgentUserContext,
} from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ContextBuilder } from '../memory/context-builder.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import {
  ClassifierAgent,
  type ConversationRouteScope,
  type ClassifierDecision,
} from '../agents/classifier.agent.js';
import { ConversationAgent } from '../agents/conversation.agent.js';
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';

export type ConversationRouteOutcome =
  | {
      readonly kind: 'handled';
      readonly result: AgentOperationResult;
    }
  | {
      readonly kind: 'escalate_to_planning';
    }
  | {
      readonly kind: 'fallthrough';
    };

const EMPTY_RETRIEVED_MEMORIES: AgentRetrievedMemories = {
  user: [],
  team: [],
  organization: [],
};

const CONVERSATIONAL_CACHE_TTL_MS = 5 * 60_000;
const CONVERSATIONAL_CACHE_MAX_ENTRIES = 512;

export class AgentRouterConversationService {
  private readonly classifierAgent: ClassifierAgent;
  private readonly conversationAgent: ConversationAgent;
  private readonly conversationalResponseCache = new Map<
    string,
    {
      readonly result: AgentOperationResult;
      readonly expiresAt: number;
    }
  >();

  constructor(
    llm: OpenRouterService,
    private readonly contextBuilder: ContextBuilder,
    private readonly routerContext: Pick<AgentRouterContextService, 'appendAssistantMessage'>,
    private readonly telemetry: Pick<
      AgentRouterTelemetryService,
      | 'emitProgressOperation'
      | 'emitMetricSample'
      | 'emitStreamedTextChunks'
      | 'emitUpdate'
      | 'recordPhaseLatency'
    >
  ) {
    this.classifierAgent = new ClassifierAgent(llm);
    this.conversationAgent = new ConversationAgent(llm);
  }

  async tryConversationalRoute(payload: {
    readonly payload: AgentJobPayload;
    readonly context: AgentSessionContext;
    readonly threadId?: string;
    readonly firestore?: FirebaseFirestore.Firestore;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly environment: 'staging' | 'production';
    readonly signal?: AbortSignal;
  }): Promise<ConversationRouteOutcome> {
    const {
      payload: jobPayload,
      context,
      threadId,
      firestore,
      onUpdate,
      onStreamEvent,
      signal,
    } = payload;
    const { operationId, userId, intent } = jobPayload;
    const conversationalPhaseStartMs = Date.now();

    if ((context.attachments?.length ?? 0) > 0 || (context.videoAttachments?.length ?? 0) > 0) {
      return { kind: 'fallthrough' };
    }

    const cacheKey = this.buildConversationalCacheKey(context, intent);
    const cached = this.conversationalResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedResponse = await this.emitConversationalResponse({
        operationId,
        userId,
        threadId,
        responseText: cached.result.summary,
        onUpdate,
        onStreamEvent,
        signal,
        cacheSource: 'conversation_cache',
      });

      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'chat_cache_hit',
        [],
        true,
        onStreamEvent
      );

      return { kind: 'handled', result: cachedResponse };
    }

    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Understanding whether this needs conversation context or a full plan...',
      metadata: {
        eventType: 'progress_stage',
        phase: 'conversation_triage',
        phaseIndex: 1,
        phaseTotal: 2,
      },
    });

    const routeDecision = await this.getConversationRouteDecision(intent, context);
    if (!routeDecision) {
      this.telemetry.emitMetricSample(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        metricName: 'fallback_activation',
        value: 1,
        message: 'Fallback activated: conversational triage failed open.',
        metadata: {
          phase: 'conversation_triage',
          fallbackType: 'conversation_triage_fail_open',
        },
        sampleContext: {
          operationId,
          userId,
        },
      });
      return { kind: 'fallthrough' };
    }

    if (routeDecision.route === 'action') {
      const planSummary =
        routeDecision.planSummary?.trim() || 'handle this request with specialist execution';
      const planningPrelude = sanitizeAgentOutputText(
        `I see you want to ${planSummary}. Let me put a plan together for this.`
      );
      if (onStreamEvent) {
        await this.telemetry.emitStreamedTextChunks(onStreamEvent, {
          operationId,
          agentId: 'router',
          text: planningPrelude,
          targetChunkSize: 28,
          cadenceMs: 24,
          signal,
        });
      }
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        message: planningPrelude,
        metadata: {
          eventType: 'progress_subphase',
          phase: 'conversation_triage',
          route: 'action',
        },
      });
      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'planning_escalation',
        [],
        false,
        onStreamEvent
      );
      return { kind: 'escalate_to_planning' };
    }

    const requiredContextScopes = Array.from(new Set(routeDecision.requiredContextScopes));
    if (requiredContextScopes.length === 0 && routeDecision.directResponse?.trim()) {
      const response = await this.emitConversationalResponse({
        operationId,
        userId,
        threadId,
        responseText: routeDecision.directResponse,
        onUpdate,
        onStreamEvent,
        signal,
        cacheSource: 'triage_direct',
      });
      this.storeConversationalCache(
        cacheKey,
        response,
        this.shouldCacheConversationalResponse(context, requiredContextScopes)
      );
      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'chat_no_context',
        requiredContextScopes,
        true,
        onStreamEvent
      );
      return { kind: 'handled', result: response };
    }

    const scopedContext = await this.resolveConversationContextScopes(
      userId,
      intent,
      requiredContextScopes,
      threadId,
      firestore
    );
    const scopedContextText = this.buildConversationalContextText(scopedContext);
    const contextualResponse = await this.generateContextualConversationResponse(
      intent,
      scopedContextText,
      context
    );

    const response = await this.emitConversationalResponse({
      operationId,
      userId,
      threadId,
      responseText: contextualResponse,
      onUpdate,
      onStreamEvent,
      signal,
      cacheSource: requiredContextScopes.every((scope) => scope === 'profile')
        ? 'contextual_profile'
        : 'live',
    });

    const shouldCache = this.shouldCacheConversationalResponse(context, requiredContextScopes);
    this.storeConversationalCache(cacheKey, response, shouldCache);
    this.recordConversationalRouteLatency(
      operationId,
      userId,
      Date.now() - conversationalPhaseStartMs,
      requiredContextScopes.length === 0 ? 'chat_no_context' : 'chat_contextual',
      requiredContextScopes,
      shouldCache,
      onStreamEvent
    );

    return { kind: 'handled', result: response };
  }

  private async getConversationRouteDecision(
    intent: string,
    context: AgentSessionContext
  ): Promise<ClassifierDecision | null> {
    const deterministicDecision = this.getDeterministicConversationRouteDecision(intent, context);
    if (deterministicDecision) {
      return deterministicDecision;
    }

    return this.classifierAgent.classify(intent, context);
  }

  private getDeterministicConversationRouteDecision(
    intent: string,
    context: AgentSessionContext
  ): ClassifierDecision | null {
    if (!this.isSelfKnowledgeIntent(intent)) {
      return null;
    }

    const requiredContextScopes: ConversationRouteScope[] = [
      'profile',
      'memories',
      'recent_sync',
      'active_threads',
      ...(context.threadId ? (['thread_history'] as const) : []),
    ];

    return {
      route: 'chat',
      reasoning: 'Self-knowledge prompt requires conversational context aggregation.',
      requiredContextScopes,
      directResponse: null,
      planSummary: null,
    };
  }

  private isSelfKnowledgeIntent(intent: string): boolean {
    const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedIntent) {
      return false;
    }

    const selfKnowledgePhrases = [
      'what do you know about me',
      'what all do you know about me',
      'tell me what you know about me',
      'what do you remember about me',
      'what have you learned about me',
      'what have i told you about me',
      'what information do you have about me',
      'what info do you have about me',
      'what context do you have about me',
    ];

    return selfKnowledgePhrases.some((phrase) => normalizedIntent.includes(phrase));
  }

  private async resolveConversationContextScopes(
    userId: string,
    intent: string,
    scopes: readonly ConversationRouteScope[],
    threadId: string | undefined,
    firestore?: FirebaseFirestore.Firestore
  ): Promise<{
    readonly profile?: AgentUserContext;
    readonly memories: AgentRetrievedMemories;
    readonly recentSyncSummaries: readonly string[];
    readonly threadHistory: string;
    readonly activeThreadsSummary: string;
  }> {
    const normalizedScopes = new Set(scopes);
    const needsProfile =
      normalizedScopes.has('profile') ||
      normalizedScopes.has('memories') ||
      normalizedScopes.has('recent_sync');

    const profile = needsProfile
      ? await this.contextBuilder.buildContext(userId, firestore)
      : undefined;

    const memoriesPromise =
      normalizedScopes.has('memories') && profile
        ? this.contextBuilder.getMemoriesForContext(profile, intent)
        : Promise.resolve(EMPTY_RETRIEVED_MEMORIES);
    const recentSyncPromise =
      normalizedScopes.has('recent_sync') && profile
        ? this.contextBuilder.getRecentSyncSummariesForContext(profile)
        : Promise.resolve([] as readonly string[]);
    const threadHistoryPromise =
      normalizedScopes.has('thread_history') && threadId
        ? this.contextBuilder.getRecentThreadHistory(threadId, 20)
        : Promise.resolve('');
    const activeThreadsPromise = normalizedScopes.has('active_threads')
      ? this.contextBuilder.getActiveThreadsSummary(userId, 8)
      : Promise.resolve('');

    const [memories, recentSyncSummaries, threadHistory, activeThreadsSummary] = await Promise.all([
      memoriesPromise,
      recentSyncPromise,
      threadHistoryPromise,
      activeThreadsPromise,
    ]);

    return {
      profile,
      memories,
      recentSyncSummaries,
      threadHistory,
      activeThreadsSummary,
    };
  }

  private buildConversationalContextText(context: {
    readonly profile?: AgentUserContext;
    readonly memories: AgentRetrievedMemories;
    readonly recentSyncSummaries: readonly string[];
    readonly threadHistory: string;
    readonly activeThreadsSummary: string;
  }): string {
    const sections: string[] = [];

    if (context.profile) {
      sections.push(
        `[User Context]\n${this.contextBuilder.compressToPrompt(
          context.profile,
          context.memories,
          context.recentSyncSummaries
        )}`
      );
    }

    if (context.activeThreadsSummary) {
      sections.push(`[Recent Conversation Topics]${context.activeThreadsSummary}`);
    }

    if (context.threadHistory) {
      sections.push(context.threadHistory.trim());
    }

    return sections.join('\n\n');
  }

  private async generateContextualConversationResponse(
    intent: string,
    scopedContextText: string,
    context: AgentSessionContext
  ): Promise<string> {
    return this.conversationAgent.respond(intent, scopedContextText, context);
  }

  private async emitConversationalResponse(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly threadId?: string;
    readonly responseText: string;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly signal?: AbortSignal;
    readonly cacheSource: string;
  }): Promise<AgentOperationResult> {
    const safeResponseText = sanitizeAgentOutputText(payload.responseText);
    this.telemetry.emitUpdate(
      payload.onUpdate,
      payload.operationId,
      'completed',
      safeResponseText,
      undefined,
      {
        agentId: 'router',
        stage: 'agent_thinking',
        outcomeCode: 'success_default',
        metadata: { executionMode: 'conversation', source: payload.cacheSource },
      }
    );

    if (payload.onStreamEvent) {
      await this.telemetry.emitStreamedTextChunks(payload.onStreamEvent, {
        operationId: payload.operationId,
        agentId: 'router',
        text: safeResponseText,
        targetChunkSize: 28,
        cadenceMs: 24,
        signal: payload.signal,
      });
    }

    this.routerContext.appendAssistantMessage(payload.userId, payload.threadId, safeResponseText);
    return { summary: safeResponseText, suggestions: [] };
  }

  private buildConversationalCacheKey(context: AgentSessionContext, intent: string): string {
    const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    const intentHash = createHash('sha1').update(normalizedIntent).digest('hex');
    const mode = context.mode?.trim().toLowerCase() ?? 'default';
    const threadId = context.threadId?.trim() ?? 'no-thread';
    const environment = context.environment ?? 'unknown';
    return `${context.userId}:${mode}:${environment}:${threadId}:${intentHash}`;
  }

  private shouldCacheConversationalResponse(
    context: AgentSessionContext,
    scopes: readonly ConversationRouteScope[]
  ): boolean {
    if ((context.attachments?.length ?? 0) > 0 || (context.videoAttachments?.length ?? 0) > 0) {
      return false;
    }

    if (scopes.length === 0) {
      return true;
    }

    return scopes.every((scope) => scope === 'profile');
  }

  private storeConversationalCache(
    cacheKey: string,
    result: AgentOperationResult,
    shouldCache: boolean
  ): void {
    if (!shouldCache) {
      return;
    }

    this.pruneConversationalCache();
    this.conversationalResponseCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CONVERSATIONAL_CACHE_TTL_MS,
    });
  }

  private recordConversationalRouteLatency(
    operationId: string,
    userId: string,
    durationMs: number,
    routeType: 'chat_cache_hit' | 'chat_no_context' | 'chat_contextual' | 'planning_escalation',
    scopes: readonly ConversationRouteScope[],
    cacheEligible: boolean,
    onStreamEvent?: OnStreamEvent
  ): void {
    this.telemetry.recordPhaseLatency('conversation_triage', durationMs, {
      operationId,
      userId,
      routeType,
      contextScopes: scopes,
      cacheEligible,
    });

    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: routeType === 'planning_escalation' ? 'decomposing_intent' : 'agent_thinking',
      message: `Conversation triage latency: ${Math.max(0, Math.round(durationMs))}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'conversation_triage',
        routeType,
        contextScopes: scopes,
        cacheEligible,
        value: Math.max(0, Math.round(durationMs)),
      },
    });
  }

  private pruneConversationalCache(): void {
    const now = Date.now();
    for (const [key, value] of this.conversationalResponseCache) {
      if (value.expiresAt <= now) {
        this.conversationalResponseCache.delete(key);
      }
    }

    while (this.conversationalResponseCache.size > CONVERSATIONAL_CACHE_MAX_ENTRIES) {
      const oldestKey = this.conversationalResponseCache.keys().next().value;
      if (!oldestKey) break;
      this.conversationalResponseCache.delete(oldestKey);
    }
  }
}
