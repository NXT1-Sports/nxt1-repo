import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import {
  AgentXOperationChatRunControlFacade,
  type AgentXOperationChatRunControlFacadeHost,
} from './agent-x-operation-chat-run-control.facade';

describe('AgentXOperationChatRunControlFacade', () => {
  let facade: AgentXOperationChatRunControlFacade;
  let host: AgentXOperationChatRunControlFacadeHost;

  const loggerMock = {
    child: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const streamRegistryMock = {
    abort: vi.fn(),
  };

  const operationEventServiceMock = {
    emitOperationStatusUpdated: vi.fn(),
    getEnqueueWaitingEntry: vi.fn().mockReturnValue(null),
  };

  const agentXServiceMock = {
    clearDropRecoveryOp: vi.fn(),
  };

  const messageFacadeMock = {
    messages: signal([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.child.mockReturnValue(loggerMock);

    TestBed.configureTestingModule({
      providers: [
        AgentXOperationChatRunControlFacade,
        { provide: AGENT_X_API_BASE_URL, useValue: '/api/agent-x' },
        { provide: AGENT_X_AUTH_TOKEN_FACTORY, useValue: vi.fn().mockResolvedValue(null) },
        { provide: AgentXJobService, useValue: {} },
        { provide: AgentXService, useValue: agentXServiceMock },
        { provide: AgentXStreamRegistryService, useValue: streamRegistryMock },
        { provide: AgentXOperationEventService, useValue: operationEventServiceMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn(), trackUserAction: vi.fn() },
        },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: AgentXOperationChatMessageFacade, useValue: messageFacadeMock },
        {
          provide: AgentXOperationChatAttachmentsFacade,
          useValue: { pendingFiles: signal([]), pendingConnectedSources: signal([]) },
        },
        { provide: AgentXOperationChatTransportFacade, useValue: {} },
      ],
    });

    facade = TestBed.inject(AgentXOperationChatRunControlFacade);

    host = {
      contextId: () => 'op-123',
      contextTitle: () => 'Agent X',
      contextType: () => 'operation',
      getOperationStatus: () => 'processing',
      inputValue: signal(''),
      loading: signal(true),
      retryStarted: signal(false),
      activeYieldState: signal(null),
      yieldResolved: signal(false),
      clearRealtimePipelines: vi.fn(),
      markEnqueueStopped: vi.fn(),
      setActivityPhase: vi.fn(),
      markActivityPulse: vi.fn(),
      setOperationStatus: vi.fn(),
      getCurrentOperationId: vi.fn().mockReturnValue('op-123'),
      setCurrentOperationId: vi.fn(),
      getActiveStream: vi.fn().mockReturnValue(null),
      setActiveStream: vi.fn(),
      resolveActiveThreadId: vi.fn().mockReturnValue('thread-1'),
      hasUserSent: vi.fn().mockReturnValue(true),
      markUserMessageSent: vi.fn(),
      getPendingSelectedAction: vi.fn().mockReturnValue(null),
      setPendingSelectedAction: vi.fn(),
      yieldOperationId: vi.fn().mockReturnValue('op-123'),
      uid: () => 'uid-1',
    };

    facade.configure(host);
  });

  it('clears drop recovery immediately when the user pauses a chat', () => {
    facade.pauseStream();

    expect(agentXServiceMock.clearDropRecoveryOp).toHaveBeenCalledTimes(1);
    expect(host.setActivityPhase).toHaveBeenCalledWith('paused', 'Paused');
    expect(host.setCurrentOperationId).toHaveBeenCalledWith('op-123');
  });
});
