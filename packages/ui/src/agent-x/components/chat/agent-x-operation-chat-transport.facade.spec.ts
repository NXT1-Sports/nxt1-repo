import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentYieldState } from '@nxt1/core';
import type { AgentXChatRequest, AgentXStreamCallbacks } from '@nxt1/core/ai';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL, AgentXJobService } from '../../services/agent-x-job.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import { AgentXOperationEventService } from '../../services/agent-x-operation-event.service';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import {
  AgentXOperationChatTransportFacade,
  type AgentXOperationChatTransportFacadeHost,
} from './agent-x-operation-chat-transport.facade';
import type { OperationMessage } from './agent-x-operation-chat.models';

describe('AgentXOperationChatTransportFacade', () => {
  let facade: AgentXOperationChatTransportFacade;
  let host: AgentXOperationChatTransportFacadeHost;
  let callbacks: AgentXStreamCallbacks;
  let operationStatus: ReturnType<AgentXOperationChatTransportFacadeHost['getOperationStatus']>;

  const loggerMock = {
    child: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const streamRegistryMock = {
    abort: vi.fn(),
    register: vi.fn(),
    linkOperation: vi.fn(),
    markError: vi.fn(),
    upsertStep: vi.fn(),
    appendCard: vi.fn(),
    appendMedia: vi.fn(),
  };

  const operationEventServiceMock = {
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    emitOperationStatusUpdated: vi.fn(),
    emitOperationsLogRefreshRequested: vi.fn(),
  };

  const agentXServiceMock = {
    persistDropRecoveryOp: vi.fn(),
    clearDropRecoveryOp: vi.fn(),
    setPendingResolvedOp: vi.fn(),
    requestAutoOpenPanel: vi.fn(),
    requestedSidePanel: vi.fn().mockReturnValue(null),
    userContext: vi.fn().mockReturnValue(null),
  };

  const messageFacadeMock = {
    messages: signal<OperationMessage[]>([]),
    clearPendingTypingDelta: vi.fn(),
    flushPendingTypingDelta: vi.fn(),
    queueTypingDelta: vi.fn(),
    drainBufferedTypingDelta: vi.fn().mockReturnValue(''),
    withUpsertedToolStepPart: vi.fn().mockImplementation((parts) => parts),
    attachStreamedCard: vi.fn(),
    stampLatestUserMessageOperationId: vi.fn(),
    finalizeStreamedAssistantMessage: vi.fn(),
    replaceTyping: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.child.mockReturnValue(loggerMock);
    messageFacadeMock.messages.set([]);

    TestBed.configureTestingModule({
      providers: [
        AgentXOperationChatTransportFacade,
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
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackUserAction: vi.fn(), trackStateChange: vi.fn() },
        },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: AgentXStreamRegistryService, useValue: streamRegistryMock },
        { provide: AgentXOperationEventService, useValue: operationEventServiceMock },
        { provide: AgentXService, useValue: agentXServiceMock },
        { provide: AgentXOperationChatMessageFacade, useValue: messageFacadeMock },
        { provide: AgentXJobService, useValue: {} },
      ],
    });

    facade = TestBed.inject(AgentXOperationChatTransportFacade);
    operationStatus = 'processing';
    host = {
      contextId: () => 'op-123',
      contextType: () => 'operation',
      threadId: () => 'thread-1',
      messages: signal([]),
      loading: signal(false),
      latestProgressLabel: signal<string | null>(null),
      batchEmailProgress: signal(null),
      resolvedThreadId: signal<string | null>('thread-1'),
      activeYieldState: signal<AgentYieldState | null>(null),
      yieldResolved: signal(true),
      setExecutionMode: vi.fn(),
      setShowApprovedExecutionPlanDock: vi.fn(),
      applyYieldState: vi.fn(),
      clearRealtimePipelines: vi.fn(),
      getActiveStream: vi.fn().mockReturnValue(null),
      setActiveStream: vi.fn(),
      getCurrentOperationId: vi.fn().mockReturnValue('op-123'),
      setCurrentOperationId: vi.fn(),
      getShadowFirestoreSub: vi.fn().mockReturnValue(null),
      setShadowFirestoreSub: vi.fn(),
      getActiveFirestoreSub: vi.fn().mockReturnValue(null),
      getStreamTurnWatermark: vi.fn().mockReturnValue(null),
      setStreamTurnWatermark: vi.fn(),
      resolveActiveThreadId: vi.fn().mockReturnValue('thread-1'),
      getOperationStatus: () => operationStatus,
      setOperationStatus: vi.fn((next) => {
        operationStatus = next;
      }),
      setActivityPhase: vi.fn(),
      markActivityPulse: vi.fn(),
      emitResponseComplete: vi.fn(),
      subscribeToFirestoreJobEvents: vi.fn(),
      reconcileOperationFromStoredEvents: vi.fn(),
      onEnqueueHeavyDone: vi.fn(),
      uid: () => 'uid-1',
    };
    facade.configure(host);

    vi.spyOn(
      (facade as { api: { streamMessage: unknown } }).api,
      'streamMessage'
    ).mockImplementation(
      (_request: AgentXChatRequest, nextCallbacks: AgentXStreamCallbacks): AbortController => {
        callbacks = nextCallbacks;
        return new AbortController();
      }
    );
  });

  it('clears drop recovery as soon as the stream is intentionally paused', async () => {
    const pendingStream = facade.sendViaStream(
      { message: 'Pause this chat' } as AgentXChatRequest,
      'token-123'
    );

    callbacks.onOperation?.({
      operationId: 'op-123',
      threadId: 'thread-1',
      status: 'paused',
      timestamp: new Date().toISOString(),
      message: 'Paused by user',
    } as never);

    expect(agentXServiceMock.clearDropRecoveryOp).toHaveBeenCalledTimes(1);
    expect(host.setOperationStatus).toHaveBeenCalledWith('paused');

    callbacks.onError({
      error: 'Stop test stream',
      status: 400,
      code: 'TEST_STOP',
    });

    await expect(pendingStream).rejects.toThrow('Stop test stream');
  });

  it('ignores stale running lifecycle events after the user has paused locally', async () => {
    facade.sendViaStream({ message: 'Pause this chat' } as AgentXChatRequest, 'token-123');
    operationStatus = 'paused';

    callbacks.onOperation?.({
      operationId: 'op-123',
      threadId: 'thread-1',
      status: 'running',
      timestamp: new Date().toISOString(),
      message: 'Still running',
    } as never);

    expect(host.setOperationStatus).not.toHaveBeenCalledWith('processing');
    expect(host.setActivityPhase).not.toHaveBeenCalledWith('connected', 'Still running');
  });

  it('ignores stale ask-user lifecycle events after the user has paused locally', async () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_input',
      promptToUser: 'Which team should I use?',
      agentId: 'router',
      pendingToolCall: {
        toolName: 'ask_user',
        toolCallId: 'ask_user:Which team should I use?',
        toolInput: {
          question: 'Which team should I use?',
          threadId: 'thread-1',
          operationId: 'op-123',
        },
      },
      messages: [],
    };

    facade.sendViaStream({ message: 'Pause this chat' } as AgentXChatRequest, 'token-123');
    operationStatus = 'paused';

    callbacks.onOperation?.({
      operationId: 'op-123',
      threadId: 'thread-1',
      status: 'awaiting_input',
      timestamp: new Date().toISOString(),
      message: 'Need more info',
      yieldState,
    } as never);

    expect(host.applyYieldState).not.toHaveBeenCalled();
    expect(host.setOperationStatus).not.toHaveBeenCalledWith('awaiting_input');
    expect(host.setActivityPhase).not.toHaveBeenCalledWith('awaiting_input', 'Need more info');
  });

  it('ignores stale ask-user cards after the user has paused locally', async () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_input',
      promptToUser: 'Which team should I use?',
      agentId: 'router',
      pendingToolCall: {
        toolName: 'ask_user',
        toolCallId: 'ask_user:Which team should I use?',
        toolInput: {
          question: 'Which team should I use?',
          threadId: 'thread-1',
          operationId: 'op-card-first-ask-user-1',
        },
      },
      messages: [],
    };
    messageFacadeMock.attachStreamedCard.mockReturnValueOnce(yieldState);

    facade.sendViaStream({ message: 'Pause this chat' } as AgentXChatRequest, 'token-123');
    operationStatus = 'paused';

    callbacks.onCard?.({
      type: 'ask_user',
      agentId: 'router',
      title: 'Agent X has a question',
      payload: {
        question: 'Which team should I use?',
        threadId: 'thread-1',
        operationId: 'op-card-first-ask-user-1',
      },
      clearText: true,
    });

    expect(messageFacadeMock.attachStreamedCard).not.toHaveBeenCalled();
    expect(host.applyYieldState).not.toHaveBeenCalled();
    expect(host.setOperationStatus).not.toHaveBeenCalledWith('awaiting_input');
    expect(host.setActivityPhase).not.toHaveBeenCalledWith('awaiting_input');
  });

  it('applies an ask-user yield immediately when the card arrives before the operation event', async () => {
    const yieldState: AgentYieldState = {
      reason: 'needs_input',
      promptToUser: 'Which team should I use?',
      agentId: 'router',
      pendingToolCall: {
        toolName: 'ask_user',
        toolCallId: 'ask_user:Which team should I use?',
        toolInput: {
          question: 'Which team should I use?',
          threadId: 'thread-1',
          operationId: 'op-card-first-ask-user-1',
        },
      },
      messages: [],
    };
    messageFacadeMock.attachStreamedCard.mockReturnValueOnce(yieldState);

    const pendingStream = facade.sendViaStream(
      { message: 'Continue the workflow' } as AgentXChatRequest,
      'token-123'
    );

    callbacks.onCard?.({
      type: 'ask_user',
      agentId: 'router',
      title: 'Agent X has a question',
      payload: {
        question: 'Which team should I use?',
        threadId: 'thread-1',
        operationId: 'op-card-first-ask-user-1',
      },
      clearText: true,
    });

    expect(host.applyYieldState).toHaveBeenCalledWith({
      yieldState,
      source: 'sse-operation',
      operationId: 'op-card-first-ask-user-1',
    });
    expect(host.setOperationStatus).toHaveBeenCalledWith('awaiting_input');
    expect(host.setActivityPhase).toHaveBeenCalledWith('awaiting_input');

    callbacks.onError({
      error: 'Stop test stream',
      status: 400,
      code: 'TEST_STOP',
    });

    await expect(pendingStream).rejects.toThrow('Stop test stream');
  });

  it('requests an operations log refresh when cancel_recurring_task succeeds', async () => {
    facade.sendViaStream(
      { message: 'Stop the recurring PDF task' } as AgentXChatRequest,
      'token-123'
    );

    callbacks.onStep?.({
      id: 'step-1',
      label: 'Cancelled recurring task',
      stageType: 'tool',
      status: 'success',
      metadata: {
        toolName: 'cancel_recurring_task',
      },
    } as never);

    expect(operationEventServiceMock.emitOperationsLogRefreshRequested).toHaveBeenCalledWith(
      'operations-log',
      'thread-1',
      [0, 1000, 2500, 5000]
    );
  });

  it('switches the composer back to execute when execute_saved_plan actually starts', async () => {
    facade.sendViaStream({ message: 'go' } as AgentXChatRequest, 'token-123');

    callbacks.onStep?.({
      id: 'step-execute-plan',
      label: 'Executing approved plan',
      stageType: 'tool',
      status: 'active',
      metadata: {
        toolName: 'execute_saved_plan',
      },
    } as never);

    expect(host.setExecutionMode).toHaveBeenCalledWith('execute');
    expect(host.setShowApprovedExecutionPlanDock).toHaveBeenCalledWith(true);
  });

  it('keeps all selected film-play contexts on the outgoing request instead of bundling them', async () => {
    const sendViaStreamSpy = vi
      .spyOn(facade, 'sendViaStream')
      .mockResolvedValue(undefined as never);

    (facade as unknown as { getAuthToken: () => Promise<string> }).getAuthToken = () =>
      Promise.resolve('token-123');

    await facade.callAgentChat(
      'Analyze this breakdown',
      [],
      undefined,
      undefined,
      'execute',
      undefined,
      undefined,
      [
        {
          id: 'play-1',
          kind: 'film_play',
          title: 'Play 1',
          source: { type: 'film_review', id: 'review-1', label: 'Review 1' },
          entityRefs: [
            { type: 'film_review', id: 'review-1', label: 'Review 1' },
            { type: 'film_play', id: 'play-1', label: 'Play 1' },
          ],
        },
        {
          id: 'play-2',
          kind: 'film_play',
          title: 'Play 2',
          source: { type: 'film_review', id: 'review-1', label: 'Review 1' },
          entityRefs: [
            { type: 'film_review', id: 'review-1', label: 'Review 1' },
            { type: 'film_play', id: 'play-2', label: 'Play 2' },
          ],
        },
        {
          id: 'play-3',
          kind: 'film_play',
          title: 'Play 3',
          source: { type: 'film_review', id: 'review-1', label: 'Review 1' },
          entityRefs: [
            { type: 'film_review', id: 'review-1', label: 'Review 1' },
            { type: 'film_play', id: 'play-3', label: 'Play 3' },
          ],
        },
        {
          id: 'play-4',
          kind: 'film_play',
          title: 'Play 4',
          source: { type: 'film_review', id: 'review-1', label: 'Review 1' },
          entityRefs: [
            { type: 'film_review', id: 'review-1', label: 'Review 1' },
            { type: 'film_play', id: 'play-4', label: 'Play 4' },
          ],
        },
      ]
    );

    expect(sendViaStreamSpy).toHaveBeenCalledTimes(1);
    expect(
      sendViaStreamSpy.mock.calls[0]?.[0].selectedContexts?.map((context) => context.id)
    ).toEqual(['play-1', 'play-2', 'play-3', 'play-4']);
  });

  it('defaults the outgoing request effort level to medium when none is provided', async () => {
    const sendViaStreamSpy = vi
      .spyOn(facade, 'sendViaStream')
      .mockResolvedValue(undefined as never);

    (facade as unknown as { getAuthToken: () => Promise<string> }).getAuthToken = () =>
      Promise.resolve('token-123');

    await facade.callAgentChat('Use the default effort level');

    expect(sendViaStreamSpy).toHaveBeenCalledTimes(1);
    expect(sendViaStreamSpy.mock.calls[0]?.[0].effortLevel).toBe('medium');
  });

  it('preserves an explicit high effort level on the outgoing request', async () => {
    const sendViaStreamSpy = vi
      .spyOn(facade, 'sendViaStream')
      .mockResolvedValue(undefined as never);

    (facade as unknown as { getAuthToken: () => Promise<string> }).getAuthToken = () =>
      Promise.resolve('token-123');

    await facade.callAgentChat('Use high effort', [], undefined, undefined, 'execute', 'high');

    expect(sendViaStreamSpy).toHaveBeenCalledTimes(1);
    expect(sendViaStreamSpy.mock.calls[0]?.[0].effortLevel).toBe('high');
  });

  it('encodes markdown-sensitive stream poster URL characters before promoting media URLs', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-media/reels/clip.mp4';
    const thumbnailUrl =
      'https://storage.googleapis.com/nxt1-media/reels/thumbs/clip poster (1).jpg?alt=media&token=thumb';
    const encodedThumbnailUrl = encodeURIComponent(thumbnailUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
    const promote = (
      facade as unknown as {
        promoteStreamMediaUrlsToMarkdown: (
          content: string,
          attachments: Array<{
            url: string;
            type: 'video';
            name: string;
            thumbnailUrl: string;
          }>
        ) => string;
      }
    ).promoteStreamMediaUrlsToMarkdown.bind(facade);

    const result = promote(videoUrl, [
      {
        url: videoUrl,
        type: 'video',
        name: 'clip.mp4',
        thumbnailUrl,
      },
    ]);

    expect(result).toBe(`[View Video](${videoUrl}#poster=${encodedThumbnailUrl})`);
    expect(result).not.toContain('(1)');
  });

  it('uses a streamed generated graphic attachment as the video poster fallback', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-media/reels/clip.mp4';
    const graphicUrl = 'https://storage.googleapis.com/nxt1-media/reels/superhero-graphic.png';
    const promote = (
      facade as unknown as {
        promoteStreamMediaUrlsToMarkdown: (
          content: string,
          attachments: Array<{
            url: string;
            type: 'image' | 'video';
            name: string;
          }>
        ) => string;
      }
    ).promoteStreamMediaUrlsToMarkdown.bind(facade);

    const result = promote(videoUrl, [
      {
        url: videoUrl,
        type: 'video',
        name: 'clip.mp4',
      },
      {
        url: graphicUrl,
        type: 'image',
        name: 'superhero-graphic.png',
      },
    ]);

    expect(result).toBe(`[View Video](${videoUrl}#poster=${encodeURIComponent(graphicUrl)})`);
  });

  it('uses hash-named staged video images as streamed video poster fallbacks', () => {
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3ac85c34dad6901c293a3f%2Fmedia%2Fstaged%2Fvideo%2F0a1b7359be9740268beab5396200fd1c.mp4?alt=media&token=EKN_x643i3oXNUXYU5fZTRpax8UFXdBsrseT5bjMzUg';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3ac85c34dad6901c293a3f%2Fmedia%2Fstaged%2Fvideo%2F24cf3ab58a9c4d8db48f9cd20b392e76.jpg?alt=media&token=thumb';
    const promote = (
      facade as unknown as {
        promoteStreamMediaUrlsToMarkdown: (
          content: string,
          attachments: Array<{
            url: string;
            type: 'image' | 'video';
            name: string;
          }>
        ) => string;
      }
    ).promoteStreamMediaUrlsToMarkdown.bind(facade);

    const result = promote(`[View Video](${videoUrl})`, [
      {
        url: videoUrl,
        type: 'video',
        name: '0a1b7359be9740268beab5396200fd1c.mp4',
      },
      {
        url: thumbnailUrl,
        type: 'image',
        name: '24cf3ab58a9c4d8db48f9cd20b392e76.jpg',
      },
    ]);

    expect(result).toBe(`[View Video](${videoUrl}#poster=${encodeURIComponent(thumbnailUrl)})`);
  });

  it('buffers SSE media events in the stream registry for remount snapshots', async () => {
    const pendingStream = facade.sendViaStream(
      { message: 'Generate a video' } as AgentXChatRequest,
      'token-123'
    );
    const mediaEvent = {
      type: 'video',
      url: 'https://cdn.example.com/generated/highlight.mp4',
      thumbnailUrl: 'https://cdn.example.com/generated/highlight-thumb.jpg',
    } as const;
    messageFacadeMock.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: mediaEvent.url,
        timestamp: new Date('2026-06-24T00:00:00.000Z'),
        isTyping: true,
      },
    ]);

    callbacks.onMedia?.(mediaEvent);

    expect(streamRegistryMock.appendMedia).toHaveBeenCalledWith('thread-1', mediaEvent);

    callbacks.onError({
      error: 'Stop test stream',
      status: 400,
      code: 'TEST_STOP',
    });

    await expect(pendingStream).rejects.toThrow('Stop test stream');
  });

  it('promotes signed export document urls to markdown links during streaming', () => {
    const exportUrl =
      'https://app.nxt1.test/api/v1/agent-x/media-proxy/export/scout-report.pdf?path=exports%2Fuser-1%2Fscout-report.pdf&mime=application%2Fpdf&exp=1750000000&sig=abc123';
    const promote = (
      facade as unknown as {
        promoteStreamMediaUrlsToMarkdown: (
          content: string,
          attachments: Array<{
            url: string;
            type: 'video';
            name: string;
            thumbnailUrl: string;
          }>
        ) => string;
      }
    ).promoteStreamMediaUrlsToMarkdown.bind(facade);

    const result = promote(exportUrl, []);

    expect(result).toBe(`[Open File](${exportUrl})`);
  });

  it('promotes a live typing video URL once later streamed text terminates it', () => {
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=video';
    const normalize = (
      facade as unknown as {
        normalizeTypingStreamMediaMarkdown: (options?: { readonly final?: boolean }) => void;
      }
    ).normalizeTypingStreamMediaMarkdown.bind(facade);
    messageFacadeMock.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: `Final Video:\n${videoUrl}\n\nImportant Quality Notes:`,
        timestamp: new Date('2026-06-26T00:00:00.000Z'),
        isTyping: false,
      },
    ]);

    normalize();

    expect(messageFacadeMock.messages()[0]?.content).toContain(`[View Video](${videoUrl})`);
    expect(messageFacadeMock.messages()[0]?.content).not.toContain(`\n${videoUrl}\n`);
  });

  it('does not promote a live typing graphic URL before the stream is final', () => {
    const imageUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fgraphic.png?alt=media&token=image';
    const normalize = (
      facade as unknown as {
        normalizeTypingStreamMediaMarkdown: (options?: { readonly final?: boolean }) => void;
      }
    ).normalizeTypingStreamMediaMarkdown.bind(facade);
    messageFacadeMock.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: `Final Graphic:\n${imageUrl}\n\nWant me to post it?`,
        timestamp: new Date('2026-06-26T00:00:00.000Z'),
        isTyping: false,
      },
    ]);

    normalize();

    expect(messageFacadeMock.messages()[0]?.content).toBe(
      `Final Graphic:\n${imageUrl}\n\nWant me to post it?`
    );
  });

  it('does not promote a live typing video URL while it is still the trailing stream text', () => {
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=video';
    const normalize = (
      facade as unknown as {
        normalizeTypingStreamMediaMarkdown: () => void;
      }
    ).normalizeTypingStreamMediaMarkdown.bind(facade);
    messageFacadeMock.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: `Final Video:\n${videoUrl}`,
        timestamp: new Date('2026-06-26T00:00:00.000Z'),
        isTyping: false,
      },
    ]);

    normalize();

    expect(messageFacadeMock.messages()[0]?.content).toBe(`Final Video:\n${videoUrl}`);
  });

  it('promotes a trailing media URL once the stream is final', () => {
    const imageUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fgraphic.png?alt=media&token=image';
    const normalize = (
      facade as unknown as {
        normalizeTypingStreamMediaMarkdown: (options?: { readonly final?: boolean }) => void;
      }
    ).normalizeTypingStreamMediaMarkdown.bind(facade);
    messageFacadeMock.messages.set([
      {
        id: 'typing',
        role: 'assistant',
        content: `Final Graphic:\n${imageUrl}`,
        timestamp: new Date('2026-06-26T00:00:00.000Z'),
        isTyping: false,
      },
    ]);

    normalize({ final: true });

    expect(messageFacadeMock.messages()[0]?.content).toBe(
      `Final Graphic:\n![Generated Image](${imageUrl})`
    );
  });

  it('stamps the optimistic user message when the stream resolves an operation id', async () => {
    const pendingStream = facade.sendViaStream(
      { message: 'Start a fresh request' } as AgentXChatRequest,
      'token-123',
      'idem-new'
    );

    callbacks.onThread?.({
      threadId: 'thread-1',
      operationId: 'op-new',
    } as never);

    expect(messageFacadeMock.stampLatestUserMessageOperationId).toHaveBeenCalledWith({
      operationId: 'op-new',
      idempotencyKey: 'idem-new',
    });

    callbacks.onError({
      error: 'Stop test stream',
      status: 400,
      code: 'TEST_STOP',
    });

    await expect(pendingStream).rejects.toThrow('Stop test stream');
  });
});
