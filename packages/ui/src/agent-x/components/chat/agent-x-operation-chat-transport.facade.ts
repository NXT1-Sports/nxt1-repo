import {
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  inject,
  runInInjectionContext,
  type WritableSignal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createAgentXApi,
  type AgentXApi,
  type AgentXAttachment,
  type AgentXChatRequest,
  type AgentXMessagePart,
  type AgentXRichCard,
  type AgentXSelectedAction,
  type AgentXStreamCardEvent,
  type AgentXStreamStepEvent,
  type AgentXToolStep,
} from '@nxt1/core/ai';
import type { AgentYieldState } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../services/agent-x-job.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from '../../services/agent-x-operation-event.service';
import { AgentXService } from '../../services/agent-x.service';
import { IntelService } from '../../../intel/intel.service';
import { ProfileGenerationStateService } from '../../../profile/profile-generation-state.service';
import type { OperationMessage } from './agent-x-operation-chat.models';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';

type OperationStatus =
  | 'processing'
  | 'complete'
  | 'error'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval'
  | null;

export interface StreamTurnWatermark {
  optimisticChars: number;
  confirmedChars: number;
}

export interface AgentXOperationChatTransportFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly messages: WritableSignal<OperationMessage[]>;
  readonly loading: WritableSignal<boolean>;
  readonly latestProgressLabel: WritableSignal<string | null>;
  readonly resolvedThreadId: WritableSignal<string | null>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  getActiveStream(): AbortController | null;
  setActiveStream(controller: AbortController | null): void;
  getCurrentOperationId(): string | null;
  setCurrentOperationId(operationId: string | null): void;
  getShadowFirestoreSub(): OperationEventSubscription | null;
  setShadowFirestoreSub(subscription: OperationEventSubscription | null): void;
  getActiveFirestoreSub(): OperationEventSubscription | null;
  getStreamTurnWatermark(): StreamTurnWatermark | null;
  setStreamTurnWatermark(watermark: StreamTurnWatermark | null): void;
  resolveActiveThreadId(): string | null;
  setOperationStatus(status: OperationStatus): void;
  emitResponseComplete(): void;
  subscribeToFirestoreJobEvents(
    operationId: string,
    startAfterSeq?: number,
    initialWatermark?: StreamTurnWatermark | null
  ): void;
  uid(): string;
}

@Injectable()
export class AgentXOperationChatTransportFacade {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(EnvironmentInjector);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatTransport');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly agentXService = inject(AgentXService);
  private readonly intelService = inject(IntelService, { optional: true });
  private readonly profileGenerationState = inject(ProfileGenerationStateService, {
    optional: true,
  });
  private readonly messageFacade = inject(AgentXOperationChatMessageFacade);

  private readonly api: AgentXApi = createAgentXApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  private host: AgentXOperationChatTransportFacadeHost | null = null;
  private responseTurnId = 0;
  private responseCompleteEmitted = false;
  private deltaLatencySamples: number[] = [];

  configure(host: AgentXOperationChatTransportFacadeHost): void {
    this.host = host;
  }

