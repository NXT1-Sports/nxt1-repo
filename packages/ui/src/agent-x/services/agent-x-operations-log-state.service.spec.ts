import '@angular/compiler';

import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
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
});

function createService(
  httpOverrides: Partial<HttpClient>,
  eventOverrides: Partial<AgentXOperationEventService> = {}
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
      { provide: AgentXOperationEventService, useValue: eventService },
    ],
  });

  return runInInjectionContext(injector, () => new AgentXOperationsLogStateService());
}
