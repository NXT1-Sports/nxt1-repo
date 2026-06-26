import { Injectable, inject, type WritableSignal } from '@angular/core';
import type { AgentYieldState } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type {
  AgentXAttachment,
  AgentXExecutionMode,
  AgentXSelectedAction,
  AgentXSelectedContext,
  AgentXToolStep,
} from '@nxt1/core/ai';
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
import { AgentXService } from '../../services/agent-x.service';
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
  | 'awaiting_approval'
  | 'cancelled';

interface SendOptions {
  readonly text?: string;
  readonly selectedAction?: AgentXSelectedAction | null;
  readonly executionMode?: AgentXExecutionMode;
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
  markEnqueueStopped(): void;
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
  private readonly agentXService = inject(AgentXService);
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
    const isEnqueueWaitingThread =
      !!threadId && !!this.operationEventService.getEnqueueWaitingEntry(threadId);

    if (threadId) {
      this.streamRegistry.abort(threadId);
    }

    const activeStream = host.getActiveStream();
    if (activeStream) {
      activeStream.abort();
      host.setActiveStream(null);
    }

    host.clearRealtimePipelines();
    // For enqueue jobs, pause acts as a stop/cancel UX state in the thread.
    // The host implementation is guarded to no-op for non-enqueue chat threads.
    host.markEnqueueStopped();

    // For /chat turns, currentOperationId is set by the SSE stream transport.
    // For /enqueue threads, no SSE stream runs so currentOperationId is null —
    // fall back to contextId() which IS the operationId for contextType 'operation'.
    const currentOperationId =
      host.getCurrentOperationId() ??
      (host.contextType() === 'operation' ? host.contextId() : null);
    if (currentOperationId) {
      pausedOperationId = currentOperationId;
      void this.firePauseRequest(currentOperationId);
    }

    // Clear the stream recovery marker immediately so a user-initiated pause
    // cannot be reopened on the next app resume before the backend emits its
    // formal paused status update.
    this.agentXService.clearDropRecoveryOp();

