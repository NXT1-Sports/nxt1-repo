import '@angular/compiler';

import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NxtBreadcrumbService } from '../../services/breadcrumb';
import { NxtLoggingService } from '../../services/logging';
import {
  AgentXOperationEventService,
  FIRESTORE_ADAPTER,
  type FirestoreAdapter,
} from './agent-x-operation-event.service';

const WAITING_THREADS_KEY = 'nxt1.enqueueWaitingThreads';

describe('AgentXOperationEventService enqueue waiting state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clears the waiting marker when the matching enqueue operation completes', () => {
    const service = createService();
    const statuses: string[] = [];

    service.operationStatusUpdated$.subscribe((event) => statuses.push(event.status));
    service.markEnqueueWaiting('thread-1', 100, 'child-op-1');

    service.emitOperationStatusUpdated(
      'thread-1',
      'complete',
      '2026-05-19T00:00:00.000Z',
      'enqueue',
      'child-op-1'
    );

    expect(statuses).toEqual(['complete']);
    expect(service.getEnqueueWaitingEntry('thread-1')).toBeNull();
  });

  it('keeps the waiting marker when a different operation completes on the same thread', () => {
    const service = createService();

    service.markEnqueueWaiting('thread-1', 100, 'child-op-1');
    service.emitOperationStatusUpdated(
      'thread-1',
      'complete',
      '2026-05-19T00:00:00.000Z',
      'enqueue',
      'parent-op-1'
    );

    expect(service.getEnqueueWaitingEntry('thread-1')).toEqual({
      queuedAt: 100,
      operationId: 'child-op-1',
    });
  });

  it('clears the waiting marker when the matching enqueue operation fails', () => {
    const service = createService();

    service.markEnqueueWaiting('thread-1', 100, 'child-op-1');
    service.emitOperationStatusUpdated(
      'thread-1',
      'error',
      '2026-05-19T00:00:00.000Z',
      'enqueue',
      'child-op-1'
    );

    expect(service.getEnqueueWaitingEntry('thread-1')).toBeNull();
  });

  it('keeps operation-scoped waiting markers when terminal events omit operation id', () => {
    const service = createService();

    service.markEnqueueWaiting('thread-1', 100, 'child-op-1');
    service.emitOperationStatusUpdated(
      'thread-1',
      'complete',
      '2026-05-19T00:00:00.000Z',
      'enqueue'
    );

    expect(service.getEnqueueWaitingEntry('thread-1')).toEqual({
      queuedAt: 100,
      operationId: 'child-op-1',
    });
  });

  it('migrates legacy waiting markers without operation ids', () => {
    const service = createService();
    localStorage.setItem(WAITING_THREADS_KEY, JSON.stringify({ 'thread-1': 100 }));

    expect(service.getEnqueueWaitingEntry('thread-1')).toEqual({
      queuedAt: 100,
      operationId: null,
    });
  });
});

describe('AgentXOperationEventService stored operation state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('uses completed parent job status when the event subcollection has no done event', async () => {
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn().mockReturnValue(() => undefined),
      getDocs: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue({ status: 'completed' }),
    };
    const service = createService(firestoreAdapter);

    const stored = await service.getStoredEventState('op-1');

    expect(stored.latestLifecycleStatus).toBe('complete');
    expect(stored.isDone).toBe(true);
    expect(stored.doneSuccess).toBe(true);
    expect(firestoreAdapter.getDoc).toHaveBeenCalledWith('AgentJobs/op-1');
  });

  it('uses parent job status when event replay has lifecycle but no terminal done row', async () => {
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn().mockReturnValue(() => undefined),
      getDocs: vi.fn().mockResolvedValue([
        { seq: 1, type: 'operation', status: 'running' },
        { seq: 2, type: 'delta', text: 'Working...' },
      ]),
      getDoc: vi.fn().mockResolvedValue({ status: 'completed' }),
    };
    const service = createService(firestoreAdapter);

    const stored = await service.getStoredEventState('op-2');

    expect(stored.latestLifecycleStatus).toBe('complete');
    expect(stored.isDone).toBe(true);
    expect(stored.content).toBe('Working...');
  });
});

describe('AgentXOperationEventService thread message refresh events', () => {
  it('emits thread message refresh events with normalized ids', () => {
    const service = createService();
    const events: Array<{
      threadId: string;
      source: string;
      operationId?: string;
      status?: string;
    }> = [];

    service.threadMessagesUpdated$.subscribe((event) => events.push(event));

    service.emitThreadMessagesUpdated('thread-1', 'operations-log', ' op-1 ', 'complete');

    expect(events).toEqual([
      {
        threadId: 'thread-1',
        source: 'operations-log',
        operationId: 'op-1',
        status: 'complete',
      },
    ]);
  });

  it('emits operations log refresh requests with normalized ids', () => {
    const service = createService();
    const events: Array<{
      source: string;
      threadId?: string;
      retryDelaysMs?: readonly number[];
    }> = [];

    service.operationsLogRefreshRequested$.subscribe((event) => events.push(event));

    service.emitOperationsLogRefreshRequested('chat-response-complete', ' thread-1 ', [0, 1000]);

    expect(events).toEqual([
      {
        source: 'chat-response-complete',
        threadId: 'thread-1',
        retryDelaysMs: [0, 1000],
      },
    ]);
  });
});

