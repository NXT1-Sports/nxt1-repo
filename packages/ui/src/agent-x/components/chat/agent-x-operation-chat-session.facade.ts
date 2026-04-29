import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import type { AgentYieldState } from '@nxt1/core';
import type {
  AgentXMessagePart,
  AgentXRichCard,
  AgentXStreamMediaEvent,
  AgentXToolStep,
} from '@nxt1/core/ai';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from '../../services/agent-x-operation-event.service';
import { AgentXService } from '../../services/agent-x.service';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import type { PendingFile, OperationMessage } from './agent-x-operation-chat.models';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import {
  AgentXOperationChatTransportFacade,
  type StreamTurnWatermark,
} from './agent-x-operation-chat-transport.facade';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';

type OperationStatus =
  | 'processing'
  | 'complete'
  | 'error'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval'
  | null;

export interface AgentXOperationChatSessionFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly resumeOperationId: () => string;
  readonly initialMessage: () => string;
  readonly initialFiles: () => readonly PendingFile[];
  readonly errorMessage: () => string | null;
  readonly threadMode: WritableSignal<boolean>;
  readonly inputValue: WritableSignal<string>;
  readonly loading: WritableSignal<boolean>;
  readonly latestProgressLabel: WritableSignal<string | null>;
  readonly resolvedThreadId: WritableSignal<string | null>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  getOperationStatus(): OperationStatus;
  setOperationStatus(status: OperationStatus): void;
  getCurrentOperationId(): string | null;
  setCurrentOperationId(operationId: string | null): void;
  getActiveStream(): AbortController | null;
  setActiveStream(controller: AbortController | null): void;
  getActiveFirestoreSub(): OperationEventSubscription | null;
  setActiveFirestoreSub(subscription: OperationEventSubscription | null): void;
  getShadowFirestoreSub(): OperationEventSubscription | null;
  setShadowFirestoreSub(subscription: OperationEventSubscription | null): void;
  getStreamTurnWatermark(): StreamTurnWatermark | null;
  setStreamTurnWatermark(watermark: StreamTurnWatermark | null): void;
  hasUserSent(): boolean;
  markUserMessageSent(): void;
  send(options?: {
    text?: string;
    selectedAction?: { action: string; toolName: string; label?: string } | null;
    preserveDraft?: boolean;
  }): Promise<void>;
  attachToResumedOperation(params: {
    operationId: string;
    threadId?: string;
    afterSeq?: number;
  }): Promise<void>;
  uid(): string;
}

