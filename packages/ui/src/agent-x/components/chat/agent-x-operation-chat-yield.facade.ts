import { DestroyRef, Injectable, PLATFORM_ID, inject, type WritableSignal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createAgentXApi,
  type AgentXApi,
  type AgentXAttachment,
  type AgentXAttachmentType,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';
import type { AgentYieldState } from '@nxt1/core';
import { resolveApprovalSuccessText } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../services/agent-x-job.service';
import type { BillingActionResolvedEvent } from '../cards/agent-x-billing-action-card.component';
import type { AskUserReplyEvent } from '../cards/agent-x-ask-user-card.component';
import type {
  ActionCardApprovalEvent,
  ActionCardReplyEvent,
} from '../cards/agent-x-action-card.component';
import type { ConnectedAppSource } from '../modals/agent-x-attachments-sheet.component';
import type { MessageAttachment, PendingFile } from './agent-x-operation-chat.models';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';

export interface AgentXOperationChatYieldFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly resumeOperationId: () => string;
  readonly errorMessage: () => string | null;
  readonly inputValue: WritableSignal<string>;
  readonly loading: WritableSignal<boolean>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  readonly resolvedThreadId: WritableSignal<string | null>;
  loadThreadMessages(threadId: string): Promise<void>;
  getCurrentOperationId(): string | null;
  setCurrentOperationId(operationId: string | null): void;
  getActiveStream(): AbortController | null;
  setActiveStream(controller: AbortController | null): void;
  send(): Promise<void>;
  uid(): string;
  resolveFirestoreOperationId(): string | null;
  isFirestoreOperationId(id: string): boolean;
}

