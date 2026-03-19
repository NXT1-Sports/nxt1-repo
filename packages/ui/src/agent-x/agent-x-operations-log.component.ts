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
  output,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  SKELETON: 'operations-log-skeleton',
} as const;

@Component({
  selector: 'nxt1-agent-x-operations-log',
  imports: [NxtIconComponent, NxtSheetHeaderComponent],
  template: `
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

    <!-- ═══ SUMMARY BAR ═══ -->
    <div class="log-summary" [attr.data-testid]="testIds.SUMMARY_BAR">
      <div class="log-summary-stat">
        <span class="log-summary-value">{{ totalCount() }}</span>
        <span class="log-summary-label">Total</span>
      </div>
      <div class="log-summary-divider"></div>
      <div class="log-summary-stat">
        <span class="log-summary-value log-summary-value--success">{{ completedCount() }}</span>
        <span class="log-summary-label">Completed</span>
      </div>
      <div class="log-summary-divider"></div>
      <div class="log-summary-stat">
        <span class="log-summary-value log-summary-value--active">{{ activeCount() }}</span>
        <span class="log-summary-label">Active</span>
      </div>
      <div class="log-summary-divider"></div>
      <div class="log-summary-stat">
        <span class="log-summary-value log-summary-value--error">{{ failedCount() }}</span>
        <span class="log-summary-label">Failed</span>
      </div>
    </div>

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
                (click)="onEntryTap(entry)"
              >
                <!-- Status + Icon -->
                <div
                  class="log-entry-icon"
                  [class.log-entry-icon--complete]="entry.status === 'complete'"
                  [class.log-entry-icon--error]="entry.status === 'error'"
                  [class.log-entry-icon--cancelled]="entry.status === 'cancelled'"
                  [class.log-entry-icon--active]="entry.status === 'in-progress'"
                >
                  <nxt1-icon [name]="entry.icon" [size]="16" />
                </div>

                <!-- Content -->
                <div class="log-entry-content">
                  <div class="log-entry-top">
                    <h4 class="log-entry-title">{{ entry.title }}</h4>
                    <span
                      class="log-entry-status"
                      [class.log-entry-status--complete]="entry.status === 'complete'"
                      [class.log-entry-status--error]="entry.status === 'error'"
                      [class.log-entry-status--cancelled]="entry.status === 'cancelled'"
                      [class.log-entry-status--active]="entry.status === 'in-progress'"
                    >
                      @switch (entry.status) {
                        @case ('complete') {
                          <nxt1-icon name="checkmarkCircle" [size]="12" />
                        }
                        @case ('error') {
                          <nxt1-icon name="alertCircle" [size]="12" />
                        }
                        @case ('cancelled') {
                          <nxt1-icon name="close" [size]="12" />
                        }
                        @case ('in-progress') {
                          <span class="log-entry-spinner">
                            <nxt1-icon name="refresh" [size]="12" />
                          </span>
                        }
                      }
                    </span>
                  </div>
                  <p class="log-entry-summary">{{ entry.summary }}</p>
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
                        <nxt1-icon name="timer" [size]="10" />
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

      /* ── Skeleton shimmer ── */
      @keyframes log-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* ═══ SUMMARY BAR ═══ */
      .log-summary {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        margin: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        background: var(--log-surface);
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        flex-shrink: 0;
      }

      .log-summary-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .log-summary-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--log-text-primary);
        line-height: 1;
      }

      .log-summary-value--success {
        color: var(--log-success);
      }

      .log-summary-value--active {
        color: var(--log-primary);
      }

      .log-summary-value--error {
        color: var(--log-error);
      }

      .log-summary-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--log-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .log-summary-divider {
        width: 1px;
        height: 28px;
        background: var(--log-border);
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
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px);
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

      /* ── Entry Icon ── */
      .log-entry-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
        margin-top: 2px;
        background: var(--log-primary-glow);
        color: var(--log-primary);
      }

      .log-entry-icon--complete {
        background: color-mix(in srgb, var(--log-success) 12%, transparent);
        color: var(--log-success);
      }

      .log-entry-icon--error {
        background: color-mix(in srgb, var(--log-error) 12%, transparent);
        color: var(--log-error);
      }

      .log-entry-icon--cancelled {
        background: color-mix(in srgb, var(--log-warning) 12%, transparent);
        color: var(--log-warning);
      }

      .log-entry-icon--active {
        background: var(--log-primary-glow);
        color: var(--log-primary);
      }

      /* ── Entry Content ── */
      .log-entry-content {
        flex: 1;
        min-width: 0;
      }

      .log-entry-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: 4px;
      }

      .log-entry-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--log-text-primary);
        margin: 0;
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

      .log-entry-spinner {
        display: inline-flex;
        animation: log-spin 1.2s linear infinite;
      }

      .log-entry-summary {
        font-size: 13px;
        line-height: 1.4;
        color: var(--log-text-secondary);
        margin: 0 0 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
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

  /** Optional ModalController — available when hosted inside Ionic bottom sheet, null on web. */
  private readonly modalCtrl = inject(ModalController, { optional: true });

  /** Bottom sheet service for drilling into a specific operation thread. */
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /** Emitted when close button is tapped (for inline/web usage). */
  readonly closePanel = output<void>();

  /** Test IDs for template binding. */
  protected readonly testIds = OPERATIONS_LOG_TEST_IDS;

  // ============================================
  // STATE — Private writable, protected computed
  // ============================================

  private readonly _loading = signal(true);
  private readonly _operations = signal<readonly OperationLogEntry[]>([]);
  private readonly _activeFilter = signal<OperationLogStatus | 'all' | 'scheduled'>('all');

  protected readonly loading = computed(() => this._loading());
  protected readonly operations = computed(() => this._operations());
  protected readonly activeFilter = computed(() => this._activeFilter());
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

  /** Filtered operations based on active filter. */
  protected readonly filteredOperations = computed(() => {
    const filter = this._activeFilter();
    const ops = this._operations();
    if (filter === 'all') return ops;
    if (filter === 'scheduled') return ops.filter((o) => o.isScheduled);
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
  }

  /** Fetch operations from the backend API. */
  private async loadOperations(): Promise<void> {
    this._loading.set(true);
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
        this._operations.set([]);
      }
    } catch (err) {
      this.logger.error('Failed to load operations log', err);
      this._operations.set([]);
    } finally {
      this._loading.set(false);
    }
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