@Injectable()
export class AgentXOperationChatSessionFacade {
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatSession');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly agentXService = inject(AgentXService);
  private readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);
  private readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);

  readonly initialMessageSent = signal(false);

  private host: AgentXOperationChatSessionFacadeHost | null = null;

  private normalizeMessageContent(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private stepSignature(steps: readonly AgentXToolStep[] | undefined): string {
    if (!steps || steps.length === 0) return '';
    return steps.map((step) => `${step.id}|${step.label}|${step.status}`).join('||');
  }

  private cardSignature(cards: readonly AgentXRichCard[] | undefined): string {
    if (!cards || cards.length === 0) return '';
    return cards.map((card) => JSON.stringify(card)).join('||');
  }

  private dedupeConsecutiveAssistantMessages(
    messages: readonly OperationMessage[]
  ): OperationMessage[] {
    const deduped: OperationMessage[] = [];

    for (const message of messages) {
      const previous = deduped[deduped.length - 1];
      if (!previous) {
        deduped.push(message);
        continue;
      }

      if (message.role !== 'assistant' || previous.role !== 'assistant') {
        deduped.push(message);
        continue;
      }

      const sameOperation = (message.operationId ?? '') === (previous.operationId ?? '');
      const sameContent =
        this.normalizeMessageContent(message.content) ===
        this.normalizeMessageContent(previous.content);
      const sameSteps = this.stepSignature(message.steps) === this.stepSignature(previous.steps);
      const sameCards = this.cardSignature(message.cards) === this.cardSignature(previous.cards);

      if (sameOperation && sameContent && sameSteps && sameCards) {
        continue;
      }

      deduped.push(message);
    }

    return deduped;
  }

  configure(host: AgentXOperationChatSessionFacadeHost): void {
    this.host = host;
  }

  initializeAfterView(): void {
    const host = this.requireHost();
    const threadId = host.threadId().trim();
    if (threadId) {
      this.initializeExistingThread(threadId);
      return;
    }

    if (host.getOperationStatus() === 'error') {
      host.threadMode.set(true);
      this.injectFailureMessage();
      return;
    }

    if (
      host.contextId().trim() &&
      host.contextType() === 'operation' &&
      host.getOperationStatus() === 'processing'
    ) {
      host.threadMode.set(true);
      this.subscribeToFirestoreJobEvents();
      return;
    }

    if (host.initialFiles().length > 0) {
      this.attachmentsFacade.pendingFiles.set([...host.initialFiles()]);
    }

    if (host.resumeOperationId().trim()) {
      void host.attachToResumedOperation({
        operationId: host.resumeOperationId().trim(),
        threadId: threadId || undefined,
        afterSeq: 0,
      });
      return;
    }

    if (host.initialMessage().trim() && !this.initialMessageSent()) {
      this.initialMessageSent.set(true);
      setTimeout(() => {
        const initialMessage = host.initialMessage().trim();
        if (!initialMessage) return;
        if (host.inputValue().trim().length > 0) {
          return;
        }
        void host.send({ text: initialMessage, preserveDraft: true });
      }, 150);
    }
  }

  handleDestroy(): void {
    const host = this.requireHost();
    this.messageFacade.clearPendingTypingDelta();
    const threadId = host.resolvedThreadId();
    if (threadId) {
      this.streamRegistry.detach(threadId);
    }
    if (!threadId || !this.streamRegistry.hasActiveStream(threadId)) {
      host.getActiveStream()?.abort();
    }
    host.setActiveStream(null);
    host.getActiveFirestoreSub()?.unsubscribe();
    host.setActiveFirestoreSub(null);
    host.getShadowFirestoreSub()?.unsubscribe();
    host.setShadowFirestoreSub(null);
  }

  resolveActiveThreadId(): string | null {
    const host = this.requireHost();
    const threadId = host.resolvedThreadId() ?? host.threadId().trim();
    return threadId && threadId.length > 0 ? threadId : null;
  }

  isFirestoreOperationId(value: string | null | undefined): value is string {
    const trimmed = value?.trim();
    if (!trimmed) return false;
    const bare = trimmed.startsWith('chat-') ? trimmed.slice(5) : trimmed;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare);
  }

  resolveFirestoreOperationId(): string | null {
    const host = this.requireHost();
    const candidates = [
      host.getCurrentOperationId(),
      host.resumeOperationId().trim() || null,
      host.contextId().trim() || null,
    ];

    for (const candidate of candidates) {
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return null;
  }

  subscribeToFirestoreJobEvents(
    explicitOperationId?: string,
    startAfterSeq?: number,
    deltaWatermark?: { optimisticChars: number; confirmedChars: number } | null
  ): void {
    const host = this.requireHost();
    const operationId = explicitOperationId ?? host.contextId();
    if (!operationId?.trim() || host.getActiveFirestoreSub()) return;

    this.transportFacade.beginResponseTurn('firestore-subscribe');

    this.logger.info('Attaching Firestore job event listener for background operation', {
      operationId,
      startAfterSeq,
    });
    this.breadcrumb.trackStateChange('operation-chat:firestore-subscribe', {
      operationId,
      startAfterSeq,
    });

    if (!this.messageFacade.messages().some((message) => message.id === 'typing')) {
      host.loading.set(true);
      this.messageFacade.messages.update((messages) => [
        ...messages,
        {
          id: 'typing',
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isTyping: true,
        },
      ]);
    }

    host.setActiveFirestoreSub(
      this.operationEventService.subscribe(
        operationId,
        {
          onDelta: (text) => {
            if (deltaWatermark) {
              const start = deltaWatermark.confirmedChars;
              deltaWatermark.confirmedChars += text.length;
              if (deltaWatermark.confirmedChars <= deltaWatermark.optimisticChars) {
                return;
              }
              const skipChars = Math.max(0, deltaWatermark.optimisticChars - start);
              const tail = skipChars > 0 ? text.slice(skipChars) : text;
              if (tail.length > 0) {
                deltaWatermark.optimisticChars += tail.length;
                this.messageFacade.queueTypingDelta(tail);
              }
              return;
            }
            this.messageFacade.queueTypingDelta(text);
          },
          onStep: (step) => {
            this.messageFacade.flushPendingTypingDelta();
            if (!step.label.trim()) return;
            this.messageFacade.messages.update((messages) =>
              messages.map((message) => {
                if (message.id !== 'typing') return message;
                const previousSteps = message.steps ?? [];
                const stepIndex = previousSteps.findIndex((candidate) => candidate.id === step.id);
                const nextSteps =
                  stepIndex >= 0
                    ? previousSteps.map((candidate, index) =>
                        index === stepIndex ? step : candidate
                      )
                    : [...previousSteps, step];
                return {
                  ...message,
                  steps: nextSteps,
                  parts: this.messageFacade.withUpsertedToolStepPart(message.parts, step),
                };
              })
            );
          },
          onCard: (card) => {
            this.messageFacade.flushPendingTypingDelta();
            this.messageFacade.messages.update((messages) =>
              messages.map((message) => {
                if (message.id !== 'typing') return message;
                const nextParts = [...(message.parts ?? [])];
                nextParts.push({ type: 'card', card });
                return {
                  ...message,
                  cards: [...(message.cards ?? []), card],
                  parts: nextParts,
                };
              })
            );
          },
          onMedia: (media) => {
            this.messageFacade.flushPendingTypingDelta();
            const mediaPart: AgentXMessagePart =
              media.type === 'video'
                ? { type: 'video', url: media.url }
                : { type: 'image', url: media.url };

            this.messageFacade.messages.update((messages) =>
              messages.map((message) =>
                message.id === 'typing'
                  ? { ...message, parts: [...(message.parts ?? []), mediaPart] }
                  : message
              )
            );
          },
          onProgress: (event) => {
            const message = typeof event.message === 'string' ? event.message.trim() : '';
            if (!message) return;
            host.latestProgressLabel.set(message);
          },
          onDone: (event) => {
            this.messageFacade.flushPendingTypingDelta();
            host.latestProgressLabel.set(null);
            this.messageFacade.finalizeStreamedAssistantMessage({
              streamingId: 'typing',
              messageId: event.messageId,
              success: event.success,
              source: 'firestore-done',
            });
            host.loading.set(false);
            host.getActiveFirestoreSub()?.unsubscribe();
            host.setActiveFirestoreSub(null);
            host.setStreamTurnWatermark(null);
            void this.haptics.notification('success');
            this.transportFacade.emitResponseCompleteOnce('firestore-done');
            this.logger.info('Background job stream complete (Firestore)', { operationId });
          },
          onError: (error) => {
            host.latestProgressLabel.set(null);
            this.messageFacade.replaceTyping({
              id: host.uid(),
              role: 'assistant',
              content: error || 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            host.loading.set(false);
            host.getActiveFirestoreSub()?.unsubscribe();
            host.setActiveFirestoreSub(null);
            host.setStreamTurnWatermark(null);
            void this.haptics.notification('error');
            this.logger.error('Background job stream error (Firestore)', new Error(error), {
              operationId,
            });
            this.transportFacade.emitResponseCompleteOnce('firestore-error');
          },
        },
        startAfterSeq !== undefined ? { startAfterSeq } : undefined
      )
    );
  }

  async loadThreadMessages(threadId: string): Promise<void> {
    const host = this.requireHost();
    host.loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: host.contextId() });

    try {
      const { messages: items, latestPausedYieldState } =
        await this.agentXService.getPersistedThreadMessages(threadId);
      const persistedPendingYieldState = this.coercePersistedYieldState(latestPausedYieldState);

      if (!items.length) {
        this.logger.warn('Operation thread returned no messages — preserving local state', {
          threadId,
          contextId: host.contextId(),
          hasPersistedYield: !!persistedPendingYieldState,
          localMessageCount: this.messageFacade.messages().length,
        });

        if (persistedPendingYieldState) {
          this.applyPendingYieldState(
            persistedPendingYieldState,
            threadId,
            'thread-metadata-empty'
          );
          return;
        }

        if (host.getOperationStatus() === 'error') {
          this.injectFailureMessage();
        }
        return;
      }

      const mapped: OperationMessage[] = items
        // Phase J (thread-as-truth): tool/system rows are persisted
        // for backend replay only — they must not render as chat
        // bubbles. Filter them out at the boundary.
        .filter(
          (message): message is typeof message & { role: 'user' | 'assistant' } =>
            message.role === 'user' || message.role === 'assistant'
        )
        .map((message) => {
          const persistedSteps: AgentXToolStep[] = (message.steps ?? []).filter(
            (step): step is AgentXToolStep =>
              typeof step.label === 'string' &&
              step.label.trim().length > 0 &&
              step.stageType === 'tool'
          );

          const persistedParts =
            message.parts?.map((part) =>
              part.type === 'tool-steps'
                ? {
                    type: 'tool-steps' as const,
                    steps: part.steps.filter(
                      (step): step is AgentXToolStep =>
                        typeof step.label === 'string' &&
                        step.label.trim().length > 0 &&
                        step.stageType === 'tool'
                    ),
                  }
                : part.type === 'card'
                  ? {
                      type: 'card' as const,
                      card: {
                        ...part.card,
                        agentId:
                          typeof (part.card as { agentId?: unknown }).agentId === 'string'
                            ? (part.card as { agentId: AgentXRichCard['agentId'] }).agentId
                            : 'router',
                      },
                    }
                  : part
            ) ?? [];

          const derivedMediaParts = this.extractMediaPartsFromPersistedMessage({
            content: message.content,
            resultData: message.resultData,
          });
          const mergedParts = this.mergeMediaParts(persistedParts, derivedMediaParts);

          // Derive the `cards` array from card-type parts so render methods
          // that read `message.cards` directly (messageCardsForBubble,
          // executionPlanCard, etc.) work correctly on reload — not just
          // during the live stream where cards are pushed to both arrays.
          const persistedCards: AgentXRichCard[] = mergedParts
            .filter((part): part is { type: 'card'; card: AgentXRichCard } => part.type === 'card')
            .map((part) => part.card);

          return {
            id: message.id ?? host.uid(),
            // Phase J (thread-as-truth): preserve role fidelity. The
            // chat session computed signal filters tool/system rows so
            // they don't render as visible bubbles — but they are kept
            // in the persisted feed so debugging/replay tooling can
            // surface them.
            role: message.role,
            operationId: typeof message.operationId === 'string' ? message.operationId : undefined,
            content: message.content.replace(/\n\n\[Attached (?:file|video): .+/gs, '').trim(),
            timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
            ...(persistedSteps.length > 0 ? { steps: persistedSteps } : {}),
            ...(mergedParts.length > 0 ? { parts: mergedParts } : {}),
            ...(persistedCards.length > 0 ? { cards: persistedCards } : {}),
            ...(typeof message.resultData?.['imageUrl'] === 'string'
              ? { imageUrl: message.resultData['imageUrl'] as string }
              : {}),
            ...(typeof message.resultData?.['videoUrl'] === 'string'
              ? { videoUrl: message.resultData['videoUrl'] as string }
              : {}),
            ...((message.attachments?.length ?? 0) > 0
              ? {
                  attachments: (message.attachments ?? []).map((attachment) => ({
                    url: attachment.url,
                    name: attachment.name,
                    type: (attachment.type === 'image'
                      ? 'image'
                      : attachment.type === 'video'
                        ? 'video'
                        : 'doc') as 'image' | 'video' | 'doc',
                  })),
                }
              : {}),
          };
        });

      const dedupedMapped = this.dedupeConsecutiveAssistantMessages(mapped);
      this.messageFacade.messages.set(dedupedMapped);

      const latestMessageOperationId = [...items]
        .reverse()
        .map((message) =>
          typeof message.operationId === 'string' ? message.operationId.trim() : ''
        )
        .find((id) => this.isFirestoreOperationId(id));
      if (latestMessageOperationId) {
        host.setCurrentOperationId(latestMessageOperationId);
      }

      if (persistedPendingYieldState) {
        this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata');
      }

      const activeYield = host.activeYieldState();
      if (activeYield) {
        this.messageFacade.upsertInlineYieldMessage(
          activeYield,
          host.getCurrentOperationId() ?? host.contextId()
        );
      }

      const hadUser = dedupedMapped.some((message) => message.role === 'user');
      if (hadUser && !host.hasUserSent()) {
        host.markUserMessageSent();
      }

      this.logger.info('Operation thread loaded', {
        threadId,
        contextId: host.contextId(),
        messageCount: dedupedMapped.length,
      });

      const hasAssistantReply = mapped.some(
        (message) => message.role === 'assistant' && message.content?.trim()
      );
      if (
        host.getOperationStatus() === 'processing' &&
        hasAssistantReply &&
        !host.activeYieldState()
      ) {
        let pendingYieldState: AgentYieldState | null = null;

        const operationId = this.resolveFirestoreOperationId();
        if (operationId) {
          const stored = await this.operationEventService.getStoredEventState(operationId);
          pendingYieldState = stored.latestYieldState;
        }

        if (pendingYieldState) {
          this.applyPendingYieldState(pendingYieldState, threadId, 'firestore-fallback');
        } else {
          this.logger.info(
            'Thread content proves job complete — reconciling stale in-progress status',
            {
              threadId,
              contextId: host.contextId(),
            }
          );
          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            threadId,
            'complete',
            new Date().toISOString()
          );
        }
      }

      if (
        host.getOperationStatus() === 'complete' ||
        (host.getOperationStatus() !== 'processing' && hasAssistantReply)
      ) {
        this.messageFacade.settleActiveToolSteps('success');
      } else if (
        host.getOperationStatus() === 'error' ||
        host.getOperationStatus() === 'paused' ||
        host.getOperationStatus() === 'awaiting_input' ||
        host.getOperationStatus() === 'awaiting_approval'
      ) {
        this.messageFacade.settleActiveToolSteps('error');
      }

      if (host.getOperationStatus() === 'error') {
        this.injectFailureMessage();
      }
    } catch (error) {
      this.logger.error('Failed to load operation thread', error, {
        threadId,
        contextId: host.contextId(),
      });
      this.messageFacade.pushMessage({
        id: host.uid(),
        role: 'assistant',
        content: 'Failed to load this conversation. You can still continue here.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      host.loading.set(false);
    }
  }

  private initializeExistingThread(threadId: string): void {
    const host = this.requireHost();
    host.threadMode.set(true);
    host.resolvedThreadId.set(threadId);

    const snapshot = this.streamRegistry.claim(threadId, {
      onDelta: (text) => {
        this.messageFacade.queueTypingDelta(text);
      },
      onStep: (step) => {
        this.messageFacade.flushPendingTypingDelta();
        if (!step.label.trim()) return;
        this.messageFacade.messages.update((messages) =>
          messages.map((message) => {
            if (message.id !== 'typing') return message;
            const previousSteps = message.steps ?? [];
            const stepIndex = previousSteps.findIndex((candidate) => candidate.id === step.id);
            const nextSteps =
              stepIndex >= 0
                ? previousSteps.map((candidate, index) => (index === stepIndex ? step : candidate))
                : [...previousSteps, step];
            return {
              ...message,
              steps: nextSteps,
              parts: this.messageFacade.withUpsertedToolStepPart(message.parts, step),
            };
          })
        );
      },
      onCard: (card) => {
        this.messageFacade.flushPendingTypingDelta();
        this.messageFacade.messages.update((messages) =>
          messages.map((message) => {
            if (message.id !== 'typing') return message;
            const nextParts = [...(message.parts ?? [])];
            nextParts.push({ type: 'card', card });
            return {
              ...message,
              cards: [...(message.cards ?? []), card],
              parts: nextParts,
            };
          })
        );
      },
      onDone: (event) => {
        this.messageFacade.flushPendingTypingDelta();
        this.messageFacade.finalizeStreamedAssistantMessage({
          streamingId: 'typing',
          messageId:
            event != null && typeof event['messageId'] === 'string'
              ? event['messageId']
              : undefined,
          success:
            event != null && typeof event['success'] === 'boolean' ? event['success'] : undefined,
          source: 'stream-registry-done',
        });
        host.loading.set(false);
        void this.haptics.notification('success');
        this.transportFacade.emitResponseCompleteOnce('stream-registry-done');
      },
      onError: (error) => {
        this.messageFacade.replaceTyping({
          id: host.uid(),
          role: 'assistant',
          content: error || 'Something went wrong. Please try again.',
          timestamp: new Date(),
          error: true,
        });
        host.loading.set(false);
        void this.haptics.notification('error');
      },
    });

    if (snapshot) {
      this.logger.info('Rehydrating from stream registry', {
        threadId,
        contentLength: snapshot.content.length,
        done: snapshot.done,
      });

      void this.loadThreadMessages(threadId).then(() => {
        const fresh = this.streamRegistry.getSnapshot(threadId);
        if (!fresh) return;

        if (fresh.done) {
          if (fresh.error) {
            this.messageFacade.messages.update((messages) => [
              ...messages,
              {
                id: host.uid(),
                role: 'assistant',
                content: fresh.error || 'Something went wrong.',
                timestamp: new Date(),
                error: true,
              },
            ]);
          }
          return;
        }

        if (fresh.content || fresh.steps.length || fresh.cards.length) {
          this.messageFacade.messages.update((messages) => {
            // Guard: if a finalized (non-typing) assistant message already has
            // this exact content, the operation completed before we arrived
            // here. Adding a second bubble would show the answer twice.
            if (
              fresh.content?.trim() &&
              messages.some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  m.content?.trim() === fresh.content.trim()
              )
            ) {
              return messages;
            }

            // Guard: never add a second typing bubble.
            if (messages.some((m) => m.id === 'typing')) return messages;

            return [
              ...messages,
              {
                id: 'typing',
                role: 'assistant',
                content: fresh.content,
                timestamp: new Date(),
                isTyping: !fresh.content,
                steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                cards: fresh.cards.length > 0 ? [...fresh.cards] : undefined,
                parts: fresh.parts.length > 0 ? [...fresh.parts] : undefined,
              },
            ];
          });
        }
        host.loading.set(true);
      });
      return;
    }

    if (
      host.contextId().trim() &&
      host.contextType() === 'operation' &&
      host.getOperationStatus() === 'processing'
    ) {
      const operationId = this.resolveFirestoreOperationId();
      void this.loadThreadMessages(threadId).then(async () => {
        if (!operationId) {
          this.logger.warn('Skipping Firestore operation rehydrate: no valid operationId', {
            contextId: host.contextId(),
            threadId,
          });
          return;
        }

        const hasAssistantReply = this.messageFacade
          .messages()
          .some(
            (message) =>
              !message.isTyping && message.role === 'assistant' && message.content?.trim()
          );

        if (hasAssistantReply) {
          this.logger.info('Thread already has assistant reply — skipping Firestore subscribe', {
            operationId,
          });
          return;
        }

        const stored = await this.operationEventService.getStoredEventState(operationId);

        if (stored.latestYieldState) {
          host.activeYieldState.set(stored.latestYieldState);
          host.yieldResolved.set(false);
          this.messageFacade.upsertInlineYieldMessage(stored.latestYieldState, operationId);
        }

        if (stored.isDone) {
          const alreadyHasAssistant = this.messageFacade
            .messages()
            .some(
              (message) =>
                !message.isTyping && message.role === 'assistant' && message.content?.trim()
            );
          if (
            !alreadyHasAssistant &&
            stored.content &&
            !this.messageFacade
              .messages()
              .some(
                (message) =>
                  message.role === 'assistant' &&
                  !message.isTyping &&
                  this.normalizeMessageContent(message.content) ===
                    this.normalizeMessageContent(stored.content)
              )
          ) {
            this.messageFacade.messages.update((messages) => [
              ...messages,
              {
                id: host.uid(),
                role: 'assistant',
                content: stored.content,
                timestamp: new Date(),
                isTyping: false,
                steps: stored.steps.length > 0 ? stored.steps : undefined,
              },
            ]);
          }
          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            host.threadId().trim() || operationId,
            'complete',
            new Date().toISOString()
          );
          return;
        }

        const storedParts: AgentXMessagePart[] = [];
        if (stored.steps.length > 0) {
          storedParts.push({ type: 'tool-steps', steps: stored.steps });
        }
        if (stored.content) {
          storedParts.push({ type: 'text', content: stored.content });
        }
        this.messageFacade.messages.update((messages) => {
          if (messages.some((message) => message.id === 'typing')) return messages;
          return [
            ...messages,
            {
              id: 'typing',
              role: 'assistant',
              content: stored.content,
              timestamp: new Date(),
              isTyping: !stored.content,
              steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
              parts: storedParts.length > 0 ? storedParts : undefined,
            },
          ];
        });
        host.loading.set(true);
        this.subscribeToFirestoreJobEvents(undefined, stored.maxSeq);
      });
      return;
    }

    void this.loadThreadMessages(threadId).then(async () => {
      const pendingStatus =
        host.getOperationStatus() === 'paused' ||
        host.getOperationStatus() === 'awaiting_input' ||
        host.getOperationStatus() === 'awaiting_approval';
      const operationId = this.resolveFirestoreOperationId();
      if (!pendingStatus || !operationId) return;

      const stored = await this.operationEventService.getStoredEventState(operationId);
      if (!stored.latestYieldState) return;

      host.activeYieldState.set(stored.latestYieldState);
      host.yieldResolved.set(false);
      this.messageFacade.upsertInlineYieldMessage(stored.latestYieldState, operationId);
    });
  }

  private inferOperationStatusFromYield(
    yieldState: AgentYieldState
  ): 'paused' | 'awaiting_input' | 'awaiting_approval' {
    if (yieldState.reason === 'needs_approval') return 'awaiting_approval';
    if (yieldState.pendingToolCall?.toolName === 'resume_paused_operation') return 'paused';
    return 'awaiting_input';
  }

  private coercePersistedYieldState(value: unknown): AgentYieldState | null {
    if (!value || typeof value !== 'object') return null;

    const candidate = value as Partial<AgentYieldState>;
    if (typeof candidate.reason !== 'string') return null;
    if (!candidate.pendingToolCall || typeof candidate.pendingToolCall.toolName !== 'string') {
      return null;
    }

    return candidate as AgentYieldState;
  }

  private applyPendingYieldState(
    yieldState: AgentYieldState,
    threadId: string,
    source: string
  ): void {
    const host = this.requireHost();
    const pendingStatus = this.inferOperationStatusFromYield(yieldState);
    host.activeYieldState.set(yieldState);
    host.yieldResolved.set(false);
    this.messageFacade.upsertInlineYieldMessage(
      yieldState,
      this.resolveYieldOperationId(yieldState)
    );
    host.setOperationStatus(pendingStatus);

    this.logger.info('Applied pending yield state on thread load', {
      threadId,
      contextId: host.contextId(),
      source,
      pendingStatus,
      reason: yieldState.reason,
      toolName: yieldState.pendingToolCall?.toolName,
    });
  }

  private resolveYieldOperationId(yieldState?: AgentYieldState | null): string {
    const host = this.requireHost();
    const toolInputOperationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : null;

    const candidates = [
      toolInputOperationId,
      host.getCurrentOperationId()?.trim() || undefined,
      host.resumeOperationId().trim() || undefined,
      this.resolveFirestoreOperationId() ?? undefined,
      host.contextId().trim() || undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return candidates.find((candidate): candidate is string => !!candidate) ?? host.contextId();
  }

  private injectFailureMessage(): void {
    const host = this.requireHost();
    const reason = host.errorMessage() || 'an unexpected error';
    this.messageFacade.pushMessage({
      id: host.uid(),
      role: 'assistant',
      content:
        `This operation was unable to complete due to ${reason}.\n\n` +
        `You can retry below, or dismiss and start a new request.`,
      timestamp: new Date(),
      error: true,
    });
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private inferMediaType(url: string, mimeType?: string): 'image' | 'video' | null {
    const lowerMime = (mimeType ?? '').toLowerCase();
    if (lowerMime.startsWith('image/')) return 'image';
    if (lowerMime.startsWith('video/')) return 'video';

    const lowerUrl = url.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(lowerUrl)) return 'image';
    if (/\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(?:\?|#|$)/i.test(lowerUrl)) return 'video';
    if (/videodelivery\.net\//i.test(lowerUrl)) return 'video';
    return null;
  }

  private extractMediaUrlsFromText(content: string): readonly AgentXStreamMediaEvent[] {
    if (!content.trim()) return [];
    const seen = new Set<string>();
    const media: AgentXStreamMediaEvent[] = [];
    const matches = content.match(/https?:\/\/[^\s)\]"']+/gi) ?? [];
    for (const rawUrl of matches) {
      const url = rawUrl.trim();
      if (!url || !this.isHttpUrl(url)) continue;
      const type = this.inferMediaType(url);
      if (!type) continue;
      const key = `${type}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      media.push({ type, url });
    }
    return media;
  }

  private extractMediaPartsFromPersistedMessage(message: {
    content: string;
    resultData?: Record<string, unknown> | null;
  }): AgentXMessagePart[] {
    const mediaEvents: AgentXStreamMediaEvent[] = [];
    const seen = new Set<string>();

    const push = (urlValue: unknown, mimeTypeValue?: unknown, forcedType?: 'image' | 'video') => {
      if (typeof urlValue !== 'string') return;
      const url = urlValue.trim();
      if (!url || !this.isHttpUrl(url)) return;
      const mimeType = typeof mimeTypeValue === 'string' ? mimeTypeValue : undefined;
      const type = forcedType ?? this.inferMediaType(url, mimeType);
      if (!type) return;
      const key = `${type}|${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      mediaEvents.push({ type, url, ...(mimeType ? { mimeType } : {}) });
    };

    const resultData = message.resultData;
    if (resultData && typeof resultData === 'object') {
      push(resultData['imageUrl'], resultData['mimeType'], 'image');
      push(resultData['videoUrl'], resultData['mimeType'], 'video');
      push(resultData['url'], resultData['mimeType']);
      push(resultData['publicUrl'], resultData['mimeType']);
      push(resultData['downloadUrl'], resultData['mimeType']);

      const imageUrls = resultData['imageUrls'];
      if (Array.isArray(imageUrls)) {
        for (const url of imageUrls) push(url, resultData['mimeType'], 'image');
      }

      const videoUrls = resultData['videoUrls'];
      if (Array.isArray(videoUrls)) {
        for (const url of videoUrls) push(url, resultData['mimeType'], 'video');
      }
    }

    const textMedias = this.extractMediaUrlsFromText(message.content);
    for (const media of textMedias) {
      push(media.url, media.mimeType, media.type);
    }

    return mediaEvents.map((media) =>
      media.type === 'video'
        ? ({ type: 'video', url: media.url } as const)
        : ({ type: 'image', url: media.url } as const)
    );
  }

  private mergeMediaParts(
    parts: readonly AgentXMessagePart[],
    mediaParts: readonly AgentXMessagePart[]
  ): AgentXMessagePart[] {
    if (mediaParts.length === 0) return [...parts];
    const merged = [...parts];
    const existing = new Set(
      parts
        .filter((part) => part.type === 'image' || part.type === 'video')
        .map((part) => `${part.type}|${part.url}`)
    );

    for (const mediaPart of mediaParts) {
      if (mediaPart.type !== 'image' && mediaPart.type !== 'video') continue;
      const key = `${mediaPart.type}|${mediaPart.url}`;
      if (existing.has(key)) continue;
      existing.add(key);
      merged.push(mediaPart);
    }

    return merged;
  }

  private requireHost(): AgentXOperationChatSessionFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatSessionFacade used before configure()');
    }

    return this.host;
  }
}
