import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentYieldState } from '@nxt1/core';
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
    expect(message.id).not.toBe('typing');
    expect(message.content).toBe('Resumed. Waiting for synced updates from Agent X…');
    expect(message.isTyping).toBe(false);
    expect(loadThreadMessages).toHaveBeenCalledWith('thread-1');
  });

  it('drops the streamed row when the persisted final message already exists locally', () => {
    const persistedMessageId = '507f1f77bcf86cd799439011';
    const persistedCard: AgentXRichCard = {
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
        id: persistedMessageId,
        role: 'assistant',
        content: 'Add a payment method to continue.',
        timestamp: new Date('2026-06-15T12:00:00.000Z'),
        cards: [persistedCard],
      },
      {
        id: 'typing',
        role: 'assistant',
        content: 'Add a payment method to continue.',
        timestamp: new Date('2026-06-15T12:00:01.000Z'),
        cards: [persistedCard],
      },
    ]);

    facade.finalizeStreamedAssistantMessage({
      streamingId: 'typing',
      messageId: persistedMessageId,
      success: true,
      threadId: 'thread-1',
      source: 'sse-done',
    });

    expect(facade.messages()).toEqual([
      {
        id: persistedMessageId,
        role: 'assistant',
        content: 'Add a payment method to continue.',
        timestamp: new Date('2026-06-15T12:00:00.000Z'),
        cards: [persistedCard],
      },
    ]);
    expect(loadThreadMessages).toHaveBeenCalledWith('thread-1');
  });

  it('preserves streamed context when converting to an ask-user yield row', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_input',
      promptToUser: 'What should I focus on first for recruiting outreach?',
      agentId: 'router',
      pendingToolCall: {
        toolName: 'ask_user',
        toolCallId: 'tool-1',
        toolInput: {
          question: 'What should I focus on first for recruiting outreach?',
        },
      },
      messages: [],
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'I need your direction before I continue.',
        timestamp: new Date('2026-05-04T19:00:00.000Z'),
        steps: [
          {
            id: 'tool-1',
            label: 'Ask user',
            status: 'active',
            stageType: 'tool',
          },
        ],
      },
    ]);

    facade.upsertInlineYieldMessage(yieldState, 'op-1');

    const typing = facade.messages().find((message) => message.id === 'typing');
    const yieldMessage = facade
      .messages()
      .find((message) => message.yieldState?.reason === 'needs_input');
    const committedProse = facade
      .messages()
      .find(
        (message) =>
          message.role === 'assistant' &&
          !message.yieldState &&
          message.content === 'I need your direction before I continue.'
      );

    // Typing sentinel is committed in place as a separate assistant bubble so
    // the streamed prose/tool-steps remain visible above the yield bubble.
    expect(typing).toBeUndefined();
    expect(committedProse).toBeDefined();
    expect(committedProse?.isTyping).toBe(false);
    expect(committedProse?.steps ?? []).toEqual([
      {
        id: 'tool-1',
        label: 'Ask user',
        status: 'active',
        stageType: 'tool',
      },
    ]);
    // Yield bubble carries ONLY the question (via yieldState.promptToUser).
    expect(yieldMessage?.content).toBe('');
    expect(yieldMessage?.steps ?? []).toEqual([]);
    expect(yieldMessage?.yieldState).toEqual(yieldState);
  });

  it('preserves streamed context when converting to an approval yield row', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser:
        'Review and approve this email draft before sending. Send an email to john@nxt1sports.com.',
      agentId: 'router',
      approvalId: 'approval-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-1',
        toolInput: {
          toEmail: 'john@nxt1sports.com',
          subject: 'Check Out NXT 1 Sports',
        },
      },
      messages: [],
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: "I'll execute both steps in order.",
        timestamp: new Date('2026-05-04T19:00:00.000Z'),
        steps: [
          {
            id: 'tool-search',
            label: 'Search college database',
            status: 'success',
            stageType: 'tool',
          },
        ],
      },
    ]);

    facade.upsertInlineYieldMessage(yieldState, 'op-1');

    const yieldMessage = facade
      .messages()
      .find((message) => message.yieldState?.approvalId === 'approval-1');
    const committedProse = facade
      .messages()
      .find(
        (message) =>
          message.role === 'assistant' &&
          !message.yieldState &&
          message.content === "I'll execute both steps in order."
      );

    expect(yieldMessage).toBeDefined();
    expect(yieldMessage?.content).toBe('');
    expect(yieldMessage?.steps ?? []).toEqual([]);
    expect(committedProse).toBeDefined();
    expect(committedProse?.isTyping).toBe(false);
    expect(committedProse?.steps ?? []).toEqual([
      {
        id: 'tool-search',
        label: 'Search college database',
        status: 'success',
        stageType: 'tool',
      },
    ]);
    expect(facade.messages().some((message) => message.id === 'typing')).toBe(false);
  });

  it('removes a duplicate plain assistant prelude when committing approval typing output', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Review and approve this email draft before sending.',
      agentId: 'router',
      approvalId: 'approval-dedupe-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-dedupe-1',
        toolInput: {
          operationId: 'op-dedupe-1',
          toEmail: 'john@nxt1sports.com',
          subject: 'College Football Program Search Results',
        },
      },
      messages: [],
    };

    facade.messages.set([
      {
        id: 'assistant-prelude-duplicate',
        role: 'assistant',
        content: 'Searching 5 football colleges for a QB in the 2028 class now...',
        operationId: 'op-dedupe-1',
        timestamp: new Date('2026-06-12T20:00:00.000Z'),
      },
      {
        id: 'typing',
        role: 'assistant',
        content: 'Searching 5 football colleges for a QB in the 2028 class now...',
        operationId: 'op-dedupe-1',
        timestamp: new Date('2026-06-12T20:00:01.000Z'),
        parts: [
          {
            type: 'text',
            content: 'Searching 5 football colleges for a QB in the 2028 class now...',
          },
        ],
        steps: [
          {
            id: 'tool-search-colleges',
            label: 'Searching college database: Football',
            status: 'success',
            stageType: 'tool',
          },
        ],
      },
    ]);

    facade.upsertInlineYieldMessage(yieldState, 'op-dedupe-1');

    const messages = facade.messages();
    const duplicatePreludeRows = messages.filter(
      (message) =>
        message.content === 'Searching 5 football colleges for a QB in the 2028 class now...'
    );
    const committedRow = duplicatePreludeRows.find((message) => !message.yieldState);
    const yieldMessage = messages.find(
      (message) => message.yieldState?.approvalId === 'approval-dedupe-1'
    );

    expect(duplicatePreludeRows).toHaveLength(1);
    expect(committedRow?.steps?.map((step) => step.id)).toEqual(['tool-search-colleges']);
    expect(committedRow?.semanticPhase).toBe('assistant_partial');
    expect(committedRow?.parts).toEqual([
      { type: 'text', content: 'Searching 5 football colleges for a QB in the 2028 class now...' },
    ]);
    expect(yieldMessage?.content).toBe('');
  });

  it('flushes pending typing and leaves no stale typing row after approval yield conversion', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Review and approve this scheduled email.',
      agentId: 'router',
      approvalId: 'approval-flush-1',
      pendingToolCall: {
        toolName: 'schedule_email',
        toolCallId: 'tool-flush-1',
        toolInput: {
          toEmail: 'john@nxt1sports.com',
          scheduledFor: '2026-06-12T19:00:00.000Z',
        },
      },
      messages: [],
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'I drafted the schedule request.',
        timestamp: new Date('2026-06-12T18:00:00.000Z'),
      },
    ]);
    facade.queueTypingDelta(' Please review it before I continue.');

    facade.upsertInlineYieldMessage(yieldState, 'op-flush-1');

    const yieldMessage = facade
      .messages()
      .find((message) => message.yieldState?.approvalId === 'approval-flush-1');
    const committedProse = facade
      .messages()
      .find(
        (message) =>
          message.role === 'assistant' &&
          !message.yieldState &&
          message.content === 'I drafted the schedule request. Please review it before I continue.'
      );

    expect(committedProse?.content).toBe(
      'I drafted the schedule request. Please review it before I continue.'
    );
    expect(committedProse?.parts).toEqual([
      { type: 'text', content: ' Please review it before I continue.' },
    ]);
    expect(yieldMessage?.content).toBe('');
    expect(yieldMessage?.parts ?? []).toEqual([]);
    expect(facade.messages().some((message) => message.id === 'typing')).toBe(false);
  });

  it('allows fresh resumed typing after an approval yield resolves and appends resumed delta after yield', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Review this email before sending.',
      agentId: 'router',
      approvalId: 'approval-resume-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-resume-1',
        toolInput: {
          operationId: 'op-resume-1',
          toEmail: 'john@nxt1sports.com',
          subject: 'Check Out NXT 1 Sports',
        },
      },
      messages: [],
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'I drafted an email for your review.',
        timestamp: new Date('2026-06-12T18:00:00.000Z'),
      },
    ]);

    facade.upsertInlineYieldMessage(yieldState, 'op-resume-1');
    facade.updateInlineYieldMessageState('op-resume-1', 'resolved', 'Approved');
    facade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-12T18:01:00.000Z'),
      isTyping: true,
    });
    facade.queueTypingDelta('Sending the approved email now.');
    facade.flushPendingTypingDelta();

    const messages = facade.messages();
    const yieldIndex = messages.findIndex(
      (message) => message.yieldState?.approvalId === 'approval-resume-1'
    );
    const typingIndex = messages.findIndex((message) => message.id === 'typing');

    expect(yieldIndex).toBeGreaterThanOrEqual(0);
    expect(typingIndex).toBeGreaterThan(yieldIndex);
    expect(messages[typingIndex]?.content).toBe('Sending the approved email now.');
  });

  it('removes an empty stale typing row so new typing is not deduped', () => {
    facade.messages.set([
      {
        id: 'yield:approval-empty-1',
        role: 'assistant',
        content: 'I drafted an email for your review.',
        timestamp: new Date('2026-06-12T18:00:00.000Z'),
      },
      {
        id: 'typing',
        role: 'assistant',
        content: '',
        timestamp: new Date('2026-06-12T18:01:00.000Z'),
        isTyping: false,
      },
    ]);

    facade.retireActiveTypingCarrier('op-empty-1');
    facade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-12T18:02:00.000Z'),
      isTyping: true,
    });

    const typingMessages = facade.messages().filter((message) => message.id === 'typing');
    expect(typingMessages).toHaveLength(1);
    expect(typingMessages[0]?.isTyping).toBe(true);
    expect(typingMessages[0]?.timestamp.toISOString()).toBe('2026-06-12T18:02:00.000Z');
  });

  it('removes a stale typing row when its visible payload is already carried', () => {
    facade.messages.set([
      {
        id: 'yield:approval-carried-1',
        role: 'assistant',
        content: 'I drafted an email for your review.',
        timestamp: new Date('2026-06-12T18:00:00.000Z'),
        steps: [
          {
            id: 'tool-search',
            label: 'Search contacts',
            status: 'success',
            stageType: 'tool',
          },
        ],
      },
      {
        id: 'typing',
        role: 'assistant',
        content: 'I drafted an email for your review.',
        timestamp: new Date('2026-06-12T18:01:00.000Z'),
        isTyping: false,
        steps: [
          {
            id: 'tool-search',
            label: 'Search contacts',
            status: 'success',
            stageType: 'tool',
          },
        ],
      },
    ]);

    facade.retireActiveTypingCarrier('op-carried-1');
    facade.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-12T18:02:00.000Z'),
      isTyping: true,
    });

    const messages = facade.messages();
    expect(messages.filter((message) => message.id === 'yield:approval-carried-1')).toHaveLength(1);
    expect(messages.filter((message) => message.id === 'typing')).toHaveLength(1);
    expect(messages.at(-1)?.id).toBe('typing');
  });

  it('commits a visible stale typing row when its payload is not carried elsewhere', () => {
    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'I am still finishing the approved email.',
        timestamp: new Date('2026-06-12T18:03:00.000Z'),
        isTyping: true,
      },
    ]);

    facade.retireActiveTypingCarrier('op-visible-1');

    const [message] = facade.messages();
    expect(message.id).toBe('op-visible-1:assistant_committed:1781287380000');
    expect(message.content).toBe('I am still finishing the approved email.');
    expect(message.isTyping).toBe(false);
  });

  it('attaches a late approval confirmation card to the existing yield row', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Review this email before sending.',
      agentId: 'router',
      approvalId: 'approval-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-1',
        toolInput: {
          operationId: 'op-1',
          toEmail: 'john@nxt1sports.com',
          subject: 'Check Out NXT 1 Sports',
        },
      },
      messages: [],
    };

    const approvalCard: AgentXRichCard = {
      type: 'confirmation',
      agentId: 'router',
      title: 'Review Email Draft',
      payload: {
        approvalId: 'approval-1',
        toolCallId: 'tool-1',
        operationId: 'op-1',
        actions: [
          { id: 'reject', label: 'Reject', variant: 'secondary' },
          { id: 'approve', label: 'Send', variant: 'primary' },
        ],
      },
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'I drafted an email for your review.',
        timestamp: new Date('2026-05-04T19:00:00.000Z'),
      },
    ]);

    facade.upsertInlineYieldMessage(yieldState, 'op-1');
    facade.attachStreamedCard('typing', approvalCard, 'op-1', false);

    const yieldMessage = facade
      .messages()
      .find((message) => message.yieldState?.approvalId === 'approval-1');
    const typingMessage = facade.messages().find((message) => message.id === 'typing');

    expect(yieldMessage?.cards).toEqual([approvalCard]);
    expect(yieldMessage?.parts).toEqual([{ type: 'card', card: approvalCard }]);
    expect(typingMessage?.cards ?? []).toEqual([]);
    expect(typingMessage?.parts ?? []).toEqual([]);
  });

  it('keeps streamed tool output when approval card arrives before yield operation', () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Review this email before sending.',
      agentId: 'router',
      approvalId: 'approval-card-first-1',
      pendingToolCall: {
        toolName: 'send_email',
        toolCallId: 'tool-card-first-1',
        toolInput: {
          operationId: 'op-card-first-1',
          toEmail: 'john@nxt1sports.com',
          subject: 'Football College Search Results',
        },
      },
      messages: [],
    };
    const approvalCard: AgentXRichCard = {
      type: 'confirmation',
      agentId: 'router',
      title: 'Review Email Draft',
      payload: {
        yieldState,
        approvalId: 'approval-card-first-1',
        toolCallId: 'tool-card-first-1',
        operationId: 'op-card-first-1',
        actions: [{ id: 'approve', label: 'Send', variant: 'primary' }],
      },
    };

    facade.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: 'Got the 5 colleges. Now sending the email with the results.',
        timestamp: new Date('2026-06-12T19:00:00.000Z'),
        steps: [
          {
            id: 'tool-search',
            label: 'Searching college database: Football',
            status: 'success',
            stageType: 'tool',
          },
        ],
      },
    ]);

    facade.attachStreamedCard('typing', approvalCard, 'op-card-first-1', true);
    facade.upsertInlineYieldMessage(yieldState, 'op-card-first-1');

    const messages = facade.messages();
    const committedOutput = messages.find(
      (message) =>
        message.role === 'assistant' &&
        !message.yieldState &&
        message.content === 'Got the 5 colleges. Now sending the email with the results.'
    );
    const approvalYield = messages.find(
      (message) => message.yieldState?.approvalId === 'approval-card-first-1'
    );

    expect(committedOutput).toBeDefined();
    expect(committedOutput?.steps?.map((step) => step.id)).toEqual(['tool-search']);
    expect(approvalYield?.content).toBe('');
    expect(approvalYield?.cards).toEqual([approvalCard]);
    expect(messages.indexOf(approvalYield!)).toBeGreaterThan(messages.indexOf(committedOutput!));
  });
});
