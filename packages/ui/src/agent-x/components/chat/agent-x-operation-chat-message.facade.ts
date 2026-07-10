import { Injectable, PLATFORM_ID, inject, signal, type Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createAgentXApi,
  type AgentXApi,
  type AgentXAskUserPayload,
  type AgentXBillingActionPayload,
  type AgentXBillingActionReason,
  type AgentXToolStep,
  type AgentXMessagePart,
  type AgentXRichCard,
} from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import type { AgentXFeedbackSubmitEvent } from '../modals/agent-x-feedback-modal.component';
import type { AgentYieldState } from '@nxt1/core';
import type {
  MessageAttachment,
  OperationMessage,
  PendingUndoState,
} from './agent-x-operation-chat.models';
import { stripDistilledSectionTransitionLines } from './agent-x-operation-chat.utils';

export interface AgentXOperationChatMessageFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly resolvedThreadId: Signal<string | null>;
  resolveActiveThreadId(): string | null;
  loadThreadMessages(threadId: string): Promise<void>;
  attachToResumedOperation(params: {
    operationId: string;
    threadId?: string;
    afterSeq?: number;
  }): Promise<void>;
}

@Injectable()
export class AgentXOperationChatMessageFacade {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatMessage');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

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

  readonly messages = signal<OperationMessage[]>([]);
  readonly editingMessageId = signal<string | null>(null);
  readonly editingMessageDraft = signal('');
  readonly feedbackTargetMessageId = signal<string | null>(null);
  readonly feedbackDefaultRating = signal<1 | 2 | 3 | 4 | 5>(5);
  readonly pendingUndoState = signal<PendingUndoState | null>(null);
  readonly undoBannerTriggerId = signal(0);

  private pendingTypingDelta = '';
  private pendingTypingFlushFrame: number | null = null;
  private readonly pendingTypingFlushCallbacks = new Set<() => void>();
  private host: AgentXOperationChatMessageFacadeHost | null = null;

  configure(host: AgentXOperationChatMessageFacadeHost): void {
    this.host = host;
  }

  pushMessage(message: OperationMessage): void {
    this.messages.update((previous) => {
      // Sentinel-id dedup: only one row may carry id === 'typing' at a time.
      // Multiple call sites (run-control send, yield resume, sse-fallback,
      // reconnect rehydrate) push typing bubbles independently, so guard here
      // to keep @for track unique and avoid NG0955.
      if (message.id === 'typing' && previous.some((entry) => entry.id === 'typing')) {
        return previous;
      }
      return [...previous, message];
    });
  }

  pushOptimisticUserReply(params: {
    readonly operationId: string;
    readonly content: string;
    readonly messageId?: string;
    readonly attachments?: readonly MessageAttachment[];
  }): void {
    const content = params.content.trim();
    const operationId = params.operationId.trim();
    if (!content || !operationId) return;

    const id = `ask-user-reply:${operationId}:${params.messageId?.trim() || content}`;
    this.messages.update((previous) => {
      const alreadyPresent = previous.some(
        (message) =>
          message.id === id ||
          (message.role === 'user' &&
            message.operationId === operationId &&
            message.content.trim() === content)
      );
      if (alreadyPresent) return previous;

      return [
        ...previous,
        {
          id,
          role: 'user',
          content,
          timestamp: new Date(),
          operationId,
          ...(params.attachments?.length ? { attachments: [...params.attachments] } : {}),
        },
      ];
    });
  }

