import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentXRichCard } from '@nxt1/core/ai';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import {
  AgentXOperationChatMessageFacade,
  type AgentXOperationChatMessageFacadeHost,
} from './agent-x-operation-chat-message.facade';

describe('AgentXOperationChatMessageFacade', () => {
  let facade: AgentXOperationChatMessageFacade;
  let host: AgentXOperationChatMessageFacadeHost;
  let loadThreadMessages: ReturnType<typeof vi.fn>;

  const loggerMock = {
    child: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.child.mockReturnValue(loggerMock);
    loadThreadMessages = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        AgentXOperationChatMessageFacade,
        {
          provide: HttpClient,
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
          },
        },
        { provide: AGENT_X_API_BASE_URL, useValue: '/api/agent-x' },
        { provide: HapticsService, useValue: { impact: vi.fn(), notification: vi.fn() } },
        { provide: NxtToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackUserAction: vi.fn(), trackStateChange: vi.fn() },
        },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
      ],
    });

    facade = TestBed.inject(AgentXOperationChatMessageFacade);
    host = {
      contextId: () => 'ctx-1',
      contextType: () => 'operation',
      threadId: () => 'thread-1',
      resolvedThreadId: signal<string | null>('thread-1'),
      resolveActiveThreadId: () => 'thread-1',
      loadThreadMessages,
      attachToResumedOperation: vi.fn().mockResolvedValue(undefined),
    };
    facade.configure(host);
  });

  it('keeps a local rich-card message when completion arrives without a persisted message id', () => {
    const billingCard: AgentXRichCard = {
      agentId: 'router',
      type: 'billing-action',
      title: 'Action Required',
      payload: {
        reason: 'payment_method_required',
        description: 'Add a payment method to continue.',
      },
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'Add a payment method to continue.',
        timestamp: new Date(),
        cards: [billingCard],
      },
    ]);

    facade.finalizeStreamedAssistantMessage({
      streamingId: 'typing',
      success: true,
      threadId: 'thread-1',
      source: 'sse-done',
    });

    const [message] = facade.messages();
    expect(message.id).not.toBe('typing');
    expect(message.cards).toEqual([billingCard]);
    expect(message.isTyping).toBe(false);
    expect(loadThreadMessages).not.toHaveBeenCalled();
  });

  it('reloads persisted thread messages when completion has no visible content', () => {
    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    facade.finalizeStreamedAssistantMessage({
      streamingId: 'typing',
      success: true,
      threadId: 'thread-1',
      source: 'sse-done',
    });

    const [message] = facade.messages();
    expect(message.id).toBe('typing');
    expect(message.content).toBe('Resumed. Waiting for synced updates from Agent X…');
    expect(loadThreadMessages).toHaveBeenCalledWith('thread-1');
  });
});
