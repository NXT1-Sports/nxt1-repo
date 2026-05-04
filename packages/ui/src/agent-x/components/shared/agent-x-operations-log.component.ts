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
  ElementRef,
  HostListener,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../../components/bottom-sheet';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { AgentXOperationChatComponent } from '../chat/agent-x-operation-chat.component';
import { AgentXOperationEventService } from '../../services/agent-x-operation-event.service';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { OperationLogEntry, OperationLogStatus, OperationsLogResponse } from '@nxt1/core';
import { NxtToastService } from '../../../services/toast/toast.service';

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

interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

interface MenuAnchor {
  readonly entryId: string;
  readonly top: number;
  readonly left: number;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_FILTERS: readonly StatusFilter[] = [
  { id: 'all', label: 'All' },
  { id: 'complete', label: 'Completed' },
  { id: 'in-progress', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'awaiting_input', label: 'Needs Input' },
  { id: 'awaiting_approval', label: 'Needs Approval' },
  { id: 'error', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'scheduled', label: 'Scheduled' },
] as const;

const MENU_VIEWPORT_MARGIN_PX = 8;
const MENU_VERTICAL_OFFSET_PX = 6;
const MENU_ESTIMATED_WIDTH_PX = 208;
const MENU_ESTIMATED_HEIGHT_PX = 220;
const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

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
  ENTRY_MENU_BUTTON: 'operations-log-entry-menu-button',
  ENTRY_MENU: 'operations-log-entry-menu',
  ENTRY_RENAME_INPUT: 'operations-log-entry-rename-input',
} as const;

