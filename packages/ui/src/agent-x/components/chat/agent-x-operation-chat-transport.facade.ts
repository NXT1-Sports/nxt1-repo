import {
  DestroyRef,
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
  AGENT_X_RUNTIME_CONFIG,
  createAgentXApi,
  type AgentXApi,
  type AgentXAttachment,
  type AgentXAttachmentStub,
  type AgentXChatRequest,
  type AgentXRichCard,
  type AgentXSelectedAction,
  type AgentXStreamCardEvent,
  type AgentXStreamMediaEvent,
  type AgentXStreamStepEvent,
  type AgentXToolStep,
  type AgentXStreamWaitingForAttachmentsEvent,
} from '@nxt1/core/ai';
import type { AgentYieldState } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  resolveCurrentAgentXAppBaseUrl,
} from '../../services/agent-x-job.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from '../../services/agent-x-operation-event.service';
import { AgentXService } from '../../services/agent-x.service';
import { IntelService } from '../../../intel/intel.service';
import { ProfileGenerationStateService } from '../../../profile/profile-generation-state.service';
import { ProfileService } from '../../../profile/profile.service';
import { TeamProfileService } from '../../../team-profile/team-profile.service';
import type { MessageAttachment, OperationMessage } from './agent-x-operation-chat.models';
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

export interface BatchEmailRecipientStatus {
  readonly email: string;
  readonly status: 'sending' | 'sent' | 'failed';
  readonly subject: string;
  readonly error?: string;
}

export interface BatchEmailCampaignProgress {
  readonly total: number;
  readonly sent: number;
  readonly failed: number;
  readonly currentEmail: string | null;
  readonly recipients: BatchEmailRecipientStatus[];
}

export interface AgentXOperationChatTransportFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly messages: WritableSignal<OperationMessage[]>;
  readonly loading: WritableSignal<boolean>;
  readonly latestProgressLabel: WritableSignal<string | null>;
  readonly batchEmailProgress: WritableSignal<BatchEmailCampaignProgress | null>;
  readonly resolvedThreadId: WritableSignal<string | null>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  applyYieldState(params: {
    yieldState: AgentYieldState;
    source: string;
    operationId?: string;
  }): void;
  clearRealtimePipelines(): void;
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
  setActivityPhase(
    phase:
      | 'idle'
      | 'sending'
      | 'connected'
      | 'streaming'
      | 'running_tool'
      | 'waiting_delta'
      | 'reconnecting'
      | 'paused'
      | 'awaiting_input'
      | 'awaiting_approval'
      | 'completed'
      | 'failed'
      | 'cancelled',
    label?: string | null
  ): void;
  markActivityPulse(label?: string | null): void;
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
  private readonly profileService = inject(ProfileService, { optional: true });
  private readonly teamProfileService = inject(TeamProfileService, { optional: true });
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
  private destroyed = false;

  private inferStreamMediaType(url: string, mimeType?: string): 'image' | 'video' | null {
    const lowerMime = (mimeType ?? '').toLowerCase();
    if (lowerMime.startsWith('image/')) return 'image';
    if (lowerMime.startsWith('video/')) return 'video';

    const lowerUrl = url.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(lowerUrl)) return 'image';
    if (/\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(?:\?|#|$)/i.test(lowerUrl)) return 'video';
    if (/videodelivery\.net\//i.test(lowerUrl)) return 'video';
    return null;
  }

  private extractStreamMediaFromToolResult(
    toolResult?: Record<string, unknown>
  ): readonly AgentXStreamMediaEvent[] {
    if (!toolResult) return [];

    const seen = new Set<string>();
    const media: AgentXStreamMediaEvent[] = [];

    const pushCandidate = (
      urlValue: unknown,
      mimeTypeValue?: unknown,
      forcedType?: 'image' | 'video'
    ): void => {
      if (typeof urlValue !== 'string') return;
      const url = urlValue.trim();
      if (!url || !/^https?:\/\//i.test(url)) return;
      const mimeType = typeof mimeTypeValue === 'string' ? mimeTypeValue : undefined;
      const type = forcedType ?? this.inferStreamMediaType(url, mimeType);
      if (!type) return;
      const key = `${type}|${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      media.push({ type, url, ...(mimeType ? { mimeType } : {}) });
    };

    pushCandidate(toolResult['imageUrl'], toolResult['mimeType'], 'image');
    pushCandidate(toolResult['videoUrl'], toolResult['mimeType'], 'video');
    pushCandidate(toolResult['url'], toolResult['mimeType']);
    pushCandidate(toolResult['publicUrl'], toolResult['mimeType']);
    pushCandidate(toolResult['downloadUrl'], toolResult['mimeType']);
    pushCandidate(toolResult['outputUrl'], toolResult['mimeType'], 'video');

    return media;
  }

  private mergeLiveMediaIntoTypingMessage(media: AgentXStreamMediaEvent): void {
    const attachmentType: MessageAttachment['type'] = media.type === 'video' ? 'video' : 'image';

    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;

        const existingAttachments = [...(message.attachments ?? [])];
        const alreadyPresent = existingAttachments.some(
          (attachment) => attachment.url === media.url && attachment.type === attachmentType
        );
        if (alreadyPresent) return message;

        return {
          ...message,
          attachments: [
            ...existingAttachments,
            {
              url: media.url,
              type: attachmentType,
              name: attachmentType === 'video' ? 'stream-video.mp4' : 'stream-image.jpg',
            },
          ],
        };
      })
    );
  }

  constructor() {
    // Per-component facade: when the host component is destroyed, mark this
    // facade as destroyed so any in-flight stream that resolves later cannot
    // emit on a torn-down OutputRef (NG0953).
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.host = null;
    });
  }

  configure(host: AgentXOperationChatTransportFacadeHost): void {
    this.host = host;
  }

  async callAgentChat(
    userInput: string,
    attachments: AgentXAttachment[] = [],
    selectedAction?: AgentXSelectedAction,
    idempotencyKey?: string,
    connectedSources?: readonly { platform: string; profileUrl: string; faviconUrl?: string }[],
    pendingAttachmentOptions?: {
      stubs: readonly AgentXAttachmentStub[];
      onWaitingForAttachments: (operationId: string) => Promise<void>;
    }
  ): Promise<void> {
    const host = this.requireHost();
    const sanitizedConnectedSources =
      connectedSources?.flatMap((source) => {
        const platform = source.platform.trim();
        const profileUrl = source.profileUrl.trim();
        if (!platform || !profileUrl || platform.toLowerCase() === 'nxt1') {
          return [];
        }

        return [
          {
            platform,
            profileUrl,
            ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
          },
        ];
      }) ?? [];
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
      ...(pendingAttachmentOptions?.stubs?.length
        ? { attachmentStubs: pendingAttachmentOptions.stubs }
        : {}),
      ...(selectedAction ? { selectedAction } : {}),
      ...(sanitizedConnectedSources.length > 0
        ? { connectedSources: sanitizedConnectedSources }
        : {}),
    } satisfies AgentXChatRequest;

    this.logger.info('Dispatching Agent X chat request', {
      contextId: host.contextId(),
      threadId: host.resolveActiveThreadId() ?? null,
      attachmentCount: attachments.length,
      attachmentTypes: attachments.map((attachment) => attachment.type),
      videoCount: attachments.filter((attachment) => attachment.type === 'video').length,
    });

    const authToken = await this.getAuthToken?.().catch(() => null);

    this.breadcrumb.trackStateChange('agent-x-operation-chat:sending', {
      contextId: host.contextId(),
      streaming: !!(authToken && isPlatformBrowser(this.platformId)),
    });

    if (authToken && isPlatformBrowser(this.platformId)) {
      try {
        await this.sendViaStream(
          request,
          authToken,
          idempotencyKey,
          pendingAttachmentOptions?.onWaitingForAttachments
            ? (event) => pendingAttachmentOptions!.onWaitingForAttachments!(event.operationId)
            : undefined
        );
      } catch (error) {
        if (this.isStreamLimitError(error)) {
          this.logger.warn('Stream limited on initial send; retrying once with backoff', {
            contextId: host.contextId(),
          });
          this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-limit-retry', {
            contextId: host.contextId(),
          });

          await new Promise((resolve) =>
            setTimeout(resolve, AGENT_X_RUNTIME_CONFIG.clientRecovery.streamLimitRetryBackoffMs)
          );

          try {
            await this.sendViaStream(
              request,
              authToken,
              idempotencyKey,
              pendingAttachmentOptions?.onWaitingForAttachments
                ? (event) => pendingAttachmentOptions!.onWaitingForAttachments!(event.operationId)
                : undefined
            );
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

  sendViaStream(
    request: AgentXChatRequest,
    authToken: string,
    idempotencyKey?: string,
    onWaitingForAttachments?: (
      event: AgentXStreamWaitingForAttachmentsEvent
    ) => void | Promise<void>
  ): Promise<void> {
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

    const pendingOperationId =
      request.resumeOperationId?.trim() ||
      host.getCurrentOperationId() ||
      host.contextId().trim() ||
      null;
    if (pendingOperationId) {
      this.agentXService.persistDropRecoveryOp(
        pendingOperationId,
        host.resolvedThreadId() ?? undefined
      );
    }

    return new Promise<void>((resolve, reject) => {
      const appBaseUrl = resolveCurrentAgentXAppBaseUrl();
      const streamController = this.api.streamMessage(
        request,
        {
          onThread: (event) => {
            host.resolvedThreadId.set(event.threadId);
            if (event.operationId) host.setCurrentOperationId(event.operationId);
            host.setActivityPhase('connected');
            this.logger.debug('Stream thread resolved', { threadId: event.threadId });

            this.agentXService.persistDropRecoveryOp(
              event.operationId ?? pendingOperationId ?? host.contextId().trim(),
              event.threadId
            );

            this.streamRegistry.register(event.threadId, streamController, {
              retentionHint: 'long-running',
            });

            if (event.operationId) {
              this.streamRegistry.linkOperation(event.operationId, event.threadId);
            }

            // Notify the shell about the resolved threadId so it can remount
            // the chat component in the navigate-away-before-thread race.
            const resolvedOperationId =
              event.operationId ?? pendingOperationId ?? host.contextId().trim();
            if (resolvedOperationId) {
              this.agentXService.setPendingResolvedOp(resolvedOperationId, event.threadId);
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
                    onThinking: () => undefined,
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
            host.markActivityPulse();

            const watermark = host.getStreamTurnWatermark();
            if (watermark) {
              watermark.optimisticChars += event.content.length;
            }

            this.messageFacade.queueTypingDelta(event.content);
          },

          onThinking: (event) => {
            const threadId = host.resolvedThreadId();
            if (threadId) this.streamRegistry.appendThinking(threadId, event.content);
            // Thinking arrives before deltas — update parts on the typing message
            this.messageFacade.messages.update((messages) =>
              messages.map((message) => {
                if (message.id !== 'typing') return message;
                const prevParts = message.parts ?? [];
                const last = prevParts[prevParts.length - 1];
                const nextParts =
                  last?.type === 'thinking'
                    ? [
                        ...prevParts.slice(0, -1),
                        { type: 'thinking' as const, content: last.content + event.content },
                      ]
                    : [...prevParts, { type: 'thinking' as const, content: event.content }];
                return { ...message, parts: nextParts };
              })
            );
          },

          onStep: (event: AgentXStreamStepEvent) => {
            const label = event.label.trim();
            if (!label) return;

            if (event.status === 'active') {
              host.setActivityPhase('running_tool');
            } else if (
              event.stageType === 'tool' &&
              (event.status === 'success' || event.status === 'error')
            ) {
              // Tool finished: leave running_tool so the pre-text wait can render
              // via waiting_delta until the assistant starts emitting text deltas.
              host.setActivityPhase('waiting_delta');
            } else {
              // Keep streaming state stable for non-active step updates.
              // Waiting+immediate-pulse causes a visible loader flash.
              host.markActivityPulse();
            }

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
            this.profileService?.notifyAgentToolStep(event.id, step.label, event.status);
            this.teamProfileService?.notifyAgentToolStep(event.id, step.label, event.status);
            const currentOperationId = host.getCurrentOperationId();
            if (currentOperationId) {
              this.profileGenerationState?.receiveStep(currentOperationId, step);
            }

            if (event.toolResult) {
              const liveMedia = this.extractStreamMediaFromToolResult(event.toolResult);
              for (const media of liveMedia) {
                this.mergeLiveMediaIntoTypingMessage(media);
              }
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
            this.messageFacade.attachStreamedCard(
              streamingId,
              card,
              host.getCurrentOperationId() ?? host.contextId(),
              !!event.clearText
            );
          },

          onOperation: (event) => {
            if (event.operationId) {
              host.setCurrentOperationId(event.operationId);
            }

            const opMessage = typeof event.message === 'string' ? event.message.trim() : '';
            if (
              (event.status === 'paused' ||
                event.status === 'awaiting_input' ||
                event.status === 'awaiting_approval') &&
              event.yieldState
            ) {
              host.applyYieldState({
                yieldState: event.yieldState,
                source: 'sse-operation',
                ...(event.operationId ? { operationId: event.operationId } : {}),
              });
            }

            if (event.status === 'complete') {
              host.setOperationStatus('complete');
              // Keep the shimmer active until terminal `done` arrives. Some
              // backends emit lifecycle `complete` slightly before the stream
              // closes.
              host.setActivityPhase('waiting_delta', opMessage || null);
            } else if (event.status === 'failed') {
              host.setOperationStatus('error');
              host.setActivityPhase('failed', opMessage || null);
            } else if (event.status === 'paused') {
              host.setOperationStatus('paused');
              host.setActivityPhase('paused', opMessage || null);
            } else if (event.status === 'awaiting_input') {
              host.setOperationStatus('awaiting_input');
              host.setActivityPhase('awaiting_input', opMessage || null);
            } else if (event.status === 'awaiting_approval') {
              host.setOperationStatus('awaiting_approval');
              host.setActivityPhase('awaiting_approval', opMessage || null);
            } else if (event.status === 'running' || event.status === 'queued') {
              host.setOperationStatus('processing');
              host.setActivityPhase('connected', opMessage || null);
            }

            this.operationEventService.emitOperationStatusUpdated(
              event.threadId,
              event.status,
              event.timestamp
            );
          },

          onProgress: (event) => {
            const message = typeof event.message === 'string' ? event.message.trim() : '';

            // Route batch-email per-recipient progress to a dedicated signal
            // so the UI can render a deterministic per-recipient status panel.
            const meta = event.metadata as Record<string, unknown> | undefined;
            if (meta?.['phase'] === 'send_email' && typeof meta?.['recipientEmail'] === 'string') {
              const recipientEmail = meta['recipientEmail'] as string;
              const recipientCount =
                typeof meta['recipientCount'] === 'number' ? (meta['recipientCount'] as number) : 0;
              const subject =
                typeof meta['subject'] === 'string' ? (meta['subject'] as string) : '';
              const recipientStatus =
                (meta['recipientStatus'] as 'sending' | 'sent' | 'failed') ?? 'sending';
              const recipientError =
                typeof meta['recipientError'] === 'string'
                  ? (meta['recipientError'] as string)
                  : undefined;

              host.batchEmailProgress.update((prev) => {
                const base = prev ?? {
                  total: recipientCount,
                  sent: 0,
                  failed: 0,
                  currentEmail: null,
                  recipients: [],
                };
                const prevEntry = base.recipients.find((r) => r.email === recipientEmail);
                const updatedEntry: BatchEmailRecipientStatus = {
                  email: recipientEmail,
                  status: recipientStatus,
                  subject,
                  ...(recipientError ? { error: recipientError } : {}),
                };
                const updatedRecipients = [
                  ...base.recipients.filter((r) => r.email !== recipientEmail),
                  updatedEntry,
                ];
                const sentDelta =
                  recipientStatus === 'sent' && prevEntry?.status !== 'sent' ? 1 : 0;
                const failedDelta =
                  recipientStatus === 'failed' && prevEntry?.status !== 'failed' ? 1 : 0;
                return {
                  total: recipientCount || base.total,
                  sent: base.sent + sentDelta,
                  failed: base.failed + failedDelta,
                  currentEmail: recipientStatus === 'sending' ? recipientEmail : base.currentEmail,
                  recipients: updatedRecipients,
                };
              });
            }

            if (message) {
              host.latestProgressLabel.set(message);
              host.markActivityPulse(message);
            } else {
              host.markActivityPulse();
            }
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
            // Keep operation chat bubbles focused on text/tools/cards.
            // Media events can still be consumed by dedicated media panels.
            void event;
          },

          onStreamReplaced: (event) => {
            this.messageFacade.flushPendingTypingDelta();
            host.setActivityPhase('reconnecting', 'Reconnecting...');
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
            this.agentXService.clearDropRecoveryOp();
            resolve();
          },

          ...(onWaitingForAttachments ? { onWaitingForAttachments } : {}),

          onDone: (event) => {
            this.messageFacade.flushPendingTypingDelta();
            host.latestProgressLabel.set(null);
            host.batchEmailProgress.set(null);
            host.setActivityPhase('completed');
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
            this.agentXService.clearDropRecoveryOp();
            this.emitResponseCompleteOnce('sse-done');
            resolve();
          },

          onError: (event) => {
            const threadId = host.resolvedThreadId();
            if (threadId) this.streamRegistry.markError(threadId, event.error);

            host.setActiveStream(null);
            host.latestProgressLabel.set(null);

            if (event.status === 429) {
              this.agentXService.clearDropRecoveryOp();
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
              host.setActivityPhase('reconnecting', 'Reconnecting...');
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

            host.setActivityPhase('failed', event.error);
            this.messageFacade.replaceTyping({
              id: host.uid(),
              role: 'assistant',
              content: 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            this.agentXService.clearDropRecoveryOp();
            const error = new Error(event.error);
            (error as Error & { status?: number; code?: string }).status = event.status;
            (error as Error & { status?: number; code?: string }).code = event.code;
            reject(error);
          },
        },
        authToken,
        this.baseUrl,
        {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(appBaseUrl ? { appBaseUrl } : {}),
        }
      );

      host.setActiveStream(streamController);
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
    // Stream may resolve after the host component was destroyed (e.g. user
    // closed the chat sheet mid-flight then reopened a different instance).
    // Skip emitting on a dead OutputRef — the new component instance has its
    // own Firestore tail that already received the same `done` signal.
    if (this.destroyed || !this.host) {
      this.logger.debug('responseComplete skipped — host destroyed', {
        turnId: this.responseTurnId,
        source,
      });
      this.responseCompleteEmitted = true;
      return;
    }
    const host = this.host;
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
    if (latencyMs < 0 || latencyMs > AGENT_X_RUNTIME_CONFIG.clientRecovery.streamLatencyClampMs) {
      return;
    }

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
