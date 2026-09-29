import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ModalController } from '@ionic/angular/standalone';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { OperationLogEntry } from '@nxt1/core';
import { AGENT_X_OPERATIONS_LOG_TEST_IDS } from '@nxt1/core/testing';
import { AgentXOperationsLogComponent } from '../agent-x-operations-log.component';
import { NxtSheetHeaderComponent } from '../../../../components/bottom-sheet/sheet-header.component';
import { AgentXOperationsLogStateService } from '../../../services/agent-x-operations-log-state.service';
import { AgentXOperationEventService } from '../../../services/agent-x-operation-event.service';
import { AgentXStreamRegistryService } from '../../../services/agent-x-stream-registry.service';
import { AGENT_X_API_BASE_URL } from '../../../services/agent-x-job.service';
import { NxtBottomSheetService } from '../../../../components/bottom-sheet';
import { HapticsService } from '../../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../../services/analytics/analytics-adapter.token';
import { NxtToastService } from '../../../../services/toast/toast.service';

@Component({
  selector: 'nxt1-sheet-header',
  template: '',
  standalone: true,
})
class MockSheetHeaderComponent {}

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

describe('AgentXOperationsLogComponent - Pin Support', () => {
  let stateMock: {
    loadingInitial: ReturnType<typeof signal<boolean>>;
    loadingMore: ReturnType<typeof signal<boolean>>;
    scheduled: ReturnType<typeof signal<readonly OperationLogEntry[]>>;
    pinned: ReturnType<typeof signal<readonly OperationLogEntry[]>>;
    history: ReturnType<typeof signal<readonly OperationLogEntry[]>>;
    operations: ReturnType<typeof signal<readonly OperationLogEntry[]>>;
    error: ReturnType<typeof signal<string | null>>;
    unreadThreadIds: ReturnType<typeof signal<ReadonlySet<string>>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    loadMore: ReturnType<typeof vi.fn>;
    isThreadPinned: ReturnType<typeof vi.fn>;
    pinThread: ReturnType<typeof vi.fn>;
    hasRecurringTaskForThread: ReturnType<typeof vi.fn>;
  };
  let toastMock: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
  };
  let hapticsMock: { impact: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    stateMock = {
      loadingInitial: signal(false),
      loadingMore: signal(false),
      scheduled: signal([]),
      pinned: signal([]),
      history: signal([]),
      operations: signal([]),
      error: signal(null),
      unreadThreadIds: signal(new Set<string>()),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      loadMore: vi.fn().mockResolvedValue(undefined),
      isThreadPinned: vi.fn().mockReturnValue(false),
      pinThread: vi.fn().mockResolvedValue(true),
      hasRecurringTaskForThread: vi.fn().mockReturnValue(false),
    };

    toastMock = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    hapticsMock = {
      impact: vi.fn().mockResolvedValue(undefined),
    };

    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    logger.child.mockReturnValue(logger);

    TestBed.configureTestingModule({
      imports: [AgentXOperationsLogComponent],
      providers: [
        { provide: AgentXOperationsLogStateService, useValue: stateMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtLoggingService, useValue: logger },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test' },
        {
          provide: HttpClient,
          useValue: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() },
        },
        { provide: AgentXStreamRegistryService, useValue: { abort: vi.fn() } },
        { provide: AgentXOperationEventService, useValue: {} },
        { provide: NxtBottomSheetService, useValue: {} },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
      ],
    }).overrideComponent(AgentXOperationsLogComponent, {
      remove: { imports: [NxtSheetHeaderComponent] },
      add: { imports: [MockSheetHeaderComponent] },
    });
  });

  it('renders pinned group when pinned entries exist', () => {
    const pinnedEntry = createEntry({
      id: 'pinned-1',
      threadId: '507f1f77bcf86cd799439011',
      title: 'Pinned Recruiting Plan',
      pinnedAt: '2026-06-25T12:00:00.000Z',
    });

    stateMock.pinned.set([pinnedEntry]);
    stateMock.operations.set([pinnedEntry]);
    stateMock.isThreadPinned.mockReturnValue(true);

    const fixture = TestBed.createComponent(AgentXOperationsLogComponent);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const pinnedGroup = root.querySelector(
      `[data-testid="${AGENT_X_OPERATIONS_LOG_TEST_IDS.PINNED_GROUP}"]`
    );
    expect(pinnedGroup).not.toBeNull();
    expect(pinnedGroup?.textContent).toContain('Pinned Recruiting Plan');

    const pinnedBadge = root.querySelector('.log-entry-pinned');
    expect(pinnedBadge).toBeNull();
  });

  it('allows pinning an unpinned session and calls state service pinThread', async () => {
    const historyEntry = createEntry({
      id: 'history-1',
      threadId: '507f1f77bcf86cd799439022',
      title: 'Film Analysis',
      pinnedAt: null,
    });

    stateMock.history.set([historyEntry]);
    stateMock.operations.set([historyEntry]);
    stateMock.isThreadPinned.mockReturnValue(false);

    const fixture = TestBed.createComponent(AgentXOperationsLogComponent);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(
      (comp as unknown as { canPinEntry: (entry: OperationLogEntry) => boolean }).canPinEntry(
        historyEntry
      )
    ).toBe(true);
    expect(
      (comp as unknown as { isEntryPinned: (entry: OperationLogEntry) => boolean }).isEntryPinned(
        historyEntry
      )
    ).toBe(false);

    await (
      comp as unknown as { onPinToggle: (entry: OperationLogEntry, event: Event) => Promise<void> }
    ).onPinToggle(historyEntry, new MouseEvent('click'));

    expect(stateMock.pinThread).toHaveBeenCalledWith('507f1f77bcf86cd799439022', true);
    expect(toastMock.success).toHaveBeenCalledWith('Session pinned');
  });

  it('allows unpinning a pinned session and calls state service pinThread with false', async () => {
    const pinnedEntry = createEntry({
      id: 'pinned-1',
      threadId: '507f1f77bcf86cd799439011',
      title: 'Pinned Plan',
      pinnedAt: '2026-06-25T12:00:00.000Z',
    });

    stateMock.pinned.set([pinnedEntry]);
    stateMock.operations.set([pinnedEntry]);
    stateMock.isThreadPinned.mockReturnValue(true);

    const fixture = TestBed.createComponent(AgentXOperationsLogComponent);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(
      (comp as unknown as { isEntryPinned: (entry: OperationLogEntry) => boolean }).isEntryPinned(
        pinnedEntry
      )
    ).toBe(true);

    await (
      comp as unknown as { onPinToggle: (entry: OperationLogEntry, event: Event) => Promise<void> }
    ).onPinToggle(pinnedEntry, new MouseEvent('click'));

    expect(stateMock.pinThread).toHaveBeenCalledWith('507f1f77bcf86cd799439011', false);
    expect(toastMock.success).toHaveBeenCalledWith('Session unpinned');
  });

  it('disallows pinning on scheduled tasks', () => {
    const scheduledEntry = createEntry({
      id: 'schedule:task-1',
      threadId: '507f1f77bcf86cd799439011',
      title: 'Daily briefing',
      isScheduled: true,
    });

    const fixture = TestBed.createComponent(AgentXOperationsLogComponent);
    const comp = fixture.componentInstance;

    expect(
      (comp as unknown as { canPinEntry: (entry: OperationLogEntry) => boolean }).canPinEntry(
        scheduledEntry
      )
    ).toBe(false);
  });
});
