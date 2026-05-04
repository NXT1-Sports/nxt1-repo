import { Injectable, PLATFORM_ID, inject, type WritableSignal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createAgentXApi, type AgentXApi } from '@nxt1/core/ai';
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
  AgentXJobService,
} from '../../services/agent-x-job.service';
import type { BillingActionResolvedEvent } from '../cards/agent-x-billing-action-card.component';
import type { DraftSubmittedEvent } from '../cards/agent-x-draft-card.component';
import type { ConfirmationActionEvent } from '../cards/agent-x-confirmation-card.component';
import type { AskUserReplyEvent } from '../cards/agent-x-ask-user-card.component';
import type {
  ActionCardApprovalEvent,
  ActionCardReplyEvent,
} from '../cards/agent-x-action-card.component';
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
  private readonly jobService = inject(AgentXJobService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatYield');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
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

  onDraftSubmitted(event: DraftSubmittedEvent): void {
    this.logger.info('Draft email approved', {
      toEmail: event.toEmail,
      subject: event.subject?.slice(0, 50),
      approvalId: event.approvalId,
    });
    this.breadcrumb.trackUserAction('draft-email-approved', {
      toEmail: event.toEmail,
      source: 'operation-chat',
      approvalId: event.approvalId,
    });

    if (event.approvalId) {
      void this.resolveInlineApproval({
        approvalId: event.approvalId,
        decision: 'approved',
        toolInput: {
          ...(event.toEmail ? { toEmail: event.toEmail } : {}),
          subject: event.subject,
          bodyHtml: event.content,
        },
        successMessage: 'Draft approved',
      });
      return;
    }

    this.logger.warn('Inline draft card missing approvalId', {
      toEmail: event.toEmail,
      subject: event.subject?.slice(0, 50),
    });
    this.toast.error('This draft can no longer be sent directly. Refresh and try again.');
  }

  onConfirmationAction(event: ConfirmationActionEvent): void {
    if (!event.approvalId) {
      this.logger.warn('Inline confirmation action missing approvalId', {
        actionId: event.actionId,
      });
      return;
    }

    const decision =
      event.actionId === 'approve' ? 'approved' : event.actionId === 'reject' ? 'rejected' : null;

    if (!decision) {
      this.logger.warn('Unsupported inline confirmation action', {
        actionId: event.actionId,
        approvalId: event.approvalId,
      });
      return;
    }

    void this.resolveInlineApproval({
      approvalId: event.approvalId,
      decision,
      successMessage: decision === 'approved' ? 'Approved' : 'Request rejected',
    });
  }

  async onAskUserReply(event: AskUserReplyEvent): Promise<void> {
    const host = this.requireHost();
    const operationId = event.operationId?.trim() || this.yieldOperationId();

    this.logger.info('ask_user reply submitted', {
      threadId: event.threadId,
      operationId,
    });
    this.breadcrumb.trackUserAction('ask-user-reply', {
      threadId: event.threadId,
      operationId,
      source: 'operation-chat',
    });

    if (!operationId) {
      this.logger.warn('ask_user reply missing operationId', {
        threadId: event.threadId,
      });
      this.toast.error('This question is no longer available. Refresh and try again.');
      return;
    }

    this.messageFacade.updateInlineYieldMessageState(operationId, 'submitting');

    try {
      const success = await this.resumeYieldedOperation(operationId, event.answer);
      if (success) {
        await this.haptics.notification('success');
        this.messageFacade.updateInlineYieldMessageState(
          operationId,
          'resolved',
          'Reply sent — resuming'
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId,
          source: 'operation-chat-ask-user',
        });
        setTimeout(() => {
          host.yieldResolved.set(true);
        }, 300);
        return;
      }

      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    } catch (error) {
      this.logger.error('ask_user reply failed', error, {
        threadId: event.threadId,
        operationId,
      });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(operationId, 'idle');
    }
  }

  async onApproveAction(event: ActionCardApprovalEvent): Promise<void> {
    const host = this.requireHost();
    const approvedToolName = host.activeYieldState()?.pendingToolCall?.toolName;
    this.logger.info('Action card approval', {
      operationId: event.operationId,
      decision: event.decision,
    });
    this.breadcrumb.trackUserAction('action-card-approve', {
      operationId: event.operationId,
      decision: event.decision,
    });
    this.messageFacade.updateInlineYieldMessageState(event.operationId, 'submitting');

    let approvalId = event.approvalId ?? host.activeYieldState()?.approvalId;
    if (!approvalId) {
      const recovered = await this.api.findPendingApprovalByOperation(event.operationId);
      if (recovered?.approvalId) {
        approvalId = recovered.approvalId;
        this.logger.info('Recovered missing approvalId from pending approvals', {
          operationId: event.operationId,
          approvalId,
          expiresAt: recovered.expiresAt,
        });
      }
    }

    if (!approvalId) {
      this.logger.warn('Action card approval missing approvalId', {
        operationId: event.operationId,
        decision: event.decision,
      });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(event.operationId, 'idle');
      this.toast.error('This approval request is no longer available. Refresh and try again.');
      return;
    }

    try {
      const success = await this.resolveInlineApproval({
        approvalId,
        decision: event.decision === 'approve' ? 'approved' : 'rejected',
        ...(event.toolInput ? { toolInput: event.toolInput } : {}),
        successMessage: event.decision === 'approve' ? 'Approved' : 'Request rejected',
        ...(event.trustForSession ? { trustForSession: true } : {}),
      });
      if (success) {
        await this.haptics.notification('success');
        const successCopy = resolveApprovalSuccessText(approvedToolName ?? '');
        const resolvedText = event.decision === 'approve' ? successCopy.badge : 'Rejected';

        this.messageFacade.updateInlineYieldMessageState(
          event.operationId,
          'resolved',
          resolvedText
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
          operationId: event.operationId,
          decision: event.decision,
          approvalId,
          source: 'operation-chat',
        });
        setTimeout(() => {
          host.yieldResolved.set(true);
        }, 150);
      } else {
        this.logger.warn('Approve API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.messageFacade.updateInlineYieldMessageState(event.operationId, 'idle');
      }
    } catch (error) {
      this.logger.error('Action card approval failed', error, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(event.operationId, 'idle');
    }
  }

  async onReplyAction(event: ActionCardReplyEvent): Promise<void> {
    const host = this.requireHost();
    this.logger.info('Action card reply', { operationId: event.operationId });
    this.breadcrumb.trackUserAction('action-card-reply', {
      operationId: event.operationId,
    });
    this.messageFacade.updateInlineYieldMessageState(event.operationId, 'submitting');

    try {
      const activeYield = host.activeYieldState();
      const success =
        activeYield?.reason === 'needs_input'
          ? await this.resumeYieldedOperation(event.operationId, event.response)
          : await this.jobService.replyOperation(event.operationId, event.response);
      if (success) {
        await this.haptics.notification('success');
        this.messageFacade.updateInlineYieldMessageState(
          event.operationId,
          'resolved',
          'Reply sent — resuming'
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId: event.operationId,
          source: 'operation-chat',
        });
        setTimeout(() => {
          host.yieldResolved.set(true);
          this.messageFacade.pushMessage({
            id: host.uid(),
            role: 'user',
            content: event.response,
            timestamp: new Date(),
          });
          this.messageFacade.pushMessage({
            id: host.uid(),
            role: 'system',
            content: '✅ Reply sent — Agent X is resuming with your input.',
            timestamp: new Date(),
          });
        }, 800);
      } else {
        this.logger.warn('Reply API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.messageFacade.updateInlineYieldMessageState(event.operationId, 'idle');
      }
    } catch (error) {
      this.logger.error('Action card reply failed', error, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.messageFacade.updateInlineYieldMessageState(event.operationId, 'idle');
    }
  }

  yieldOperationId(): string {
    const host = this.requireHost();
    const activeYield = host.activeYieldState();
    return this.resolveYieldOperationId(activeYield ?? undefined) ?? host.contextId();
  }

  resolveYieldOperationId(yieldState?: AgentYieldState | null): string | undefined {
    const host = this.requireHost();
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

    const threadId = result.threadId ?? host.resolvedThreadId() ?? undefined;
    if (threadId) {
      host.resolvedThreadId.set(threadId);
    }

    host.setCurrentOperationId(result.operationId);
    host.activeYieldState.set(null);
    this.transportFacade.beginResponseTurn('resume-yielded');

    this.messageFacade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
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

    this.messageFacade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
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
}
