import { Injectable, inject, type WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AgentYieldState } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AgentXAttachment, AgentXSelectedAction, AgentXToolStep } from '@nxt1/core/ai';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  AgentXJobService,
} from '../../services/agent-x-job.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import { AgentXOperationEventService } from '../../services/agent-x-operation-event.service';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';
import type { MessageAttachment, OperationMessage } from './agent-x-operation-chat.models';

const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';

type OperationChatStatus =
  | 'processing'
  | 'complete'
  | 'error'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval';

interface SendOptions {
  readonly text?: string;
  readonly selectedAction?: AgentXSelectedAction | null;
  readonly preserveDraft?: boolean;
  readonly idempotencyKey?: string;
}

export interface AgentXOperationChatRunControlFacadeHost {
  readonly contextId: () => string;
  readonly contextTitle: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly getOperationStatus: () => OperationChatStatus | null;
  readonly inputValue: WritableSignal<string>;
  readonly loading: WritableSignal<boolean>;
  readonly retryStarted: WritableSignal<boolean>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  clearRealtimePipelines(): void;
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
  setOperationStatus(status: OperationChatStatus | null): void;
  getCurrentOperationId(): string | null;
  setCurrentOperationId(operationId: string | null): void;
  getActiveStream(): AbortController | null;
  setActiveStream(controller: AbortController | null): void;
  resolveActiveThreadId(): string | null;
  hasUserSent(): boolean;
  markUserMessageSent(): void;
  getPendingSelectedAction(): AgentXSelectedAction | null;
  setPendingSelectedAction(action: AgentXSelectedAction | null): void;
  yieldOperationId(): string;
  uid(): string;
}

@Injectable({ providedIn: 'root' })
export class AgentXOperationChatRunControlFacade {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly jobService = inject(AgentXJobService);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatRunControl');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  private readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);

  private host: AgentXOperationChatRunControlFacadeHost | null = null;

  configure(host: AgentXOperationChatRunControlFacadeHost): void {
    this.host = host;
  }

  async onRetry(): Promise<void> {
    const host = this.requireHost();

    this.logger.info('Retrying failed operation', { contextId: host.contextId() });
    this.breadcrumb.trackUserAction('operation-retry', { operationId: host.contextId() });
    await this.haptics.impact('medium');

    host.retryStarted.set(true);

    const result = await this.jobService.retryOperation(host.contextId(), host.contextTitle());

    if (result) {
      await this.haptics.notification('success');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_RETRIED, {
        originalOperationId: host.contextId(),
        newOperationId: result.operationId,
        source: 'operation-chat',
      });
      this.logger.info('Retry enqueued', {
        originalId: host.contextId(),
        newOperationId: result.operationId,
      });
      return;
    }

