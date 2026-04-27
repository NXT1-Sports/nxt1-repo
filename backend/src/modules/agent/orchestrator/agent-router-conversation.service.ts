import { createHash } from 'node:crypto';
import { z } from 'zod';
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
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';

const CONVERSATION_ROUTE_SCOPE_SCHEMA = z.enum([
  'profile',
  'thread_history',
  'active_threads',
  'memories',
  'recent_sync',
]);

type ConversationRouteScope = z.infer<typeof CONVERSATION_ROUTE_SCOPE_SCHEMA>;

const conversationRouteDecisionSchema = z.object({
  route: z.enum(['chat', 'plan']),
  requiredContextScopes: z.array(CONVERSATION_ROUTE_SCOPE_SCHEMA).default([]),
  directResponse: z.string().nullable(),
  planSummary: z.string().nullable(),
});

type ConversationRouteDecision = z.infer<typeof conversationRouteDecisionSchema>;

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
  private readonly conversationalResponseCache = new Map<
    string,
    {
      readonly result: AgentOperationResult;
      readonly expiresAt: number;
    }
  >();

  constructor(
    private readonly llm: OpenRouterService,
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
  ) {}

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

    if (routeDecision.route === 'plan') {
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
          route: 'plan',
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
  ): Promise<ConversationRouteDecision | null> {
    const deterministicDecision = this.getDeterministicConversationRouteDecision(intent, context);
    if (deterministicDecision) {
      return deterministicDecision;
    }

    const systemPrompt = `You are Agent X's conversation triage layer. Decide whether the user should receive a direct conversational response now or whether this request requires specialist planning.

Respond with JSON only.

Rules:
- route="chat" when the user is asking a question, wants guidance, wants platform help, wants a conversational explanation, or needs context-aware advice.
- route="plan" only when the user wants Agent X to perform specialist work or execute an operation such as outreach, film analysis, graphics/content generation, reporting, list building, posting, or multi-step coordination.
- requiredContextScopes should include only the minimum scopes needed for a high-quality conversational answer.
- Available scopes: profile, thread_history, active_threads, memories, recent_sync.
- directResponse should only be present when route="chat" and no additional context is needed.
- planSummary should only be present when route="plan" and should be a short plain-English description of the requested work.
- For bare greetings, acknowledgements, identity questions, and general openers, do NOT request profile or memory context. Use route="chat", requiredContextScopes=[], and provide directResponse.
- Do NOT request profile context just to make a response warmer or more personalized. Request profile only when the user's question actually depends on knowing their role, sport, position, goals, or account state.
- If the user can be answered well without retrieved context, prefer directResponse with requiredContextScopes=[].
- Examples that should stay no-context chat: "hi", "hello", "thanks", "who are you", "what is Agent X", "what can you do".
- Examples that may need profile context: "how can you help me", "what should I work on", "what should I focus on next", "what features do I have access to".`;

    try {
      const result = await this.llm.prompt(systemPrompt, intent, {
        tier: 'chat',
        maxTokens: 300,
        temperature: 0.2,
        timeoutMs: 6_000,
        outputSchema: {
          name: 'conversation_route_decision',
          schema: conversationRouteDecisionSchema,
        },
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: 'router',
          },
        }),
      });

      const parsed = conversationRouteDecisionSchema.safeParse(result.parsedOutput);
      if (parsed.success) {
        return parsed.data;
      }

      if (this.looksLikePlannerPayload(result.parsedOutput)) {
        return {
          route: 'plan',
          requiredContextScopes: [],
          directResponse: null,
          planSummary:
            this.extractPlannerSummary(result.parsedOutput) ??
            'handle this request with specialist execution',
        };
      }

      if (this.looksLikeIntentClassificationPayload(result.parsedOutput)) {
        const fallback = this.extractIntentClassificationFallback(result.parsedOutput);
        if (fallback) {
          return fallback;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private getDeterministicConversationRouteDecision(
    intent: string,
    context: AgentSessionContext
  ): ConversationRouteDecision | null {
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

  private looksLikePlannerPayload(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const tasks = candidate['tasks'];
    return Array.isArray(tasks) && tasks.length > 0;
  }

  private extractPlannerSummary(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const summary = candidate['summary'];
    return typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : null;
  }

  private looksLikeIntentClassificationPayload(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate['isConversational'] === 'boolean';
  }

  private extractIntentClassificationFallback(value: unknown): ConversationRouteDecision | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const isConversational = candidate['isConversational'];
    if (typeof isConversational !== 'boolean') return null;

    if (isConversational) {
      const directResponse =
        typeof candidate['directResponse'] === 'string' ? candidate['directResponse'] : null;
      return {
        route: 'chat',
        requiredContextScopes: [],
        directResponse,
        planSummary: null,
      };
    }

    return {
      route: 'plan',
      requiredContextScopes: [],
      directResponse: null,
      planSummary: null,
    };
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
    const systemPrompt = `You are Agent X, NXT1's AI sports assistant. Answer the user conversationally using provided context when it is relevant. Stay concise, grounded, and practical. Do not create plans, tool calls, or coordinator tasks unless explicitly instructed; the routing layer already chose conversational handling for this message. Never invent profile details that are not in the provided context.`;

    const userMessage = scopedContextText
      ? `${scopedContextText}\n\n[User Message]\n${intent}`
      : intent;

    const result = await this.llm.prompt(systemPrompt, userMessage, {
      tier: 'chat',
      maxTokens: 512,
      temperature: 0.4,
      timeoutMs: 8_000,
      ...(context.operationId && {
        telemetryContext: {
          operationId: context.operationId,
          userId: context.userId,
          agentId: 'router',
        },
      }),
    });

    return sanitizeAgentOutputText(result.content || "I'm here and ready to help.");
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