  async callAgentChat(
    userInput: string,
    attachments: AgentXAttachment[] = [],
    selectedAction?: AgentXSelectedAction
  ): Promise<void> {
    const host = this.requireHost();
    const maxHistoryContentChars = 40_000;
    const allMessages = host
      .messages()
      .filter(
        (message) =>
          !message.isTyping && message.role !== 'system' && message.content.trim().length > 0
      );
    let lastUserIndex = -1;
    for (let index = allMessages.length - 1; index >= 0; index -= 1) {
      if (allMessages[index].role === 'user') {
        lastUserIndex = index;
        break;
      }
    }

    const historyMessages =
      lastUserIndex >= 0
        ? allMessages.filter((_message, index) => index !== lastUserIndex)
        : allMessages;

    const request = {
      message: userInput,
      history: historyMessages.slice(-20).map((message) => ({
        id: host.uid(),
        role: message.role as 'user' | 'assistant',
        content:
          message.content.length > maxHistoryContentChars
            ? `${message.content.slice(0, maxHistoryContentChars)}…`
            : message.content,
        timestamp: new Date(),
      })),
      ...(host.resolveActiveThreadId() ? { threadId: host.resolveActiveThreadId()! } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(selectedAction ? { selectedAction } : {}),
    } satisfies AgentXChatRequest;

    const authToken = await this.getAuthToken?.().catch(() => null);

    this.breadcrumb.trackStateChange('agent-x-operation-chat:sending', {
      contextId: host.contextId(),
      streaming: !!(authToken && isPlatformBrowser(this.platformId)),
    });

    if (authToken && isPlatformBrowser(this.platformId)) {
      try {
        await this.sendViaStream(request, authToken);
      } catch (error) {
        if (this.isStreamLimitError(error)) {
          this.logger.warn('Stream limited on initial send; retrying once with backoff', {
            contextId: host.contextId(),
          });
          this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-limit-retry', {
            contextId: host.contextId(),
          });

          await new Promise((resolve) => setTimeout(resolve, 900));

          try {
            await this.sendViaStream(request, authToken);
            return;
          } catch (retryError) {
            if (this.isStreamLimitError(retryError)) {
              this.logger.warn('Stream limit persisted after retry', {
                contextId: host.contextId(),
              });
              this.messageFacade.replaceTyping({
                id: host.uid(),
                role: 'assistant',
                content:
                  'Too many active Agent X sessions right now. Close other tabs or wait a moment, then try again.',
                timestamp: new Date(),
                error: true,
              });
            }
            throw retryError;
          }
        }

        throw error;
      }
      return;
    }

