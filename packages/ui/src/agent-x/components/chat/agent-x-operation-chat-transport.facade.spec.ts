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

describe('AgentXOperationChatTransportFacade', () => {
  let facade: AgentXOperationChatTransportFacade;
  let host: AgentXOperationChatTransportFacadeHost;
  let callbacks: AgentXStreamCallbacks;

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
  };

  const messageFacadeMock = {
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
      setOperationStatus: vi.fn(),
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
