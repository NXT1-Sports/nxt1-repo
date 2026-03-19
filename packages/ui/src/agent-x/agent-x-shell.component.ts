/**
 * @fileoverview Agent X Shell Component - AI Command Center
 * @module @nxt1/ui/agent-x
 * @version 2.0.0
 *
 * Redesigned AI-first command center with proactive Daily Briefing,
 * Active Operations queue, and contextual Action Chips.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Layout (top → bottom):
 * 1. Page Header — Agent X logo centered (no text title)
 * 2. Daily Briefing — Proactive AI insights card
 * 3. Coordinators — 2×2 grid of virtual staff cards (Recruiting, Media, Scout, Academics)
 * 4. Weekly Playbook — Always visible (with "Need a Game Plan" state if no goals)
 * 5. Daily Operations — Active background task cards (conditional)
 * 6. Input Bar — Fixed above footer (already exists)
 *
 * @example
 * ```html
 * <nxt1-agent-x-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  afterNextRender,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtIconComponent } from '../components/icon';
import { AgentXService } from './agent-x.service';

import { AgentXInputComponent } from './agent-x-input.component';
import {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from './agent-x-operation-chat.component';
import { AgentXDashboardSkeletonComponent } from './agent-x-dashboard-skeleton.component';
import { AgentXOperationsLogComponent } from './agent-x-operations-log.component';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { type ShellActiveOperation } from '@nxt1/core/ai';

// ============================================
// INTERFACES
// ============================================

/** User info for header display. */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
}

/** An active background operation Agent X is processing. */
export interface ActiveOperation {
  readonly id: string;
  readonly label: string;
  readonly progress: number; // 0–100
  readonly icon: string;
  readonly status: 'processing' | 'complete' | 'error';
  /** MongoDB thread ID — when set, opening this card loads the persisted worker conversation. */
  readonly threadId?: string;
}

/** A contextual action chip for quick workflows. */
export interface ActionChip {
  readonly id: string;
  readonly label: string;
  readonly subLabel?: string;
  readonly icon: string;
}

/** A group of related quick commands under a category. */
export interface CommandCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly commands: readonly ActionChip[];
}

/** Daily briefing insight from Agent X. Kept as shared contract for consumers. */
export interface BriefingInsight {
  readonly id: string;
  readonly text: string;
  readonly icon: string;
  readonly type: 'info' | 'warning' | 'success';
}

/** A goal tag linking a playbook task to a user objective. */
export interface GoalTag {
  readonly id: string;
  readonly label: string;
}

/** Legacy weekly timeline item contract used by shared consumers. */
export interface WeeklyPlaybookItem {
  readonly id: string;
  readonly weekLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly details: string;
  readonly actionLabel: string;
  readonly status: 'pending' | 'in-progress' | 'complete' | 'problem';
  readonly goal?: GoalTag;
}

