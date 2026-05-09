import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { OperationLogEntry, OperationsLogResponse } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import type { AgentXRecurringTaskDockItem } from './agent-x-operation-chat-recurring-tasks-dock.component';

const RECURRING_TASK_CACHE_TTL_MS = 5 * 60 * 1000;

type RecurringTaskThreadCacheEntry = {
  readonly items: readonly AgentXRecurringTaskDockItem[];
  readonly expiresAt: number;
};

type RecurringTaskOperationsCacheEntry = {
  readonly entries: readonly OperationLogEntry[];
  readonly expiresAt: number;
};

let sharedThreadCache = new Map<string, RecurringTaskThreadCacheEntry>();
let sharedOperationsCache: RecurringTaskOperationsCacheEntry | null = null;
let sharedOperationsRequest: Promise<readonly OperationLogEntry[]> | null = null;

function formatRecurringNextRun(isoUtc: string, timezone: string | null): string {
  const parsed = new Date(isoUtc);
  if (Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }

  if (!timezone) {
    return parsed.toLocaleString();
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}

interface AgentXOperationChatRecurringHost {
  resolveActiveThreadId(): string | null;
  hasRecurringTasksHint(): boolean;
}

@Injectable()
export class AgentXOperationChatRecurringFacade {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatRecurring');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  private host: AgentXOperationChatRecurringHost | null = null;

  private readonly _items = signal<readonly AgentXRecurringTaskDockItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _cancellingTaskKeys = signal<readonly string[]>([]);
  private readonly _knownRecurringThreadIds = signal<readonly string[]>([]);
  private requestVersion = 0;
  private activeThreadId = '';

  readonly items = computed(() => this._items());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly hasTasks = computed(() => this._items().length > 0);
  readonly cancellingTaskKeys = computed(() => this._cancellingTaskKeys());
  readonly shouldRenderDock = computed(() => {
    if (this._items().length > 0) {
      return true;
    }

    const activeThreadId = this.activeThreadId;
    if (!activeThreadId || !this._loading()) {
      return false;
    }

    return (
      this.host?.hasRecurringTasksHint() === true ||
      this._knownRecurringThreadIds().includes(activeThreadId)
    );
  });

  configure(host: AgentXOperationChatRecurringHost): void {
    this.host = host;
  }

  refreshForActiveThread(): void {
    const threadId = this.host?.resolveActiveThreadId() ?? null;
    this.refreshForThread(threadId);
  }

  refreshForThread(threadId: string | null): void {
    void this.loadForThread(threadId);
  }

  async cancelRecurringTask(taskKey: string): Promise<void> {
    const trimmedKey = taskKey.trim();
    if (!trimmedKey) return;

    if (this._cancellingTaskKeys().includes(trimmedKey)) return;

    const previousItems = this._items();
    this._cancellingTaskKeys.update((keys) => [...keys, trimmedKey]);
    this._items.set(previousItems.filter((task) => task.taskKey !== trimmedKey));

    try {
      const url = `${this.baseUrl}/agent-x/operations-log/scheduled/${encodeURIComponent(trimmedKey)}/archive`;
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>(url, {})
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to cancel recurring task');
      }

      this.logger.info('Recurring task cancelled from chat dock', { taskKey: trimmedKey });
      this.breadcrumb.trackStateChange('operation-chat: recurring task cancelled', {
        taskKey: trimmedKey,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_STREAM_CANCELLED, {
        source: 'operation-chat-recurring-dock',
      });
      this.invalidateSharedCache(trimmedKey);
      this.toast.success('Recurring task cancelled');
    } catch (err) {
      this._items.set(previousItems);
      const message = err instanceof Error ? err.message : 'Failed to cancel recurring task';
      this.logger.error('Failed to cancel recurring task from chat dock', {
        taskKey: trimmedKey,
        error: message,
      });
      this.toast.error(message);
    } finally {
      this._cancellingTaskKeys.update((keys) => keys.filter((key) => key !== trimmedKey));
    }
  }

  private async loadForThread(threadId: string | null): Promise<void> {
    const activeThreadId = threadId?.trim() ?? '';
    if (!activeThreadId) {
      this.activeThreadId = '';
      this._items.set([]);
      this._error.set(null);
      return;
    }

    const threadChanged = this.activeThreadId !== activeThreadId;
    this.activeThreadId = activeThreadId;
    if (threadChanged) {
      this._items.set([]);
    }

    const cachedItems = this.readThreadCache(activeThreadId);
    if (cachedItems) {
      this._items.set(cachedItems);
      this._loading.set(false);
      this._error.set(null);
      return;
    }

    const currentRequestVersion = ++this.requestVersion;
    this._loading.set(true);
    this._error.set(null);

    try {
      const entries = await this.getRecurringEntries();

      if (currentRequestVersion !== this.requestVersion) return;

      const tasks = entries
        .filter((entry) => this.isEntryForThread(entry, activeThreadId))
        .map((entry) => this.toDockItem(entry))
        .filter(
          (
            item
          ): item is {
            item: AgentXRecurringTaskDockItem;
            nextRunAtMs: number | null;
          } => item !== null
        )
        .sort((a, b) => {
          if (a.nextRunAtMs === null && b.nextRunAtMs === null) {
            return a.item.title.localeCompare(b.item.title);
          }
          if (a.nextRunAtMs === null) return 1;
          if (b.nextRunAtMs === null) return -1;
          return a.nextRunAtMs - b.nextRunAtMs;
        })
        .map((item) => item.item);

      this.writeThreadCache(activeThreadId, tasks);
      this._knownRecurringThreadIds.update((threadIds) => {
        const nextThreadIds = new Set(threadIds);
        if (tasks.length > 0) {
          nextThreadIds.add(activeThreadId);
        } else {
          nextThreadIds.delete(activeThreadId);
        }
        return [...nextThreadIds];
      });
      this._items.set(tasks);
    } catch (err) {
      if (currentRequestVersion !== this.requestVersion) return;
      const message = err instanceof Error ? err.message : 'Failed to load recurring tasks';
      this.logger.error('Failed loading recurring tasks for operation chat', {
        threadId: activeThreadId,
        error: message,
      });
      this._error.set(message);
      this._items.set([]);
    } finally {
      if (currentRequestVersion === this.requestVersion) {
        this._loading.set(false);
      }
    }
  }

  private readThreadCache(threadId: string): readonly AgentXRecurringTaskDockItem[] | null {
    const entry = sharedThreadCache.get(threadId);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      sharedThreadCache.delete(threadId);
      return null;
    }

    return entry.items;
  }

  private writeThreadCache(threadId: string, items: readonly AgentXRecurringTaskDockItem[]): void {
    sharedThreadCache.set(threadId, {
      items: [...items],
      expiresAt: Date.now() + RECURRING_TASK_CACHE_TTL_MS,
    });
  }

  private invalidateSharedCache(taskKey?: string): void {
    if (!taskKey) {
      sharedThreadCache = new Map();
      sharedOperationsCache = null;
      sharedOperationsRequest = null;
      return;
    }

    const nextThreadCache = new Map<string, RecurringTaskThreadCacheEntry>();
    for (const [threadId, entry] of sharedThreadCache.entries()) {
      const filteredItems = entry.items.filter((item) => item.taskKey !== taskKey);
      nextThreadCache.set(threadId, {
        items: filteredItems,
        expiresAt: entry.expiresAt,
      });
    }
    sharedThreadCache = nextThreadCache;

    if (sharedOperationsCache) {
      sharedOperationsCache = {
        entries: sharedOperationsCache.entries.filter((entry) => {
          const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
          return metadata['recurringTaskKey'] !== taskKey;
        }),
        expiresAt: sharedOperationsCache.expiresAt,
      };
    }
  }

  private async getRecurringEntries(): Promise<readonly OperationLogEntry[]> {
    const cached = sharedOperationsCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.entries;
    }

    if (sharedOperationsRequest) {
      return sharedOperationsRequest;
    }

    sharedOperationsRequest = this.fetchRecurringEntries();

    try {
      return await sharedOperationsRequest;
    } finally {
      sharedOperationsRequest = null;
    }
  }

  private async fetchRecurringEntries(): Promise<readonly OperationLogEntry[]> {
    const url = `${this.baseUrl}/agent-x/operations-log?limit=100`;
    const response = await firstValueFrom(this.http.get<OperationsLogResponse>(url));

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load recurring tasks');
    }

    const entries = response.data.filter((entry) => entry.isScheduled === true);
    sharedOperationsCache = {
      entries,
      expiresAt: Date.now() + RECURRING_TASK_CACHE_TTL_MS,
    };
    return entries;
  }

  private isEntryForThread(entry: OperationLogEntry, threadId: string): boolean {
    if (entry.isScheduled !== true) return false;

    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    const recurringTaskKey = metadata['recurringTaskKey'];
    if (typeof recurringTaskKey !== 'string' || recurringTaskKey.trim().length === 0) return false;

    const candidates: unknown[] = [
      entry.threadId,
      metadata['sourceId'],
      metadata['threadId'],
      metadata['sourceThreadId'],
    ];

    return candidates.some(
      (candidate) => typeof candidate === 'string' && candidate.trim() === threadId
    );
  }

  private toDockItem(
    entry: OperationLogEntry
  ): { item: AgentXRecurringTaskDockItem; nextRunAtMs: number | null } | null {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    const recurringTaskKey = metadata['recurringTaskKey'];
    if (typeof recurringTaskKey !== 'string' || recurringTaskKey.trim().length === 0) return null;

    const nextRunIso = metadata['nextRun'];
    const timezone = typeof metadata['timezone'] === 'string' ? metadata['timezone'].trim() : null;
    let nextSendLabel = 'Next send: not scheduled';
    let nextRunAtMs: number | null = null;
    if (typeof nextRunIso === 'string' && nextRunIso.trim().length > 0) {
      const parsed = new Date(nextRunIso);
      if (!Number.isNaN(parsed.getTime())) {
        nextRunAtMs = parsed.getTime();
        nextSendLabel = `Next send: ${formatRecurringNextRun(nextRunIso, timezone)}`;
      }
    } else if (entry.summary?.trim()) {
      nextSendLabel = entry.summary.startsWith('Next run')
        ? entry.summary.replace('Next run', 'Next send')
        : entry.summary;
    }

    return {
      item: {
        taskKey: recurringTaskKey.trim(),
        title: entry.title,
        nextSendLabel,
      },
      nextRunAtMs,
    };
  }
}