    this.transitionInFlightMessages('Paused');
    host.loading.set(false);
    host.setActivityPhase(
      isEnqueueWaitingThread ? 'cancelled' : 'paused',
      isEnqueueWaitingThread ? 'Cancelled' : 'Paused'
    );

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
      const currentOperationId =
        host.getCurrentOperationId() ??
        (host.contextType() === 'operation' ? host.contextId() : undefined);
      this.operationEventService.emitOperationStatusUpdated(
        threadId,
        isEnqueueWaitingThread ? 'complete' : 'paused',
        new Date().toISOString(),
        'chat',
        currentOperationId ?? undefined
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
    host.markEnqueueStopped();

    // Same enqueue fallback as pauseStream() — contextId() is the operationId
    // for 'operation' context type when no SSE turn has set currentOperationId.
    const currentOperationId =
      host.getCurrentOperationId() ??
      (host.contextType() === 'operation' ? host.contextId() : null);
    if (currentOperationId) {
      host.setCurrentOperationId(null);
      void this.fireCancelRequest(currentOperationId);
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
        new Date().toISOString(),
        'chat',
        currentOperationId ?? undefined
      );
    }
  }

  async send(options?: SendOptions): Promise<void> {
    const host = this.requireHost();
    const composerValue = host.inputValue();
    const text = (options?.text ?? composerValue).trim();
    let files = this.attachmentsFacade.pendingFiles();
    const pendingSources = this.attachmentsFacade.pendingConnectedSources();
    const pendingSelectedContexts = this.attachmentsFacade.pendingSelectedContexts();
    const selectedAction = options?.selectedAction ?? host.getPendingSelectedAction();

    if (
      (!text &&
        files.length === 0 &&
        pendingSources.length === 0 &&
        pendingSelectedContexts.length === 0) ||
      host.loading()
    ) {
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
      void this.fireCancelRequest(previousOperationId);
      host.setCurrentOperationId(null);
      host.activeYieldState.set(null);
      host.yieldResolved.set(true);
      host.setOperationStatus('processing');
    }

    const idempotencyKey = options?.idempotencyKey ?? this.createChatIdempotencyKey();

    host.loading.set(true);
    host.setActivityPhase(
      'sending',
      files.some((file) => file.isVideo) ? 'Preparing video...' : 'Sending...'
    );
    files = [...(await this.attachmentsFacade.waitForVideoThumbnails(files))];
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

      void this.fireCancelRequest(pausedOperationId);
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
    } else if (!text && pendingSelectedContexts.length > 0) {
      displayContent =
        pendingSelectedContexts.length === 1
          ? pendingSelectedContexts[0].title
          : `${pendingSelectedContexts.length} attached contexts`;
    }

    const fileDisplayAttachments: MessageAttachment[] = files.map((pendingFile) => ({
      // For video: create a playable blob URL from the actual file.
      // previewUrl is the canvas JPEG thumbnail — NOT a playable video URL.
      // Native Capacitor gallery picks can be zero-byte placeholder Files, so
      // fall back to nativeWebPath for the sent-message strip.
      url: pendingFile.isVideo
        ? pendingFile.nativeWebPath && pendingFile.file.size === 0
          ? pendingFile.nativeWebPath
          : URL.createObjectURL(pendingFile.file)
        : (pendingFile.previewUrl ?? ''),
      type: pendingFile.isImage ? 'image' : pendingFile.isVideo ? 'video' : 'doc',
      name: pendingFile.file.name,
      ...(pendingFile.isVideo && pendingFile.previewUrl
        ? { thumbnailUrl: pendingFile.previewUrl }
        : {}),
    }));

    const sourceDisplayAttachments: MessageAttachment[] = pendingSources.map((source) => ({
      url: source.profileUrl,
      type: 'app',
      name: source.platform,
      platform: source.platform,
      faviconUrl: source.faviconUrl,
    }));

    const selectedContextDisplayAttachments = pendingSelectedContexts.map((context) =>
      this.toSelectedContextDisplayAttachment(context)
    );

    const displayAttachments: MessageAttachment[] = [
      ...fileDisplayAttachments,
      ...sourceDisplayAttachments,
      ...selectedContextDisplayAttachments,
    ];

    const userMessageId = host.uid();

    this.messageFacade.pushMessage({
      id: userMessageId,
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
    this.attachmentsFacade.clearPendingSelectedContexts();

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
            this.attachmentsFacade.addPendingSelectedContexts(pendingSelectedContexts);
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

          this.replaceOptimisticFileAttachmentUrls(
            userMessageId,
            fileDisplayAttachments,
            readyAttachments,
            [...sourceDisplayAttachments, ...selectedContextDisplayAttachments]
          );
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
          this.attachmentsFacade.addPendingSelectedContexts(pendingSelectedContexts);
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

      this.attachmentsFacade.clearVideoUploadProgress();
      this.transportFacade.beginResponseTurn('send');

      await this.transportFacade.callAgentChat(
        displayContent,
        readyAttachments,
        selectedAction ?? undefined,
        idempotencyKey,
        options?.executionMode ?? 'execute',
        pendingSources.length > 0 ? pendingSources : undefined,
        pendingSelectedContexts.length > 0 ? pendingSelectedContexts : undefined,
        undefined
      );
      await this.haptics.notification('success');
    } catch (error) {
      this.logger.error('Chat message failed', error, { contextId: host.contextId() });
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      host.setActivityPhase('failed', message);
      this.attachmentsFacade.addPendingSelectedContexts(pendingSelectedContexts);
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
      this.attachmentsFacade.clearVideoUploadProgress();
      const activeThreadId = host.resolveActiveThreadId();
      const enqueueWaitingActive =
        !!activeThreadId && !!this.operationEventService.getEnqueueWaitingEntry(activeThreadId);
      const keepLoadingForEnqueue =
        enqueueWaitingActive && host.getOperationStatus() === 'processing';

      if (keepLoadingForEnqueue) {
        host.loading.set(true);
        host.setActivityPhase('waiting_delta');
      } else {
        host.loading.set(false);
      }
    }
  }

  private toSelectedContextDisplayAttachment(context: AgentXSelectedContext): MessageAttachment {
    const videoUrl = context.media?.videoUrl?.trim();
    const imageUrl = context.media?.imageUrl?.trim();
    const thumbnailUrl = context.media?.thumbnailUrl?.trim();
    const source = context.source?.label ?? context.source?.type;

    if (videoUrl) {
      return {
        url: videoUrl,
        type: 'video',
        name: context.title,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        contextKind: context.kind,
        ...(source ? { contextSource: source } : {}),
        ...(context.summary ? { contextSummary: context.summary } : {}),
      };
    }

    if (imageUrl || thumbnailUrl) {
      return {
        url: imageUrl ?? thumbnailUrl ?? '',
        type: 'image',
        name: context.title,
        contextKind: context.kind,
        ...(source ? { contextSource: source } : {}),
        ...(context.summary ? { contextSummary: context.summary } : {}),
      };
    }

    return {
      url: `context://${encodeURIComponent(context.id)}`,
      type: 'context',
      name: context.title,
      contextKind: context.kind,
      ...(source ? { contextSource: source } : {}),
      ...(context.summary ? { contextSummary: context.summary } : {}),
    };
  }

  private replaceOptimisticFileAttachmentUrls(
    messageId: string,
    optimisticFileAttachments: readonly MessageAttachment[],
    readyAttachments: readonly AgentXAttachment[],
    trailingAttachments: readonly MessageAttachment[]
  ): void {
    if (optimisticFileAttachments.length === 0 || readyAttachments.length === 0) {
      return;
    }

    const uploadedFileAttachments = optimisticFileAttachments.map((attachment, index) => {
      const readyAttachment = readyAttachments[index];
      if (!readyAttachment) {
        return attachment;
      }

      const thumbnailUrl = readyAttachment.thumbnailUrl ?? attachment.thumbnailUrl;
      const nextAttachment: MessageAttachment = {
        ...attachment,
        url: readyAttachment.url,
        name: readyAttachment.name || attachment.name,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
      return nextAttachment;
    });

    this.messageFacade.messages.update((messages) =>
      messages.map((message) =>
        message.id === messageId
          ? { ...message, attachments: [...uploadedFileAttachments, ...trailingAttachments] }
          : message
      )
    );
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

  /**
   * Sends the explicit cancel request to the backend.
   *
   * Uses `keepalive: true` for the same reason as {@link firePauseRequest} —
   * cancel is typically followed by user navigation, and we must guarantee
   * the request reaches the backend so Firestore is updated to `cancelled`.
   */
  private async fireCancelRequest(operationId: string): Promise<void> {
    const url = `${this.baseUrl}/agent-x/cancel/${operationId}`;
    try {
      const token = await this.getAuthToken?.();
      if (!token) {
        return;
      }
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        keepalive: true,
      });
    } catch (error) {
      this.logger.debug('Explicit cancel request failed (non-critical)', {
        operationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Sends the explicit pause request to the backend.
   *
   * Uses native `fetch` with `keepalive: true` so the request is guaranteed to
   * be delivered by the browser even if the user immediately refreshes or
   * navigates away after clicking pause. This is critical because pause is
   * usually followed by user action — without `keepalive`, the browser kills
   * the in-flight XHR/fetch on navigation and Firestore never receives the
   * `paused` status update, causing the operation to incorrectly appear as
   * `in-progress` after refresh.
   *
   * Returns a promise so callers can optionally await backend confirmation,
   * but errors are logged and swallowed — local UI already reflects paused.
   */
  private async firePauseRequest(operationId: string): Promise<void> {
    const url = `${this.baseUrl}/agent-x/pause/${operationId}`;
    try {
      const token = await this.getAuthToken?.();
      if (!token) {
        return;
      }
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        keepalive: true,
      });
    } catch (error) {
      this.logger.debug('Explicit pause request failed (non-critical)', {
        operationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
