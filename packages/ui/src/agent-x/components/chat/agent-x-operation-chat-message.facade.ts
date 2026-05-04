import { Injectable, PLATFORM_ID, inject, signal, type Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createAgentXApi,
  type AgentXApi,
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
import type { OperationMessage, PendingUndoState } from './agent-x-operation-chat.models';

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
  private host: AgentXOperationChatMessageFacadeHost | null = null;

  configure(host: AgentXOperationChatMessageFacadeHost): void {
    this.host = host;
  }

  pushMessage(message: OperationMessage): void {
    this.messages.update((previous) => [...previous, message]);
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
        messages.map((message) =>
          message.id === params.streamingId
            ? { ...message, id: persistedMessageId, isTyping: false }
            : message
        )
      );
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

  queueTypingDelta(text: string): void {
    if (!text) return;
    this.pendingTypingDelta += text;

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
  }

  drainBufferedTypingDelta(): string {
    const delta = this.pendingTypingDelta;
    this.pendingTypingDelta = '';
    if (this.pendingTypingFlushFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.pendingTypingFlushFrame);
      }
      this.pendingTypingFlushFrame = null;
    }
    return delta;
  }

  clearPendingTypingDelta(): void {
    this.pendingTypingDelta = '';
    if (this.pendingTypingFlushFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.pendingTypingFlushFrame);
    }
    this.pendingTypingFlushFrame = null;
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
    const messageId = this.inlineYieldMessageId(yieldState, operationId);

    this.messages.update((messages) => {
      const typingIndex = messages.findIndex((message) => message.id === 'typing');
      const existingIndex = messages.findIndex((message) => message.id === messageId);
      if (existingIndex >= 0) {
        const updated = {
          ...messages[existingIndex],
          yieldState,
          operationId,
        };

        // Keep existing persisted row inline with the active stream: when a typing
        // placeholder exists, the ask-user card should sit directly below it.
        if (typingIndex >= 0) {
          const withoutExisting = messages.filter((_, index) => index !== existingIndex);
          const nextTypingIndex = withoutExisting.findIndex((message) => message.id === 'typing');
          if (nextTypingIndex >= 0) {
            return [
              ...withoutExisting.slice(0, nextTypingIndex + 1),
              updated,
              ...withoutExisting.slice(nextTypingIndex + 1),
            ];
          }
        }

        return messages.map((message, index) => (index === existingIndex ? updated : message));
      }

      const yieldMessage: OperationMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        operationId,
        yieldState,
        yieldCardState: 'idle',
      };

      if (typingIndex < 0) {
        return [...messages, yieldMessage];
      }

      return [
        ...messages.slice(0, typingIndex + 1),
        yieldMessage,
        ...messages.slice(typingIndex + 1),
      ];
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
    const discriminator =
      yieldState.approvalId ?? yieldState.pendingToolCall?.toolCallId ?? yieldState.reason;
    return `yield:${operationId ?? host.contextId()}:${discriminator}`;
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
