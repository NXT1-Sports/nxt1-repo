import { Injectable, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  OperationLogEntry,
  OperationLogStatus,
  OperationsLogPageInfo,
  OperationsLogResponse,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AgentXOperationEventService } from './agent-x-operation-event.service';

const ENQUEUE_HYDRATION_REFRESH_DELAYS_MS = [0, 1_000, 2_500, 5_000, 10_000] as const;
const OPERATIONS_LOG_REFRESH_DELAYS_MS = [0, 1_000, 2_500, 5_000] as const;
const INITIAL_HISTORY_LIMIT = 50;
const OPERATIONS_LOG_NO_CACHE_OPTIONS = {
  headers: {
    'X-No-Cache': '1',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  },
} as const;

@Injectable({ providedIn: 'root' })
export class AgentXOperationsLogStateService {
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationsLogState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _loadingInitial = signal(false);
  private readonly _loadingMore = signal(false);
  private readonly _refreshing = signal(false);
  private readonly _initialized = signal(false);
  private readonly _history = signal<readonly OperationLogEntry[]>([]);
  private readonly _scheduled = signal<readonly OperationLogEntry[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _hasMore = signal(false);
  private readonly _nextCursor = signal<string | null>(null);

  private readonly _unreadThreadIds = signal<ReadonlySet<string>>(new Set());
  private readonly _sseGeneratedTitles = new Map<string, string>();
  private readonly _sseGeneratedTitlesByOperation = new Map<string, string>();
  private readonly _confirmedTerminalStatuses = new Map<string, OperationLogStatus>();
  private readonly _terminalOperationIdsByThread = new Map<string, Set<string>>();
  private readonly _liveInProgressThreads = new Set<string>();
  private readonly _httpNotifiedTerminalRefreshKeys = new Set<string>();
  private readonly _enqueueHydrationAttempts = new Map<string, number>();
  private readonly _enqueueHydrationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _operationsLogRefreshAttempts = new Map<string, number>();
  private readonly _operationsLogRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _operationsLogRefreshRecurringTargets = new Map<string, boolean | null>();

  readonly loadingInitial = computed(() => this._loadingInitial());
  readonly loadingMore = computed(() => this._loadingMore());
  readonly refreshing = computed(() => this._refreshing());
  readonly initialized = computed(() => this._initialized());
  readonly history = computed(() => this._history());
  readonly scheduled = computed(() => this._scheduled());
  readonly operations = computed(() => [...this._scheduled(), ...this._history()]);
  readonly error = computed(() => this._error());
  readonly hasMore = computed(() => this._hasMore());
  readonly nextCursor = computed(() => this._nextCursor());
  readonly unreadThreadIds = computed(() => this._unreadThreadIds());

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timer of this._enqueueHydrationTimers.values()) {
        clearTimeout(timer);
      }
      this._enqueueHydrationTimers.clear();
      this._enqueueHydrationAttempts.clear();

