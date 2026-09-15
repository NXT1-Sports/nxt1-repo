import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentYieldState } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';
import {
  AgentXOperationChatYieldFacade,
  type AgentXOperationChatYieldFacadeHost,
} from './agent-x-operation-chat-yield.facade';

describe('AgentXOperationChatYieldFacade', () => {
  let facade: AgentXOperationChatYieldFacade;
  let host: AgentXOperationChatYieldFacadeHost;
  let operationStatus:
    | 'processing'
    | 'complete'
    | 'error'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'cancelled'
    | null;
  let activityPhase:
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
    | 'cancelled';

  const httpPost = vi.fn();
  const loggerMock = {
    child: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const hapticsMock = {
    notification: vi.fn().mockResolvedValue(undefined),
  };
  const toastMock = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const breadcrumbMock = {
    trackUserAction: vi.fn(),
    trackStateChange: vi.fn(),
  };
  const analyticsMock = {
    trackEvent: vi.fn(),
  };
  const attachmentsFacadeMock = {
    pendingFiles: vi.fn().mockReturnValue([]),
    pendingConnectedSources: vi.fn().mockReturnValue([]),
    pendingSelectedContexts: vi.fn().mockReturnValue([]),
    clearPendingSelectedContexts: vi.fn(),
    waitForVideoThumbnails: vi.fn(),
    prepareAttachmentsForSend: vi.fn(),
  };
  const messageFacadeMock = {
    updateInlineYieldMessageState: vi.fn(),
    settleActiveToolSteps: vi.fn(),
    pushMessage: vi.fn(),
    retireActiveTypingCarrier: vi.fn(),
  };
  const transportFacadeMock = {
    emitResponseCompleteOnce: vi.fn(),
    beginResponseTurn: vi.fn(),
    sendViaStream: vi.fn(),
  };
  const streamRegistryMock = {
    abort: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.child.mockReturnValue(loggerMock);
    httpPost.mockReturnValue(
      of({
        success: true,
        data: {
          actionType: 'approval_decision',
          decision: 'rejected',
          resumed: false,
        },
      })
    );

    TestBed.configureTestingModule({
      providers: [
        AgentXOperationChatYieldFacade,
        {
          provide: HttpClient,
          useValue: {
            get: vi.fn(),
            post: httpPost,
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
          },
        },
        { provide: AGENT_X_API_BASE_URL, useValue: '/api/agent-x' },
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: AgentXOperationChatAttachmentsFacade, useValue: attachmentsFacadeMock },
        { provide: AgentXOperationChatMessageFacade, useValue: messageFacadeMock },
        { provide: AgentXOperationChatTransportFacade, useValue: transportFacadeMock },
        { provide: AgentXStreamRegistryService, useValue: streamRegistryMock },
      ],
    });

    facade = TestBed.inject(AgentXOperationChatYieldFacade);
    operationStatus = 'awaiting_approval';
    activityPhase = 'streaming';
    const activeStream = new AbortController();
    const activeYieldState = signal<AgentYieldState | null>({
      reason: 'needs_approval',
      promptToUser: 'Review and approve this email draft before sending.',
      approvalId: 'approval-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-call-1',
        toolInput: {
          operationId: 'op-123',
          toEmail: 'john@nxt1sports.com',
          subject: 'Test',
        },
      },
    });

    host = {
      contextId: () => 'op-123',
      contextType: () => 'operation',
      threadId: () => 'thread-1',
      resumeOperationId: () => '',
      errorMessage: () => null,
      inputValue: signal(''),
      loading: signal(true),
      activeYieldState,
      yieldResolved: signal(false),
      resolvedThreadId: signal<string | null>('thread-1'),
      clearRealtimePipelines: vi.fn(),
      loadThreadMessages: vi.fn().mockResolvedValue(undefined),
      getCurrentOperationId: vi.fn().mockReturnValue('op-123'),
      setCurrentOperationId: vi.fn(),
      getActiveStream: vi.fn().mockReturnValue(activeStream),
      setActiveStream: vi.fn(),
      setOperationStatus: vi.fn((next) => {
        operationStatus = next;
      }),
      setActivityPhase: vi.fn((next) => {
        activityPhase = next;
      }),
      send: vi.fn(),
      uid: () => 'msg-1',
      resolveFirestoreOperationId: () => 'op-123',
      isFirestoreOperationId: (id) => id === 'op-123',
    };

    facade.configure(host);
  });

  it('clears live chat state after rejecting an approval action', async () => {
    await facade.onApproveAction({
      messageId: 'message-1',
      operationId: 'op-123',
      decision: 'reject',
    });

    expect(httpPost).toHaveBeenCalledOnce();
    expect(streamRegistryMock.abort).toHaveBeenCalledWith('thread-1');
    expect(host.clearRealtimePipelines).toHaveBeenCalledOnce();
    expect(host.setOperationStatus).toHaveBeenCalledWith('cancelled');
    expect(operationStatus).toBe('cancelled');
    expect(host.setActivityPhase).toHaveBeenCalledWith('cancelled', 'Rejected');
    expect(activityPhase).toBe('cancelled');
    expect(host.loading()).toBe(false);
    expect(host.setActiveStream).toHaveBeenCalledWith(null);
    expect(host.activeYieldState()).toBeNull();
    expect(host.yieldResolved()).toBe(true);
    expect(messageFacadeMock.retireActiveTypingCarrier).toHaveBeenCalledWith('op-123');
    expect(transportFacadeMock.emitResponseCompleteOnce).toHaveBeenCalledWith('approval-rejected');
    expect(messageFacadeMock.updateInlineYieldMessageState).toHaveBeenNthCalledWith(
      2,
      'op-123',
      'resolved',
      'Rejected'
    );
    expect(messageFacadeMock.pushMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-123',
        role: 'assistant',
        content: "Understood. I won't send that email.",
      })
    );
    expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
      APP_EVENTS.AGENT_X_OPERATION_APPROVED,
      expect.objectContaining({
        operationId: 'op-123',
        decision: 'reject',
        source: 'operation-chat',
      })
    );
  });
});