@Component({
  selector: 'nxt1-agent-x-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtIconComponent,
    AgentXDashboardSkeletonComponent,
    AgentXInputComponent,
  ],
  template: `
    <!-- ═══ PAGE HEADER — Agent X Logo Centered ═══ -->
    @if (!hideHeader()) {
      <nxt1-page-header (menuClick)="avatarClick.emit()">
        <!-- Agent X Title in center title slot -->
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Agent</span>
          <svg
            class="header-agent-logo"
            viewBox="0 0 612 792"
            width="40"
            height="40"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
            />
            <polygon
              points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
            />
          </svg>
        </div>

        <button
          pageHeaderSlot="end"
          type="button"
          class="agent-history-action"
          aria-label="Agent Logs"
          (click)="onActivityLogClick()"
        >
          <nxt1-icon name="time" [size]="22" className="agent-history-icon" />
        </button>
      </nxt1-page-header>
    }

    <!-- ═══ SCROLLABLE CONTENT ═══ -->
    <ion-content [fullscreen]="true" class="agent-x-content">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="agent-x-container">
        @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
          <nxt1-agent-x-dashboard-skeleton />
        }

        <!-- ═══ 1. DAILY BRIEFING ═══ -->
        @if (!agentX.dashboardLoading()) {
          <section class="briefing-section" aria-label="Daily briefing">
            <!-- Greeting -->
            <h2 class="briefing-greeting">{{ greeting() }}</h2>

            <!-- AI Pulse Indicator & Badges -->
            <div class="briefing-top-badges">
              <div class="header-badge status-badge">
                <div class="pulse-dot"></div>
                <span>Active</span>
              </div>
              <div class="header-badge budget-badge">
                <nxt1-icon name="wallet" [size]="14"></nxt1-icon>
                <span>$150 Budget</span>
              </div>
              <button type="button" class="header-badge goals-badge" (click)="onSetupGoals()">
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
              </button>
            </div>

            <!-- Briefing Summary (Compact) -->
            <p class="briefing-summary">{{ briefingPreview() }}</p>

            <!-- ═══ 2. DAILY OPERATIONS (Conditional) ═══ -->
            @if (activeOperations().length > 0) {
              <section class="operations-section" aria-label="Daily operations">
                <h3 class="section-title">Daily Operations</h3>
                <div class="operations-scroll">
                  @for (op of activeOperations(); track op.id) {
                    <button
                      type="button"
                      class="operation-card"
                      [class.operation-card--processing]="op.status === 'processing'"
                      [class.operation-card--complete]="op.status === 'complete'"
                      [class.operation-card--error]="op.status === 'error'"
                      (click)="onOperationTap(op)"
                    >
                      <!-- Top row: task icon + label -->
                      <div class="operation-top">
                        <div class="operation-icon">
                          <nxt1-icon [name]="op.icon" [size]="14" />
                        </div>
                        <span class="operation-label">{{ op.label }}</span>
                      </div>

                      <!-- Progress bar -->
                      <div
                        class="operation-progress"
                        [class.operation-progress--complete]="op.status === 'complete'"
                        [class.operation-progress--error]="op.status === 'error'"
                      >
                        <div
                          class="operation-progress-bar"
                          [class.operation-progress-bar--processing]="op.status === 'processing'"
                          [class.operation-progress-bar--complete]="op.status === 'complete'"
                          [class.operation-progress-bar--error]="op.status === 'error'"
                          [style.width.%]="op.status === 'complete' ? 100 : op.progress"
                        ></div>
                      </div>

                      <!-- Bottom row: status badge + spinner/icon -->
                      <div class="operation-status-row">
                        @switch (op.status) {
                          @case ('processing') {
                            <span class="operation-status-badge operation-status-badge--processing">
                              In progress
                            </span>
                            <span class="operation-spinner">
                              <nxt1-icon name="refresh" [size]="12" />
                            </span>
                          }
                          @case ('complete') {
                            <span class="operation-status-badge operation-status-badge--complete">
                              Complete
                            </span>
                            <span class="operation-status-icon operation-status-icon--complete">
                              <nxt1-icon name="checkmarkCircle" [size]="12" />
                            </span>
                          }
                          @case ('error') {
                            <span class="operation-status-badge operation-status-badge--error">
                              Failed
                            </span>
                            <span class="operation-status-icon operation-status-icon--error">
                              <nxt1-icon name="alertCircle" [size]="12" />
                            </span>
                          }
                        }
                      </div>
                    </button>
                  }
                </div>
              </section>
            }

            <!-- ═══ 3. ACTION CARDS ═══ -->
            <section class="action-cards-section" aria-label="Action Cards">
              <h3 class="section-title action-plan-title">Today's Action Plan</h3>

              <div class="action-card">
                <div class="card-icon-wrapper action">
                  <nxt1-icon name="flash" [size]="20"></nxt1-icon>
                </div>
                <div class="card-content">
                  <div class="card-title">You scored 22 points last night</div>
                </div>
                <button type="button" class="action-btn secondary-btn">Run action</button>
              </div>

              <div class="action-card insight">
                <div class="card-icon-wrapper insight">
                  <nxt1-icon name="eye" [size]="20"></nxt1-icon>
                </div>
                <div class="card-content">
                  <div class="card-title">3 coaches viewed your profile this week</div>
                </div>
              </div>

              <div class="action-card bundle">
                <div class="card-icon-wrapper bundle">
                  <nxt1-icon name="cube" [size]="20"></nxt1-icon>
                </div>
                <div class="card-content">
                  <div class="card-title">Big game detected — want me to handle everything?</div>
                  <button
                    type="button"
                    class="action-btn primary-btn"
                    (click)="onBundleCardAction()"
                  >
                    Execute Game Plan
                  </button>
                </div>
              </div>

              <div class="action-card">
                <div class="card-icon-wrapper progress">
                  <nxt1-icon name="trendingUp" [size]="20"></nxt1-icon>
                </div>
                <div class="card-content">
                  <div class="card-title">Your exposure is up 32% this week</div>
                </div>
                <button type="button" class="action-btn secondary-btn">Keep momentum going</button>
              </div>

              <div class="action-card system">
                <div class="card-icon-wrapper system">
                  <nxt1-icon name="search" [size]="20"></nxt1-icon>
                </div>
                <div class="card-content">
                  <div class="card-title">I found 18 matching coaches</div>
                </div>
              </div>
            </section>
          </section>
        }
      </div>
    </ion-content>

    <!-- ═══ FLOATING COORDINATOR CHIPS — Fixed above input ═══ -->
    <section class="floating-coordinators" aria-label="Coordinators">
      <div class="floating-coordinators-scroll" role="list">
        @for (cat of commandCategories(); track cat.id) {
          <button
            type="button"
            role="listitem"
            class="floating-coordinator-pill"
            (click)="onCategoryTap(cat)"
          >
            {{ cat.label }}
          </button>
        }
      </div>
    </section>

    <!-- ═══ INPUT BAR — Fixed above footer ═══ -->
    <nxt1-agent-x-input
      [hasMessages]="false"
      [selectedTask]="agentX.selectedTask()"
      [isLoading]="agentX.isLoading()"
      [canSend]="agentX.canSend()"
      [userMessage]="agentX.getUserMessage()"
      [placeholder]="'Message A Coordinator'"
      (messageChange)="agentX.setUserMessage($event)"
      (send)="onSendMessage()"
      (removeTask)="agentX.clearTask()"
      (toggleTasks)="onToggleTasks()"
    />
  `,
  styles: [
    `
      /* ============================================
         AGENT X COMMAND CENTER — 2026 AI-FIRST
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        --agent-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --agent-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --agent-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --agent-primary: var(--nxt1-color-primary, #ccff00);
        --agent-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-glass-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.1));
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --agent-bg: var(--nxt1-color-bg-primary, #ffffff);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
      }

      /* ── Header Logo ── */
      .header-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        margin-top: -8px;
        margin-left: -18px;
      }

      .header-title-text {
        display: inline-flex;
        align-items: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        color: var(--agent-text-primary);
        line-height: 1;
        transform: translateY(1px);
      }

      .header-agent-logo {
        display: block;
        flex-shrink: 0;
        color: var(--agent-text-primary);
        transform: translateY(1px);
      }

      .agent-history-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 9999px;
        padding: 0;
        background: transparent;
        color: var(--agent-text-primary);
      }

      .agent-history-icon {
        display: block;
      }

      /* ── Content Area ── */
      .agent-x-content {
        --background: var(--agent-bg);
      }

      .agent-x-container {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(280px + env(safe-area-inset-bottom, 0px));
      }

      @media (max-width: 767px) {
        .agent-x-container {
          padding-bottom: calc(330px + env(safe-area-inset-bottom, 0px));
        }
      }

      /* ──────────────────────────────────
         1. DAILY OPERATIONS
         ────────────────────────────────── */

      /* Spin animation for processing spinner */
      @keyframes op-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      /* Subtle border glow for active processing cards */
      @keyframes op-pulse-border {
        0%,
        100% {
          border-color: var(--agent-primary-glow);
        }
        50% {
          border-color: var(--agent-primary);
        }
      }

      /* Glow on the progress bar fill */
      @keyframes op-bar-glow {
        0%,
        100% {
          box-shadow: 0 0 4px transparent;
        }
        50% {
          box-shadow: 0 0 6px var(--agent-primary);
        }
      }

      .operations-section {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .operations-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
      }

      .operations-scroll::-webkit-scrollbar {
        display: none;
      }

      /* ── Card ── */
      .operation-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        flex-shrink: 0;
        width: 200px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.2s ease,
          border-color 0.3s ease,
          box-shadow 0.3s ease;
      }

      .operation-card:active {
        background: var(--agent-surface-hover);
      }

      /* Processing — breathing border glow */
      .operation-card--processing {
        border-color: var(--agent-primary-glow);
        animation: op-pulse-border 2.4s ease-in-out infinite;
      }

      /* Complete — subtle green tint */
      .operation-card--complete {
        border-color: var(--nxt1-color-success-border, rgba(76, 175, 80, 0.25));
        background: var(--nxt1-color-success-surface, rgba(76, 175, 80, 0.05));
      }

      /* Error — subtle red tint */
      .operation-card--error {
        border-color: var(--nxt1-color-error-border, rgba(244, 67, 54, 0.25));
        background: var(--nxt1-color-error-surface, rgba(244, 67, 54, 0.05));
      }

      /* ── Top row (icon + label) ── */
      .operation-top {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .operation-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .operation-card--complete .operation-icon {
        background: var(--nxt1-color-success-surface, rgba(76, 175, 80, 0.1));
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-card--error .operation-icon {
        background: var(--nxt1-color-error-surface, rgba(244, 67, 54, 0.1));
        color: var(--nxt1-color-error, #f44336);
      }

      .operation-label {
        font-size: var(--nxt1-font-size-sm, 13px);
        font-weight: var(--nxt1-font-weight-medium, 500);
        color: var(--agent-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      /* ── Progress bar ── */
      .operation-progress {
        width: 100%;
        height: 3px;
        background: var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        overflow: hidden;
      }

      .operation-progress-bar {
        height: 100%;
        background: var(--agent-primary);
        border-radius: var(--nxt1-radius-full, 9999px);
        transition: width 0.4s ease;
      }

      .operation-progress-bar--processing {
        animation: op-bar-glow 2s ease-in-out infinite;
      }

      .operation-progress-bar--complete {
        background: var(--nxt1-color-success, #4caf50);
      }

      .operation-progress-bar--error {
        background: var(--nxt1-color-error, #f44336);
      }

      /* ── Status row (badge + icon/spinner) ── */
      .operation-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .operation-status-badge {
        font-size: 10px;
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        line-height: 1;
      }

      .operation-status-badge--processing {
        color: var(--agent-primary);
      }

      .operation-status-badge--complete {
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-status-badge--error {
        color: var(--nxt1-color-error, #f44336);
      }

      /* Spinning refresh icon */
      .operation-spinner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--agent-primary);
        animation: op-spin 1.2s linear infinite;
      }

      /* Static status icons */
      .operation-status-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .operation-status-icon--complete {
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-status-icon--error {
        color: var(--nxt1-color-error, #f44336);
      }

      /* ──────────────────────────────────
         2. DAILY BRIEFING
         ────────────────────────────────── */
      .briefing-section {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        padding: var(--nxt1-spacing-6, 24px) 0 var(--nxt1-spacing-4, 16px);
      }

      /* AI Active Pulse */
      .briefing-top-badges {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
        flex-wrap: wrap;
      }

      .header-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        line-height: 1;
        white-space: nowrap;
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
      }

      .header-badge.status-badge {
        color: var(--agent-primary);
        border-color: var(--agent-primary-glow);
        background: var(--agent-primary-glow);
      }

      .header-badge.budget-badge {
        color: var(--agent-text-primary);
      }

      .header-badge.goals-badge {
        appearance: none;
        -webkit-appearance: none;
        color: var(--agent-text-secondary);
        cursor: pointer;
        transition:
          color 0.15s ease,
          background 0.15s ease;
      }

      .header-badge.goals-badge:active {
        color: var(--agent-text-primary);
        background: var(--agent-surface-hover);
      }

      .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
        position: relative;
        flex-shrink: 0;
      }

      /* Greeting */
      .briefing-greeting {
        font-size: 22px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        line-height: 1.3;
      }

      .briefing-summary {
        width: 100%;
        font-size: 14px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6, 24px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* ──────────────────────────────────
         SHARED SECTION TITLE
         ────────────────────────────────── */
      .section-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--agent-text-muted);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
      }

      .action-plan-title {
        text-transform: none;
      }

      /* ──────────────────────────────────
         3. ACTION CARDS
         ────────────────────────────────── */
      .action-cards-section {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .action-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
        transition:
          background 0.2s ease,
          border-color 0.2s ease;
      }

      .action-card:active {
        background: var(--agent-surface-hover);
      }

      /* Core Icon Wrappers */
      .card-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Action variants */
      .card-icon-wrapper.action {
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
      }

      /* Insight variants */
      .card-icon-wrapper.insight {
        background: rgba(33, 150, 243, 0.1);
        color: #2196f3;
      }
      .action-card.insight .card-icon-wrapper {
        background: rgba(33, 150, 243, 0.15);
      }

      /* Bundle variants */
      .card-icon-wrapper.bundle {
        background: rgba(156, 39, 176, 0.1);
        color: #9c27b0;
      }
      .action-card.bundle {
        background: linear-gradient(145deg, var(--agent-surface), rgba(156, 39, 176, 0.05));
        border-color: rgba(156, 39, 176, 0.2);
      }

      /* Progress variants */
      .card-icon-wrapper.progress {
        background: rgba(76, 175, 80, 0.1);
        color: #4caf50;
      }

      /* System variants */
      .card-icon-wrapper.system {
        background: var(--agent-surface-hover);
        color: var(--agent-text-secondary);
      }

      /* Layout */
      .card-content {
        flex: 1;
        min-width: 0;
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--agent-text-primary);
        line-height: 1.4;
      }

      /* Buttons */
      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s ease;
        border: none;
        margin-top: var(--nxt1-spacing-3, 12px);
        align-self: flex-start;
      }
      .action-btn:active {
        opacity: 0.9;
      }
      .action-btn.primary-btn {
        background: var(--agent-primary);
        color: #000;
      }
      .action-btn.secondary-btn {
        background: var(--agent-surface-hover);
        border: 1px solid var(--agent-border);
        color: var(--agent-text-primary);
      }

      /* ──────────────────────────────────
         2. FLOATING COORDINATOR PILLS
         ────────────────────────────────── */
      .floating-coordinators {
        position: fixed;
        left: var(--agent-input-left, 0);
        right: var(--agent-input-right, 0);
        bottom: calc(84px + var(--keyboard-offset, 0px));
        z-index: calc(var(--nxt1-z-index-fixed, 999) - 1);
        pointer-events: none;
      }

      @media (min-width: 768px) {
        .floating-coordinators {
          left: var(--agent-input-desktop-left, var(--nxt1-sidebar-width, 280px));
          right: var(--agent-input-desktop-right, 0);
        }
      }

      @media (max-width: 767px) {
        .floating-coordinators {
          left: var(--nxt1-footer-left, 16px);
          right: var(--nxt1-footer-right, 16px);
          bottom: calc(
            var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px + 60px +
              var(--keyboard-offset, 0px)
          );
        }
      }

      .floating-coordinators-scroll {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding: 0 0;
      }

      .floating-coordinators-scroll::-webkit-scrollbar {
        display: none;
      }

      .floating-coordinator-pill {
        flex-shrink: 0;
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 12px 16px;
        background: var(--agent-glass-bg);
        color: var(--agent-text-primary);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        box-shadow: var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.15s ease;
      }

      .floating-coordinator-pill:active {
        border-color: var(--agent-primary);
        background: var(--agent-primary-glow);
        transform: scale(0.98);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellComponent {
  protected readonly agentX = inject(AgentXService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info. */
  readonly user = input<AgentXUser | null>(null);

  /** Hide page header (desktop sidebar provides navigation). */
  readonly hideHeader = input(false);

  // ============================================
  // LOCAL STATE
  // ============================================

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar/hamburger is clicked (open sidenav). */
  readonly avatarClick = output<void>();

  /** Emitted when an action chip is tapped. */
  readonly chipTap = output<ActionChip>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Display name for header avatar fallback. */
  protected displayName(): string {
    return this.user()?.displayName ?? 'User';
  }

  /** Time-aware greeting for the Daily Briefing. */
  protected readonly greeting = computed(() => {
    const name = this.user()?.displayName?.split(' ')[0] ?? '';
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${timeGreeting}, ${name}.` : `${timeGreeting}.`;
  });

  // ============================================
  // ROLE-AWARE SHELL CONTENT
  // Uses live dashboard data from AgentXService only.
  // Static fallback content is intentionally disabled to avoid mock-data flashes.
  // ============================================

  /** Active background operations — live from service only. */
  protected readonly activeOperations = computed<ShellActiveOperation[]>(() =>
    this.agentX.activeOperations()
  );

  /** Briefing preview text — live from service only. */
  protected readonly briefingPreview = computed(() => this.agentX.briefingPreviewText());

  // ============================================
  // COORDINATORS — Role-Aware Virtual Staff
  // ============================================

  /** Coordinator cards — live from service only. */
  protected readonly commandCategories = computed(() => this.agentX.coordinators());

  // ============================================
  // HEADER CONFIG
  // ============================================

  constructor() {
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
      this.agentX.loadDashboard();
    });

    effect(() => {
      const pending = this.agentX.pendingThread();
      if (!pending) return;

      // Consume the request immediately to prevent duplicate sheet opens
      // if dashboard signals or route rendering re-run the effect.
      this.agentX.clearPendingThread();

      void this.openOperationChat(
        pending.operationId ?? pending.threadId,
        pending.title,
        pending.icon ?? 'sparkles',
        'operation',
        [],
        '',
        pending.threadId
      );
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onActivityLogClick(): Promise<void> {
    await this.haptics.impact('light');
    await this.bottomSheet.openSheet({
      component: AgentXOperationsLogComponent,
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operations-log-sheet',
    });
  }

  /**
   * Handle "Set Your Goals" button from the empty playbook state.
   * Opens Agent X goal setup conversation.
   */
  protected async onSetupGoals(): Promise<void> {
    await this.haptics.impact('medium');
    await this.openOperationChat('goal-setup', 'Set Your Goals', 'flag', 'command');
  }

  /**
   * Handle bundle card CTA by opening one focused execution sheet
   * with the 3 high-value options.
   */
  protected async onBundleCardAction(): Promise<void> {
    await this.haptics.impact('medium');
    const quickActions: OperationQuickAction[] = [
      { id: 'bundle-post-highlight', label: 'Post highlight', icon: 'playCircle' },
      { id: 'bundle-send-emails', label: 'Send emails', icon: 'mail' },
      { id: 'bundle-update-profile', label: 'Update profile', icon: 'person' },
    ];

    await this.openOperationChat(
      'bundle-big-game-plan',
      'Big Game Plan',
      'cube',
      'command',
      quickActions,
      'Choose what Agent X should execute for this big-game moment.'
    );
  }

  /**
   * Handle category pill tap — opens bottom sheet with sub-commands as suggestion chips.
   */
  protected async onCategoryTap(cat: CommandCategory): Promise<void> {
    await this.haptics.impact('light');
    const quickActions: OperationQuickAction[] = cat.commands.map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
    }));
    await this.openOperationChat(
      cat.id,
      cat.label,
      cat.icon,
      'command',
      quickActions,
      cat.description
    );
  }

  /**
   * Handle action chip tap — opens dedicated bottom sheet chat.
   */
  protected async onChipTap(chip: ActionChip): Promise<void> {
    await this.haptics.impact('light');
    this.chipTap.emit(chip);
    await this.openOperationChat(chip.id, chip.label, chip.icon, 'command');
  }

  /**
   * Handle active operation card tap — opens dedicated bottom sheet chat.
   */
  protected async onOperationTap(op: ActiveOperation): Promise<void> {
    await this.haptics.impact('light');
    // Pass the persisted thread ID so the sheet loads the worker's actual output logs
    // rather than opening a blank new chat session.
    await this.openOperationChat(op.id, op.label, op.icon, 'operation', [], '', op.threadId ?? '');
  }

  /**
   * Open the dedicated bottom sheet chat for an operation or command.
   */
  private async openOperationChat(
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    contextType: 'operation' | 'command',
    quickActions: OperationQuickAction[] = [],
    contextDescription = '',
    threadId = ''
  ): Promise<void> {
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId,
        contextTitle,
        contextIcon,
        contextType,
        quickActions,
        contextDescription,
        threadId,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle send message — opens the Agent X bottom sheet chat
   * with the user's message instead of displaying inline.
   */
  protected async onSendMessage(): Promise<void> {
    const message = this.agentX.getUserMessage().trim();
    if (!message) return;

    // Clear the shell input immediately
    this.agentX.setUserMessage('');
    this.agentX.clearTask();
    await this.haptics.impact('light');

    // Open the operation chat bottom sheet with the message
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'agent-x-chat',
        contextTitle: 'Agent X',
        contextIcon: 'bolt',
        contextType: 'command',
        initialMessage: message,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle toggle tasks panel.
   */
  protected async onToggleTasks(): Promise<void> {
    await this.haptics.impact('light');
    this.toast.info('Task panel coming soon');
  }

  /**
   * Handle pull-to-refresh — reloads dashboard data.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    await this.agentX.loadDashboard();
    event.complete();
  }

  /**
   * Handle refresh timeout.
   */
  protected async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh timed out');
  }
}