describe('AgentXOperationEventService sequence cursor subscriptions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('skips replayed Firestore events at or below startAfterSeq', () => {
    let emitSnapshot: (docs: ReadonlyArray<Record<string, unknown>>) => void = () => undefined;
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn((_path, _orderBy, onNext) => {
        emitSnapshot = onNext;
        return () => undefined;
      }),
      getDocs: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue(null),
    };
    const service = createService(firestoreAdapter);
    const deltas: string[] = [];

    service.subscribe(
      'op-seq-1',
      {
        onDelta: (text) => deltas.push(text),
        onStep: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      { startAfterSeq: 3 }
    );

    emitSnapshot([
      { seq: 1, type: 'delta', text: 'old ' },
      { seq: 3, type: 'delta', text: 'also old ' },
      { seq: 4, type: 'delta', text: 'new' },
    ]);

    expect(deltas).toEqual(['new']);
  });

  it('advances an existing shared listener when a reconnect provides a newer cursor', () => {
    let emitSnapshot: (docs: ReadonlyArray<Record<string, unknown>>) => void = () => undefined;
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn((_path, _orderBy, onNext) => {
        emitSnapshot = onNext;
        return () => undefined;
      }),
      getDocs: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue(null),
    };
    const service = createService(firestoreAdapter);
    const firstDeltas: string[] = [];
    const reconnectDeltas: string[] = [];

    service.subscribe('op-seq-2', {
      onDelta: (text) => firstDeltas.push(text),
      onStep: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    emitSnapshot([{ seq: 1, type: 'delta', text: 'first' }]);

    service.subscribe(
      'op-seq-2',
      {
        onDelta: (text) => reconnectDeltas.push(text),
        onStep: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      { startAfterSeq: 5 }
    );
    emitSnapshot([
      { seq: 2, type: 'delta', text: 'replayed-2' },
      { seq: 5, type: 'delta', text: 'replayed-5' },
      { seq: 6, type: 'delta', text: 'fresh' },
    ]);

    expect(firstDeltas).toEqual(['first', 'fresh']);
    expect(reconnectDeltas).toEqual(['fresh']);
    expect(firestoreAdapter.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('preserves thumbnailUrl on Firestore media events for generated videos', () => {
    let emitSnapshot: (docs: ReadonlyArray<Record<string, unknown>>) => void = () => undefined;
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn((_path, _orderBy, onNext) => {
        emitSnapshot = onNext;
        return () => undefined;
      }),
      getDocs: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue(null),
    };
    const service = createService(firestoreAdapter);
    const mediaEvents: unknown[] = [];

    service.subscribe('op-media-1', {
      onDelta: vi.fn(),
      onStep: vi.fn(),
      onMedia: (event) => mediaEvents.push(event),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    emitSnapshot([
      {
        seq: 1,
        type: 'tool_result',
        stageType: 'tool',
        stepId: 'call_video',
        toolName: 'ffmpeg_merge_videos',
        toolSuccess: true,
        message: 'Merge Videos',
        toolResult: {
          outputUrl: 'https://cdn.example.com/generated/highlight.mp4',
          thumbnailUrl: 'https://cdn.example.com/generated/highlight-thumb.jpg',
          mimeType: 'video/mp4',
        },
      },
    ]);

    expect(mediaEvents).toEqual([
      {
        type: 'video',
        url: 'https://cdn.example.com/generated/highlight.mp4',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/highlight-thumb.jpg',
      },
    ]);
  });

  it('pairs hash-named staged video thumbnails from nested persistedMediaUrls in Firestore media events', () => {
    let emitSnapshot: (docs: ReadonlyArray<Record<string, unknown>>) => void = () => undefined;
    const firestoreAdapter: FirestoreAdapter = {
      onSnapshot: vi.fn((_path, _orderBy, onNext) => {
        emitSnapshot = onNext;
        return () => undefined;
      }),
      getDocs: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue(null),
    };
    const service = createService(firestoreAdapter);
    const mediaEvents: unknown[] = [];
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3ac85c34dad6901c293a3f%2Fmedia%2Fstaged%2Fvideo%2F0a1b7359be9740268beab5396200fd1c.mp4?alt=media&token=EKN_x643i3oXNUXYU5fZTRpax8UFXdBsrseT5bjMzUg';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3ac85c34dad6901c293a3f%2Fmedia%2Fstaged%2Fvideo%2F24cf3ab58a9c4d8db48f9cd20b392e76.jpg?alt=media&token=thumb';
    const secondThumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3ac85c34dad6901c293a3f%2Fmedia%2Fstaged%2Fvideo%2F4b61320cbbcd425c9ad71215ab760202.jpg?alt=media&token=thumb2';

    service.subscribe('op-media-2', {
      onDelta: vi.fn(),
      onStep: vi.fn(),
      onMedia: (event) => mediaEvents.push(event),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    emitSnapshot([
      {
        seq: 1,
        type: 'tool_result',
        stageType: 'tool',
        stepId: 'call_stage_media',
        toolName: 'stage_media',
        toolSuccess: true,
        message: 'Stage Media',
        toolResult: {
          data: {
            persistedMediaUrls: [thumbnailUrl, secondThumbnailUrl, videoUrl],
          },
        },
      },
    ]);

    expect(mediaEvents).toEqual([
      {
        type: 'video',
        url: videoUrl,
        thumbnailUrl,
      },
    ]);
  });
});

function createService(firestoreAdapter?: FirestoreAdapter): AgentXOperationEventService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const injector = Injector.create({
    providers: [
      {
        provide: NxtLoggingService,
        useValue: {
          child: () => logger,
        },
      },
      {
        provide: NxtBreadcrumbService,
        useValue: {
          trackStateChange: vi.fn(),
        },
      },
      { provide: NgZone, useValue: { run: (callback: () => void) => callback() } },
      ...(firestoreAdapter ? [{ provide: FIRESTORE_ADAPTER, useValue: firestoreAdapter }] : []),
    ],
  });

  return runInInjectionContext(injector, () => new AgentXOperationEventService());
}
