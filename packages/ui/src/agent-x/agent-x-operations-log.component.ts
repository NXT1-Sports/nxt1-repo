/**
 * @fileoverview Agent X Operations Log — Bottom Sheet History Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Displays the last 30 days of Agent X operations in a scrollable,
 * day-grouped list. Opens inside NxtBottomSheetService.openSheet().
 *
 * Features:
 * - Day-grouped timeline with relative dates ("Today", "Yesterday", "Mar 1")
 * - Status-aware color coding (complete, error, cancelled, in-progress)
 * - Category icons per operation type
 * - Tap-to-view operation detail via callback
 * - Skeleton loading state
 * - Empty state with call-to-action
 * - Filter chips to narrow by status
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * await this.bottomSheet.openSheet({
 *   component: AgentXOperationsLogComponent,
 *   ...SHEET_PRESETS.FULL,
 *   showHandle: true,
 *   backdropDismiss: true,
 *   cssClass: 'agent-x-operations-log-sheet',
 * });
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AgentXOperationChatComponent } from './agent-x-operation-chat.component';
import { AgentXOperationEventService } from './agent-x-operation-event.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { OperationLogEntry, OperationLogStatus, OperationsLogResponse } from '@nxt1/core';

// ============================================
// INTERFACES (local, non-exported)
// ============================================

/** A group of operations by day. */
interface OperationDayGroup {
  readonly label: string;
  readonly date: string;
  readonly entries: readonly OperationLogEntry[];
}