    await this.haptics.notification('error');
    host.retryStarted.set(false);
    this.messageFacade.pushMessage({
      id: host.uid(),
      role: 'assistant',
      content: "Sorry, I couldn't restart this operation right now. Please try again in a moment.",
      timestamp: new Date(),
      error: true,
    });
  }

  pauseStream(): void {
    const host = this.requireHost();
    let pausedOperationId: string | null = null;
    const threadId = host.resolveActiveThreadId();

    if (threadId) {
      this.streamRegistry.abort(threadId);
    }

    const activeStream = host.getActiveStream();
    if (activeStream) {
      activeStream.abort();
      host.setActiveStream(null);
    }

    host.clearRealtimePipelines();

    const currentOperationId = host.getCurrentOperationId();
    if (currentOperationId) {
      pausedOperationId = currentOperationId;
      this.firePauseRequest(currentOperationId);
    }

    this.transitionInFlightMessages('Paused');
    host.loading.set(false);
    host.setActivityPhase('paused', 'Paused');

    const targetOperationId = pausedOperationId ?? host.contextId();
    if (targetOperationId) {
      host.setCurrentOperationId(targetOperationId);
      host.activeYieldState.set(null);
      host.yieldResolved.set(true);
    }

    this.logger.info('Stream paused by user', { contextId: host.contextId() });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-paused', {
      contextId: host.contextId(),
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_STREAM_PAUSED, {
      threadId: threadId ?? undefined,
      contextId: host.contextId(),
      contextType: host.contextType(),
    });

    if (threadId) {
      this.operationEventService.emitOperationStatusUpdated(
        threadId,
        'paused',
        new Date().toISOString()
      );
    }
  }

  cancelStream(): void {
    const host = this.requireHost();
    const threadId = host.resolveActiveThreadId();

    if (threadId) {
      this.streamRegistry.abort(threadId);
    }

    const activeStream = host.getActiveStream();
    if (activeStream) {
      activeStream.abort();
      host.setActiveStream(null);
    }

    host.clearRealtimePipelines();

    const currentOperationId = host.getCurrentOperationId();
    if (currentOperationId) {
      host.setCurrentOperationId(null);
      this.fireCancelRequest(currentOperationId);
    }

    this.transitionInFlightMessages('Cancelled');
    host.loading.set(false);
    host.setActivityPhase('cancelled', 'Cancelled');

    this.logger.info('Stream cancelled by user', { contextId: host.contextId() });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-cancelled', {
      contextId: host.contextId(),
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_STREAM_CANCELLED, {
      threadId: threadId ?? undefined,
      contextId: host.contextId(),
      contextType: host.contextType(),
    });

    if (threadId) {
      this.operationEventService.emitOperationStatusUpdated(
        threadId,
        'complete',
        new Date().toISOString()
      );
    }
  }

  async send(options?: SendOptions): Promise<void> {
    const host = this.requireHost();
    const composerValue = host.inputValue();
    const text = (options?.text ?? composerValue).trim();
    const files = this.attachmentsFacade.pendingFiles();
    const pendingSources = this.attachmentsFacade.pendingConnectedSources();
    const selectedAction = options?.selectedAction ?? host.getPendingSelectedAction();

    if ((!text && files.length === 0 && pendingSources.length === 0) || host.loading()) {
      return;
    }

    const previousOperationId = host.getCurrentOperationId();
    const previousStatus = host.getOperationStatus();
    host.clearRealtimePipelines();

    if (previousStatus === 'paused' && previousOperationId) {
      this.logger.info('New message after paused stream; cancelling stale paused operation', {
        pausedOperationId: previousOperationId,
        contextId: host.contextId(),
      });
      this.breadcrumb.trackUserAction('send-after-paused-stream', {
        operationId: previousOperationId,
      });
      this.fireCancelRequest(previousOperationId);
      host.setCurrentOperationId(null);
      host.activeYieldState.set(null);
      host.yieldResolved.set(true);
      host.setOperationStatus('processing');
    }

    const idempotencyKey = options?.idempotencyKey ?? this.createChatIdempotencyKey();

    host.loading.set(true);
    host.setActivityPhase('sending', 'Sending...');
    if (!options?.preserveDraft) {
      host.inputValue.set('');
    }
    host.setPendingSelectedAction(null);

    if (!host.hasUserSent()) {
      host.markUserMessageSent();
    }

    const activeYield = host.activeYieldState();
    const pausedOperationId =
      activeYield?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME
        ? host.yieldOperationId()
        : null;

    if (pausedOperationId) {
      this.logger.info('New message sent while paused; abandoning paused operation state', {
        pausedOperationId,
        contextId: host.contextId(),
      });
      this.breadcrumb.trackUserAction('send-while-paused', {
        operationId: pausedOperationId,
      });

      this.fireCancelRequest(pausedOperationId);
      host.setCurrentOperationId(null);
      host.activeYieldState.set(null);
      host.yieldResolved.set(true);
      this.messageFacade.messages.update((messages) =>
        messages.filter(
          (message) =>
            !(
              message.operationId === pausedOperationId &&
              message.yieldState?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME
            )
        )
      );
      host.setOperationStatus('processing');
    }

    this.attachmentsFacade.pendingConnectedSources.set([]);

    let displayContent = text;
    if (!text && files.length > 0) {
      displayContent = `📎 ${files.length} file${files.length > 1 ? 's' : ''}`;
    }

    const fileDisplayAttachments: MessageAttachment[] = files.map((pendingFile) => ({
      url: pendingFile.previewUrl ?? '',
      type: pendingFile.isImage ? 'image' : pendingFile.isVideo ? 'video' : 'doc',
      name: pendingFile.file.name,
    }));

    const sourceDisplayAttachments: MessageAttachment[] = pendingSources.map((source) => ({
      url: source.profileUrl,
      type: 'app',
      name: source.platform,
      platform: source.platform,
      faviconUrl: source.faviconUrl,
    }));

    const displayAttachments: MessageAttachment[] = [
      ...fileDisplayAttachments,
      ...sourceDisplayAttachments,
    ];

    this.messageFacade.pushMessage({
      id: host.uid(),
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      idempotencyKey,
      ...(displayAttachments.length > 0 ? { attachments: displayAttachments } : {}),
      ...(selectedAction ? { selectedAction } : {}),
    });

    this.messageFacade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    });

    // Mirror regular chat UX: move staged files into the sent message row instantly.
    this.attachmentsFacade.pendingFiles.set([]);

    try {
      let readyAttachments: AgentXAttachment[] = [];
      let authToken: string | null = null;
      if (files.length > 0) {
        authToken = (await this.getAuthToken?.().catch(() => null)) ?? null;
        if (authToken) {
          this.logger.info('Uploading staged attachments before chat dispatch', {
            contextId: host.contextId(),
            selectedFileCount: files.length,
          });

          readyAttachments = await this.attachmentsFacade.prepareAttachmentsForSend(
            files,
            authToken
          );
          if (readyAttachments.length !== files.length) {
            const failedCount = files.length - readyAttachments.length;
            this.logger.warn('Blocking chat send because some attachments failed to upload', {
              contextId: host.contextId(),
              selectedCount: files.length,
              uploadedCount: readyAttachments.length,
              failedCount,
            });
            this.breadcrumb.trackStateChange(
              'agent-x-operation-chat:attachment-upload-incomplete',
              {
                contextId: host.contextId(),
                selectedCount: files.length,
                uploadedCount: readyAttachments.length,
                failedCount,
              }
            );
            this.toast.error(
              failedCount === 1
                ? '1 attachment failed to upload. Fix it and retry before sending.'
                : `${failedCount} attachments failed to upload. Fix them and retry before sending.`
            );
            this.attachmentsFacade.pendingFiles.set([...files]);
            this.messageFacade.replaceTyping({
              id: host.uid(),
              role: 'assistant',
              content:
                failedCount === 1
                  ? '1 attachment failed to upload. Fix it and tap send again.'
                  : `${failedCount} attachments failed to upload. Fix them and tap send again.`,
              timestamp: new Date(),
              error: true,
            });
            return;
          }
        } else {
          this.logger.error('Auth token unavailable — staged attachments cannot be sent to AI', {
            count: files.length,
            contextId: host.contextId(),
          });
          this.breadcrumb.trackUserAction('agent-x-upload-auth-missing', {
            contextId: host.contextId(),
            stagedFileCount: files.length,
          });
          this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ERROR_AUTH_MISSING, {
            contextId: host.contextId(),
            contextType: host.contextType(),
            stagedFileCount: files.length,
          });
          this.toast.error(
            `Session expired: ${files.length} attached file(s) cannot be sent. Please re-authenticate.`
          );
          this.attachmentsFacade.pendingFiles.set([...files]);
          this.messageFacade.replaceTyping({
            id: host.uid(),
            role: 'assistant',
            content: 'Your session expired before attachments could upload. Please sign in again.',
            timestamp: new Date(),
            error: true,
          });
          await this.haptics.notification('error');
          return;
        }
      }

      this.transportFacade.beginResponseTurn('send');

      await this.transportFacade.callAgentChat(
        displayContent,
        readyAttachments,
        selectedAction ?? undefined,
        idempotencyKey,
        pendingSources.length > 0 ? pendingSources : undefined
      );
      await this.haptics.notification('success');
    } catch (error) {
      this.logger.error('Chat message failed', error, { contextId: host.contextId() });
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      host.setActivityPhase('failed', message);
      await this.haptics.notification('error');

      const alreadyHasError = this.messageFacade
        .messages()
        .some((message) => message.error && message.id !== 'typing');
      if (!alreadyHasError) {
        this.messageFacade.replaceTyping({
          id: host.uid(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          timestamp: new Date(),
          error: true,
        });
      }
    } finally {
      host.loading.set(false);
    }
  }

  async onRetryErrorMessage(errorMessage: OperationMessage): Promise<void> {
    this.requireHost(); // Ensures facade is configured before accessing messages
    const messages = this.messageFacade.messages();
    const errorIndex = messages.findIndex((message) => message.id === errorMessage.id);
    const lastUserMessage = [...messages]
      .slice(0, errorIndex)
      .reverse()
      .find((message) => message.role === 'user');

    if (!lastUserMessage) {
      return;
    }

    this.messageFacade.messages.update((previous) =>
      previous.filter((message) => message.id !== errorMessage.id)
    );
    await this.send({
      text: lastUserMessage.content,
      selectedAction: lastUserMessage.selectedAction ?? null,
      preserveDraft: true,
      idempotencyKey: lastUserMessage.idempotencyKey,
    });
  }

  private transitionInFlightMessages(label: 'Paused' | 'Cancelled'): void {
    const interruptedReason = label === 'Paused' ? 'paused' : 'cancelled';
    const host = this.requireHost();

    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        const hasTyping = message.isTyping === true;
        const hasActiveSteps = message.steps?.some((step) => step.status === 'active');
        const hasActiveParts = message.parts?.some(
          (part) =>
            part.type === 'tool-steps' && part.steps.some((step) => step.status === 'active')
        );
        // The streaming bubble keeps id === 'typing' even after the first
        // delta flips isTyping=false (so flushPendingTypingDelta can keep
        // appending into it). On pause/cancel we MUST rotate that sentinel
        // off the now-finalized row, otherwise the next send's typing push
        // is rejected by pushMessage's typing-dedup and new deltas keep
        // landing in this old bubble (rendering above the new user message).
        const carriesTypingSentinel = message.id === 'typing';
        if (!hasTyping && !hasActiveSteps && !hasActiveParts && !carriesTypingSentinel) {
          return message;
        }

        const updateStep = (step: AgentXToolStep): AgentXToolStep =>
          step.status === 'active' ? { ...step, status: 'error', label } : step;

        return {
          ...message,
          ...(carriesTypingSentinel ? { id: host.uid() } : {}),
          isTyping: false,
          ...(message.role === 'assistant' ? { interruptedReason } : {}),
          steps: message.steps?.map(updateStep),
          parts: message.parts?.map((part) =>
            part.type === 'tool-steps' ? { ...part, steps: part.steps.map(updateStep) } : part
          ),
        };
      })
    );
  }

  private fireCancelRequest(operationId: string): void {
    const url = `${this.baseUrl}/agent-x/cancel/${operationId}`;
    this.getAuthToken?.()
      .then((token) => {
        if (!token) {
          return;
        }
        return firstValueFrom(
          this.http.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
        );
      })
      .catch((error) => {
        this.logger.debug('Explicit cancel request failed (non-critical)', {
          operationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private firePauseRequest(operationId: string): void {
    const url = `${this.baseUrl}/agent-x/pause/${operationId}`;
    this.getAuthToken?.()
      .then((token) => {
        if (!token) {
          return;
        }
        return firstValueFrom(
          this.http.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
        );
      })
      .catch((error) => {
        this.logger.debug('Explicit pause request failed (non-critical)', {
          operationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private createChatIdempotencyKey(): string {
    const timePart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `chat_${timePart}_${randomPart}`;
  }

  private requireHost(): AgentXOperationChatRunControlFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatRunControlFacade host not configured');
    }
    return this.host;
  }
}
