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