@Injectable()
export class AgentXOperationChatYieldFacade {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatYield');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);
  private readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);

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

  private host: AgentXOperationChatYieldFacadeHost | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.host = null;
    });
  }

  configure(host: AgentXOperationChatYieldFacadeHost): void {
    this.host = host;
  }

  onBillingActionResolved(event: BillingActionResolvedEvent): void {
    this.logger.info('Billing action resolved (operation chat)', {
      reason: event.reason,
      completed: event.completed,
    });
    this.breadcrumb.trackUserAction('billing-card-resolved', {
      reason: event.reason,
      completed: event.completed,
      source: 'operation-chat',
    });

    // Hide the inline billing action card once user acts (open usage or dismiss).
    this.messageFacade.dismissBillingActionCards(event.reason);

    if (event.completed) {
      this.messageFacade.pushMessage({
        id: this.requireHost().uid(),
        role: 'system',
        content: '✅ Billing updated — you can resend your message.',
        timestamp: new Date(),
      });
    }
  }

  async onAskUserReply(event: AskUserReplyEvent): Promise<void> {
    // Prefer the row-level operationId emitted by the card (derived from msg.operationId).
    // This ensures we resume the exact paused checkpoint, not whatever the global
    // activeYieldState happens to point at (which may be stale after a reload or
    // in a multi-operation thread).
    const operationId = event.operationId ?? this.yieldOperationId();

    this.logger.info('ask_user reply submitted', { operationId });
    this.breadcrumb.trackUserAction('ask-user-reply', {
      operationId,
      source: 'operation-chat',
    });

    if (!operationId) {
      this.logger.warn('ask_user reply missing operationId — no active yield state');
      this.toast.error('This question is no longer available. Refresh and try again.');
      return;
    }

    this.messageFacade.updateInlineYieldMessageState(operationId, 'submitting');

    const stagedFiles = this.attachmentsFacade.pendingFiles();
    const stagedConnectedSources = this.attachmentsFacade.pendingConnectedSources();
    const stagedSelectedContexts = this.attachmentsFacade.pendingSelectedContexts();
    const hasStagedAttachments =
      stagedFiles.length > 0 ||
      stagedConnectedSources.length > 0 ||
      stagedSelectedContexts.length > 0;
    let displayAttachments: MessageAttachment[] = [];
    let uploadedAttachments: AgentXAttachment[] = [];

    try {
      if (hasStagedAttachments) {
        const files = [...(await this.attachmentsFacade.waitForVideoThumbnails(stagedFiles))];
        displayAttachments = this.buildDisplayAttachments(
          files,
          stagedConnectedSources,
          stagedSelectedContexts
        );

        if (files.length > 0) {
          const authToken = (await this.getAuthToken?.().catch(() => null)) ?? null;
          if (!authToken) {
            this.toast.error(
              `Session expired: ${files.length} attached file(s) cannot be sent. Please re-authenticate.`
            );
            this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
            await this.haptics.notification('error');
            return;
          }

          uploadedAttachments = await this.attachmentsFacade.prepareAttachmentsForSend(
            files,
            authToken
          );
          if (uploadedAttachments.length !== files.length) {
            const failedCount = files.length - uploadedAttachments.length;
            this.toast.error(
              failedCount === 1
                ? '1 attachment failed to upload. Fix it and retry before sending.'
                : `${failedCount} attachments failed to upload. Fix them and retry before sending.`
            );
            this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
            await this.haptics.notification('error');
            return;
          }
        }
      }

      const result = await this.submitThreadAction({
        actionType: 'ask_user_reply',
        messageId: event.messageId,
        operationIdHint: operationId,
        response: event.answer,
        attachments: [
          ...uploadedAttachments,
          ...stagedConnectedSources.map((source) => this.toConnectedSourceAttachment(source)),
          ...stagedSelectedContexts.map((context) => this.toSelectedContextAttachment(context)),
        ],
      });

      if (result) {
        await this.haptics.notification('success');
        this.messageFacade.pushOptimisticUserReply({
          operationId,
          content: event.answer,
          ...(displayAttachments.length > 0 ? { attachments: displayAttachments } : {}),
          ...(event.messageId ? { messageId: event.messageId } : {}),
        });
        if (hasStagedAttachments) {
          this.attachmentsFacade.pendingFiles.set([]);
          this.attachmentsFacade.pendingConnectedSources.set([]);
          this.attachmentsFacade.clearPendingSelectedContexts();
        }
        this.messageFacade.settleActiveToolSteps('success');
        this.messageFacade.updateInlineYieldMessageState(operationId, 'resolved', 'Answered');

        if (result.resumed && result.operationId) {
          await this.attachToResumedOperation({
            operationId: result.operationId,
            threadId: result.threadId ?? undefined,
          });
        }

        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId,
          source: 'operation-chat-ask-user',
        });
        this.markYieldResolvedSoon();
        return;
      }

      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    } catch (error) {
      this.logger.error('ask_user reply failed', error, { operationId });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    }
  }

  async onApproveAction(event: ActionCardApprovalEvent): Promise<void> {
    // Prefer the row-level operationId emitted by the card — see onAskUserReply for rationale.
    const operationId = event.operationId ?? this.yieldOperationId();
    const approvedToolName = this.requireHost().activeYieldState()?.pendingToolCall?.toolName;
    this.logger.info('Action card approval', {
      operationId,
      decision: event.decision,
    });
    this.breadcrumb.trackUserAction('action-card-approve', {
      operationId,
      decision: event.decision,
    });
    this.messageFacade.updateInlineYieldMessageState(operationId, 'submitting');

    try {
      const result = await this.submitThreadAction({
        actionType: 'approval_decision',
        messageId: event.messageId,
        operationIdHint: operationId,
        decision: event.decision === 'approve' ? 'approved' : 'rejected',
        ...(event.toolInput ? { toolInput: event.toolInput } : {}),
        ...(event.trustForSession ? { trustForSession: true } : {}),
      });
      if (result) {
        await this.haptics.notification('success');
        const successCopy = resolveApprovalSuccessText(approvedToolName ?? '');
        const resolvedText = event.decision === 'approve' ? successCopy.badge : 'Rejected';

        this.messageFacade.updateInlineYieldMessageState(operationId, 'resolved', resolvedText);
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
          operationId,
          decision: event.decision,
          source: 'operation-chat',
        });

        if (event.decision === 'reject') {
          this.messageFacade.settleActiveToolSteps('error');
          this.messageFacade.pushMessage({
            id: `approval-rejected:${operationId}`,
            role: 'assistant',
            content: resolveApprovalRejectedText(approvedToolName ?? ''),
            timestamp: new Date(),
            operationId,
          });
          this.requireHost().activeYieldState.set(null);
        }

        if (event.decision === 'approve' && result.resumed && result.operationId) {
          await this.attachToResumedOperation({
            operationId: result.operationId,
            threadId: result.threadId ?? undefined,
          });
        }

        this.markYieldResolvedSoon();
      } else {
        this.logger.warn('Thread action approval returned null', { operationId });
        await this.haptics.notification('error');
        this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
      }
    } catch (error) {
      this.logger.error('Action card approval failed', error, { operationId });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    }
  }

  async onReplyAction(event: ActionCardReplyEvent): Promise<void> {
    // Prefer the row-level operationId emitted by the card — see onAskUserReply for rationale.
    const operationId = event.operationId ?? this.yieldOperationId();
    this.logger.info('Action card reply', { operationId });
    this.breadcrumb.trackUserAction('action-card-reply', { operationId });
    this.messageFacade.updateInlineYieldMessageState(operationId, 'submitting');

    try {
      const result = await this.submitThreadAction({
        actionType: 'ask_user_reply',
        messageId: event.messageId,
        operationIdHint: operationId,
        response: event.response,
      });

      if (result) {
        await this.haptics.notification('success');
        this.messageFacade.pushOptimisticUserReply({
          operationId,
          content: event.response,
          ...(event.messageId ? { messageId: event.messageId } : {}),
        });
        this.messageFacade.settleActiveToolSteps('success');
        this.messageFacade.updateInlineYieldMessageState(operationId, 'resolved', 'Replied');

        if (result.resumed && result.operationId) {
          await this.attachToResumedOperation({
            operationId: result.operationId,
            threadId: result.threadId ?? undefined,
          });
        }

        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId,
          source: 'operation-chat',
        });
        this.markYieldResolvedSoon();
      } else {
        this.logger.warn('Thread action reply returned null', { operationId });
        await this.haptics.notification('error');
        this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
      }
    } catch (error) {
      this.logger.error('Action card reply failed', error, { operationId });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    }
  }

  yieldOperationId(): string {
    const host = this.host;
    if (!host) {
      this.logger.debug('Yield operation id requested before configure');
      return '';
    }
    const activeYield = host.activeYieldState();
    return this.resolveYieldOperationId(activeYield ?? undefined) ?? host.contextId();
  }

  resolveYieldOperationId(yieldState?: AgentYieldState | null): string | undefined {
    const host = this.host;
    if (!host) {
      this.logger.debug('Yield operation id resolution requested before configure');
      return undefined;
    }
    const toolInputOperationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : null;

    const candidates = [
      toolInputOperationId,
      host.getCurrentOperationId()?.trim() || undefined,
      host.resumeOperationId()?.trim() || undefined,
      host.resolveFirestoreOperationId() ?? undefined,
      host.contextId()?.trim() || undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (host.isFirestoreOperationId(candidate)) return candidate;
    }

    return candidates.find((candidate): candidate is string => !!candidate);
  }

  async resumeYieldedOperation(operationId: string, response: string): Promise<boolean> {
    const host = this.requireHost();
    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken || !isPlatformBrowser(this.platformId)) {
      this.logger.warn('Cannot resume yielded operation without browser auth token', {
        operationId,
      });
      this.toast.error('Sign in again to continue this operation');
      return false;
    }

    const result = await this.api.resumeYieldedJob(operationId, response);
    if (!result?.resumed || !result.operationId) {
      this.logger.warn('Yielded operation resume failed', { operationId });
      return false;
    }

    if (!this.host || this.destroyed) {
      this.logger.debug('Skipping resumed yielded operation attach after chat teardown', {
        operationId,
        resumedOperationId: result.operationId,
      });
      return false;
    }

    const threadId = result.threadId ?? host.resolvedThreadId() ?? undefined;
    if (threadId) {
      host.resolvedThreadId.set(threadId);
    }

    host.setCurrentOperationId(result.operationId);
    host.activeYieldState.set(null);
    this.transportFacade.beginResponseTurn('resume-yielded');
    this.messageFacade.retireActiveTypingCarrier(result.operationId);

    this.messageFacade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      operationId: result.operationId,
      isTyping: true,
    });
    host.loading.set(true);

    try {
      await this.transportFacade.sendViaStream(
        {
          message: 'Resume yielded operation',
          ...(threadId ? { threadId } : {}),
          resumeOperationId: result.operationId,
        },
        authToken
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to attach to resumed yielded operation stream', error, {
        operationId,
        resumedOperationId: result.operationId,
      });
      this.messageFacade.replaceTyping({
        id: host.uid(),
        role: 'assistant',
        content: 'Your reply was saved, but I could not reconnect to the resumed operation.',
        timestamp: new Date(),
        error: true,
      });
      return false;
    } finally {
      host.loading.set(false);
    }
  }

  async resolveInlineApproval(params: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    toolInput?: Record<string, unknown>;
    successMessage?: string;
    trustForSession?: boolean;
  }): Promise<boolean> {
    this.logger.info('Resolving inline approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:inline-approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });

    try {
      const result = await this.api.resolveApproval(
        params.approvalId,
        params.decision,
        params.toolInput,
        params.trustForSession
      );

      if (!result) {
        this.logger.warn('Inline approval returned null', {
          approvalId: params.approvalId,
          decision: params.decision,
        });
        this.toast.error('Failed to process approval');
        return false;
      }

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
        approvalId: params.approvalId,
        decision: params.decision,
        resumed: result.resumed,
      });

      if (params.decision === 'rejected') {
        this.toast.success(params.successMessage ?? 'Request rejected');
        return true;
      }

      if (params.successMessage) {
        this.toast.success(params.successMessage);
      }

      if (result.resumed && result.operationId) {
        await this.attachToResumedOperation({
          operationId: result.operationId,
          threadId: result.threadId ?? undefined,
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to resolve inline approval', error, {
        approvalId: params.approvalId,
        decision: params.decision,
      });
      this.toast.error('Failed to process approval');
      return false;
    }
  }

  private buildDisplayAttachments(
    files: readonly PendingFile[],
    connectedSources: readonly ConnectedAppSource[],
    selectedContexts: readonly AgentXSelectedContext[]
  ): MessageAttachment[] {
    const fileDisplayAttachments: MessageAttachment[] = files.map((pendingFile) => ({
      url: pendingFile.isVideo
        ? (pendingFile.nativeWebPath ?? pendingFile.previewUrl ?? '')
        : (pendingFile.previewUrl ?? ''),
      type: pendingFile.isImage ? 'image' : pendingFile.isVideo ? 'video' : 'doc',
      name: pendingFile.file.name,
      ...(pendingFile.isVideo && pendingFile.previewUrl
        ? { thumbnailUrl: pendingFile.previewUrl }
        : {}),
    }));

    const sourceDisplayAttachments: MessageAttachment[] = connectedSources.map((source) => ({
      url: source.profileUrl,
      type: 'app',
      name: source.platform,
      platform: source.platform,
      faviconUrl: source.faviconUrl,
    }));

    const selectedContextDisplayAttachments: MessageAttachment[] = selectedContexts.map((context) =>
      this.toSelectedContextDisplayAttachment(context)
    );

    return [
      ...fileDisplayAttachments,
      ...sourceDisplayAttachments,
      ...selectedContextDisplayAttachments,
    ];
  }

  private toConnectedSourceAttachment(source: ConnectedAppSource): AgentXAttachment {
    return {
      id: this.createAttachmentId(),
      url: source.profileUrl,
      name: source.platform,
      mimeType: 'application/x-connected-source',
      type: 'app' satisfies AgentXAttachmentType,
      sizeBytes: 1,
      ...(source.platform ? { platform: source.platform } : {}),
      ...(source.profileUrl ? { profileUrl: source.profileUrl } : {}),
      ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
    };
  }

  private toSelectedContextAttachment(context: AgentXSelectedContext): AgentXAttachment {
    const title = context.title.trim() || 'Selected context';
    const mediaUrl =
      context.media?.videoUrl?.trim() ||
      context.media?.imageUrl?.trim() ||
      context.media?.thumbnailUrl?.trim();
    const contextUrl = mediaUrl || `context://${encodeURIComponent(context.id.trim())}`;
    const sourceLabel = context.source?.label?.trim() || context.source?.type;

    return {
      id: this.createAttachmentId(),
      url: contextUrl,
      name: title,
      mimeType: 'application/x-selected-context',
      type: 'app' satisfies AgentXAttachmentType,
      sizeBytes: 1,
      ...(sourceLabel ? { platform: sourceLabel } : {}),
      ...(mediaUrl ? { profileUrl: mediaUrl } : {}),
    };
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

  private createAttachmentId(): string {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (typeof randomUuid === 'string' && randomUuid.trim().length > 0) {
      return randomUuid;
    }

    return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async submitThreadAction(params: {
    actionType: 'ask_user_reply' | 'approval_decision';
    messageId?: string;
    operationIdHint?: string;
    response?: string;
    attachments?: readonly AgentXAttachment[];
    decision?: 'approved' | 'rejected';
    toolInput?: Record<string, unknown>;
    trustForSession?: boolean;
  }): Promise<{
    actionType: 'ask_user_reply' | 'approval_decision';
    resumed: boolean;
    decision?: 'approved' | 'rejected';
    operationId?: string;
    threadId?: string | null;
  } | null> {
    const host = this.requireHost();
    const threadId = host.threadId()?.trim() || host.resolvedThreadId()?.trim() || undefined;

    if (!threadId) {
      this.logger.warn('Thread action rejected: missing threadId', {
        actionType: params.actionType,
      });
      this.toast.error('This thread is unavailable. Refresh and try again.');
      return null;
    }

    const result = await this.api.submitThreadAction(threadId, {
      actionType: params.actionType,
      ...(params.messageId ? { messageId: params.messageId } : {}),
      ...(params.operationIdHint ? { operationIdHint: params.operationIdHint } : {}),
      ...(params.response ? { response: params.response } : {}),
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
      ...(params.decision ? { decision: params.decision } : {}),
      ...(params.toolInput ? { toolInput: params.toolInput } : {}),
      ...(params.trustForSession ? { trustForSession: true } : {}),
    });

    if (!result) {
      this.toast.error('Failed to process action. Please retry.');
      return null;
    }

    return result;
  }

  async attachToResumedOperation(params: {
    operationId: string;
    threadId?: string;
    afterSeq?: number;
  }): Promise<void> {
    const host = this.requireHost();
    const trimmedOperationId = params.operationId?.trim();
    if (!trimmedOperationId) {
      this.logger.warn('Cannot attach to resumed operation without operationId');
      return;
    }

    if (
      host.getCurrentOperationId() === trimmedOperationId &&
      host.getActiveStream() &&
      !host.getActiveStream()!.signal.aborted
    ) {
      this.logger.debug('Skipping duplicate resumed stream attach (already active)', {
        operationId: trimmedOperationId,
      });
      return;
    }

    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken || !isPlatformBrowser(this.platformId)) {
      this.logger.info('Approval resumed without live stream attachment', {
        operationId: trimmedOperationId,
      });
      if (params.threadId) {
        host.resolvedThreadId.set(params.threadId);
      }
      host.setCurrentOperationId(trimmedOperationId);
      host.activeYieldState.set(null);
      this.messageFacade.retireActiveTypingCarrier(trimmedOperationId);

      const refreshThreadId =
        params.threadId?.trim() || host.resolvedThreadId()?.trim() || host.threadId().trim();
      if (refreshThreadId) {
        await host.loadThreadMessages(refreshThreadId).catch((error) => {
          this.logger.error(
            'Failed to refresh thread after approval resumed without stream',
            error,
            {
              operationId: trimmedOperationId,
              threadId: refreshThreadId,
            }
          );
        });
      }
      return;
    }

    if (!this.host || this.destroyed) {
      this.logger.debug('Skipping resumed operation stream attach after chat teardown', {
        operationId: trimmedOperationId,
      });
      return;
    }

    host.getActiveStream()?.abort();
    host.setActiveStream(null);

    if (params.threadId) {
      host.resolvedThreadId.set(params.threadId);
    }

    host.setCurrentOperationId(trimmedOperationId);
    host.activeYieldState.set(null);
    this.transportFacade.beginResponseTurn('attach-resumed-operation');
    this.messageFacade.retireActiveTypingCarrier(trimmedOperationId);

    this.messageFacade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      operationId: trimmedOperationId,
      isTyping: true,
    });
    host.loading.set(true);

    try {
      await this.transportFacade.sendViaStream(
        {
          message: 'Resume approved operation',
          ...(params.threadId ? { threadId: params.threadId } : {}),
          resumeOperationId: trimmedOperationId,
          ...(params.afterSeq !== undefined ? { afterSeq: params.afterSeq } : {}),
        },
        authToken
      );
    } catch (error) {
      this.logger.error('Failed to attach to resumed operation stream', error, {
        operationId: trimmedOperationId,
      });
      this.messageFacade.replaceTyping({
        id: host.uid(),
        role: 'assistant',
        content: 'Failed to resume operation. Please refresh and try again.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      host.loading.set(false);
    }
  }

  private requireHost(): AgentXOperationChatYieldFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatYieldFacade used before configure()');
    }

    return this.host;
  }

  private markYieldResolvedSoon(): void {
    setTimeout(() => {
      if (this.destroyed || !this.host) {
        this.logger.debug('Skipping yieldResolved update after chat teardown');
        return;
      }

      this.host.yieldResolved.set(true);
    }, 300);
  }
}

function resolveApprovalRejectedText(toolName: string): string {
  const normalizedToolName = toolName.trim().toLowerCase();

  if (normalizedToolName === 'batch_send_email') {
    return "Understood. I won't send those emails.";
  }

  if (/email|gmail|outlook|mail/.test(normalizedToolName)) {
    return "Understood. I won't send that email.";
  }

  return "Understood. I won't proceed with that action.";
}