/** Filter chip definition. */
interface StatusFilter {
  readonly id: OperationLogStatus | 'all' | 'scheduled';
  readonly label: string;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_FILTERS: readonly StatusFilter[] = [
  { id: 'all', label: 'All' },
  { id: 'complete', label: 'Completed' },
  { id: 'in-progress', label: 'Active' },
  { id: 'awaiting_input', label: 'Needs Input' },
  { id: 'error', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'scheduled', label: 'Scheduled' },
] as const;

// ============================================
// COMPONENT
// ============================================

/** Test IDs for Operations Log (used by E2E Page Objects). */
export const OPERATIONS_LOG_TEST_IDS = {
  HEADER: 'operations-log-header',
  CLOSE_BUTTON: 'operations-log-close',
  SUMMARY_BAR: 'operations-log-summary',
  FILTER_CHIP: 'operations-log-filter',
  SCROLL_CONTAINER: 'operations-log-scroll',
  DAY_GROUP: 'operations-log-day-group',
  ENTRY: 'operations-log-entry',
  EMPTY_STATE: 'operations-log-empty',
  ERROR_STATE: 'operations-log-error',
  SKELETON: 'operations-log-skeleton',
} as const;

@Component({
  selector: 'nxt1-agent-x-operations-log',
  imports: [NxtIconComponent, NxtSheetHeaderComponent],
  template: `
    @if (!embedded()) {
      <!-- ═══ HEADER ═══ -->
      <nxt1-sheet-header
        title="Agent Logs"
        subtitle="Operations"
        icon="time"
        iconShape="circle"
        closePosition="right"
        [showBorder]="false"
        [testId]="testIds.HEADER"
        [closeTestId]="testIds.CLOSE_BUTTON"
        (closeSheet)="dismiss()"
      />

      <!-- ═══ FILTER CHIPS ═══ -->
      <div class="log-filters">
        @for (filter of statusFilters; track filter.id) {
          <button
            type="button"
            class="log-filter-chip"
            [attr.data-testid]="testIds.FILTER_CHIP"
            [class.log-filter-chip--active]="activeFilter() === filter.id"
            (click)="onFilterTap(filter.id)"
          >
            {{ filter.label }}
            @if (filter.id !== 'all') {
              <span class="log-filter-count">{{ getFilterCount(filter.id) }}</span>
            }
          </button>
        }
      </div>
    }

    <!-- ═══ OPERATIONS LIST ═══ -->
    <div class="log-scroll" [attr.data-testid]="testIds.SCROLL_CONTAINER">
      @if (loading()) {
        <!-- Skeleton Loading -->
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="log-skeleton" [attr.data-testid]="testIds.SKELETON" aria-hidden="true">
            <div class="log-skeleton__icon"></div>
            <div class="log-skeleton__content">
              <div class="log-skeleton__title"></div>
              <div class="log-skeleton__summary"></div>
            </div>
            <div class="log-skeleton__time"></div>
          </div>
        }
      } @else if (error()) {
        <!-- Error State -->
        <div class="log-empty" [attr.data-testid]="testIds.ERROR_STATE">
          <div class="log-empty-icon log-empty-icon--error">
            <nxt1-icon name="alertCircle" [size]="32" />
          </div>
          <h3 class="log-empty-title">Couldn't load operations</h3>
          <p class="log-empty-message">{{ error() }}</p>
          <button type="button" class="log-retry-button" (click)="loadOperations()">
            <nxt1-icon name="refresh" [size]="14" />
            Retry
          </button>
        </div>
      } @else if (filteredGroups().length === 0) {
        <!-- Empty State -->
        <div class="log-empty" [attr.data-testid]="testIds.EMPTY_STATE">
          <div class="log-empty-icon">
            <nxt1-icon name="time" [size]="32" />
          </div>
          <h3 class="log-empty-title">No operations yet</h3>
          <p class="log-empty-message">When Agent X runs tasks for you, they'll appear here.</p>
        </div>
      } @else {
        <!-- Grouped Timeline -->
        @for (group of filteredGroups(); track group.date) {
          <div class="log-day-group" [attr.data-testid]="testIds.DAY_GROUP">
            <div class="log-day-label">{{ group.label }}</div>
            @for (entry of group.entries; track entry.id) {
              <button
                type="button"
                class="log-entry"
                [attr.data-testid]="testIds.ENTRY"
                [class.log-entry--complete]="entry.status === 'complete'"
                [class.log-entry--error]="entry.status === 'error'"
                [class.log-entry--cancelled]="entry.status === 'cancelled'"
                [class.log-entry--active]="entry.status === 'in-progress'"
                [class.log-entry--awaiting]="entry.status === 'awaiting_input'"
                (click)="onEntryTap(entry)"
              >
                <!-- Status indicator (hidden for completed entries) -->
                @if (entry.status !== 'complete') {
                  <span
                    class="log-entry-status"
                    [class.log-entry-status--error]="entry.status === 'error'"
                    [class.log-entry-status--cancelled]="entry.status === 'cancelled'"
                    [class.log-entry-status--active]="entry.status === 'in-progress'"
                    [class.log-entry-status--awaiting]="entry.status === 'awaiting_input'"
                  >
                    @switch (entry.status) {
                      @case ('error') {
                        <nxt1-icon name="alertCircle" [size]="14" />
                      }
                      @case ('cancelled') {
                        <nxt1-icon name="close" [size]="14" />
                      }
                      @case ('in-progress') {
                        <span class="log-entry-spinner">
                          <nxt1-icon name="refresh" [size]="14" />
                        </span>
                      }
                      @case ('awaiting_input') {
                        <nxt1-icon name="hand-left" [size]="14" />
                      }
                    }
                  </span>
                }

                <!-- Content -->
                <div class="log-entry-content">
                  <h4 class="log-entry-title">{{ entry.title }}</h4>
                  <div class="log-entry-meta">
                    <span class="log-entry-time">{{ formatTime(entry.timestamp) }}</span>
                    @if (entry.duration) {
                      <span class="log-entry-duration">
                        <nxt1-icon name="time" [size]="10" />
                        {{ entry.duration }}
                      </span>
                    }
                    @if (entry.isScheduled) {
                      <span class="log-entry-scheduled">
                        <nxt1-icon name="calendar" [size]="10" />
                        Scheduled
                      </span>
                    }
                  </div>
                </div>
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         OPERATIONS LOG — Bottom Sheet
         Matches Agent X design tokens & patterns
         ============================================ */

      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        font-family: var(--nxt1-font-family, var(--ion-font-family, system-ui));

        --log-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --log-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --log-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --log-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --log-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --log-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --log-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --log-primary: var(--nxt1-color-primary, #ccff00);
        --log-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --log-success: var(--nxt1-color-success, #4caf50);
        --log-error: var(--nxt1-color-error, #f44336);
        --log-warning: var(--nxt1-color-warning, #ffb020);
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --log-bg: var(--nxt1-color-bg-primary, #ffffff);
        --log-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --log-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --log-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --log-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --log-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --log-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
      }

      /* ── Spin animation for active spinner ── */
      @keyframes log-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      /* ── Awaiting input pulse ── */
      @keyframes log-pulse-awaiting {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      /* ── Skeleton shimmer ── */
      @keyframes log-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* ═══ FILTER CHIPS ═══ */
      .log-filters {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        flex-shrink: 0;
      }

      .log-filters::-webkit-scrollbar {
        display: none;
      }

      .log-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--log-text-secondary);
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        white-space: nowrap;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .log-filter-chip:active {
        background: var(--log-surface-hover);
      }

      .log-filter-chip--active {
        background: var(--log-primary-glow);
        border-color: var(--log-primary);
        color: var(--log-primary);
      }

      .log-filter-count {
        font-size: 11px;
        font-weight: 700;
        opacity: 0.7;
      }

      /* ═══ SCROLLABLE LIST ═══ */
      .log-scroll {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0 var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(var(--nxt1-spacing-6, 24px) + env(safe-area-inset-bottom, 0px));
        -webkit-overflow-scrolling: touch;
      }

      /* ═══ DAY GROUP ═══ */
      .log-day-group {
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .log-day-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--log-text-muted);
        padding: var(--nxt1-spacing-2, 8px) 0;
        position: sticky;
        top: 0;
        background: var(--log-bg);
        z-index: 1;
      }

      /* ═══ LOG ENTRY ═══ */
      .log-entry {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        background: var(--log-surface);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .log-entry:last-child {
        margin-bottom: 0;
      }

      .log-entry:active {
        background: var(--log-surface-hover);
        border-color: color-mix(in srgb, var(--log-primary) 30%, var(--log-border));
      }

      /* ── Entry Content ── */
      .log-entry-content {
        flex: 1;
        min-width: 0;
      }

      .log-entry-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--log-text-primary);
        margin: 0 0 2px;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .log-entry-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .log-entry-status--complete {
        color: var(--log-success);
      }

      .log-entry-status--error {
        color: var(--log-error);
      }

      .log-entry-status--cancelled {
        color: var(--log-warning);
      }

      .log-entry-status--active {
        color: var(--log-primary);
      }

      .log-entry-status--awaiting {
        color: var(--log-warning);
      }

      .log-entry-spinner {
        display: inline-flex;
        animation: log-spin 1.2s linear infinite;
      }

      .log-entry-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .log-entry-time {
        font-size: 11px;
        font-weight: 500;
        color: var(--log-text-muted);
      }

      .log-entry-duration {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        font-weight: 500;
        color: var(--log-text-muted);
      }

      .log-entry-scheduled {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        font-weight: 600;
        color: var(--log-primary);
        background: var(--log-primary-glow);
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-full, 9999px);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      /* ═══ SKELETON ═══ */
      .log-skeleton {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        background: var(--log-surface);
      }

      .log-skeleton__icon,
      .log-skeleton__title,
      .log-skeleton__summary,
      .log-skeleton__time {
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
        background-image: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
          var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
          var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
        );
        background-size: 200% 100%;
        animation: log-shimmer 1.5s infinite ease-in-out;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .log-skeleton__icon {
        width: 34px;
        height: 34px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      .log-skeleton__content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .log-skeleton__title {
        width: 65%;
        height: 14px;
      }

      .log-skeleton__summary {
        width: 90%;
        height: 12px;
      }

      .log-skeleton__time {
        width: 40px;
        height: 10px;
        margin-top: 4px;
        flex-shrink: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .log-skeleton__icon,
        .log-skeleton__title,
        .log-skeleton__summary,
        .log-skeleton__time {
          animation: none;
          opacity: 0.6;
        }

        .log-entry-spinner {
          animation: none;
        }
      }

      /* ═══ EMPTY STATE ═══ */
      .log-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-6, 24px) 0;
        min-height: 200px;
      }

      .log-empty-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--log-surface);
        color: var(--log-text-muted);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .log-empty-icon--error {
        background: color-mix(in srgb, var(--log-error) 12%, transparent);
        color: var(--log-error);
      }

      .log-empty-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--log-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px);
      }

      .log-empty-message {
        font-size: 13px;
        line-height: 1.5;
        color: var(--log-text-secondary);
        margin: 0;
        max-width: 240px;
      }

      .log-retry-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: var(--nxt1-spacing-4, 16px);
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        color: var(--log-primary);
        background: var(--log-primary-glow);
        border: 1px solid color-mix(in srgb, var(--log-primary) 20%, transparent);
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .log-retry-button:hover {
        background: color-mix(in srgb, var(--log-primary) 16%, transparent);
        border-color: color-mix(in srgb, var(--log-primary) 30%, transparent);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationsLogComponent {
  // ============================================
  // OBSERVABILITY (4 pillars — mandatory)
  // ============================================
  private readonly logger = inject(NxtLoggingService).child('OperationsLog');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  /** HttpClient for API calls. */
  private readonly http = inject(HttpClient);

  /** Base API URL (provided by app.config.ts per environment). */
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);

  /** Operation event service — used to receive real-time title updates. */
  private readonly operationEventService = inject(AgentXOperationEventService);

  /** DestroyRef for auto-unsubscribing observables. */
  private readonly destroyRef = inject(DestroyRef);

  /** Optional ModalController — available when hosted inside Ionic bottom sheet, null on web. */
  private readonly modalCtrl = inject(ModalController, { optional: true });

  /** Bottom sheet service for drilling into a specific operation thread. */
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /** Emitted when close button is tapped (for inline/web usage). */
  readonly closePanel = output<void>();

  /** Emitted when an entry is tapped in embedded mode (parent handles navigation). */
  readonly entryTap = output<OperationLogEntry>();

  /** When true, hides the sheet header and filters (used when embedded in sidebar). */
  readonly embedded = input(false);

  /** Test IDs for template binding. */
  protected readonly testIds = OPERATIONS_LOG_TEST_IDS;

  // ============================================
  // STATE — Private writable, protected computed
  // ============================================

  private readonly _loading = signal(true);
  private readonly _operations = signal<readonly OperationLogEntry[]>([]);
  private readonly _activeFilter = signal<OperationLogStatus | 'all' | 'scheduled'>('all');
  private readonly _error = signal<string | null>(null);

  protected readonly loading = computed(() => this._loading());
  protected readonly operations = computed(() => this._operations());
  protected readonly activeFilter = computed(() => this._activeFilter());
  protected readonly error = computed(() => this._error());
  protected readonly statusFilters = STATUS_FILTERS;

  // ============================================
  // COMPUTED
  // ============================================

  /** Total number of operations. */
  protected readonly totalCount = computed(() => this._operations().length);

  /** Count of completed operations. */
  protected readonly completedCount = computed(
    () => this._operations().filter((o) => o.status === 'complete').length
  );

  /** Count of active/in-progress operations. */
  protected readonly activeCount = computed(
    () => this._operations().filter((o) => o.status === 'in-progress').length
  );

  /** Count of failed operations. */
  protected readonly failedCount = computed(
    () => this._operations().filter((o) => o.status === 'error').length
  );

  /** Count of awaiting-input operations. */
  protected readonly awaitingCount = computed(
    () => this._operations().filter((o) => o.status === 'awaiting_input').length
  );

  /**
   * Filtered operations based on the active filter chip.
   *
   * Filter semantics:
   * - `'all'`         → all entries, no filtering
   * - `'scheduled'`   → entries where `isScheduled === true` (autonomous/cron-triggered)
   * - status filters  → entries matching the exact `status` field
   */
  protected readonly filteredOperations = computed(() => {
    const filter = this._activeFilter();
    const ops = this._operations();
    if (filter === 'all') return ops;
    if (filter === 'scheduled') return ops.filter((o) => o.isScheduled === true);
    return ops.filter((o) => o.status === filter);
  });

  /** Grouped operations by day. */
  protected readonly filteredGroups = computed((): OperationDayGroup[] => {
    const ops = this.filteredOperations();
    const groups = new Map<string, OperationLogEntry[]>();

    for (const op of ops) {
      const dateKey = this.getDateKey(op.timestamp);
      const existing = groups.get(dateKey);
      if (existing) {
        existing.push(op);
      } else {
        groups.set(dateKey, [op]);
      }
    }

    return Array.from(groups.entries()).map(([dateKey, entries]) => ({
      label: this.formatDateLabel(dateKey),
      date: dateKey,
      entries,
    }));
  });

  // ============================================
  // METHODS
  // ============================================

  constructor() {
    this.loadOperations();

    // Subscribe to real-time title updates from the Agent X SSE stream.
    // When the backend auto-generates a title for a new thread, update
    // the matching entry in the local list so the sidebar reflects it instantly.
    this.operationEventService.titleUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this._operations.update((ops) =>
          ops.map((op) => (op.threadId === evt.threadId ? { ...op, title: evt.title } : op))
        );
      });
  }

  /** Public refresh — callable from parent via viewChild. */
  async refresh(): Promise<void> {
    await this.silentRefresh();
  }

  /**
   * Silent refresh — re-fetches operations without showing loading skeleton.
   * Called by parent (via viewChild) after a chat response completes.
   */
  private async silentRefresh(): Promise<void> {
    try {
      const url = `${this.baseUrl}/agent-x/operations-log?limit=50`;
      const response = await firstValueFrom(this.http.get<OperationsLogResponse>(url));

      if (response.success && response.data) {
        this._operations.set(response.data);
      }
    } catch {
      // Silent refresh failures are non-critical
    }
  }

  /** Fetch operations from the backend API. */
  protected async loadOperations(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Loading operations log');
    this.breadcrumb.trackStateChange('operations-log: loading');
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_VIEWED);

    try {
      const url = `${this.baseUrl}/agent-x/operations-log?limit=50`;
      const response = await firstValueFrom(this.http.get<OperationsLogResponse>(url));

      if (response.success && response.data) {
        this._operations.set(response.data);
        this.logger.info('Operations log loaded', { count: response.data.length });
        this.breadcrumb.trackStateChange('operations-log: loaded', { count: response.data.length });
      } else {
        this.logger.warn('Operations log returned empty', { error: response.error });
        this._error.set(response.error ?? 'No data returned');
        this._operations.set([]);
      }
    } catch (err) {
      const msg = this.classifyError(err);
      this.logger.error('Failed to load operations log', { error: msg });
      this._error.set(msg);
      this._operations.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Classifies an error into a user-friendly message based on its type.
   * Handles network failures, auth errors, and generic API errors distinctly.
   */
  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Network error — check your connection';
      if (err.status === 401 || err.status === 403) return 'Session expired — please sign in again';
      if (err.status >= 500) return 'Server error — try again in a moment';
      return err.error?.error ?? `Request failed (${err.status})`;
    }
    return err instanceof Error ? err.message : 'Failed to load operations';
  }

  /** Set active filter with haptic and tracking. */
  protected async onFilterTap(filter: OperationLogStatus | 'all' | 'scheduled'): Promise<void> {
    await this.haptics.impact('light');
    this._activeFilter.set(filter);
    this.logger.info('Filter applied', { filter });
    this.breadcrumb.trackStateChange('operations-log: filter changed', { filter });
  }

  /** Get count for a specific filter. */
  protected getFilterCount(status: OperationLogStatus | 'all' | 'scheduled'): number {
    if (status === 'all') return this.totalCount();
    if (status === 'scheduled') return this._operations().filter((o) => o.isScheduled).length;
    return this._operations().filter((o) => o.status === status).length;
  }

  /** Handle entry tap with haptic feedback. */
  protected async onEntryTap(entry: OperationLogEntry): Promise<void> {
    await this.haptics.impact('light');
    this.logger.info('Entry tapped', { entryId: entry.id, status: entry.status });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_ENTRY_TAPPED, {
      entry_id: entry.id,
      status: entry.status,
      item_category: entry.category,
    });

    // In embedded mode (desktop rail), delegate to parent via output
    if (this.embedded()) {
      this.entryTap.emit(entry);
      return;
    }

    // If the operation is linked to a persisted thread, open that exact conversation.
    if (entry.threadId) {
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: entry.id,
          contextTitle: entry.title,
          contextIcon: entry.icon,
          contextType: 'operation',
          threadId: entry.threadId,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      return;
    }

    // Fall back to an isolated operation chat when historical thread data is unavailable.
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: entry.id,
        contextTitle: entry.title,
        contextIcon: entry.icon,
        contextType: 'operation',
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /** Close the panel with haptic feedback. */
  protected async dismiss(): Promise<void> {
    await this.haptics.impact('light');
    this.logger.info('Operations log dismissed');
    this.breadcrumb.trackStateChange('operations-log: closed');

    if (this.modalCtrl) {
      await this.modalCtrl.dismiss(null, 'cancel');
    } else {
      this.closePanel.emit();
    }
  }

  /** Format timestamp to relative time string. */
  protected formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;

    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /** Get a date key string (YYYY-MM-DD) from an ISO timestamp. */
  private getDateKey(timestamp: string): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Format a date key into a human-readable label. */
  private formatDateLabel(dateKey: string): string {
    const date = new Date(dateKey + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const todayKey = this.getDateKey(today.toISOString());
    const yesterdayKey = this.getDateKey(yesterday.toISOString());

    if (dateKey === todayKey) return 'Today';
    if (dateKey === yesterdayKey) return 'Yesterday';

    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}