@Component({
  selector: 'nxt1-agent-x-operations-log',
  imports: [NxtIconComponent, NxtSheetHeaderComponent],
  template: `
    @if (!embedded() && !hideHeader()) {
      <!-- ═══ HEADER ═══ -->
      <nxt1-sheet-header
        title="Agent Sessions"
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
    <div
      class="log-scroll"
      [attr.data-testid]="testIds.SCROLL_CONTAINER"
      (scroll)="onScrollContainerScroll()"
    >
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
      } @else if (scheduledEntries().length === 0 && filteredGroups().length === 0) {
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
        @if (scheduledEntries().length > 0) {
          <div
            class="log-day-group log-day-group--scheduled"
            [attr.data-testid]="testIds.DAY_GROUP"
          >
            <div class="log-day-label" [class.log-day-label--static]="!stickyDayLabels()">
              Scheduled Tasks
            </div>
            <div class="log-scheduled-row" role="list" aria-label="Scheduled sessions">
              @for (entry of scheduledEntries(); track entry.id) {
                <div
                  class="log-entry log-entry--scheduled-card"
                  role="listitem"
                  [attr.data-testid]="testIds.ENTRY"
                  [class.log-entry--menu-open]="isMenuOpen(entry)"
                  [class.log-entry--unread]="isUnread(entry)"
                  [class.log-entry--error]="entry.status === 'error'"
                  [class.log-entry--cancelled]="entry.status === 'cancelled'"
                  [class.log-entry--active]="entry.status === 'in-progress'"
                  [class.log-entry--awaiting]="
                    entry.status === 'paused' ||
                    entry.status === 'awaiting_input' ||
                    entry.status === 'awaiting_approval'
                  "
                >
                  <button type="button" class="log-entry-main" (click)="onEntryTap(entry)">
                    @if (entry.status !== 'complete') {
                      <span
                        class="log-entry-status"
                        [class.log-entry-status--error]="entry.status === 'error'"
                        [class.log-entry-status--cancelled]="entry.status === 'cancelled'"
                        [class.log-entry-status--active]="entry.status === 'in-progress'"
                        [class.log-entry-status--awaiting]="
                          entry.status === 'paused' ||
                          entry.status === 'awaiting_input' ||
                          entry.status === 'awaiting_approval'
                        "
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
                          @case ('paused') {
                            <nxt1-icon name="time" [size]="14" />
                          }
                          @case ('awaiting_input') {
                            <nxt1-icon name="handLeft" [size]="14" />
                          }
                          @case ('awaiting_approval') {
                            <nxt1-icon name="shieldCheck" [size]="14" />
                          }
                        }
                      </span>
                    }

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
                      </div>
                    </div>
                  </button>

                  <div class="log-entry-actions">
                    <button
                      type="button"
                      class="log-entry-menu-trigger"
                      [attr.data-menu-anchor-id]="entry.id"
                      [attr.data-testid]="testIds.ENTRY_MENU_BUTTON"
                      [attr.aria-expanded]="isMenuOpen(entry)"
                      aria-haspopup="menu"
                      aria-label="Open session actions"
                      [disabled]="isMutationBusy(entry)"
                      (click)="onEntryMenuToggle(entry, $event)"
                    >
                      <nxt1-icon name="moreHorizontal" [size]="18" />
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        @for (group of filteredGroups(); track group.date) {
          <div class="log-day-group" [attr.data-testid]="testIds.DAY_GROUP">
            <div class="log-day-label" [class.log-day-label--static]="!stickyDayLabels()">
              {{ group.label }}
            </div>
            @for (entry of group.entries; track entry.id) {
              <div
                class="log-entry"
                [attr.data-testid]="testIds.ENTRY"
                [class.log-entry--menu-open]="isMenuOpen(entry)"
                [class.log-entry--unread]="isUnread(entry)"
                [class.log-entry--error]="entry.status === 'error'"
                [class.log-entry--cancelled]="entry.status === 'cancelled'"
                [class.log-entry--active]="entry.status === 'in-progress'"
                [class.log-entry--awaiting]="
                  entry.status === 'paused' ||
                  entry.status === 'awaiting_input' ||
                  entry.status === 'awaiting_approval'
                "
              >
                <button type="button" class="log-entry-main" (click)="onEntryTap(entry)">
                  <!-- Status indicator (hidden for completed entries) -->
                  @if (entry.status !== 'complete') {
                    <span
                      class="log-entry-status"
                      [class.log-entry-status--error]="entry.status === 'error'"
                      [class.log-entry-status--cancelled]="entry.status === 'cancelled'"
                      [class.log-entry-status--active]="entry.status === 'in-progress'"
                      [class.log-entry-status--awaiting]="
                        entry.status === 'paused' ||
                        entry.status === 'awaiting_input' ||
                        entry.status === 'awaiting_approval'
                      "
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
                        @case ('paused') {
                          <nxt1-icon name="time" [size]="14" />
                        }
                        @case ('awaiting_input') {
                          <nxt1-icon name="handLeft" [size]="14" />
                        }
                        @case ('awaiting_approval') {
                          <nxt1-icon name="shieldCheck" [size]="14" />
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

                <div class="log-entry-actions">
                  <button
                    type="button"
                    class="log-entry-menu-trigger"
                    [attr.data-menu-anchor-id]="entry.id"
                    [attr.data-testid]="testIds.ENTRY_MENU_BUTTON"
                    [attr.aria-expanded]="isMenuOpen(entry)"
                    aria-haspopup="menu"
                    aria-label="Open session actions"
                    [disabled]="isMutationBusy(entry)"
                    (click)="onEntryMenuToggle(entry, $event)"
                  >
                    <nxt1-icon name="moreHorizontal" [size]="18" />
                  </button>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>

    @if (openMenuEntry(); as menuEntry) {
      <div class="log-entry-menu-backdrop" (click)="onMenuBackdropTap()"></div>
      <div
        class="log-entry-menu log-entry-menu--overlay"
        [attr.data-testid]="testIds.ENTRY_MENU"
        role="menu"
        aria-label="Session actions"
        [style.top.px]="menuPosition().top"
        [style.left.px]="menuPosition().left"
      >
        @if (isRenaming(menuEntry)) {
          <div class="log-entry-menu-rename" (click)="$event.stopPropagation()">
            <label class="log-entry-menu-label" for="rename-{{ menuEntry.id }}">
              Rename session
            </label>
            <input
              id="rename-{{ menuEntry.id }}"
              type="text"
              class="log-entry-menu-input"
              [attr.data-testid]="testIds.ENTRY_RENAME_INPUT"
              [value]="renameDraft()"
              maxlength="200"
              (click)="$event.stopPropagation()"
              (input)="onRenameInput($any($event.target).value)"
              (keydown.enter)="onRenameConfirm(menuEntry, $event)"
              (keydown.escape)="onRenameCancel($event)"
            />
            <div class="log-entry-menu-row">
              <button type="button" class="log-entry-menu-item" (click)="onRenameCancel($event)">
                Cancel
              </button>
              <button
                type="button"
                class="log-entry-menu-item log-entry-menu-item--primary"
                [disabled]="isMutationBusy(menuEntry)"
                (click)="onRenameConfirm(menuEntry, $event)"
              >
                Save
              </button>
            </div>
          </div>
        } @else if (isDeleteConfirming(menuEntry)) {
          <div class="log-entry-menu-confirm" (click)="$event.stopPropagation()">
            <p class="log-entry-menu-confirm-text">Archive this session?</p>
            <div class="log-entry-menu-row">
              <button type="button" class="log-entry-menu-item" (click)="onDeleteCancel($event)">
                Keep
              </button>
              <button
                type="button"
                class="log-entry-menu-item log-entry-menu-item--danger"
                [disabled]="isMutationBusy(menuEntry)"
                (click)="onDeleteConfirm(menuEntry, $event)"
              >
                Archive
              </button>
            </div>
          </div>
        } @else {
          <button
            type="button"
            class="log-entry-menu-item"
            role="menuitem"
            [disabled]="!canManageEntry(menuEntry)"
            (click)="onRenameStart(menuEntry, $event)"
          >
            <nxt1-icon name="pencil" [size]="16" />
            Rename
          </button>
          <button
            type="button"
            class="log-entry-menu-item log-entry-menu-item--danger"
            role="menuitem"
            [disabled]="!canManageEntry(menuEntry)"
            (click)="onDeleteArm(menuEntry, $event)"
          >
            <nxt1-icon name="trash" [size]="16" />
            Archive
          </button>
        }
      </div>
    }
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
        position: relative;
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

      /* ── Active glow pulse for in-progress entries ── */
      @keyframes log-glow-pulse {
        0%,
        100% {
          border-color: color-mix(in srgb, var(--log-primary) 50%, transparent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--log-primary) 15%, transparent);
        }
        50% {
          border-color: var(--log-primary);
          box-shadow: 0 0 12px color-mix(in srgb, var(--log-primary) 30%, transparent);
        }
      }

      /* ── Awaiting glow pulse for yield gate entries ── */
      @keyframes log-glow-awaiting {
        0%,
        100% {
          border-color: color-mix(in srgb, var(--log-warning) 50%, transparent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--log-warning) 15%, transparent);
        }
        50% {
          border-color: var(--log-warning);
          box-shadow: 0 0 12px color-mix(in srgb, var(--log-warning) 30%, transparent);
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
        padding: 0 var(--log-scroll-padding-inline, var(--nxt1-spacing-4, 16px));
        padding-bottom: calc(var(--nxt1-spacing-6, 24px) + env(safe-area-inset-bottom, 0px));
        -webkit-overflow-scrolling: touch;
      }

      /* ═══ DAY GROUP ═══ */
      .log-day-group {
        margin-bottom: var(--nxt1-spacing-5, 20px);
        position: relative;
        z-index: 0;
      }

      .log-day-group--scheduled {
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .log-scheduled-row {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        overflow-y: visible;
        padding: 0 0 var(--nxt1-spacing-2, 8px);
        scroll-snap-type: x proximity;
        -webkit-overflow-scrolling: touch;
      }

      .log-scheduled-row::-webkit-scrollbar {
        display: none;
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

      .log-day-label--static {
        position: static;
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
        position: relative;
        z-index: 1;
        isolation: isolate;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .log-entry--menu-open {
        z-index: 40;
      }

      .log-entry:last-child {
        margin-bottom: 0;
      }

      .log-entry--scheduled-card {
        flex: 0 0 248px;
        margin-bottom: 0;
        border-color: rgba(168, 130, 255, 0.45);
        border-style: dashed;
        scroll-snap-align: start;
      }

      .log-entry--scheduled-card:active {
        border-color: #a882ff;
      }

      .log-entry:active {
        background: var(--log-surface-hover);
        border-color: color-mix(in srgb, var(--log-primary) 30%, var(--log-border));
      }

      .log-entry-main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        flex: 1;
        min-width: 0;
        background: transparent;
        border: 0;
        padding: 0;
        margin: 0;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }

      .log-entry-actions {
        position: relative;
        display: flex;
        align-items: center;
        flex-shrink: 0;
        z-index: 3;
      }

      .log-entry-menu-trigger {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: transparent;
        padding: 0;
        color: var(--log-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        flex-shrink: 0;
      }

      .log-entry-menu-trigger:active {
        background: color-mix(in srgb, var(--log-text-primary) 10%, transparent);
      }

      .log-entry-menu-trigger[aria-expanded='true'] {
        background: color-mix(in srgb, var(--log-text-primary) 8%, transparent);
        color: var(--log-primary);
      }

      .log-entry-menu-trigger:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .log-entry-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 50;
        min-width: var(--nxt1-spacing-52, 13rem);
        padding: var(--nxt1-spacing-1, 4px);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
        overflow: hidden;
      }

      .log-entry-menu--overlay {
        position: absolute;
        top: 0;
        right: auto;
        z-index: 1200;
        max-width: min(20rem, calc(100% - 16px));
        max-height: calc(100% - 16px);
        overflow: auto;
      }

      .log-entry-menu-backdrop {
        position: absolute;
        inset: 0;
        z-index: 1199;
        background: transparent;
      }

      .log-entry-menu-item {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        border: 0;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        background: transparent;
        color: var(--nxt1-nav-text);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.25;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        cursor: pointer;
        text-align: left;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
      }

      .log-entry-menu-item:active {
        background: var(--nxt1-nav-hover-bg);
      }

      .log-entry-menu-item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .log-entry-menu-item--primary {
        color: var(--log-primary);
      }

      .log-entry-menu-item--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }

      .log-entry-menu-rename,
      .log-entry-menu-confirm {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .log-entry-menu-label {
        color: var(--log-text-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 4px 0;
      }

      .log-entry-menu-input {
        width: 100%;
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-md, 10px);
        background: var(--log-surface);
        color: var(--log-text-primary);
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        padding: 8px 10px;
        outline: none;
      }

      .log-entry-menu-input:focus {
        border-color: color-mix(in srgb, var(--log-primary) 65%, var(--log-border));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--log-primary) 15%, transparent);
      }

      .log-entry-menu-confirm-text {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--nxt1-nav-text);
        padding: 2px 4px;
      }

      .log-entry-menu-row {
        display: flex;
        gap: 4px;
      }

      .log-entry-menu-row .log-entry-menu-item {
        justify-content: center;
      }

      /* ── Entry Content ── */
      .log-entry-content {
        flex: 1;
        min-width: 0;
      }

      .log-entry-content--scheduled {
        width: 100%;
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

      .log-entry-title--scheduled {
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 700;
        white-space: normal;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
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

      .log-entry-meta--scheduled {
        flex-wrap: wrap;
        gap: 8px;
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

      .log-entry-scheduled--card {
        color: #d8c5ff;
        background: color-mix(in srgb, #a882ff 18%, transparent);
        border: 1px solid color-mix(in srgb, #a882ff 30%, transparent);
      }

      /* ═══ ENTRY STATUS BORDERS ═══ */

      /* In-progress: Glowing neon-green pulsing border */
      .log-entry--active {
        border-color: color-mix(in srgb, var(--log-primary) 50%, transparent);
        background: color-mix(in srgb, var(--log-primary) 4%, var(--log-surface));
        animation: log-glow-pulse 2s ease-in-out infinite;
      }

      .log-entry--scheduled-card.log-entry--active {
        border-color: color-mix(in srgb, var(--log-primary) 65%, #a882ff 35%);
      }

      /* Error: Solid red border */
      .log-entry--error {
        border-color: color-mix(in srgb, var(--log-error) 50%, transparent);
        background: color-mix(in srgb, var(--log-error) 4%, var(--log-surface));
      }

      /* Unread: Freshly completed, user hasn't reviewed yet — green glow */
      .log-entry--unread {
        border-color: color-mix(in srgb, var(--log-success) 50%, transparent);
        background: color-mix(in srgb, var(--log-success) 4%, var(--log-surface));
      }

      /* Awaiting input / Yield gate: Yellow pulsing border */
      .log-entry--awaiting {
        border-color: color-mix(in srgb, var(--log-warning) 50%, transparent);
        background: color-mix(in srgb, var(--log-warning) 4%, var(--log-surface));
        animation: log-glow-awaiting 2s ease-in-out infinite;
      }

      /* Cancelled: Muted warning border */
      .log-entry--cancelled {
        border-color: color-mix(in srgb, var(--log-warning) 20%, transparent);
        opacity: 0.7;
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

        .log-entry--active,
        .log-entry--awaiting {
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
  private readonly toast = inject(NxtToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** HttpClient for API calls. */
  private readonly http = inject(HttpClient);

  /** Base API URL (provided by app.config.ts per environment). */
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);

  /** Operation event service — used to receive real-time title updates. */
  private readonly operationEventService = inject(AgentXOperationEventService);

  /** Stream registry — used to abort live SSE connections on archive. */
  private readonly streamRegistry = inject(AgentXStreamRegistryService);

  /** DestroyRef for auto-unsubscribing observables. */
  private readonly destroyRef = inject(DestroyRef);

  /** Optional ModalController — available when hosted inside Ionic bottom sheet, null on web. */
  private readonly modalCtrl = inject(ModalController, { optional: true });

  /** Bottom sheet service for drilling into a specific operation thread. */
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /** Emitted when close button is tapped (for inline/web usage). */
  readonly close = output<void>();
  readonly closePanel = output<void>();

  /** Emitted when an entry is tapped in embedded mode (parent handles navigation). */
  readonly entryTap = output<OperationLogEntry>();

  /** When true, hides the sheet header and filters (used when embedded in sidebar). */
  readonly embedded = input(false);

  /** When true, hides the header/filters without delegating tap handling (sidebar use-case). */
  readonly hideHeader = input(false);

  /** When false, day labels scroll away with the list instead of pinning to the top. */
  readonly stickyDayLabels = input(true);

  /** Test IDs for template binding. */
  protected readonly testIds = OPERATIONS_LOG_TEST_IDS;

  // ============================================
  // STATE — Private writable, protected computed
  // ============================================

  private readonly _loading = signal(true);
  private readonly _operations = signal<readonly OperationLogEntry[]>([]);
  private readonly _activeFilter = signal<OperationLogStatus | 'all' | 'scheduled'>('all');
  private readonly _error = signal<string | null>(null);
  private readonly _menuOpenEntryId = signal<string | null>(null);
  private readonly _menuPosition = signal<MenuPosition>({ top: 0, left: 0 });
  private readonly _menuAnchor = signal<MenuAnchor | null>(null);
  private readonly _renamingEntryId = signal<string | null>(null);
  private readonly _deleteConfirmEntryId = signal<string | null>(null);
  private readonly _renameDraft = signal('');
  private readonly _mutationInFlightEntryIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Tracks threadIds that completed during this session via the SSE stream
   * and haven't been opened/reviewed by the user yet.
   * Only these entries get the green "needs review" border.
   */
  private readonly _unreadThreadIds = signal<ReadonlySet<string>>(new Set());

  /**
   * LLM-generated titles received via `title_updated` SSE events, keyed by threadId.
   *
   * These must survive `silentRefresh()` merges because the backend's MongoDB thread
   * title update (`applyGeneratedThreadTitle`) runs AFTER the `done` SSE event is
   * emitted. If `silentRefresh()` fires immediately on `done` (before the DB write
   * completes), the HTTP response still returns the raw intent as the title and would
   * overwrite the SSE-delivered LLM title. Storing them here lets `silentRefresh`
   * re-apply the correct title regardless of HTTP response timing.
   */
  private readonly _sseGeneratedTitles = new Map<string, string>();

  /**
   * Terminal statuses confirmed via the `operationStatusUpdated$` stream
   * during this session, keyed by threadId.
   *
   * Unlike the per-call `liveStatuses` snapshot inside `silentRefresh()`,
   * this map persists for the lifetime of the component. It prevents a
   * stale HTTP response (e.g. still showing `in-progress` for a thread
   * that SSE already marked `complete`) from overwriting a terminal status
   * that was correctly applied earlier in the same session.
   */
  private readonly _confirmedTerminalStatuses = new Map<string, OperationLogStatus>();

  protected readonly loading = computed(() => this._loading());
  protected readonly operations = computed(() => this._operations());
  protected readonly activeFilter = computed(() => this._activeFilter());
  protected readonly error = computed(() => this._error());
  protected readonly renameDraft = computed(() => this._renameDraft());
  protected readonly menuPosition = computed(() => this._menuPosition());
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
    () =>
      this._operations().filter(
        (o) =>
          o.status === 'paused' || o.status === 'awaiting_input' || o.status === 'awaiting_approval'
      ).length
  );

  /** Scheduled tasks pinned above regular session history. */
  protected readonly scheduledEntries = computed(() => {
    const filter = this._activeFilter();
    const ops = this._operations();

    if (filter === 'all' || filter === 'scheduled') {
      return ops.filter((o) => o.isScheduled === true);
    }

    return ops.filter((o) => o.isScheduled === true && o.status === filter);
  });

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
    if (filter === 'all') return ops.filter((o) => o.isScheduled !== true);
    if (filter === 'scheduled') return [];
    return ops.filter((o) => o.isScheduled !== true && o.status === filter);
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

  protected readonly openMenuEntry = computed(() => {
    const openEntryId = this._menuOpenEntryId();
    if (!openEntryId) return null;
    return this._operations().find((entry) => entry.id === openEntryId) ?? null;
  });

  // ============================================
  // METHODS
  // ============================================

  constructor() {
    this.loadOperations();

    // Subscribe to real-time title updates from the Agent X SSE stream.
    // When the backend auto-generates a title for a new thread, update
    // the matching entry in the local list so the sidebar reflects it instantly.
    // Also cache it in _sseGeneratedTitles so silentRefresh() can re-apply it
    // if the HTTP response still returns the stale intent-as-title (race condition
    // between done event and MongoDB applyGeneratedThreadTitle write).
    this.operationEventService.titleUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.logger.debug('Applying title update to operations list', {
          threadId: evt.threadId,
          title: evt.title,
        });
        this.breadcrumb.trackStateChange('operations-log:title-updated', {
          threadId: evt.threadId,
        });
        // Cache so silentRefresh() can win the race against MongoDB persistence
        this._sseGeneratedTitles.set(evt.threadId, evt.title);
        this._operations.update((ops) => {
          const target = ops.find((op) => op.threadId === evt.threadId);
          if (!target || target.title === evt.title) return ops;
          return ops.map((op) => (op.threadId === evt.threadId ? { ...op, title: evt.title } : op));
        });
      });

    // Subscribe to real-time operation status updates from the /chat SSE stream.
    // This is the core real-time mechanism: the backend emits `event: operation`
    // at every lifecycle transition (in-progress → complete/error/awaiting_input)
    // and this handler ensures the operations log reflects the change instantly.
    this.operationEventService.operationStatusUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.logger.info('Real-time operation status update', {
          threadId: evt.threadId,
          status: evt.status,
        });
        this.breadcrumb.trackStateChange('operations-log:status-updated', {
          threadId: evt.threadId,
          status: evt.status,
        });
        this._operations.update((ops) => {
          const idx = ops.findIndex((op) => op.threadId === evt.threadId);
          if (idx >= 0) {
            const prior = ops[idx];
            if (!prior) return ops;

            if (prior.status === evt.status) {
              return ops;
            }
            // Update existing entry's status in place
            return ops.map((op) =>
              op.threadId === evt.threadId
                ? {
                    ...op,
                    status: evt.status,
                  }
                : op
            );
          }
          // New operation — insert at the top of the list
          const newEntry: OperationLogEntry = {
            id: evt.threadId,
            title: 'Processing…',
            summary: '',
            status: evt.status,
            category: 'system',
            timestamp: evt.timestamp,
            threadId: evt.threadId,
            icon: 'sparkles',
          };
          return [newEntry, ...ops];
        });

        // Mark as unread when an operation completes during this session
        // so the green "needs review" border only appears for fresh completions.
        if (evt.status === 'complete') {
          this._unreadThreadIds.update((set) => {
            const next = new Set(set);
            next.add(evt.threadId);
            return next;
          });
        }

        // Cache confirmed terminal statuses so silentRefresh() can re-apply
        // them when a stale HTTP response races with a just-fired `done` event.
        const terminalLogStatuses = new Set<OperationLogStatus>(['complete', 'error', 'cancelled']);
        if (terminalLogStatuses.has(evt.status)) {
          this._confirmedTerminalStatuses.set(evt.threadId, evt.status);
        }
      });
  }

  /** Public refresh — callable from parent via viewChild. */
  async refresh(): Promise<void> {
    await this.silentRefresh();
  }

  /**
   * Silent refresh — re-fetches operations without showing loading skeleton.
   * Called by parent (via viewChild) after a chat response completes.
   *
   * IMPORTANT: This MERGES HTTP data with live SSE state instead of
   * replacing it. Entries that are currently `in-progress` or `awaiting_input`
   * (set by the real-time SSE stream) must survive the refresh because the
   * HTTP API may lag behind the SSE lifecycle events.
   */
  private async silentRefresh(): Promise<void> {
    try {
      // Snapshot live "in-flight" statuses from real-time SSE before the fetch
      const liveStatuses = new Map<string, OperationLogStatus>();
      const liveEntries = new Map<string, OperationLogEntry>();
      for (const op of this._operations()) {
        // Capture ALL live statuses — not just in-progress/awaiting_input.
        // This prevents a stale HTTP response (which may still say "in-progress"
        // while SSE has already set the entry to "complete"/"error") from
        // overwriting the real terminal state and leaving the spinner stuck.
        if (op.threadId) {
          liveStatuses.set(op.threadId, op.status);
          liveEntries.set(op.threadId, op);
        }
      }

      const url = `${this.baseUrl}/agent-x/operations-log?limit=100`;
      const response = await firstValueFrom(this.http.get<OperationsLogResponse>(url));

      if (response.success && response.data) {
        let entries = response.data;

        if (liveStatuses.size > 0 || this._sseGeneratedTitles.size > 0) {
          // Re-apply live SSE statuses that the HTTP response may lag behind on.
          // Rule: prefer in-memory live status ONLY when it represents a more
          // advanced state than HTTP. If HTTP already shows a terminal state
          // (complete / error) but in-memory is still 'in-progress' (because
          // the Firestore listener was interrupted before the done event), the
          // backend is the source of truth — use the HTTP terminal state.
          //
          // Also re-apply SSE-generated titles. The backend worker emits
          // `title_updated` BEFORE `done`, but persists the LLM title to MongoDB
          // AFTER `done`. Because silentRefresh() fires immediately on the `done`
          // event, the HTTP response often still carries the raw intent as the
          // title. The SSE cache wins until MongoDB catches up.
          const terminalStates = new Set<OperationLogStatus>(['complete', 'error', 'cancelled']);
          const httpThreadIds = new Set(entries.filter((e) => e.threadId).map((e) => e.threadId));
          entries = entries.map((entry) => {
            const live = entry.threadId ? liveStatuses.get(entry.threadId) : undefined;
            const sseTitle = entry.threadId
              ? this._sseGeneratedTitles.get(entry.threadId)
              : undefined;

            let merged = entry;

            // Merge live status (prefer more-advanced state)
            if (live) {
              const httpIsTerminal = terminalStates.has(entry.status);
              const liveIsTerminal = terminalStates.has(live);
              if (!httpIsTerminal || liveIsTerminal) {
                merged = { ...merged, status: live };
              }
            }

            // Merge SSE-generated title — beats HTTP when HTTP still shows raw intent
            if (sseTitle && merged.title !== sseTitle) {
              merged = { ...merged, title: sseTitle };
            }

            // Apply confirmed terminal status — prevents a stale HTTP `in-progress`
            // from overwriting a terminal status that SSE already delivered this session.
            const confirmedTerminal = entry.threadId
              ? this._confirmedTerminalStatuses.get(entry.threadId)
              : undefined;
            if (confirmedTerminal && !terminalStates.has(merged.status)) {
              merged = { ...merged, status: confirmedTerminal };
            }

            return merged;
          });

          // Re-insert entries created by SSE that haven't been persisted yet
          // (only for still-active entries — complete/error ones without a DB
          // record are edge-case orphans and don't need to be surfaced)
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

        this._operations.set(entries);
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
      const url = `${this.baseUrl}/agent-x/operations-log?limit=100`;
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
    this.resetMenuState();
    this._activeFilter.set(filter);
    this.logger.info('Filter applied', { filter });
    this.breadcrumb.trackStateChange('operations-log: filter changed', { filter });
  }

  protected canManageEntry(entry: OperationLogEntry): boolean {
    return this.getRecurringTaskKey(entry) !== null || this.getManageableThreadId(entry) !== null;
  }

  protected isMenuOpen(entry: OperationLogEntry): boolean {
    return this._menuOpenEntryId() === entry.id;
  }

  protected isRenaming(entry: OperationLogEntry): boolean {
    return this._renamingEntryId() === entry.id;
  }

  protected isDeleteConfirming(entry: OperationLogEntry): boolean {
    return this._deleteConfirmEntryId() === entry.id;
  }

  protected isMutationBusy(entry: OperationLogEntry): boolean {
    return this._mutationInFlightEntryIds().has(entry.id);
  }

  protected async onEntryMenuToggle(entry: OperationLogEntry, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.haptics.impact('light');

    if (this._menuOpenEntryId() === entry.id) {
      this.resetMenuState();
      return;
    }

    this._menuOpenEntryId.set(entry.id);
    this.updateMenuPosition(entry, event.currentTarget);
    this._renamingEntryId.set(null);
    this._deleteConfirmEntryId.set(null);
    this._renameDraft.set(entry.title ?? '');
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (!this._menuOpenEntryId()) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('.log-entry-actions, .log-entry-menu, .log-entry-menu-backdrop')
    ) {
      return;
    }
    if (!this.elementRef.nativeElement.isConnected) return;
    this.resetMenuState();
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this._menuOpenEntryId()) {
      this.resetMenuState();
    }
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    if (this._menuOpenEntryId()) {
      this.repositionOpenMenu();
    }
  }

  protected onScrollContainerScroll(): void {
    if (this._menuOpenEntryId()) {
      this.repositionOpenMenu();
    }
  }

  protected onMenuBackdropTap(): void {
    this.resetMenuState();
  }

  protected onRenameInput(value: string): void {
    this._renameDraft.set(value);
  }

  protected onRenameStart(entry: OperationLogEntry, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this._renamingEntryId.set(entry.id);
    this._deleteConfirmEntryId.set(null);
    this._renameDraft.set(entry.title ?? '');
  }

  protected onRenameCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this._renamingEntryId.set(null);
  }

  protected async onRenameConfirm(entry: OperationLogEntry, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    const nextTitle = this._renameDraft().trim();
    if (!nextTitle) {
      this.toast.warning('Title cannot be empty');
      return;
    }

    if (nextTitle.length > 200) {
      this.toast.warning('Title must be 200 characters or less');
      return;
    }

    if (nextTitle === entry.title) {
      this._renamingEntryId.set(null);
      return;
    }

    const recurringTaskKey = this.getRecurringTaskKey(entry);
    if (entry.isScheduled === true && recurringTaskKey) {
      const previousTitle = entry.title;
      this.markMutationBusy(entry.id, true);
      this._operations.update((ops) =>
        ops.map((op) =>
          this.isSameRecurringTask(op, recurringTaskKey) ? { ...op, title: nextTitle } : op
        )
      );

      try {
        const url = `${this.baseUrl}/agent-x/operations-log/scheduled/${encodeURIComponent(recurringTaskKey)}`;
        const response = await firstValueFrom(
          this.http.patch<{ success: boolean; error?: string; data?: { key?: string } }>(url, {
            title: nextTitle,
          })
        );

        if (!response.success) {
          throw new Error(response.error ?? 'Failed to rename scheduled task');
        }

        const nextTaskKey = response.data?.key?.trim() || recurringTaskKey;
        this._operations.update((ops) =>
          ops.map((op) => {
            if (!this.isSameRecurringTask(op, recurringTaskKey)) {
              return op;
            }

            const metadata = op.metadata ?? {};
            return {
              ...op,
              title: nextTitle,
              metadata: {
                ...metadata,
                recurringTaskKey: nextTaskKey,
              },
            };
          })
        );

        this.logger.info('Scheduled task renamed from operations log', {
          recurringTaskKey: nextTaskKey,
        });
        this.breadcrumb.trackStateChange('operations-log: recurring task renamed', {
          recurringTaskKey: nextTaskKey,
        });
        this.toast.success('Scheduled task renamed');
        this.resetMenuState();
        return;
      } catch (err) {
        this._operations.update((ops) =>
          ops.map((op) =>
            this.isSameRecurringTask(op, recurringTaskKey) ? { ...op, title: previousTitle } : op
          )
        );
        const message = err instanceof Error ? err.message : 'Failed to rename scheduled task';
        this.logger.error('Failed to rename scheduled task', {
          recurringTaskKey,
          error: message,
        });
        this.toast.error(message);
        return;
      } finally {
        this.markMutationBusy(entry.id, false);
      }
    }

    const threadId = this.getManageableThreadId(entry);
    if (!threadId) {
      this.toast.error('This session cannot be renamed yet');
      return;
    }

    const previousTitle = entry.title;
    this.markMutationBusy(entry.id, true);
    this._operations.update((ops) =>
      ops.map((op) =>
        op.id === entry.id || (op.threadId && op.threadId === threadId)
          ? { ...op, title: nextTitle }
          : op
      )
    );

    try {
      const url = `${this.baseUrl}/agent-x/threads/${encodeURIComponent(threadId)}`;
      const response = await firstValueFrom(
        this.http.patch<{ success: boolean; error?: string }>(url, { title: nextTitle })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to rename session');
      }

      this.logger.info('Session renamed from operations log', { threadId });
      this.breadcrumb.trackStateChange('operations-log: thread renamed', { threadId });
      this.toast.success('Session renamed');
      this._renamingEntryId.set(null);
      this._menuOpenEntryId.set(null);
    } catch (err) {
      this._operations.update((ops) =>
        ops.map((op) =>
          op.id === entry.id || (op.threadId && op.threadId === threadId)
            ? { ...op, title: previousTitle }
            : op
        )
      );
      const message = err instanceof Error ? err.message : 'Failed to rename session';
      this.logger.error('Failed to rename session', { threadId, error: message });
      this.toast.error(message);
    } finally {
      this.markMutationBusy(entry.id, false);
    }
  }

  protected onDeleteArm(entry: OperationLogEntry, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this._deleteConfirmEntryId.set(entry.id);
    this._renamingEntryId.set(null);
  }

  protected onDeleteCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this._deleteConfirmEntryId.set(null);
  }

  protected async onDeleteConfirm(entry: OperationLogEntry, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    const recurringTaskKey = this.getRecurringTaskKey(entry);
    if (entry.isScheduled === true && recurringTaskKey) {
      const previous = this._operations();
      this.markMutationBusy(entry.id, true);
      this._operations.update((ops) =>
        ops.filter((op) => !this.isSameRecurringTask(op, recurringTaskKey))
      );

      try {
        const url = `${this.baseUrl}/agent-x/operations-log/scheduled/${encodeURIComponent(recurringTaskKey)}/archive`;
        const response = await firstValueFrom(
          this.http.post<{ success: boolean; error?: string }>(url, {})
        );

        if (!response.success) {
          throw new Error(response.error ?? 'Failed to archive scheduled task');
        }

        this.logger.info('Scheduled task archived from operations log', { recurringTaskKey });
        this.breadcrumb.trackStateChange('operations-log: recurring task archived', {
          recurringTaskKey,
        });
        this.toast.success('Scheduled task archived');
        this.resetMenuState();
        return;
      } catch (err) {
        this._operations.set(previous);
        const message = err instanceof Error ? err.message : 'Failed to archive scheduled task';
        this.logger.error('Failed to archive scheduled task', {
          recurringTaskKey,
          error: message,
        });
        this.toast.error(message);
        return;
      } finally {
        this.markMutationBusy(entry.id, false);
      }
    }

    const threadId = this.getManageableThreadId(entry);
    if (!threadId) {
      this.toast.error('This session cannot be archived yet');
      return;
    }

    const previous = this._operations();
    this.markMutationBusy(entry.id, true);
    this._operations.update((ops) =>
      ops.filter((op) => !(op.id === entry.id || (op.threadId && op.threadId === threadId)))
    );

    try {
      const url = `${this.baseUrl}/agent-x/threads/${encodeURIComponent(threadId)}/archive`;
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>(url, {})
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to archive session');
      }

      // Abort any live SSE stream for this thread so it releases its slot
      // in the backend's per-user concurrent stream limit (MAX 5).
      this.streamRegistry.abort(threadId);
      this.logger.info('Session archived from operations log', { threadId });
      this.breadcrumb.trackStateChange('operations-log: thread archived', { threadId });
      this.toast.success('Session archived');
      this.resetMenuState();
    } catch (err) {
      this._operations.set(previous);
      const message = err instanceof Error ? err.message : 'Failed to archive session';
      this.logger.error('Failed to archive session', { threadId, error: message });
      this.toast.error(message);
    } finally {
      this.markMutationBusy(entry.id, false);
    }
  }

  private markMutationBusy(entryId: string, busy: boolean): void {
    this._mutationInFlightEntryIds.update((set) => {
      const next = new Set(set);
      if (busy) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return next;
    });
  }

  private resetMenuState(): void {
    this._menuOpenEntryId.set(null);
    this._menuPosition.set({ top: 0, left: 0 });
    this._menuAnchor.set(null);
    this._renamingEntryId.set(null);
    this._deleteConfirmEntryId.set(null);
    this._renameDraft.set('');
  }

  private repositionOpenMenu(): void {
    const anchor = this._menuAnchor();
    if (!anchor) {
      return;
    }

    const hostElement = this.elementRef.nativeElement as HTMLElement;
    const target = hostElement.querySelector(
      `[data-menu-anchor-id="${this.escapeAttributeValue(anchor.entryId)}"]`
    ) as HTMLElement | null;
    if (!target) {
      this.resetMenuState();
      return;
    }

    this.updateMenuPosition({ id: anchor.entryId } as OperationLogEntry, target);
  }

  private updateMenuPosition(entry: OperationLogEntry, target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const hostRect = this.elementRef.nativeElement.getBoundingClientRect();
    const hostWidth = hostRect.width;
    const hostHeight = hostRect.height;
    const maxLeft = Math.max(
      MENU_VIEWPORT_MARGIN_PX,
      hostWidth - MENU_ESTIMATED_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX
    );
    const left = Math.min(
      Math.max(rect.right - hostRect.left - MENU_ESTIMATED_WIDTH_PX, MENU_VIEWPORT_MARGIN_PX),
      maxLeft
    );
    const maxTop = Math.max(
      MENU_VIEWPORT_MARGIN_PX,
      hostHeight - MENU_ESTIMATED_HEIGHT_PX - MENU_VIEWPORT_MARGIN_PX
    );
    const top = Math.min(
      Math.max(rect.bottom - hostRect.top + MENU_VERTICAL_OFFSET_PX, MENU_VIEWPORT_MARGIN_PX),
      maxTop
    );

    this._menuPosition.set({ top, left });
    this._menuAnchor.set({ entryId: entry.id, top, left });
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
      if (MONGO_OBJECT_ID_RE.test(trimmed)) {
        return trimmed;
      }
    }

    return null;
  }

  private getRecurringTaskKey(entry: OperationLogEntry): string | null {
    const metadata = entry.metadata as Record<string, unknown> | undefined;
    const recurringTaskKey = metadata?.['recurringTaskKey'];
    return typeof recurringTaskKey === 'string' && recurringTaskKey.trim().length > 0
      ? recurringTaskKey.trim()
      : null;
  }

  private isSameRecurringTask(entry: OperationLogEntry, recurringTaskKey: string): boolean {
    return (
      entry.id === `schedule:${recurringTaskKey}` ||
      this.getRecurringTaskKey(entry) === recurringTaskKey
    );
  }

  private escapeAttributeValue(value: string): string {
    return value.replace(/(["\\])/g, '\\$1');
  }

  /** Get count for a specific filter. */
  protected getFilterCount(status: OperationLogStatus | 'all' | 'scheduled'): number {
    if (status === 'all') return this.totalCount();
    if (status === 'scheduled') return this._operations().filter((o) => o.isScheduled).length;
    return this._operations().filter((o) => o.status === status).length;
  }

  /**
   * Check if an entry is "unread" — completed during this session via the
   * SSE stream and not yet opened/reviewed by the user.
   * Only these entries get the green border treatment.
   */
  protected isUnread(entry: OperationLogEntry): boolean {
    return (
      entry.status === 'complete' && !!entry.threadId && this._unreadThreadIds().has(entry.threadId)
    );
  }

  /** Handle entry tap with haptic feedback. */
  protected async onEntryTap(entry: OperationLogEntry): Promise<void> {
    await this.haptics.impact('light');
    this.resetMenuState();
    this.logger.info('Entry tapped', { entryId: entry.id, status: entry.status });

    // Clear unread state when user opens the entry
    if (entry.threadId && this._unreadThreadIds().has(entry.threadId)) {
      this._unreadThreadIds.update((set) => {
        const next = new Set(set);
        next.delete(entry.threadId!);
        return next;
      });
    }

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

    // Map OperationLogStatus → chat component's operationStatus input.
    // OperationLogEntry uses 'in-progress'; the chat component uses 'processing'.
    const chatStatus =
      entry.status === 'in-progress'
        ? 'processing'
        : entry.status === 'complete'
          ? 'complete'
          : entry.status === 'error'
            ? 'error'
            : entry.status === 'paused'
              ? 'paused'
              : entry.status === 'awaiting_input'
                ? 'awaiting_input'
                : entry.status === 'awaiting_approval'
                  ? 'awaiting_approval'
                  : null;

    // Validate that the operationId is a real Firestore AgentJobs UUID (chat-{uuid}
    // or a bare UUID). MongoDB ObjectIds are 24 hex chars and must never be
    // used as Firestore document paths — they will always produce permission-denied.
    const isFirestoreOperationId = (id: string | undefined): boolean => {
      if (!id) return false;
      const bare = id.startsWith('chat-') ? id.slice(5) : id;
      // UUID v4 pattern
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare);
    };
    const resolvedOperationId = isFirestoreOperationId(entry.operationId)
      ? entry.operationId
      : undefined;

    // If the operation is linked to a persisted thread, open that exact conversation.
    if (entry.threadId) {
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: resolvedOperationId ?? entry.threadId,
          contextTitle: entry.title,
          contextIcon: entry.icon,
          contextType: 'operation',
          // Only pass operationStatus='processing' when there is a real Firestore
          // operationId to subscribe to. MongoDB-thread-only entries have no
          // AgentJobs document and must not trigger a Firestore subscription.
          operationStatus: resolvedOperationId
            ? chatStatus
            : chatStatus === 'processing'
              ? null
              : chatStatus,
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

    // Fall back to an isolated operation chat (no thread yet).
    // Only attach Firestore listener when there is a real operationId (UUID).
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: resolvedOperationId ?? entry.id,
        contextTitle: entry.title,
        contextIcon: entry.icon,
        contextType: 'operation',
        operationStatus: resolvedOperationId
          ? chatStatus
          : chatStatus === 'processing'
            ? null
            : chatStatus,
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
      this.close.emit();
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