      for (const timer of this._operationsLogRefreshTimers.values()) {
        clearTimeout(timer);
      }
      this._operationsLogRefreshTimers.clear();
      this._operationsLogRefreshAttempts.clear();
      this._operationsLogRefreshRecurringTargets.clear();
    });

    this.operationEventService.titleUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.logger.debug('Applying title update to operations state', {
          threadId: evt.threadId,
          operationId: evt.operationId,
          title: evt.title,
        });
        this.breadcrumb.trackStateChange('operations-log:title-updated', {
          threadId: evt.threadId,
          operationId: evt.operationId,
        });
        this._sseGeneratedTitles.set(evt.threadId, evt.title);
        if (evt.operationId) {
          this._sseGeneratedTitlesByOperation.set(evt.operationId, evt.title);
        }
        this.updateHistory((ops) => {
          const matchesTitleEvent = (op: OperationLogEntry): boolean =>
            evt.operationId
              ? op.operationId === evt.operationId ||
                (!op.operationId && op.threadId === evt.threadId)
              : op.threadId === evt.threadId;
          const target = ops.find(matchesTitleEvent);
          if (!target || target.title === evt.title) return ops;
          return ops.map((op) => (matchesTitleEvent(op) ? { ...op, title: evt.title } : op));
        });
      });

    this.operationEventService.operationStatusUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        const enqueueWaitingEntry = this.operationEventService.getEnqueueWaitingEntry(evt.threadId);
        const eventOperationId = evt.operationId?.trim() ?? '';
        const terminalLogStatuses = new Set<OperationLogStatus>(['complete', 'error', 'cancelled']);
        const enqueueWaitingActive = !!enqueueWaitingEntry;
        const terminalEventMatchesWaitingOperation =
          enqueueWaitingActive &&
          terminalLogStatuses.has(evt.status) &&
          (!enqueueWaitingEntry.operationId ||
            enqueueWaitingEntry.operationId === eventOperationId);
        const effectiveStatus: OperationLogStatus =
          enqueueWaitingActive && evt.status === 'complete' && !terminalEventMatchesWaitingOperation
            ? 'in-progress'
            : evt.status;

        this.logger.info('Real-time operation status update', {
          threadId: evt.threadId,
          operationId: evt.operationId,
          status: effectiveStatus,
          rawStatus: evt.status,
          enqueueWaitingActive,
          waitingOperationId: enqueueWaitingEntry?.operationId,
        });
        if (evt.source === 'enqueue' || enqueueWaitingActive) {
          this.scheduleEnqueueHydrationRefresh(evt.threadId, eventOperationId || undefined);
        }
        this.breadcrumb.trackStateChange('operations-log:status-updated', {
          threadId: evt.threadId,
          operationId: evt.operationId,
          status: effectiveStatus,
        });

        this.updateHistory((ops) => {
          const eventThreadId = evt.threadId.trim();
          const isTerminalEvent = terminalLogStatuses.has(effectiveStatus);
          const exactOperationIdx = eventOperationId
            ? ops.findIndex((op) => {
                const opOperationId = op.operationId?.trim() ?? '';
                const opThreadId = op.threadId?.trim() ?? '';
                return (
                  opOperationId === eventOperationId ||
                  (!opOperationId && opThreadId === eventThreadId)
                );
              })
            : -1;
          const threadIdx = ops.findIndex((op) => op.threadId?.trim() === eventThreadId);
          const threadEntry = threadIdx >= 0 ? ops[threadIdx] : undefined;
          const shouldReplaceThreadRow =
            exactOperationIdx < 0 &&
            !!threadEntry &&
            (eventOperationId.length > 0 || !isTerminalEvent) &&
            this.shouldReplaceThreadRowForEvent(threadEntry, evt.timestamp, isTerminalEvent);
          const idx =
            exactOperationIdx >= 0 ? exactOperationIdx : shouldReplaceThreadRow ? threadIdx : -1;

          if (idx >= 0) {
            const prior = ops[idx];
            if (!prior) return ops;

            const resolvedTitle = evt.title?.trim() || prior.title;
            const shouldUpdateOperationId =
              !!eventOperationId && prior.operationId !== eventOperationId;
            const shouldUpdateTimestamp = prior.timestamp !== evt.timestamp;
            const shouldUpdateTitle = resolvedTitle !== prior.title;
            const isStaleSameOperationRunningEvent =
              terminalLogStatuses.has(prior.status) &&
              effectiveStatus === 'in-progress' &&
              !!eventOperationId &&
              prior.operationId === eventOperationId;
            const nextStatus = isStaleSameOperationRunningEvent ? prior.status : effectiveStatus;

            if (
              prior.status === nextStatus &&
              !shouldUpdateOperationId &&
              !shouldUpdateTimestamp &&
              !shouldUpdateTitle
            ) {
              return ops;
            }

            const updatedEntry: OperationLogEntry = {
              ...prior,
              ...(shouldUpdateOperationId
                ? { id: eventOperationId, operationId: eventOperationId }
                : {}),
              status: nextStatus,
              timestamp: evt.timestamp,
              ...(shouldUpdateTitle ? { title: resolvedTitle } : {}),
            };
            const remaining = ops.filter(
              (op, index) => index !== idx && op.threadId?.trim() !== eventThreadId
            );
            return [updatedEntry, ...remaining];
          }

          if (threadIdx >= 0 && eventOperationId && isTerminalEvent) {
            return ops;
          }

          if (evt.source === 'enqueue') {
            if (!evt.operationId || !evt.operationId.trim()) {
              return ops;
            }
            const newEntry: OperationLogEntry = {
              id: evt.operationId,
              title:
                evt.title?.trim() ||
                this._sseGeneratedTitlesByOperation.get(evt.operationId) ||
                this._sseGeneratedTitles.get(evt.threadId) ||
                'Processing…',
              summary: '',
              status: effectiveStatus,
              category: 'system',
              timestamp: evt.timestamp,
              threadId: evt.threadId,
              operationId: evt.operationId,
              icon: 'sparkles',
            };
            return [newEntry, ...ops];
          }

          const newEntry: OperationLogEntry = {
            id: eventThreadId,
            title:
              evt.title?.trim() ||
              (eventOperationId
                ? this._sseGeneratedTitlesByOperation.get(eventOperationId)
                : undefined) ||
              this._sseGeneratedTitles.get(eventThreadId) ||
              'Processing…',
            summary: '',
            status: effectiveStatus,
            category: 'system',
            timestamp: evt.timestamp,
            threadId: eventThreadId,
            ...(eventOperationId ? { operationId: eventOperationId } : {}),
            icon: 'sparkles',
          };
          return [newEntry, ...ops];
        });

        if (effectiveStatus === 'complete') {
          this._unreadThreadIds.update((set) => {
            const next = new Set(set);
            next.add(evt.threadId);
            return next;
          });
        }

        const liveEventKey = this.getLiveEventKey(evt.operationId);
        if (terminalLogStatuses.has(effectiveStatus)) {
          if (liveEventKey) {
            this._confirmedTerminalStatuses.set(liveEventKey, effectiveStatus);
            const existingOps =
              this._terminalOperationIdsByThread.get(evt.threadId) ?? new Set<string>();
            existingOps.add(liveEventKey);
            this._terminalOperationIdsByThread.set(evt.threadId, existingOps);
          }
          this._liveInProgressThreads.delete(evt.threadId);
        } else {
          if (liveEventKey) {
            this._confirmedTerminalStatuses.delete(liveEventKey);
            this._terminalOperationIdsByThread.get(evt.threadId)?.delete(liveEventKey);
          }
          if (effectiveStatus === 'in-progress') {
            this._liveInProgressThreads.add(evt.threadId);
            this.purgeTerminalsForThread(evt.threadId);
          }
        }
      });

    this.operationEventService.operationsLogRefreshRequested$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.logger.debug('Received operations log refresh request', {
          source: evt.source,
          threadId: evt.threadId,
          retryDelaysMs: evt.retryDelaysMs,
        });
        this.requestOperationsLogRefresh(
          evt.threadId,
          evt.retryDelaysMs ?? OPERATIONS_LOG_REFRESH_DELAYS_MS
        );
      });
  }

  async ensureLoaded(force = false): Promise<void> {
    if (this._initialized() && !force) {
      if (this._history().length > 0 || this._scheduled().length > 0) {
        void this.silentRefresh();
      }
      return;
    }

    await this.loadOperations();
  }

  async refresh(): Promise<void> {
    await this.silentRefresh();
  }

  async loadMore(): Promise<void> {
    if (this._loadingMore() || !this._hasMore() || !this._nextCursor()) {
      return;
    }

    this._loadingMore.set(true);
    try {
      const response = await this.fetchOperations(INITIAL_HISTORY_LIMIT, this._nextCursor());
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load more operations');
      }

      const nextEntries = response.data;
      const merged = this.mergePagedHistory(this._history(), nextEntries);
      this._history.set(merged);
      this.applyPageInfo(response.pageInfo);
    } finally {
      this._loadingMore.set(false);
    }
  }

  markThreadReviewed(threadId: string | null | undefined): void {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId || !this._unreadThreadIds().has(resolvedThreadId)) {
      return;
    }

    this._unreadThreadIds.update((set) => {
      const next = new Set(set);
      next.delete(resolvedThreadId);
      return next;
    });
  }

  hasRecurringTaskForThread(threadId: string | null | undefined): boolean {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return false;
    }

    return this._scheduled().some(
      (entry) => this.getManageableThreadId(entry) === resolvedThreadId
    );
  }

  replaceOperations(
    updater: (entries: readonly OperationLogEntry[]) => readonly OperationLogEntry[]
  ): void {
    const next = this.normalizeOperations(updater(this.operations()));
    const split = this.partitionOperations(next);
    this._scheduled.set(split.scheduled);
    this._history.set(split.history);
  }

  private async loadOperations(): Promise<void> {
    this._loadingInitial.set(true);
    this._error.set(null);
    this.logger.info('Loading operations log');
    this.breadcrumb.trackStateChange('operations-log: loading');
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_VIEWED);

    try {
      const response = await this.fetchOperations(INITIAL_HISTORY_LIMIT);
      if (response.success && response.data) {
        const scheduled = response.scheduled ?? [];
        this._scheduled.set(this.normalizeScheduled(scheduled));
        this._history.set(this.normalizeHistory(response.data, scheduled));
        this.applyPageInfo(response.pageInfo);
        this._initialized.set(true);
        this.logger.info('Operations log loaded', {
          historyCount: response.data.length,
          scheduledCount: scheduled.length,
        });
        this.breadcrumb.trackStateChange('operations-log: loaded', {
          count: response.data.length,
          scheduledCount: scheduled.length,
        });
      } else {
        this.logger.warn('Operations log returned empty', { error: response.error });
        this._error.set(response.error ?? 'No data returned');
        this._scheduled.set([]);
        this._history.set([]);
        this.applyPageInfo(undefined);
      }
    } catch (err) {
      const msg = this.classifyError(err);
      this.logger.error('Failed to load operations log', { error: msg });
      this._error.set(msg);
      this._scheduled.set([]);
      this._history.set([]);
      this.applyPageInfo(undefined);
    } finally {
      this._loadingInitial.set(false);
    }
  }

  private async silentRefresh(): Promise<void> {
    if (this._refreshing()) {
      return;
    }

    this._refreshing.set(true);
    try {
      const previousEntries = this._history();
      const previousHasMore = this._hasMore();
      const previousNextCursor = this._nextCursor();
      const liveStatuses = new Map<string, OperationLogStatus>();
      const liveEntries = new Map<string, OperationLogEntry>();
      for (const op of previousEntries) {
        if (op.threadId) {
          const existing = liveEntries.get(op.threadId);
          if (!existing || this.isNewerThreadEntry(op, existing)) {
            liveStatuses.set(op.threadId, op.status);
            liveEntries.set(op.threadId, op);
          }
        }
      }

      const response = await this.fetchOperations(INITIAL_HISTORY_LIMIT);
      if (response.success && response.data) {
        const scheduled = response.scheduled ?? [];
        this._scheduled.set(this.normalizeScheduled(scheduled));
        let entries = this.normalizeHistory(response.data, scheduled);

        if (liveStatuses.size > 0 || this._sseGeneratedTitles.size > 0) {
          const terminalStates = new Set<OperationLogStatus>(['complete', 'error', 'cancelled']);
          const httpThreadIds = new Set(entries.filter((e) => e.threadId).map((e) => e.threadId!));
          entries = entries.map((entry) => {
            const live = entry.threadId ? liveStatuses.get(entry.threadId) : undefined;
            const sseTitle =
              (entry.operationId
                ? this._sseGeneratedTitlesByOperation.get(entry.operationId)
                : undefined) ??
              (entry.threadId ? this._sseGeneratedTitles.get(entry.threadId) : undefined);

            let merged = entry;

            const sseConfirmedRunning =
              !!entry.threadId && this._liveInProgressThreads.has(entry.threadId);
            const liveEntry = entry.threadId ? liveEntries.get(entry.threadId) : undefined;
            const liveOperationId = liveEntry?.operationId?.trim() || '';
            const httpOperationId = entry.operationId?.trim() || '';
            const liveRepresentsDifferentOperation = httpOperationId
              ? !!liveOperationId && liveOperationId !== httpOperationId
              : true;

            if (live) {
              const httpIsTerminal = terminalStates.has(entry.status);
              const liveIsTerminal = terminalStates.has(live);
              if (
                !httpIsTerminal ||
                liveIsTerminal ||
                (sseConfirmedRunning && liveRepresentsDifferentOperation)
              ) {
                merged = { ...merged, status: live };
              }
            }

            if (liveOperationId && (!httpOperationId || liveRepresentsDifferentOperation)) {
              merged = { ...merged, operationId: liveOperationId };
            }

            if (sseTitle && merged.title !== sseTitle) {
              merged = { ...merged, title: sseTitle };
            }

            const confirmedTerminal = this._confirmedTerminalStatuses.get(
              this.getLiveEventKey(entry.operationId)
            );
            if (confirmedTerminal && !terminalStates.has(merged.status) && !sseConfirmedRunning) {
              merged = { ...merged, status: confirmedTerminal };
            }

            return merged;
          });

          for (const [threadId, status] of liveStatuses) {
            if (
              !httpThreadIds.has(threadId) &&
              (status === 'in-progress' ||
                status === 'paused' ||
                status === 'awaiting_input' ||
                status === 'awaiting_approval')
            ) {
              const existing = liveEntries.get(threadId);
              if (existing) entries = [existing, ...entries];
            }
          }
        }

        const mergedEntries = this.mergeRefreshedHistory(
          previousEntries,
          entries,
          response.pageInfo?.hasMore ?? false
        );
        const preservedLoadedHistory = mergedEntries.length > entries.length;

        this._history.set(mergedEntries);
        if (preservedLoadedHistory) {
          this._hasMore.set(previousHasMore);
          this._nextCursor.set(previousNextCursor);
        } else {
          this.applyPageInfo(response.pageInfo);
        }
        this.emitOutOfBandThreadRefreshes(previousEntries, entries);
      }
    } catch {
      // Silent refresh failures are non-critical
    } finally {
      this._refreshing.set(false);
    }
  }

  private async fetchOperations(
    limit: number,
    cursor?: string | null
  ): Promise<OperationsLogResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const url = `${this.baseUrl}/agent-x/operations-log?${params.toString()}`;
    return firstValueFrom(
      this.http.get<OperationsLogResponse>(url, OPERATIONS_LOG_NO_CACHE_OPTIONS)
    );
  }

  private applyPageInfo(pageInfo?: OperationsLogPageInfo): void {
    this._hasMore.set(pageInfo?.hasMore ?? false);
    this._nextCursor.set(pageInfo?.nextCursor ?? null);
  }

  private mergePagedHistory(
    existing: readonly OperationLogEntry[],
    incoming: readonly OperationLogEntry[]
  ): readonly OperationLogEntry[] {
    const seenKeys = new Set(existing.map((entry) => this.getEntryKey(entry)));
    const appended = incoming.filter((entry) => {
      const key = this.getEntryKey(entry);
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });

    return [...existing, ...appended];
  }

  private mergeRefreshedHistory(
    existing: readonly OperationLogEntry[],
    refreshed: readonly OperationLogEntry[],
    hasMoreFromFirstPage: boolean
  ): readonly OperationLogEntry[] {
    if (!hasMoreFromFirstPage || existing.length === 0 || refreshed.length === 0) {
      return refreshed;
    }

    const oldestRefreshedEntry = refreshed[refreshed.length - 1];
    if (!oldestRefreshedEntry) {
      return refreshed;
    }

    const refreshedKeys = new Set(refreshed.map((entry) => this.getEntryKey(entry)));
    const preservedOlderEntries = existing.filter((entry) => {
      const key = this.getEntryKey(entry);
      if (refreshedKeys.has(key)) {
        return false;
      }

      return this.isEntryOlderThan(entry, oldestRefreshedEntry);
    });

    if (preservedOlderEntries.length === 0) {
      return refreshed;
    }

    return this.normalizeOperations([...refreshed, ...preservedOlderEntries]).filter(
      (entry) => entry.isScheduled !== true
    );
  }

  private normalizeScheduled(entries: readonly OperationLogEntry[]): readonly OperationLogEntry[] {
    return [...entries].sort((a, b) => this.compareEntries(a, b));
  }

  private normalizeHistory(
    historyEntries: readonly OperationLogEntry[],
    scheduledEntries: readonly OperationLogEntry[]
  ): readonly OperationLogEntry[] {
    return this.normalizeOperations([...scheduledEntries, ...historyEntries]).filter(
      (entry) => entry.isScheduled !== true
    );
  }

  private normalizeOperations(entries: readonly OperationLogEntry[]): readonly OperationLogEntry[] {
    const scheduledThreadIds = new Set<string>();

    for (const entry of entries) {
      if (entry.isScheduled !== true) {
        continue;
      }

      const threadId = this.getManageableThreadId(entry);
      if (threadId) {
        scheduledThreadIds.add(threadId);
      }
    }

    const filtered =
      scheduledThreadIds.size === 0
        ? [...entries]
        : entries.filter((entry) => {
            if (entry.isScheduled === true) {
              return true;
            }

            const threadId = this.getManageableThreadId(entry);
            return !threadId || !scheduledThreadIds.has(threadId);
          });

    return filtered.sort((a, b) => this.compareEntries(a, b));
  }

  private partitionOperations(entries: readonly OperationLogEntry[]): {
    readonly scheduled: readonly OperationLogEntry[];
    readonly history: readonly OperationLogEntry[];
  } {
    const scheduled: OperationLogEntry[] = [];
    const history: OperationLogEntry[] = [];

    for (const entry of entries) {
      if (entry.isScheduled === true) {
        scheduled.push(entry);
      } else {
        history.push(entry);
      }
    }

    return { scheduled, history };
  }

  private updateHistory(
    updater: (entries: readonly OperationLogEntry[]) => readonly OperationLogEntry[]
  ): void {
    this._history.set(this.normalizeHistory(updater(this._history()), this._scheduled()));
  }

  private compareEntries(a: OperationLogEntry, b: OperationLogEntry): number {
    const timeA = this.parseEntryTimestamp(a);
    const timeB = this.parseEntryTimestamp(b);
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return this.getEntryKey(b).localeCompare(this.getEntryKey(a));
  }

  private getEntryKey(entry: Pick<OperationLogEntry, 'threadId' | 'operationId' | 'id'>): string {
    if (entry.threadId?.trim()) {
      return `thread:${entry.threadId.trim()}`;
    }
    if (entry.operationId?.trim()) {
      return `operation:${entry.operationId.trim()}`;
    }
    return `entry:${entry.id}`;
  }

  private getLiveEventKey(operationId: string | undefined): string {
    return operationId?.trim() ?? '';
  }

  private purgeTerminalsForThread(threadId: string): void {
    const operationIds = this._terminalOperationIdsByThread.get(threadId);
    if (!operationIds) return;
    for (const opId of operationIds) {
      this._confirmedTerminalStatuses.delete(opId);
    }
    this._terminalOperationIdsByThread.delete(threadId);
  }

  private parseEntryTimestamp(entry: Pick<OperationLogEntry, 'timestamp'>): number {
    const timestamp = Date.parse(entry.timestamp);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private isEntryOlderThan(
    candidate: Pick<OperationLogEntry, 'timestamp' | 'threadId' | 'operationId' | 'id'>,
    boundary: Pick<OperationLogEntry, 'timestamp' | 'threadId' | 'operationId' | 'id'>
  ): boolean {
    const candidateTime = this.parseEntryTimestamp(candidate);
    const boundaryTime = this.parseEntryTimestamp(boundary);

    if (candidateTime < boundaryTime) {
      return true;
    }

    if (candidateTime > boundaryTime) {
      return false;
    }

    return this.getEntryKey(candidate).localeCompare(this.getEntryKey(boundary)) < 0;
  }

  private isNewerThreadEntry(candidate: OperationLogEntry, current: OperationLogEntry): boolean {
    const candidateTime = this.parseEntryTimestamp(candidate);
    const currentTime = this.parseEntryTimestamp(current);
    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }
    if (candidate.status === 'in-progress' && current.status !== 'in-progress') {
      return true;
    }
    return Boolean(candidate.operationId && candidate.operationId !== current.operationId);
  }

  private shouldReplaceThreadRowForEvent(
    entry: OperationLogEntry,
    eventTimestamp: string,
    isTerminalEvent: boolean
  ): boolean {
    if (!isTerminalEvent) {
      return true;
    }

    const eventTime = Date.parse(eventTimestamp);
    if (!Number.isFinite(eventTime)) {
      return true;
    }

    return eventTime >= this.parseEntryTimestamp(entry);
  }

  private emitOutOfBandThreadRefreshes(
    previousEntries: readonly OperationLogEntry[],
    nextEntries: readonly OperationLogEntry[]
  ): void {
    const terminalStatuses = new Set<OperationLogStatus>(['complete', 'error', 'cancelled']);
    const previousByThread = new Map<string, OperationLogEntry>();
    const previousByOperation = new Map<string, OperationLogEntry>();

    for (const entry of previousEntries) {
      const threadId = entry.threadId?.trim();
      if (threadId) {
        previousByThread.set(threadId, entry);
      }

      const operationId = entry.operationId?.trim();
      if (operationId) {
        previousByOperation.set(operationId, entry);
      }
    }

    for (const entry of nextEntries) {
      const threadId = entry.threadId?.trim();
      if (!threadId || !terminalStatuses.has(entry.status)) continue;

      const operationId = entry.operationId?.trim();
      const previous =
        (operationId ? previousByOperation.get(operationId) : undefined) ??
        previousByThread.get(threadId);
      const isFreshTerminalUpdate =
        !previous ||
        previous.status !== entry.status ||
        previous.timestamp !== entry.timestamp ||
        (previous.operationId?.trim() ?? '') !== (operationId ?? '');

      if (!isFreshTerminalUpdate) continue;

      const notificationKey = this.buildThreadRefreshNotificationKey(entry);
      if (!notificationKey || this._httpNotifiedTerminalRefreshKeys.has(notificationKey)) continue;

      this._httpNotifiedTerminalRefreshKeys.add(notificationKey);
      this._unreadThreadIds.update((set) => {
        const next = new Set(set);
        next.add(threadId);
        return next;
      });
      this.operationEventService.emitThreadMessagesUpdated(
        threadId,
        'operations-log',
        operationId,
        entry.status
      );
    }
  }

  private buildThreadRefreshNotificationKey(entry: OperationLogEntry): string {
    const threadId = entry.threadId?.trim() ?? '';
    if (!threadId) return '';

    const operationId = entry.operationId?.trim() ?? '';
    if (operationId) {
      return `${threadId}:${operationId}:${entry.status}`;
    }

    return `${threadId}:${entry.timestamp}:${entry.status}`;
  }

  private clearOperationsLogRefreshState(refreshKey: string): void {
    const timer = this._operationsLogRefreshTimers.get(refreshKey);
    if (timer) {
      clearTimeout(timer);
      this._operationsLogRefreshTimers.delete(refreshKey);
    }
    this._operationsLogRefreshAttempts.delete(refreshKey);
    this._operationsLogRefreshRecurringTargets.delete(refreshKey);
  }

  private requestOperationsLogRefresh(
    threadId: string | undefined,
    retryDelaysMs: readonly number[]
  ): void {
    const resolvedThreadId = threadId?.trim() || null;
    const refreshKey = resolvedThreadId ? `thread:${resolvedThreadId}` : 'global';

    this.clearOperationsLogRefreshState(refreshKey);
    this._operationsLogRefreshAttempts.set(refreshKey, 0);
    this._operationsLogRefreshRecurringTargets.set(
      refreshKey,
      resolvedThreadId ? this.hasRecurringTaskForThread(resolvedThreadId) : null
    );
    this.scheduleOperationsLogRefresh(refreshKey, resolvedThreadId, retryDelaysMs);
  }

  private scheduleOperationsLogRefresh(
    refreshKey: string,
    threadId: string | null,
    retryDelaysMs: readonly number[]
  ): void {
    const attempt = this._operationsLogRefreshAttempts.get(refreshKey) ?? 0;
    if (attempt >= retryDelaysMs.length) {
      this.clearOperationsLogRefreshState(refreshKey);
      return;
    }

    const delay = retryDelaysMs[attempt] ?? 0;
    const timer = setTimeout(() => {
      this._operationsLogRefreshTimers.delete(refreshKey);
      void this.silentRefresh()
        .catch((error) => {
          this.logger.warn('Operations log refresh request failed', {
            refreshKey,
            threadId,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (threadId) {
            const initialRecurringState =
              this._operationsLogRefreshRecurringTargets.get(refreshKey) ?? null;
            if (
              initialRecurringState !== null &&
              this.hasRecurringTaskForThread(threadId) !== initialRecurringState
            ) {
              this.clearOperationsLogRefreshState(refreshKey);
              return;
            }
          }

          this._operationsLogRefreshAttempts.set(refreshKey, attempt + 1);
          this.scheduleOperationsLogRefresh(refreshKey, threadId, retryDelaysMs);
        });
    }, delay);

    this._operationsLogRefreshTimers.set(refreshKey, timer);
  }

  private scheduleEnqueueHydrationRefresh(threadId: string, operationId?: string): void {
    const resolvedThreadId = threadId.trim();
    const resolvedOperationId = operationId?.trim() || null;
    if (!resolvedThreadId) return;
    const hasHydratedEntry = (): boolean =>
      this._history().some(
        (entry) =>
          entry.threadId === resolvedThreadId &&
          (!resolvedOperationId || entry.operationId === resolvedOperationId)
      );

    if (hasHydratedEntry()) {
      this._enqueueHydrationAttempts.delete(resolvedThreadId);
      const existingTimer = this._enqueueHydrationTimers.get(resolvedThreadId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this._enqueueHydrationTimers.delete(resolvedThreadId);
      }
      return;
    }

    if (this._enqueueHydrationTimers.has(resolvedThreadId)) return;

    const attempt = this._enqueueHydrationAttempts.get(resolvedThreadId) ?? 0;
    if (attempt >= ENQUEUE_HYDRATION_REFRESH_DELAYS_MS.length) return;

    const delay = ENQUEUE_HYDRATION_REFRESH_DELAYS_MS[attempt];
    const timer = setTimeout(() => {
      this._enqueueHydrationTimers.delete(resolvedThreadId);
      void this.silentRefresh()
        .catch((error) => {
          this.logger.warn('Enqueue hydration refresh failed', {
            threadId: resolvedThreadId,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (hasHydratedEntry()) {
            this._enqueueHydrationAttempts.delete(resolvedThreadId);
            return;
          }

          this._enqueueHydrationAttempts.set(resolvedThreadId, attempt + 1);
          this.scheduleEnqueueHydrationRefresh(resolvedThreadId, resolvedOperationId ?? undefined);
        });
    }, delay);

    this._enqueueHydrationTimers.set(resolvedThreadId, timer);
  }

  private getManageableThreadId(entry: OperationLogEntry): string | null {
    const candidates: unknown[] = [entry.threadId];
    const metadata = entry.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      candidates.push(metadata['sourceId'], metadata['threadId'], metadata['sourceThreadId']);
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const trimmed = candidate.trim();
      if (/^[a-f0-9]{24}$/i.test(trimmed)) {
        return trimmed;
      }
    }

    return null;
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Network error — check your connection';
      if (err.status === 401 || err.status === 403) return 'Session expired — please sign in again';
      if (err.status >= 500) return 'Server error — try again in a moment';
      const apiError = err.error?.error;
      if (typeof apiError === 'string') return apiError;
      if (typeof apiError === 'object' && apiError !== null) {
        return (
          ((apiError as Record<string, unknown>)['message'] as string) ??
          `Request failed (${err.status})`
        );
      }
      return err.error?.message ?? `Request failed (${err.status})`;
    }
    return err instanceof Error ? err.message : 'Failed to load operations';
  }
}