    this.logger.warn('Blocked Agent X send: streaming prerequisites unavailable', {
      hasAuthToken: !!authToken,
      browser: isPlatformBrowser(this.platformId),
      contextId: host.contextId(),
    });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-prereq-missing', {
      contextId: host.contextId(),
      hasAuthToken: !!authToken,
    });
    this.messageFacade.replaceTyping({
      id: host.uid(),
      role: 'assistant',
      content: 'Sign in to continue chatting with Agent X.',
      timestamp: new Date(),
      error: true,
    });
  }

  isStreamLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    return record['status'] === 429 || record['code'] === 'AGENT_STREAM_LIMIT_REACHED';
  }

  sendViaStream(request: AgentXChatRequest, authToken: string): Promise<void> {
    const host = this.requireHost();
    this.messageFacade.clearPendingTypingDelta();
    const previousThreadId = host.resolvedThreadId();
    if (previousThreadId) {
      this.streamRegistry.abort(previousThreadId);
    }
    host.getActiveStream()?.abort();
    host.setActiveStream(null);

    const streamingId = 'typing';
    host.setStreamTurnWatermark({ optimisticChars: 0, confirmedChars: 0 });

    return new Promise<void>((resolve, reject) => {
      host.setActiveStream(
        this.api.streamMessage(
          request,
          {
            onThread: (event) => {
              host.resolvedThreadId.set(event.threadId);
              if (event.operationId) host.setCurrentOperationId(event.operationId);
              this.logger.debug('Stream thread resolved', { threadId: event.threadId });

              const activeStream = host.getActiveStream();
              if (activeStream) {
                this.streamRegistry.register(event.threadId, activeStream, {
                  retentionHint: host.contextType() === 'operation' ? 'long-running' : 'standard',
                });
              }

              if (event.operationId) {
                this.streamRegistry.linkOperation(event.operationId, event.threadId);
              }

              if (
                event.operationId &&
                !host.getShadowFirestoreSub() &&
                !host.getActiveFirestoreSub()
              ) {
                host.setShadowFirestoreSub(
                  runInInjectionContext(this.injector, () =>
                    this.operationEventService.subscribe(event.operationId!, {
                      onDelta: (text) => {
                        const watermark = host.getStreamTurnWatermark();
                        if (watermark) {
                          watermark.confirmedChars += text.length;
                        }
                      },
                      onStep: () => undefined,
                      onCard: () => undefined,
                      onDone: () => undefined,
                      onError: () => undefined,
                    })
                  )
                );
                this.logger.debug('Shadow Firestore sub opened for SSE drop protection', {
                  operationId: event.operationId,
                });
              }
            },

            onDelta: (event) => {
              const threadId = host.resolvedThreadId();
              if (threadId) this.streamRegistry.appendDelta(threadId, event.content);
              this.recordDeltaLatency(event.emittedAt);

              const watermark = host.getStreamTurnWatermark();
              if (watermark) {
                watermark.optimisticChars += event.content.length;
              }

              this.messageFacade.queueTypingDelta(event.content);
            },

            onStep: (event: AgentXStreamStepEvent) => {
              const label = event.label.trim();
              if (!label) return;

              const step: AgentXToolStep = {
                id: event.id,
                label,
                agentId: event.agentId,
                stageType: event.stageType,
                stage: event.stage,
                outcomeCode: event.outcomeCode,
                metadata: event.metadata,
                status: event.status,
                icon: event.icon,
                detail: event.detail,
              };
              const threadId = host.resolvedThreadId();
              if (threadId) this.streamRegistry.upsertStep(threadId, step);

              this.intelService?.notifyToolStep(event.id, step.label, event.status, event.detail);
              const currentOperationId = host.getCurrentOperationId();
              if (currentOperationId) {
                this.profileGenerationState?.receiveStep(currentOperationId, step);
              }

              if (event.stageType !== 'tool') return;

              const deltaToFlush = this.messageFacade.drainBufferedTypingDelta();
              host.messages.update((messages) =>
                messages.map((message) => {
                  if (message.id !== streamingId) return message;

                  let nextParts = [...(message.parts ?? [])];
                  let nextContent = message.content;
                  if (deltaToFlush) {
                    const last = nextParts[nextParts.length - 1];
                    if (last?.type === 'text') {
                      nextParts[nextParts.length - 1] = {
                        type: 'text',
                        content: last.content + deltaToFlush,
                      };
                    } else {
                      nextParts.push({ type: 'text', content: deltaToFlush });
                    }
                    nextContent += deltaToFlush;
                  }

                  nextParts = this.messageFacade.withUpsertedToolStepPart(nextParts, step);

                  const previousSteps = message.steps ?? [];
                  const existingIndex = previousSteps.findIndex(
                    (candidate) => candidate.id === event.id
                  );
                  const nextSteps =
                    existingIndex >= 0
                      ? previousSteps.map((candidate, index) =>
                          index === existingIndex ? step : candidate
                        )
                      : [...previousSteps, step];

                  return {
                    ...message,
                    content: nextContent,
                    isTyping: false,
                    steps: nextSteps,
                    parts: nextParts,
                  };
                })
              );
            },

            onCard: (event: AgentXStreamCardEvent) => {
              this.messageFacade.flushPendingTypingDelta();
              const card: AgentXRichCard = {
                type: event.type,
                agentId: event.agentId,
                title: event.title,
                payload: event.payload,
              };
              const threadId = host.resolvedThreadId();
              if (threadId) this.streamRegistry.appendCard(threadId, card);

              if (event.clearText) {
                host.messages.update((messages) =>
                  messages.map((message) =>
                    message.id === streamingId
                      ? {
                          ...message,
                          content: '',
                          cards: [...(message.cards ?? []), card],
                          parts: [{ type: 'card', card }],
                        }
                      : message
                  )
                );
                return;
              }

              host.messages.update((messages) =>
                messages.map((message) =>
                  message.id === streamingId
                    ? {
                        ...message,
                        cards: [...(message.cards ?? []), card],
                        parts: [...(message.parts ?? []), { type: 'card', card }],
                      }
                    : message
                )
              );
            },

            onOperation: (event) => {
              if (event.operationId) {
                host.setCurrentOperationId(event.operationId);
              }
              if (
                (event.status === 'paused' ||
                  event.status === 'awaiting_input' ||
                  event.status === 'awaiting_approval') &&
                event.yieldState
              ) {
                host.activeYieldState.set(event.yieldState);
                host.yieldResolved.set(false);
                this.messageFacade.upsertInlineYieldMessage(
                  event.yieldState,
                  event.operationId ?? host.getCurrentOperationId() ?? host.contextId()
                );
              }

              if (event.status === 'complete') {
                host.setOperationStatus('complete');
              } else if (event.status === 'failed') {
                host.setOperationStatus('error');
              } else if (event.status === 'paused') {
                host.setOperationStatus('paused');
              } else if (event.status === 'awaiting_input') {
                host.setOperationStatus('awaiting_input');
              } else if (event.status === 'awaiting_approval') {
                host.setOperationStatus('awaiting_approval');
              }

              this.operationEventService.emitOperationStatusUpdated(
                event.threadId,
                event.status,
                event.timestamp
              );
            },

            onTitleUpdated: (event) => {
              this.operationEventService.emitTitleUpdated(event.threadId, event.title);
            },

            onPanel: (event) => {
              this.agentXService.requestAutoOpenPanel(event);
              this.logger.info('Forwarded panel event to AgentXService (immediate)', {
                type: event.type,
              });
            },

            onMedia: (event) => {
              const mediaPart: AgentXMessagePart =
                event.type === 'video'
                  ? { type: 'video', url: event.url }
                  : { type: 'image', url: event.url };

              host.messages.update((messages) =>
                messages.map((message) =>
                  message.id === streamingId
                    ? { ...message, parts: [...(message.parts ?? []), mediaPart] }
                    : message
                )
              );
            },

            onStreamReplaced: (event) => {
              this.messageFacade.flushPendingTypingDelta();
              host.setActiveStream(null);
              host.messages.update((messages) =>
                messages.filter((message) => message.id !== streamingId)
              );
              host.loading.set(false);
              host.getShadowFirestoreSub()?.unsubscribe();
              host.setShadowFirestoreSub(null);
              host.setStreamTurnWatermark(null);

              this.logger.info('SSE stream replaced by newer lease', {
                operationId: event.operationId,
                replacedByStreamId: event.replacedByStreamId,
              });
              this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-replaced', {
                operationId: event.operationId,
              });
              this.emitResponseCompleteOnce('sse-stream-replaced');
              resolve();
            },

            onDone: (event) => {
              this.messageFacade.flushPendingTypingDelta();
              host.latestProgressLabel.set(null);
              const threadId = host.resolvedThreadId();
              if (threadId) {
                this.streamRegistry.markDone(threadId, {
                  model: event.model,
                  threadId: event.threadId,
                  messageId: event.messageId,
                  usage: event.usage,
                });
              }

              this.messageFacade.finalizeStreamedAssistantMessage({
                streamingId,
                messageId: event.messageId,
                success: true,
                threadId: event.threadId,
                source: 'sse-done',
              });

              host.setActiveStream(null);
              this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-complete', {
                contextId: host.contextId(),
                model: event.model,
              });
              this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
                contextType: host.contextType(),
                contextId: host.contextId(),
                streaming: true,
                model: event.model,
              });
              const currentOperationId = host.getCurrentOperationId();
              if (currentOperationId) {
                this.profileGenerationState?.receiveJobDone(currentOperationId, true);
              }
              if (event.autoOpenPanel && !this.agentXService.requestedSidePanel()) {
                this.agentXService.requestAutoOpenPanel(event.autoOpenPanel);
                this.logger.info('Forwarded autoOpenPanel to AgentXService (done fallback)', {
                  type: event.autoOpenPanel.type,
                });
              }

              host.getShadowFirestoreSub()?.unsubscribe();
              host.setShadowFirestoreSub(null);
              host.setStreamTurnWatermark(null);

              this.logger.info('Stream complete', {
                model: event.model,
                outputTokens: event.usage?.outputTokens,
                threadId: event.threadId,
                deltaLatency: this.summarizeDeltaLatencies(),
              });
              this.emitResponseCompleteOnce('sse-done');
              resolve();
            },

            onError: (event) => {
              const threadId = host.resolvedThreadId();
              if (threadId) this.streamRegistry.markError(threadId, event.error);

              host.setActiveStream(null);
              host.latestProgressLabel.set(null);

              if (event.status === 429) {
                const error = new Error(event.error);
                (error as Error & { status?: number; code?: string }).status = event.status;
                (error as Error & { status?: number; code?: string }).code = event.code;
                reject(error);
                return;
              }

              const isNetworkDrop = !event.status || event.status === 0 || event.status >= 500;
              const isResumeThrottle = event.status === 429 && Boolean(request.resumeOperationId);
              const currentOperationId = host.getCurrentOperationId();
              if ((isNetworkDrop || isResumeThrottle) && currentOperationId) {
                this.logger.warn('SSE stream unavailable — falling back to Firestore watch', {
                  operationId: currentOperationId,
                  status: event.status,
                  resumeOperationId: request.resumeOperationId,
                });
                this.breadcrumb.trackStateChange('agent-x-operation-chat:sse-fallback-firestore', {
                  operationId: currentOperationId,
                  status: event.status,
                });

                host.messages.update((messages) => {
                  if (messages.some((message) => message.id === 'typing')) return messages;
                  return [
                    ...messages,
                    {
                      id: 'typing',
                      role: 'assistant',
                      content: '',
                      timestamp: new Date(),
                      isTyping: true,
                    },
                  ];
                });
                host.loading.set(true);
                host.subscribeToFirestoreJobEvents(
                  currentOperationId,
                  undefined,
                  host.getStreamTurnWatermark()
                );
                host.getShadowFirestoreSub()?.unsubscribe();
                host.setShadowFirestoreSub(null);
                resolve();
                return;
              }

              if (currentOperationId) {
                this.profileGenerationState?.receiveJobDone(currentOperationId, false, event.error);
              }

              this.logger.error('Stream error', event.error);
              this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-error', {
                contextId: host.contextId(),
              });
              host.getShadowFirestoreSub()?.unsubscribe();
              host.setShadowFirestoreSub(null);
              host.setStreamTurnWatermark(null);

              this.messageFacade.replaceTyping({
                id: host.uid(),
                role: 'assistant',
                content: 'Something went wrong. Please try again.',
                timestamp: new Date(),
                error: true,
              });
              const error = new Error(event.error);
              (error as Error & { status?: number; code?: string }).status = event.status;
              (error as Error & { status?: number; code?: string }).code = event.code;
              reject(error);
            },
          },
          authToken,
          this.baseUrl
        )
      );
    });
  }

  beginResponseTurn(source: string): void {
    const host = this.requireHost();
    this.responseTurnId += 1;
    this.responseCompleteEmitted = false;
    host.latestProgressLabel.set(null);
    this.logger.debug('Response turn started', {
      turnId: this.responseTurnId,
      source,
      contextId: host.contextId(),
    });
  }

  emitResponseCompleteOnce(source: string): void {
    const host = this.requireHost();
    if (this.responseCompleteEmitted) {
      this.logger.debug('Duplicate responseComplete suppressed', {
        turnId: this.responseTurnId,
        source,
        contextId: host.contextId(),
      });
      return;
    }

    this.responseCompleteEmitted = true;
    host.emitResponseComplete();
  }

  recordDeltaLatency(emittedAt?: string): void {
    if (!emittedAt) return;

    const emittedAtMs = Date.parse(emittedAt);
    if (Number.isNaN(emittedAtMs)) return;

    const latencyMs = Date.now() - emittedAtMs;
    if (latencyMs < 0 || latencyMs > 120_000) return;

    this.deltaLatencySamples.push(latencyMs);
    if (this.deltaLatencySamples.length > 120) {
      this.deltaLatencySamples.shift();
    }
  }

  summarizeDeltaLatencies(): { count: number; avgMs: number; p95Ms: number } {
    if (this.deltaLatencySamples.length === 0) {
      return { count: 0, avgMs: 0, p95Ms: 0 };
    }

    const sorted = [...this.deltaLatencySamples].sort((left, right) => left - right);
    const count = sorted.length;
    const avgMs = Math.round(sorted.reduce((sum, value) => sum + value, 0) / count);
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const p95Ms = Math.round(sorted[p95Index] ?? 0);

    return { count, avgMs, p95Ms };
  }

  private requireHost(): AgentXOperationChatTransportFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatTransportFacade used before configure()');
    }

    return this.host;
  }
}
