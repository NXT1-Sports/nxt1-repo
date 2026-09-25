import '@angular/compiler';

import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { PERFORMANCE_ADAPTER } from '../../services/performance/performance-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { TRACE_NAMES } from '@nxt1/core/performance';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AgentXOperationEventService } from './agent-x-operation-event.service';
import { AgentXOperationsLogStateService } from './agent-x-operations-log-state.service';
import type { OperationLogEntry } from '@nxt1/core';

const createEntry = (overrides: Partial<OperationLogEntry> = {}): OperationLogEntry => ({
  id: overrides.id ?? 'entry-1',
  title: overrides.title ?? 'Entry',
  summary: overrides.summary ?? '',
  status: overrides.status ?? 'complete',
  category: overrides.category ?? 'system',
  timestamp: overrides.timestamp ?? '2026-06-01T10:00:00.000Z',
  icon: overrides.icon ?? 'sparkles',
  ...overrides,
});

const NO_CACHE_OPTIONS = {
  headers: {
    'X-No-Cache': '1',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  },
};

describe('AgentXOperationsLogStateService', () => {
  it('splits scheduled entries from paged history and appends the next page', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-1',
              threadId: 'thread-1',
              timestamp: '2026-06-01T11:00:00.000Z',
            }),
          ],
          scheduled: [
            createEntry({
              id: 'schedule:task-1',
              title: 'Scheduled task',
              isScheduled: true,
              threadId: '507f1f77bcf86cd799439011',
              timestamp: '2026-06-01T12:00:00.000Z',
              metadata: {
                recurringTaskKey: 'task-1',
                sourceId: '507f1f77bcf86cd799439011',
              },
            }),
          ],
          pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
        })
      )
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-2',
              threadId: 'thread-2',
              timestamp: '2026-06-01T09:00:00.000Z',
            }),
          ],
          scheduled: [
            createEntry({
              id: 'schedule:task-1',
              title: 'Scheduled task',
              isScheduled: true,
              threadId: '507f1f77bcf86cd799439011',
              timestamp: '2026-06-01T12:00:00.000Z',
              metadata: {
                recurringTaskKey: 'task-1',
                sourceId: '507f1f77bcf86cd799439011',
              },
            }),
          ],
          pageInfo: { hasMore: false },
        })
      );

    const service = createService({ get });

    await service.ensureLoaded(true);

    expect(service.scheduled()).toHaveLength(1);
    expect(service.history()).toHaveLength(1);
    expect(service.operations()).toHaveLength(2);
    expect(service.hasMore()).toBe(true);
    expect(service.nextCursor()).toBe('cursor-2');

    await service.loadMore();

    expect(get).toHaveBeenNthCalledWith(
      2,
      'https://api.test/agent-x/operations-log?limit=50&cursor=cursor-2',
      NO_CACHE_OPTIONS
    );
    expect(service.history().map((entry) => entry.id)).toEqual(['history-1', 'history-2']);
    expect(service.scheduled().map((entry) => entry.id)).toEqual(['schedule:task-1']);
    expect(service.hasMore()).toBe(false);
    expect(service.nextCursor()).toBeNull();
  });

  it('marks a reviewed thread as no longer unread', () => {
    const statusUpdates$ = new Subject<{
      threadId: string;
      status: 'complete';
      timestamp: string;
      source: 'chat';
      operationId?: string;
      title?: string;
    }>();
    const service = createService(
      {
        get: vi
          .fn()
          .mockReturnValue(
            of({ success: true, data: [], scheduled: [], pageInfo: { hasMore: false } })
          ),
      },
      {
        operationStatusUpdated$: statusUpdates$,
      }
    );

    statusUpdates$.next({
      threadId: 'thread-123',
      status: 'complete',
      timestamp: '2026-06-01T10:00:00.000Z',
      source: 'chat',
      operationId: 'op-1',
    });

    expect(service.unreadThreadIds().has('thread-123')).toBe(true);

    service.markThreadReviewed('thread-123');

    expect(service.unreadThreadIds().has('thread-123')).toBe(false);
  });

  it('does not mark existing completed history unread when refreshing without a prior snapshot', async () => {
    const get = vi.fn().mockReturnValue(
      of({
        success: true,
        data: [
          createEntry({
            id: 'op-1',
            operationId: 'op-1',
            threadId: 'thread-1',
            status: 'complete',
            timestamp: '2026-06-01T11:00:00.000Z',
          }),
          createEntry({
            id: 'op-2',
            operationId: 'op-2',
            threadId: 'thread-2',
            status: 'complete',
            timestamp: '2026-06-01T10:00:00.000Z',
          }),
        ],
        scheduled: [],
        pageInfo: { hasMore: false },
      })
    );
    const emitThreadMessagesUpdated = vi.fn();
    const service = createService({ get }, { emitThreadMessagesUpdated });

    await service.refresh();

    expect(service.unreadThreadIds().size).toBe(0);
    expect(emitThreadMessagesUpdated).not.toHaveBeenCalled();
  });

  it('does not re-mark reviewed completed history unread when only operation id changes', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'op-old',
              operationId: 'op-old',
              threadId: 'thread-1',
              status: 'complete',
              timestamp: '2026-06-01T11:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      )
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'op-new',
              operationId: 'op-new',
              threadId: 'thread-1',
              status: 'complete',
              timestamp: '2026-06-01T11:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );
    const emitThreadMessagesUpdated = vi.fn();
    const service = createService({ get }, { emitThreadMessagesUpdated });

    await service.ensureLoaded(true);
    await service.refresh();

    expect(service.unreadThreadIds().has('thread-1')).toBe(false);
    expect(emitThreadMessagesUpdated).not.toHaveBeenCalled();
  });

  it('marks a thread unread when it transitions to complete during a refresh', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'op-1',
              operationId: 'op-1',
              threadId: 'thread-1',
              status: 'in-progress',
              timestamp: '2026-06-01T11:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      )
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'op-1',
              operationId: 'op-1',
              threadId: 'thread-1',
              status: 'complete',
              timestamp: '2026-06-01T11:05:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );
    const service = createService({ get });

    await service.ensureLoaded(true);
    await service.refresh();

    expect(service.unreadThreadIds().has('thread-1')).toBe(true);
  });

  it('preserves previously loaded older history during refresh', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-1',
              threadId: 'thread-1',
              title: 'Newest session',
              timestamp: '2026-06-01T11:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
        })
      )
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-2',
              threadId: 'thread-2',
              title: 'Older session',
              timestamp: '2026-06-01T09:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: true, nextCursor: 'cursor-3' },
        })
      )
      .mockReturnValueOnce(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-1',
              threadId: 'thread-1',
              title: 'Newest session renamed',
              timestamp: '2026-06-01T11:30:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: true, nextCursor: 'cursor-2b' },
        })
      );

    const service = createService({ get });

    await service.ensureLoaded(true);
    await service.loadMore();
    await service.refresh();

    expect(service.history().map((entry) => entry.id)).toEqual(['history-1', 'history-2']);
    expect(service.history()[0]?.title).toBe('Newest session renamed');
    expect(service.hasMore()).toBe(true);
    expect(service.nextCursor()).toBe('cursor-3');
  });

  describe('pinned sessions support', () => {
    it('hydrates pinned sessions from API into separate pinned signal and excludes them from history', async () => {
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [
            createEntry({
              id: 'history-1',
              threadId: 'thread-history',
              title: 'History session',
              timestamp: '2026-06-01T10:00:00.000Z',
            }),
          ],
          pinned: [
            createEntry({
              id: 'pinned-1',
              threadId: 'thread-pinned',
              title: 'Pinned session',
              timestamp: '2026-06-01T11:00:00.000Z',
              pinnedAt: '2026-06-01T12:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );

      const service = createService({ get });
      await service.ensureLoaded(true);

      expect(service.pinned()).toHaveLength(1);
      expect(service.pinned()[0]?.id).toBe('pinned-1');
      expect(service.history()).toHaveLength(1);
      expect(service.history()[0]?.id).toBe('history-1');
      expect(service.operations()).toHaveLength(2);
      expect(service.isThreadPinned('thread-pinned')).toBe(true);
      expect(service.isThreadPinned('thread-history')).toBe(false);
    });

    it('reconciles pinned rows returned by load-more without leaving duplicates in history', async () => {
      const movedEntry = createEntry({
        id: 'thread-1',
        threadId: '507f1f77bcf86cd799439011',
        title: 'Older session now pinned',
        timestamp: '2026-05-01T10:00:00.000Z',
      });
      const get = vi
        .fn()
        .mockReturnValueOnce(
          of({
            success: true,
            data: [movedEntry],
            pinned: [],
            scheduled: [],
            pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
          })
        )
        .mockReturnValueOnce(
          of({
            success: true,
            data: [
              createEntry({
                id: 'thread-2',
                threadId: '507f1f77bcf86cd799439022',
                title: 'Next history session',
                timestamp: '2026-04-30T10:00:00.000Z',
              }),
            ],
            pinned: [{ ...movedEntry, pinnedAt: '2026-06-01T12:00:00.000Z' }],
            scheduled: [],
            pageInfo: { hasMore: false },
          })
        );

      const service = createService({ get });
      await service.ensureLoaded(true);
      await service.loadMore();

      expect(service.pinned().map((entry) => entry.threadId)).toEqual(['507f1f77bcf86cd799439011']);
      expect(service.history().map((entry) => entry.threadId)).toEqual([
        '507f1f77bcf86cd799439022',
      ]);
    });

    it('does not reinsert pinned rows from previously loaded history during refresh', async () => {
      const movedEntry = createEntry({
        id: 'thread-1',
        threadId: '507f1f77bcf86cd799439011',
        title: 'Session now pinned',
        timestamp: '2026-05-01T10:00:00.000Z',
      });
      const recentEntry = createEntry({
        id: 'thread-new',
        threadId: '507f1f77bcf86cd799439033',
        title: 'Recent session',
        timestamp: '2026-06-01T12:00:00.000Z',
      });
      const get = vi
        .fn()
        .mockReturnValueOnce(
          of({
            success: true,
            data: [recentEntry, movedEntry],
            pinned: [],
            scheduled: [],
            pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
          })
        )
        .mockReturnValueOnce(
          of({
            success: true,
            data: [recentEntry],
            pinned: [{ ...movedEntry, pinnedAt: '2026-06-01T12:30:00.000Z' }],
            scheduled: [],
            pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
          })
        );

      const service = createService({ get });
      await service.ensureLoaded(true);
      await service.refresh();

      expect(service.pinned().map((entry) => entry.threadId)).toEqual(['507f1f77bcf86cd799439011']);
      expect(service.history().map((entry) => entry.threadId)).toEqual([
        '507f1f77bcf86cd799439033',
      ]);
    });

    it('refreshes a pinned-only log when ensureLoaded is called again', async () => {
      const pinnedEntry = createEntry({
        id: 'thread-1',
        threadId: '507f1f77bcf86cd799439011',
        pinnedAt: '2026-06-01T12:00:00.000Z',
      });
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [],
          pinned: [pinnedEntry],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );

      const service = createService({ get });
      await service.ensureLoaded(true);
      await service.ensureLoaded();
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    });

    it('optimistically pins a history session and updates with server timestamp', async () => {
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [
            createEntry({
              id: 'thread-1',
              threadId: '507f1f77bcf86cd799439011',
              title: 'Outreach session',
              timestamp: '2026-06-01T10:00:00.000Z',
            }),
          ],
          pinned: [],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );
      const put = vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            threadId: '507f1f77bcf86cd799439011',
            pinned: true,
            pinnedAt: '2026-06-01T12:34:56.000Z',
          },
        })
      );

      const service = createService({ get, put });
      await service.ensureLoaded(true);

      expect(service.history()).toHaveLength(1);
      expect(service.pinned()).toHaveLength(0);

      const result = await service.pinThread('507f1f77bcf86cd799439011', true);

      expect(result).toBe(true);
      expect(put).toHaveBeenCalledWith(
        'https://api.test/agent-x/threads/507f1f77bcf86cd799439011/pin',
        { pinned: true }
      );
      expect(service.pinned()).toHaveLength(1);
      expect(service.pinned()[0]?.pinnedAt).toBe('2026-06-01T12:34:56.000Z');
      expect(service.history()).toHaveLength(0);
      expect(service.isThreadPinned('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('records the session pin update performance trace', async () => {
      const trace = {
        putAttribute: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      };
      const startTrace = vi.fn().mockResolvedValue(trace);
      const put = vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            threadId: '507f1f77bcf86cd799439011',
            pinned: true,
            pinnedAt: '2026-06-01T12:34:56.000Z',
          },
        })
      );
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [
            createEntry({
              id: 'thread-1',
              threadId: '507f1f77bcf86cd799439011',
            }),
          ],
          pinned: [],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );

      const service = createService({ get, put }, {}, { startTrace });
      await service.ensureLoaded(true);
      await service.pinThread('507f1f77bcf86cd799439011', true);

      expect(startTrace).toHaveBeenCalledWith(TRACE_NAMES.AGENT_X_THREAD_PIN_UPDATE);
      expect(trace.putAttribute).toHaveBeenCalledWith('action', 'pin');
      expect(trace.stop).toHaveBeenCalledOnce();
    });

    it('rolls back optimistic pin on API failure', async () => {
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [
            createEntry({
              id: 'thread-1',
              threadId: '507f1f77bcf86cd799439011',
              title: 'Film review',
              timestamp: '2026-06-01T10:00:00.000Z',
            }),
          ],
          pinned: [],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );
      const put = vi.fn().mockReturnValue(
        of({
          success: false,
          error: 'Thread not found',
        })
      );

      const service = createService({ get, put });
      await service.ensureLoaded(true);

      await expect(service.pinThread('507f1f77bcf86cd799439011', true)).rejects.toThrow(
        'Thread not found'
      );

      // Rolled back to history
      expect(service.pinned()).toHaveLength(0);
      expect(service.history()).toHaveLength(1);
      expect(service.history()[0]?.threadId).toBe('507f1f77bcf86cd799439011');
      expect(service.isThreadPinned('507f1f77bcf86cd799439011')).toBe(false);
    });

    it('optimistically unpins a pinned session and restores it to history', async () => {
      const get = vi.fn().mockReturnValue(
        of({
          success: true,
          data: [],
          pinned: [
            createEntry({
              id: 'thread-1',
              threadId: '507f1f77bcf86cd799439011',
              title: 'Pinned strategy',
              pinnedAt: '2026-06-01T11:00:00.000Z',
              timestamp: '2026-06-01T10:00:00.000Z',
            }),
          ],
          scheduled: [],
          pageInfo: { hasMore: false },
        })
      );
      const put = vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            threadId: '507f1f77bcf86cd799439011',
            pinned: false,
            pinnedAt: null,
          },
        })
      );

      const service = createService({ get, put });
      await service.ensureLoaded(true);

      expect(service.pinned()).toHaveLength(1);
      expect(service.history()).toHaveLength(0);

      const result = await service.pinThread('507f1f77bcf86cd799439011', false);

      expect(result).toBe(true);
      expect(service.pinned()).toHaveLength(0);
      expect(service.history()).toHaveLength(1);
      expect(service.history()[0]?.threadId).toBe('507f1f77bcf86cd799439011');
      expect(service.isThreadPinned('507f1f77bcf86cd799439011')).toBe(false);
    });
  });
});

function createService(
  httpOverrides: Partial<HttpClient>,
  eventOverrides: Partial<AgentXOperationEventService> = {},
  performanceOverrides: { startTrace?: ReturnType<typeof vi.fn> } = {}
): AgentXOperationsLogStateService {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  const eventService = {
    titleUpdated$: new Subject(),
    operationStatusUpdated$: new Subject(),
    operationsLogRefreshRequested$: new Subject(),
    emitThreadMessagesUpdated: vi.fn(),
    getEnqueueWaitingEntry: vi.fn().mockReturnValue(null),
    ...eventOverrides,
  };

  const injector = Injector.create({
    providers: [
      { provide: HttpClient, useValue: httpOverrides },
      { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test' },
      { provide: NxtLoggingService, useValue: logger },
      {
        provide: NxtBreadcrumbService,
        useValue: { trackStateChange: vi.fn() },
      },
      { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
      {
        provide: PERFORMANCE_ADAPTER,
        useValue: {
          startTrace: vi.fn().mockResolvedValue({
            putAttribute: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
          }),
          ...performanceOverrides,
        },
      },
      { provide: AgentXOperationEventService, useValue: eventService },
    ],
  });

  return runInInjectionContext(injector, () => new AgentXOperationsLogStateService());
}