  stampLatestUserMessageOperationId(params: {
    readonly operationId: string;
    readonly idempotencyKey?: string;
  }): void {
    const operationId = params.operationId.trim();
    if (!operationId) return;

    const findLastMatchingIndex = (
      messages: readonly OperationMessage[],
      predicate: (message: OperationMessage) => boolean
    ): number => {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message && predicate(message)) return index;
      }
      return -1;
    };

    this.messages.update((previous) => {
      const preferredIndex = params.idempotencyKey
        ? findLastMatchingIndex(
            previous,
            (message) => message.role === 'user' && message.idempotencyKey === params.idempotencyKey
          )
        : -1;
      const fallbackIndex = findLastMatchingIndex(
        previous,
        (message) => message.role === 'user' && !message.operationId?.trim()
      );
      const targetIndex = preferredIndex >= 0 ? preferredIndex : fallbackIndex;
      if (targetIndex < 0) return previous;

      const target = previous[targetIndex];
      if (!target || target.operationId === operationId) return previous;

      return previous.map((message, index) =>
        index === targetIndex ? { ...message, operationId } : message
      );
    });
  }

  replaceTyping(message: OperationMessage): void {
    this.clearPendingTypingDelta();
    this.messages.update((previous) => [
      ...previous.filter((entry) => entry.id !== 'typing'),
      message,
    ]);
  }

  settleActiveToolSteps(status: 'success' | 'error'): void {
    this.messages.update((messages) =>
      messages.map((message) => {
        const hasActiveSteps = message.steps?.some((step) => step.status === 'active');
        const hasActiveParts = message.parts?.some(
          (part) =>
            part.type === 'tool-steps' && part.steps.some((step) => step.status === 'active')
        );
        if (!hasActiveSteps && !hasActiveParts) return message;

        const finalizeStep = (step: AgentXToolStep): AgentXToolStep =>
          step.status === 'active' ? { ...step, status } : step;

        return {
          ...message,
          steps: message.steps?.map(finalizeStep),
          parts: message.parts?.map((part) =>
            part.type === 'tool-steps' ? { ...part, steps: part.steps.map(finalizeStep) } : part
          ),
        };
      })
    );
  }

  finalizeStreamedAssistantMessage(params: {
    streamingId: string;
    messageId?: string;
    success?: boolean;
    threadId?: string;
    source: string;
  }): void {
    const host = this.requireHost();
    const streamedMessage = this.messages().find((message) => message.id === params.streamingId);
    const hasVisibleContent =
      Boolean(streamedMessage?.content.trim()) ||
      Boolean(streamedMessage?.parts?.length) ||
      Boolean(streamedMessage?.cards?.length) ||
      Boolean(streamedMessage?.steps?.length);
    const hasVisibleRichCard =
      Boolean(streamedMessage?.cards?.length) ||
      Boolean(streamedMessage?.parts?.some((part) => part.type === 'card'));

    const persistedMessageId =
      typeof params.messageId === 'string' && this.isPersistedMessageId(params.messageId)
        ? params.messageId
        : null;

    this.settleActiveToolSteps(params.success === false ? 'error' : 'success');

    if (persistedMessageId) {
      this.messages.update((messages) =>
        messages.some(
          (message) => message.id === persistedMessageId && message.id !== params.streamingId
        )
          ? messages.filter((message) => message.id !== params.streamingId)
          : messages.map((message) =>
              message.id === params.streamingId
                ? { ...message, id: persistedMessageId, isTyping: false }
                : message
            )
      );

      // Rehydrate the persisted assistant row immediately so final attachments
      // (video + thumbnailUrl poster) render without requiring app reload.
      const resolvedThreadId =
        (typeof params.threadId === 'string' && params.threadId.trim().length > 0
          ? params.threadId.trim()
          : null) ??
        host.resolvedThreadId() ??
        (host.threadId().trim() || null);

      if (resolvedThreadId) {
        void host.loadThreadMessages(resolvedThreadId).catch((error) => {
          this.logger.error(
            'Failed to reload thread after persisted assistant message ID swap',
            error,
            {
              source: params.source,
              contextId: host.contextId(),
              threadId: resolvedThreadId,
              messageId: persistedMessageId,
            }
          );
        });
      }
      return;
    }

    if (params.success === false) {
      const localFailureId = this.uid();
      this.messages.update((messages) =>
        messages.map((message) =>
          message.id === params.streamingId
            ? { ...message, id: localFailureId, isTyping: false }
            : message
        )
      );
      return;
    }

    if (hasVisibleRichCard) {
      const localSuccessId = this.uid();
      this.logger.warn(
        'Keeping local rich-card assistant message without persisted DB message ID',
        {
          source: params.source,
          contextId: host.contextId(),
          contextType: host.contextType(),
          streamingId: params.streamingId,
          threadId:
            (typeof params.threadId === 'string' && params.threadId.trim().length > 0
              ? params.threadId.trim()
              : null) ??
            host.resolvedThreadId() ??
            (host.threadId().trim() || null),
        }
      );

      this.messages.update((messages) =>
        messages.map((message) =>
          message.id === params.streamingId
            ? {
                ...message,
                id: localSuccessId,
                isTyping: false,
              }
            : message
        )
      );
      return;
    }

    const resolvedThreadId =
      (typeof params.threadId === 'string' && params.threadId.trim().length > 0
        ? params.threadId.trim()
        : null) ??
      host.resolvedThreadId() ??
      (host.threadId().trim() || null);

    this.logger.error(
      'Successful streamed assistant completion missing persisted DB message ID',
      new Error('Missing persisted DB message ID'),
      {
        source: params.source,
        contextId: host.contextId(),
        contextType: host.contextType(),
        streamingId: params.streamingId,
        threadId: resolvedThreadId,
      }
    );

    this.messages.update((messages) =>
      messages.map((message) =>
        message.id === params.streamingId
          ? {
              ...message,
              id: this.uid(),
              isTyping: false,
              content: hasVisibleContent
                ? message.content
                : 'Resumed. Waiting for synced updates from Agent X…',
            }
          : message
      )
    );

    if (resolvedThreadId) {
      void host.loadThreadMessages(resolvedThreadId).catch((error) => {
        this.logger.error('Failed to reload persisted thread after missing DB message ID', error, {
          source: params.source,
          contextId: host.contextId(),
          threadId: resolvedThreadId,
        });
      });
    }
  }

  withUpsertedToolStepPart(
    parts: readonly AgentXMessagePart[] | undefined,
    step: AgentXToolStep
  ): AgentXMessagePart[] {
    const nextParts = [...(parts ?? [])];

    for (let index = 0; index < nextParts.length; index += 1) {
      const part = nextParts[index];
      if (part?.type !== 'tool-steps') continue;
      const stepIndex = part.steps.findIndex((candidate) => candidate.id === step.id);
      if (stepIndex < 0) continue;
      const nextSteps = [...part.steps];
      nextSteps[stepIndex] = step;
      nextParts[index] = { type: 'tool-steps', steps: nextSteps };
      return nextParts;
    }

    const lastPart = nextParts[nextParts.length - 1];
    if (lastPart?.type === 'tool-steps') {
      nextParts[nextParts.length - 1] = {
        type: 'tool-steps',
        steps: [...lastPart.steps, step],
      };
      return nextParts;
    }

    nextParts.push({ type: 'tool-steps', steps: [step] });
    return nextParts;
  }

  queueTypingDelta(text: string, afterFlush?: () => void): void {
    const filteredText = stripDistilledSectionTransitionLines(text);
    if (!filteredText) return;
    this.pendingTypingDelta += filteredText;
    if (afterFlush) this.pendingTypingFlushCallbacks.add(afterFlush);

    if (this.pendingTypingFlushFrame !== null) return;

    if (isPlatformBrowser(this.platformId) && typeof requestAnimationFrame === 'function') {
      this.pendingTypingFlushFrame = requestAnimationFrame(() => {
        this.pendingTypingFlushFrame = null;
        this.flushPendingTypingDelta();
      });
      return;
    }

    this.flushPendingTypingDelta();
  }

  flushPendingTypingDelta(): void {
    if (!this.pendingTypingDelta) return;

    const delta = this.pendingTypingDelta;
    this.pendingTypingDelta = '';

    this.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;
        const nextParts = [...(message.parts ?? [])];
        const last = nextParts[nextParts.length - 1];
        if (last?.type === 'text') {
          nextParts[nextParts.length - 1] = { type: 'text', content: last.content + delta };
        } else {
          nextParts.push({ type: 'text', content: delta });
        }
        return { ...message, content: message.content + delta, isTyping: false, parts: nextParts };
      })
    );
    this.runPendingTypingFlushCallbacks();
  }

  retireActiveTypingCarrier(operationId?: string): void {
    this.flushPendingTypingDelta();

    this.messages.update((messages) => this.retireTypingCarrier(messages, operationId));
  }

  drainBufferedTypingDelta(): string {
    const delta = this.pendingTypingDelta;
    this.pendingTypingDelta = '';
    this.pendingTypingFlushCallbacks.clear();
    if (this.pendingTypingFlushFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.pendingTypingFlushFrame);
      }
      this.pendingTypingFlushFrame = null;
    }
    return delta;
  }

  private normalizeMessageText(value: string | undefined | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private isPlainDuplicateAssistantPrelude(
    previous: OperationMessage,
    current: OperationMessage
  ): boolean {
    if (previous.role !== 'assistant' || current.role !== 'assistant') return false;
    if (previous.yieldState || current.yieldState) return false;
    if (previous.cards?.length || previous.attachments?.length) return false;

    const previousText = this.normalizeMessageText(previous.content);
    const currentText = this.normalizeMessageText(current.content);
    if (!previousText || !currentText) return false;
    if (previousText !== currentText && !currentText.startsWith(previousText)) return false;

    const previousOperationId = previous.operationId?.trim() ?? '';
    const currentOperationId = current.operationId?.trim() ?? '';
    return (
      !previousOperationId || !currentOperationId || previousOperationId === currentOperationId
    );
  }

  private removeDuplicateAssistantPreludeBeforeCommittedTyping(
    rows: readonly OperationMessage[],
    committedId: string
  ): OperationMessage[] {
    const committedIndex = rows.findIndex((message) => message.id === committedId);
    if (committedIndex <= 0) return [...rows];

    const committed = rows[committedIndex];
    const previous = rows[committedIndex - 1];
    if (!committed || !previous) return [...rows];
    if (!this.isPlainDuplicateAssistantPrelude(previous, committed)) return [...rows];

    return rows.filter((_, index) => index !== committedIndex - 1);
  }

  clearPendingTypingDelta(): void {
    this.pendingTypingDelta = '';
    this.pendingTypingFlushCallbacks.clear();
    if (this.pendingTypingFlushFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.pendingTypingFlushFrame);
    }
    this.pendingTypingFlushFrame = null;
  }

  private runPendingTypingFlushCallbacks(): void {
    if (this.pendingTypingFlushCallbacks.size === 0) return;
    const callbacks = [...this.pendingTypingFlushCallbacks];
    this.pendingTypingFlushCallbacks.clear();
    callbacks.forEach((callback) => callback());
  }

  openFeedbackModal(message: OperationMessage): void {
    const host = this.requireHost();
    if (!this.isPersistedMessageId(message.id) || message.role !== 'assistant') return;

    this.logger.info('Opening message feedback modal', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
    });
    this.breadcrumb.trackUserAction('agent-x-message-feedback-opened', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_FEEDBACK_OPENED, {
      contextId: host.contextId(),
      contextType: host.contextType(),
    });

    this.feedbackTargetMessageId.set(message.id);
    this.feedbackDefaultRating.set(5);
  }

  closeFeedbackModal(): void {
    this.feedbackTargetMessageId.set(null);
  }

  async submitMessageFeedbackFromModal(event: AgentXFeedbackSubmitEvent): Promise<void> {
    const host = this.requireHost();
    const messageId = this.feedbackTargetMessageId();
    const threadId = host.resolveActiveThreadId();
    if (!messageId || !threadId) return;

    this.logger.info('Submitting message feedback', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId,
      threadId,
      rating: event.rating,
      category: event.category ?? null,
    });
    this.breadcrumb.trackUserAction('agent-x-message-feedback-submit', {
      contextId: host.contextId(),
      messageId,
      rating: event.rating,
      category: event.category ?? null,
    });

    try {
      const result = await this.api.submitMessageFeedback(messageId, {
        threadId,
        rating: event.rating,
        category: event.category,
        text: event.text,
      });

      if (!result.success) {
        this.logger.warn('Message feedback submission rejected', {
          contextId: host.contextId(),
          contextType: host.contextType(),
          messageId,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to submit feedback');
        return;
      }

      this.closeFeedbackModal();
      await this.haptics.impact('light');
      this.toast.success('Feedback submitted');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_FEEDBACK_SUBMITTED, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        rating: event.rating,
        feedbackCategory: event.category ?? undefined,
      });
    } catch (error) {
      this.logger.error('Message feedback submission failed', error, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        messageId,
        threadId,
      });
      this.toast.error('Failed to submit feedback');
    }
  }

  isEditingMessage(messageId: string): boolean {
    return this.editingMessageId() === messageId;
  }

  startEditingMessage(message: OperationMessage): void {
    const host = this.requireHost();
    if (message.role !== 'user' || !this.isPersistedMessageId(message.id)) return;

    this.logger.info('Opening inline message editor', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
    });
    this.breadcrumb.trackUserAction('agent-x-message-edit-started', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_EDIT_STARTED, {
      contextId: host.contextId(),
      contextType: host.contextType(),
    });

    this.editingMessageId.set(message.id);
    this.editingMessageDraft.set(message.content);
  }

  cancelEditingMessage(): void {
    this.editingMessageId.set(null);
    this.editingMessageDraft.set('');
  }

  async saveEditedMessage(message: OperationMessage, nextText: string): Promise<void> {
    const host = this.requireHost();
    const trimmed = nextText.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      this.cancelEditingMessage();
      return;
    }

    const threadId = host.resolveActiveThreadId();
    if (!threadId) {
      this.toast.error('Unable to edit message without thread context');
      return;
    }

    this.logger.info('Saving inline message edit', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      threadId,
      length: trimmed.length,
    });
    this.breadcrumb.trackUserAction('agent-x-message-edit-submit', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      threadId,
    });

    try {
      const result = await this.api.editMessage(message.id, {
        message: trimmed,
        threadId,
        reason: 'user_edit',
      });

      if (!result.success || !result.data) {
        this.logger.warn('Message edit rejected by backend', {
          contextId: host.contextId(),
          contextType: host.contextType(),
          messageId: message.id,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to edit message');
        return;
      }

      this.messages.update((messages) =>
        messages.map((entry) => (entry.id === message.id ? { ...entry, content: trimmed } : entry))
      );
      this.cancelEditingMessage();

      await this.haptics.notification('success');
      this.toast.success('Message edited. Regenerating response...');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_EDIT_SAVED, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        rerunEnqueued: !!result.data.rerunEnqueued,
      });

      if (result.data.rerunEnqueued && result.data.operationId) {
        await host.attachToResumedOperation({
          operationId: result.data.operationId,
          threadId,
        });
      }
    } catch (error) {
      this.logger.error('Saving inline message edit failed', error, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        messageId: message.id,
        threadId,
      });
      this.toast.error('Failed to edit message');
    }
  }

  async deleteMessage(message: OperationMessage): Promise<void> {
    const host = this.requireHost();
    if (!this.isPersistedMessageId(message.id)) return;
    const threadId = host.resolveActiveThreadId();
    if (!threadId) {
      this.toast.error('Unable to delete message without thread context');
      return;
    }

    this.logger.info('Deleting operation chat message', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      threadId,
      deleteResponse: message.role === 'user',
    });
    this.breadcrumb.trackUserAction('agent-x-message-delete', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      threadId,
    });

    try {
      const result = await this.api.deleteMessage(message.id, {
        threadId,
        deleteResponse: message.role === 'user',
      });

      if (!result.success || !result.data) {
        this.logger.warn('Message delete rejected by backend', {
          contextId: host.contextId(),
          contextType: host.contextType(),
          messageId: message.id,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to delete message');
        return;
      }

      this.messages.update((messages) =>
        messages.filter(
          (entry) =>
            entry.id !== result.data?.messageId &&
            entry.id !== (result.data?.deletedResponseMessageId ?? '__none__')
        )
      );

      await this.haptics.impact('light');

      this.pendingUndoState.set({
        messageId: message.id,
        restoreTokenId: result.data.restoreTokenId,
        threadId,
      });
      this.undoBannerTriggerId.update((value) => value + 1);
      this.toast.success('Message deleted');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_DELETED, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        deleteResponse: message.role === 'user',
      });
    } catch (error) {
      this.logger.error('Delete message action failed', error, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        messageId: message.id,
        threadId,
      });
      this.toast.error('Failed to delete message');
    }
  }

  clearUndoState(): void {
    this.pendingUndoState.set(null);
  }

  async undoDeletedMessage(): Promise<void> {
    const host = this.requireHost();
    const undoState = this.pendingUndoState();
    if (!undoState) return;

    this.logger.info('Restoring deleted operation chat message', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: undoState.messageId,
      threadId: undoState.threadId,
    });
    this.breadcrumb.trackUserAction('agent-x-message-undo', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: undoState.messageId,
      threadId: undoState.threadId,
    });

    try {
      const undoResult = await this.api.undoMessage(undoState.messageId, {
        restoreTokenId: undoState.restoreTokenId,
      });

      if (!undoResult.success) {
        this.logger.warn('Undo message rejected by backend', {
          contextId: host.contextId(),
          contextType: host.contextType(),
          messageId: undoState.messageId,
          threadId: undoState.threadId,
          error: undoResult.error ?? null,
        });
        this.toast.error(undoResult.error ?? 'Failed to restore message');
        return;
      }

      await host.loadThreadMessages(undoState.threadId);
      this.clearUndoState();
      this.toast.success('Message restored');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_UNDONE, {
        contextId: host.contextId(),
        contextType: host.contextType(),
      });
    } catch (error) {
      this.logger.error('Undo message action failed', error, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        messageId: undoState.messageId,
        threadId: undoState.threadId,
      });
      this.toast.error('Failed to restore message');
    }
  }

  upsertInlineYieldMessage(yieldState: AgentYieldState, operationId: string): void {
    this.flushPendingTypingDelta();

    const messageId = this.inlineYieldMessageId(yieldState, operationId);
    const incomingKey = this.yieldIdentityKey(yieldState);
    const promptText = this.normalizeYieldPrompt(yieldState.promptToUser);
    const separatesTypingPayload =
      yieldState.reason === 'needs_input' || yieldState.reason === 'needs_approval';

    this.messages.update((messages) => {
      const isActionableApprovalCard = (card: AgentXRichCard): boolean => {
        if (card.type !== 'confirmation') return false;
        const payload = card.payload as Record<string, unknown> | undefined;
        if (!payload || typeof payload !== 'object') return false;
        const hasApprovalId =
          typeof payload['approvalId'] === 'string' && payload['approvalId'].length > 0;
        if (!hasApprovalId) return false;
        const actions = payload['actions'];
        return Array.isArray(actions) && actions.length > 0;
      };
      const typingIndex = messages.findIndex((message) => message.id === 'typing');
      const typingMessage = typingIndex >= 0 ? messages[typingIndex] : undefined;
      const carriedParts = typingMessage?.parts?.filter(
        (part) => part.type !== 'card' || !isActionableApprovalCard(part.card)
      );
      const carriedCards = typingMessage?.cards?.filter((card) => !isActionableApprovalCard(card));
      const hasCarriedTypingPayload =
        !!typingMessage &&
        ((typingMessage.content ?? '').trim().length > 0 ||
          (typingMessage.attachments?.length ?? 0) > 0 ||
          (typingMessage.steps?.length ?? 0) > 0 ||
          (carriedParts?.length ?? 0) > 0 ||
          (carriedCards?.length ?? 0) > 0);

      const keepYieldCard = (card: AgentXRichCard): boolean => {
        if (!incomingKey) return false;
        return this.cardPayloadYieldIdentityKey(card) === incomingKey;
      };

      const yieldOnlyCards = (message: OperationMessage | undefined): AgentXRichCard[] =>
        (message?.cards ?? []).filter(keepYieldCard);

      const yieldOnlyParts = (
        message: OperationMessage | undefined
      ): Extract<AgentXMessagePart, { type: 'card' }>[] =>
        (message?.parts ?? []).filter(
          (part): part is Extract<AgentXMessagePart, { type: 'card' }> =>
            part.type === 'card' && keepYieldCard(part.card)
        );

      const carriedTypingPayload: Partial<OperationMessage> = hasCarriedTypingPayload
        ? {
            content: typingMessage?.content ?? '',
            ...(typingMessage?.attachments?.length
              ? { attachments: typingMessage.attachments }
              : {}),
            ...(typingMessage?.steps?.length ? { steps: typingMessage.steps } : {}),
            ...(carriedCards?.length ? { cards: carriedCards } : {}),
            ...(carriedParts?.length ? { parts: carriedParts } : {}),
          }
        : {};

      const clearTypingCarrier = (rows: readonly OperationMessage[]): OperationMessage[] => {
        if (!typingMessage) return [...rows];

        if (!hasCarriedTypingPayload) return rows.filter((message) => message.id !== 'typing');

        if (separatesTypingPayload) {
          // For interruptions, commit the streamed typing payload as a regular
          // assistant bubble so prose/tool-steps/parts remain visible above the
          // yield bubble. The yield bubble carries only the action affordance.
          // The committed id is stable per typing timestamp so subsequent
          // yields in the same operation don't collide.
          const committedId = `${operationId || 'op'}:assistant_partial:${
            typingMessage?.timestamp?.getTime() ?? Date.now()
          }`;
          const committedRows = rows.map((message) =>
            message.id !== 'typing'
              ? message
              : {
                  ...message,
                  id: committedId,
                  isTyping: false,
                  semanticPhase: 'assistant_partial' as const,
                }
          );
          return this.removeDuplicateAssistantPreludeBeforeCommittedTyping(
            committedRows,
            committedId
          );
        }

        return rows.filter((message) => message.id !== 'typing');
      };

      // Resolve the existing row in priority order:
      //   1. Exact ID match (current canonical id).
      //   2. Any existing yield bubble carrying the same yield identity
      //      (approvalId / toolCallId / reason). This collapses legacy ids
      //      that historically embedded the operationId.
      //   3. An assistant row whose cards/parts already include a
      //      confirmation card carrying this yield identity. This covers
      //      the live SSE path where `onCard` attaches the confirmation
      //      card to the streaming message *before* `onOperation` fires
      //      with the yield state — without this we'd render two cards
      //      (one from the persisted card payload, one from the synthetic
      //      yield bubble).
      //   4. A persisted assistant row in the same operation whose content
      //      matches the yield's promptToUser. The backend persists the
      //      prompt as an assistant message *and* on the thread metadata —
      //      adopting it here prevents a duplicate "I drafted a plan" bubble
      //      on rehydrate.
      //   5. Any existing yield row in the same operation with the same
      //      reason. This collapses mixed-source ask_user arrivals where
      //      the card-synthesized yield and operation-stream yield carry
      //      different toolCallId values but refer to the same interruption.
      let existingIndex = messages.findIndex((message) => message.id === messageId);

      if (existingIndex < 0 && incomingKey) {
        existingIndex = messages.findIndex(
          (message) =>
            !!message.yieldState && this.yieldIdentityKey(message.yieldState) === incomingKey
        );
      }

      if (existingIndex < 0) {
        existingIndex = messages.findIndex(
          (message) =>
            message.role === 'assistant' && this.assistantRowHasYieldIdentity(message, incomingKey)
        );
      }

      if (existingIndex < 0 && promptText) {
        existingIndex = messages.findIndex(
          (message) =>
            message.role === 'assistant' &&
            !message.yieldState &&
            !message.isTyping &&
            (message.operationId ?? '') === (operationId ?? '') &&
            this.normalizeYieldPrompt(message.content) === promptText
        );
      }

      if (existingIndex < 0) {
        existingIndex = messages.findIndex(
          (message) =>
            !!message.yieldState &&
            (message.operationId ?? '') === (operationId ?? '') &&
            message.yieldState.reason === yieldState.reason
        );
      }

      if (existingIndex >= 0) {
        const existing = messages[existingIndex];
        const preservedYieldCards = [...yieldOnlyCards(existing), ...yieldOnlyCards(typingMessage)];
        const preservedYieldParts = [...yieldOnlyParts(existing), ...yieldOnlyParts(typingMessage)];
        const updated: OperationMessage = separatesTypingPayload
          ? {
              ...existing,
              id: messageId,
              content: '',
              attachments: undefined,
              steps: undefined,
              ...(preservedYieldCards.length > 0 ? { cards: preservedYieldCards } : { cards: [] }),
              ...(preservedYieldParts.length > 0 ? { parts: preservedYieldParts } : { parts: [] }),
              yieldState,
              operationId: operationId || existing.operationId,
              yieldCardState: existing.yieldCardState ?? 'idle',
            }
          : {
              ...this.withMergedVisiblePayload(existing, carriedTypingPayload),
              id: messageId,
              yieldState,
              operationId: operationId || existing.operationId,
              yieldCardState: existing.yieldCardState ?? 'idle',
            };

        // Replace any live typing row with the canonical yield row so the card
        // occupies the active SSE position rather than appearing below stream prose.
        if (typingIndex >= 0) {
          if (separatesTypingPayload) {
            // clearTypingCarrier commits the typing row in-place as a regular
            // assistant bubble; the yield row must go AFTER that committed
            // row so the streamed prose stays visible above the prompt/card.
            const committedRows = clearTypingCarrier(messages);
            const withoutExisting =
              existingIndex === typingIndex
                ? committedRows
                : committedRows.filter((_, index) => index !== existingIndex);
            const adjustedTypingIndex =
              existingIndex !== typingIndex && existingIndex < typingIndex
                ? typingIndex - 1
                : typingIndex;
            const insertAt = adjustedTypingIndex + 1;
            return [
              ...withoutExisting.slice(0, insertAt),
              updated,
              ...withoutExisting.slice(insertAt),
            ];
          }

          const withoutExistingAndTyping = messages.filter(
            (_, index) => index !== existingIndex && index !== typingIndex
          );
          const insertAt = Math.max(0, typingIndex - (existingIndex < typingIndex ? 1 : 0));
          return [
            ...withoutExistingAndTyping.slice(0, insertAt),
            updated,
            ...withoutExistingAndTyping.slice(insertAt),
          ];
        }

        return clearTypingCarrier(messages).map((message, index) =>
          index === existingIndex ? updated : message
        );
      }

      const yieldMessage: OperationMessage = separatesTypingPayload
        ? {
            // Yield bubble carries only the interactive affordance. The streamed
            // prose/tool output lives in the committed assistant bubble that
            // clearTypingCarrier produces.
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: typingMessage?.timestamp ?? new Date(),
            operationId,
            yieldState,
            yieldCardState: 'idle',
          }
        : {
            id: messageId,
            role: 'assistant',
            ...(carriedTypingPayload as Omit<OperationMessage, 'id' | 'role' | 'timestamp'>),
            content: (carriedTypingPayload.content as string | undefined) ?? '',
            timestamp: typingMessage?.timestamp ?? new Date(),
            operationId,
            yieldState,
            yieldCardState: 'idle',
          };

      if (typingIndex < 0) {
        return [...messages, yieldMessage];
      }

      if (separatesTypingPayload) {
        // clearTypingCarrier commits the typing row in-place as a regular
        // assistant bubble; yield goes AFTER it so streamed prose stays above.
        const committed = clearTypingCarrier(messages);
        return [
          ...committed.slice(0, typingIndex + 1),
          yieldMessage,
          ...committed.slice(typingIndex + 1),
        ];
      }

      return [...messages.slice(0, typingIndex), yieldMessage, ...messages.slice(typingIndex + 1)];
    });
  }

  private retireTypingCarrier(
    messages: readonly OperationMessage[],
    operationId?: string
  ): OperationMessage[] {
    const typingIndex = messages.findIndex((message) => message.id === 'typing');
    if (typingIndex < 0) return [...messages];

    const typingMessage = messages[typingIndex];
    if (!this.messageHasVisiblePayload(typingMessage)) {
      return messages.filter((_, index) => index !== typingIndex);
    }

    if (this.isTypingPayloadAlreadyCarried(messages, typingIndex, typingMessage)) {
      return messages.filter((_, index) => index !== typingIndex);
    }

    return messages.map((message, index) =>
      index === typingIndex
        ? {
            ...typingMessage,
            id: this.committedTypingMessageId(typingMessage, operationId),
            isTyping: false,
          }
        : message
    );
  }

  private messageHasVisiblePayload(message: OperationMessage): boolean {
    return (
      message.content.trim().length > 0 ||
      (message.attachments?.length ?? 0) > 0 ||
      (message.steps?.length ?? 0) > 0 ||
      (message.parts?.length ?? 0) > 0 ||
      (message.cards?.length ?? 0) > 0
    );
  }

  private committedTypingMessageId(message: OperationMessage, operationId?: string): string {
    const idScope = operationId?.trim() || message.operationId?.trim() || 'local';
    const timestampMs = message.timestamp?.getTime() ?? Date.now();
    return `${idScope}:assistant_committed:${timestampMs}`;
  }

  private isTypingPayloadAlreadyCarried(
    messages: readonly OperationMessage[],
    typingIndex: number,
    typingMessage: OperationMessage
  ): boolean {
    return messages.some(
      (message, index) =>
        index !== typingIndex &&
        message.role === 'assistant' &&
        !message.isTyping &&
        this.messageCarriesSameVisiblePayload(message, typingMessage)
    );
  }

  private messageCarriesSameVisiblePayload(
    message: OperationMessage,
    typingMessage: OperationMessage
  ): boolean {
    const typingText = this.normalizeYieldPrompt(typingMessage.content);
    const messageText = this.normalizeYieldPrompt(message.content);

    return (
      (!typingText || messageText === typingText) &&
      this.containsAllByKey(
        message.attachments,
        typingMessage.attachments,
        (attachment) => `${attachment.url}:${attachment.type}:${attachment.name}`
      ) &&
      this.containsAllByKey(message.steps, typingMessage.steps, (step) => step.id) &&
      this.containsAllByKey(message.cards, typingMessage.cards, (card) => this.cardKey(card)) &&
      this.containsAllByKey(message.parts, typingMessage.parts, (part) => this.partKey(part))
    );
  }

  private withMergedVisiblePayload(
    message: OperationMessage,
    payload: Partial<OperationMessage>
  ): OperationMessage {
    const payloadContent = this.normalizeYieldPrompt(payload.content);
    const messageContent = this.normalizeYieldPrompt(message.content);
    const content = !payloadContent || messageContent ? message.content : (payload.content ?? '');

    return {
      ...message,
      content,
      ...(payload.attachments?.length
        ? {
            attachments: this.appendMissingByKey(
              message.attachments,
              payload.attachments,
              (attachment) => `${attachment.url}:${attachment.type}:${attachment.name}`
            ),
          }
        : {}),
      ...(payload.steps?.length
        ? { steps: this.appendMissingByKey(message.steps, payload.steps, (step) => step.id) }
        : {}),
      ...(payload.cards?.length
        ? {
            cards: this.appendMissingByKey(message.cards, payload.cards, (card) =>
              this.cardKey(card)
            ),
          }
        : {}),
      ...(payload.parts?.length
        ? {
            parts: this.appendMissingByKey(message.parts, payload.parts, (part) =>
              this.partKey(part)
            ),
          }
        : {}),
    };
  }

  private appendMissingByKey<T>(
    existing: readonly T[] | undefined,
    incoming: readonly T[],
    keyFor: (value: T) => string
  ): T[] {
    const next = [...(existing ?? [])];
    const seen = new Set(next.map(keyFor));
    for (const value of incoming) {
      const key = keyFor(value);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(value);
    }
    return next;
  }

  private containsAllByKey<T>(
    existing: readonly T[] | undefined,
    incoming: readonly T[] | undefined,
    keyFor: (value: T) => string
  ): boolean {
    if (!incoming?.length) return true;
    const existingKeys = new Set((existing ?? []).map(keyFor));
    return incoming.every((value) => existingKeys.has(keyFor(value)));
  }

  private cardKey(card: AgentXRichCard): string {
    return this.cardPayloadYieldIdentityKey(card) || JSON.stringify(card);
  }

  private partKey(part: AgentXMessagePart): string {
    if (part.type === 'card') return `card:${this.cardKey(part.card)}`;
    if (part.type === 'text') return `text:${this.normalizeYieldPrompt(part.content)}`;
    if (part.type === 'tool-steps') {
      return `tool-steps:${part.steps.map((step) => step.id).join('|')}`;
    }
    return JSON.stringify(part);
  }

  /**
   * Attach a card emitted by the live SSE stream to the in-flight assistant
   * message. When the card is a `confirmation` carrying a `yieldState`, the
   * card represents an approval prompt that is *also* delivered via the
   * `operation` SSE event — routing it through `upsertInlineYieldMessage`
   * collapses both sources onto a single canonical yield bubble (avoids
   * rendering two stacked approval cards).
   *
   * @param streamingId - The id of the streaming assistant message.
   * @param card - The card payload from the SSE `card` event.
   * @param fallbackOperationId - Operation id used when the host has no
   *                              currently-tracked operation id.
   * @param clearText - Whether the streaming message text should be cleared
   *                    (mirrors the SSE event flag).
   */
  attachStreamedCard(
    streamingId: string,
    card: AgentXRichCard,
    fallbackOperationId: string,
    clearText: boolean
  ): void {
    const yieldPayload = this.extractYieldStateFromCard(card);
    const incomingKey = yieldPayload
      ? this.yieldIdentityKey(yieldPayload)
      : this.cardPayloadYieldIdentityKey(card);

    if (yieldPayload) {
      const operationId = this.resolveCardOperationId(fallbackOperationId, yieldPayload);

      // Route the yield through the canonical upsert: this either creates
      // the synthetic yield bubble or adopts an existing row (e.g. a paused
      // assistant turn loaded from history).
      this.upsertInlineYieldMessage(yieldPayload, operationId);

      const canonicalId = this.inlineYieldMessageId(yieldPayload, operationId);

      // Stamp the card onto the canonical yield row (so persisted-card
      // render paths still work) and ensure the streaming row does not
      // also carry a duplicate confirmation card with the same identity.
      this.messages.update((messages) =>
        messages.map((message) => {
          if (message.id === canonicalId) {
            const existingCards = message.cards ?? [];
            const existingParts = message.parts ?? [];
            const cardAlreadyPresent = existingCards.some(
              (existing) =>
                this.yieldIdentityKey(this.extractYieldStateFromCard(existing)) === incomingKey
            );
            if (cardAlreadyPresent) return message;

            return {
              ...message,
              cards: [...existingCards, card],
              parts: [...existingParts, { type: 'card', card }],
            };
          }

          if (message.id === streamingId) {
            const filterCard = (existing: AgentXRichCard): boolean =>
              this.yieldIdentityKey(this.extractYieldStateFromCard(existing)) !== incomingKey;
            const nextCards = message.cards?.filter(filterCard);
            const nextParts = message.parts?.filter(
              (part) => part.type !== 'card' || filterCard(part.card)
            );

            const cardsChanged = (message.cards?.length ?? 0) !== (nextCards?.length ?? 0);
            const partsChanged = (message.parts?.length ?? 0) !== (nextParts?.length ?? 0);
            if (!cardsChanged && !partsChanged) {
              return clearText ? { ...message, content: '' } : message;
            }

            return {
              ...message,
              ...(clearText ? { content: '' } : {}),
              ...(message.cards ? { cards: nextCards } : {}),
              ...(message.parts ? { parts: nextParts } : {}),
            };
          }

          return message;
        })
      );

      return;
    }

    if (incomingKey) {
      this.messages.update((messages) => {
        const targetIndex = this.findYieldMessageIndexByIdentity(messages, incomingKey);
        if (targetIndex < 0) {
          return messages.map((message) => {
            if (message.id !== streamingId) return message;
            const baseParts = clearText ? [] : (message.parts ?? []);
            return {
              ...message,
              ...(clearText ? { content: '' } : {}),
              cards: [...(message.cards ?? []), card],
              parts: [...baseParts, { type: 'card', card }],
            };
          });
        }

        return messages.map((message, index) => {
          if (index === targetIndex) {
            const existingCards = message.cards ?? [];
            const existingParts = message.parts ?? [];
            const cardAlreadyPresent = existingCards.some(
              (existing) => this.cardPayloadYieldIdentityKey(existing) === incomingKey
            );
            if (cardAlreadyPresent) return message;

            return {
              ...message,
              cards: [...existingCards, card],
              parts: [...existingParts, { type: 'card', card }],
            };
          }

          if (message.id === streamingId) {
            const filterCard = (existing: AgentXRichCard): boolean =>
              this.cardPayloadYieldIdentityKey(existing) !== incomingKey;
            const nextCards = message.cards?.filter(filterCard);
            const nextParts = message.parts?.filter(
              (part) => part.type !== 'card' || filterCard(part.card)
            );

            const cardsChanged = (message.cards?.length ?? 0) !== (nextCards?.length ?? 0);
            const partsChanged = (message.parts?.length ?? 0) !== (nextParts?.length ?? 0);
            if (!cardsChanged && !partsChanged) {
              return clearText ? { ...message, content: '' } : message;
            }

            return {
              ...message,
              ...(clearText ? { content: '' } : {}),
              ...(message.cards ? { cards: nextCards } : {}),
              ...(message.parts ? { parts: nextParts } : {}),
            };
          }

          return message;
        });
      });

      return;
    }

    // Non-yield cards (charts, media, billing, etc.) attach directly to the
    // streaming message — preserving prior behaviour.
    this.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== streamingId) return message;
        const baseParts = clearText ? [] : (message.parts ?? []);
        return {
          ...message,
          ...(clearText ? { content: '' } : {}),
          cards: [...(message.cards ?? []), card],
          parts: [...baseParts, { type: 'card', card }],
        };
      })
    );
  }

  private extractYieldStateFromCard(
    card: AgentXRichCard | undefined | null
  ): AgentYieldState | null {
    if (!card) return null;

    if (card.type === 'confirmation') {
      const payload = card.payload as { yieldState?: AgentYieldState } | undefined;
      const yieldState = payload?.yieldState;
      if (!yieldState || typeof yieldState !== 'object') return null;
      if (typeof yieldState.reason !== 'string') return null;
      if (!yieldState.pendingToolCall || typeof yieldState.pendingToolCall.toolName !== 'string') {
        return null;
      }
      return yieldState;
    }

    if (card.type !== 'ask_user') return null;

    const payload = card.payload as AgentXAskUserPayload | undefined;
    if (!payload) return null;
    const question = payload?.question?.trim();
    if (!question) return null;

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const context = typeof payload.context === 'string' ? payload.context.trim() : '';
    const prompt = context ? `${question}\n\n${context}` : question;

    return {
      reason: 'needs_input',
      promptToUser: prompt,
      agentId: card.agentId,
      messages: [],
      pendingToolCall: {
        toolName: 'ask_user',
        toolCallId: `ask_user:${question}`,
        toolInput: {
          question,
          ...(context ? { context } : {}),
        },
      },
      yieldedAt: nowIso,
      expiresAt: expiresIso,
    };
  }

  private resolveCardOperationId(fallback: string, yieldState?: AgentYieldState): string {
    const toolInputOperationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : '';
    if (toolInputOperationId) return toolInputOperationId;

    const trimmedFallback = (fallback ?? '').trim();
    if (trimmedFallback) return trimmedFallback;
    const host = this.host;
    return host?.contextId() ?? '';
  }

  private yieldIdentityKey(yieldState: AgentYieldState | undefined | null): string {
    if (!yieldState) return '';
    const approvalId = yieldState.approvalId?.trim();
    if (approvalId) return `approval:${approvalId}`;
    const toolCallId = yieldState.pendingToolCall?.toolCallId?.trim();
    if (toolCallId) return `tool:${toolCallId}`;
    return `reason:${yieldState.reason}`;
  }

  /**
   * Extract the yield identity directly from a confirmation card's payload.
   * The backend's `buildInlineYieldCard` writes `approvalId` and (optionally)
   * `toolCallId` at the top level of the payload — it does NOT embed a full
   * `yieldState` object. This helper bridges the gap so identity matching
   * (used to collapse duplicate approval cards on rehydrate) works without
   * requiring a synthesized yieldState.
   */
  private cardPayloadYieldIdentityKey(card: AgentXRichCard | undefined | null): string {
    if (!card || card.type !== 'confirmation') return '';
    const payload = card.payload as
      | { approvalId?: unknown; toolCallId?: unknown; yieldState?: AgentYieldState }
      | undefined;
    if (!payload) return '';
    // Prefer embedded yieldState identity when present.
    const embedded = this.yieldIdentityKey(payload.yieldState);
    if (embedded) return embedded;
    const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId.trim() : '';
    if (approvalId) return `approval:${approvalId}`;
    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId.trim() : '';
    if (toolCallId) return `tool:${toolCallId}`;
    return '';
  }

  private normalizeYieldPrompt(value: string | undefined | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * True when the assistant row carries a confirmation card whose payload
   * yield identity (approvalId / toolCallId / reason) matches `incomingKey`.
   * Walks both `cards` and `parts` because the live SSE path appends to
   * both arrays while the rehydrate path may only populate one.
   */
  private assistantRowHasYieldIdentity(message: OperationMessage, incomingKey: string): boolean {
    if (!incomingKey) return false;

    const matchesCard = (card: AgentXRichCard | undefined): boolean => {
      if (!card) return false;
      // Read identity from card payload directly (handles the common case
      // where backend cards carry approvalId at the top level rather than
      // an embedded yieldState).
      return this.cardPayloadYieldIdentityKey(card) === incomingKey;
    };

    if (message.cards?.some(matchesCard)) return true;
    if (message.parts?.some((part) => part.type === 'card' && matchesCard(part.card))) {
      return true;
    }
    return false;
  }

  private findYieldMessageIndexByIdentity(
    messages: readonly OperationMessage[],
    incomingKey: string
  ): number {
    if (!incomingKey) return -1;

    return messages.findIndex((message) => {
      const yieldKey = this.yieldIdentityKey(message.yieldState);
      if (yieldKey && yieldKey === incomingKey) return true;
      return this.assistantRowHasYieldIdentity(message, incomingKey);
    });
  }

  updateInlineYieldMessageState(
    operationId: string,
    state: 'idle' | 'submitting' | 'resolved',
    resolvedText?: string
  ): void {
    this.messages.update((messages) =>
      messages.map((message) =>
        message.yieldState && message.operationId === operationId
          ? {
              ...message,
              yieldCardState: state,
              ...(resolvedText !== undefined ? { yieldResolvedText: resolvedText } : {}),
            }
          : message
      )
    );
  }

  dismissBillingActionCards(reason: AgentXBillingActionReason): void {
    this.messages.update((messages) =>
      messages.map((message) => {
        const nextCards = message.cards?.filter(
          (card) => !this.isMatchingBillingCard(card, reason)
        );
        const nextParts = message.parts?.filter(
          (part) => part.type !== 'card' || !this.isMatchingBillingCard(part.card, reason)
        );

        const cardsChanged = (message.cards?.length ?? 0) !== (nextCards?.length ?? 0);
        const partsChanged = (message.parts?.length ?? 0) !== (nextParts?.length ?? 0);
        if (!cardsChanged && !partsChanged) return message;

        return {
          ...message,
          ...(message.cards ? { cards: nextCards } : {}),
          ...(message.parts ? { parts: nextParts } : {}),
        };
      })
    );
  }

  async copyMessageContent(message: OperationMessage): Promise<void> {
    const host = this.requireHost();
    const text = message.content.trim();
    if (!text) return;

    this.logger.info('Copying operation chat message', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      role: message.role,
    });
    this.breadcrumb.trackUserAction('agent-x-message-copy', {
      contextId: host.contextId(),
      contextType: host.contextType(),
      messageId: message.id,
      role: message.role,
    });

    try {
      const copied = await this.copyText(text);
      if (!copied) {
        this.logger.warn('Failed to copy operation chat message to clipboard', {
          contextId: host.contextId(),
          messageId: message.id,
        });
        this.toast.error('Failed to copy message');
        return;
      }

      await this.haptics.impact('light');
      this.toast.success('Message copied');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_COPIED, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        role: message.role,
      });

      if (this.isPersistedMessageId(message.id)) {
        await this.api.annotateMessage(message.id, {
          action: 'copied',
          metadata: { source: 'operation-chat' },
        });
      }
    } catch (error) {
      this.logger.error('Copy message action failed', error, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        messageId: message.id,
      });
      this.toast.error('Failed to copy message');
    }
  }

  isPersistedMessageId(messageId: string): boolean {
    return /^[a-f0-9]{24}$/i.test(messageId);
  }

  private inlineYieldMessageId(yieldState: AgentYieldState, operationId: string): string {
    const host = this.requireHost();
    // Prefer approvalId — globally unique and stable across all rehydrate
    // paths (thread metadata, Firestore fallback, live SSE). This guarantees
    // upsert idempotency: every source resolves to the same row instead of
    // appending a new card whenever the operationId resolution order varies.
    const approvalId = yieldState.approvalId?.trim();
    if (approvalId) return `yield:${approvalId}`;

    const toolCallId = yieldState.pendingToolCall?.toolCallId?.trim();
    if (toolCallId) return `yield:tool:${toolCallId}`;

    const fallbackOperation = (operationId ?? '').trim() || host.contextId();
    return `yield:${fallbackOperation}:${yieldState.reason}`;
  }

  private isMatchingBillingCard(card: AgentXRichCard, reason: AgentXBillingActionReason): boolean {
    if (card.type !== 'billing-action') return false;

    const payload = card.payload as AgentXBillingActionPayload | undefined;
    return !payload?.reason || payload.reason === reason;
  }

  private async copyText(value: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback.
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }

  private uid(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private requireHost(): AgentXOperationChatMessageFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatMessageFacade used before configure()');
    }

    return this.host;
  }
}
