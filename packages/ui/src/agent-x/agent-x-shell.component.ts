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
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtIconComponent } from '../components/icon';
import { AgentXService } from './agent-x.service';
import { AgentXControlPanelComponent } from './agent-x-control-panel.component';
import {
  AGENT_X_GOAL_OPTIONS,
  AgentXControlPanelStateService,
  type AgentXControlPanelKind,
} from './agent-x-control-panel-state.service';

import { AgentXPromptInputComponent } from './agent-x-prompt-input.component';
import {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from './agent-x-operation-chat.component';
import { AgentXDashboardSkeletonComponent } from './agent-x-dashboard-skeleton.component';
import { AgentXOperationsLogComponent } from './agent-x-operations-log.component';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import {
  type ShellWeeklyPlaybookItem,
  type AgentDashboardGoal,
  type AgentYieldState,
} from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from './fab/agent-x-logo.constants';
import { NxtStateViewComponent } from '../components/state-view';

// ============================================
// INTERFACES
// ============================================

/** User info for header display. */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
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
    NxtStateViewComponent,
    AgentXDashboardSkeletonComponent,
    AgentXPromptInputComponent,
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
        } @else if (agentX.dashboardError() && !agentX.dashboardLoaded()) {
          <div class="agent-error-container">
            <nxt1-state-view
              variant="error"
              title="Something went wrong"
              [message]="agentX.dashboardError()"
              actionLabel="Try Again"
              actionIcon="refresh"
              (action)="onRetryDashboard()"
            />
          </div>
        }

        <!-- ═══ 1. DAILY BRIEFING ═══ -->
        @if (agentX.dashboardLoaded()) {
          <section class="briefing-section" aria-label="Daily briefing">
            <!-- Greeting -->
            <h2 class="briefing-greeting">{{ greeting() }}</h2>

            <!-- Briefing Summary (Compact) -->
            <p class="briefing-summary">{{ briefingPreview() }}</p>

            <!-- AI Pulse Indicator & Badges -->
            <div class="briefing-top-badges">
              <button
                type="button"
                class="header-badge status-badge"
                [class.status-badge--degraded]="agentStatusTone() === 'warning'"
                [class.status-badge--down]="agentStatusTone() === 'critical'"
                (click)="openControlPanel('status')"
              >
                <div
                  class="pulse-dot"
                  [class.pulse-dot--degraded]="agentStatusTone() === 'warning'"
                  [class.pulse-dot--down]="agentStatusTone() === 'critical'"
                ></div>
                <span>{{ agentStatusLabel() }}</span>
              </button>
              <button
                type="button"
                class="header-badge budget-badge"
                (click)="openControlPanel('budget')"
              >
                <nxt1-icon name="wallet" [size]="14"></nxt1-icon>
                <span>{{ agentBudgetBadgeLabel() }}</span>
              </button>
              <button type="button" class="header-badge goals-badge" (click)="onSetupGoals()">
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
              </button>
            </div>

            <!-- ═══ 2. TODAY'S ACTION PLAN (AI-Generated Playbook) ═══ -->
            <section class="action-cards-section" aria-label="Today's Action Plan">
              <div class="action-plan-header">
                <h3 class="section-title action-plan-title">Today's Action Plan</h3>
                @if (playbookTotalCount() > 0) {
                  <div class="action-plan-status">
                    <span class="action-plan-percent">{{ actionPlanProgressPercent() }}%</span>
                    <div
                      class="action-plan-progress"
                      aria-label="Action plan progress"
                      [attr.aria-valuenow]="actionPlanProgressPercent()"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      role="progressbar"
                    >
                      <div
                        class="action-plan-progress-bar"
                        [style.width.%]="actionPlanProgressPercent()"
                      ></div>
                    </div>
                    <p class="action-plan-meta">{{ actionPlanCompletionLabel() }}</p>
                  </div>
                }
              </div>

              @if (agentX.playbookGenerating()) {
                <div class="action-plan-generating" aria-label="Loading action plan" role="status">
                  <div class="generating-hero">
                    <div class="generating-logo-ring">
                      <svg viewBox="0 0 612 792" class="generating-x-mark" aria-hidden="true">
                        <path
                          d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                        />
                      </svg>
                    </div>
                    <p class="generating-status">
                      Agent X is building your playbook<span class="typing-dots"
                        ><span>.</span><span>.</span><span>.</span></span
                      >
                    </p>
                    <p class="generating-sub">
                      Reading your profile, reviewing activity, and generating tasks
                    </p>
                  </div>
                  <div class="generating-steps">
                    @for (step of generatingSteps; track step.label; let i = $index) {
                      <div class="generating-step" [style.animation-delay]="i * 600 + 'ms'">
                        <div class="step-indicator">
                          <div class="step-dot"></div>
                        </div>
                        <span class="step-label">{{ step.label }}</span>
                      </div>
                    }
                  </div>
                </div>
              } @else if (weeklyPlaybook().length > 0 && !allTasksComplete()) {
                @if (showCategoryPills()) {
                  <div class="category-pills" role="tablist" aria-label="Filter action plan">
                    @for (pill of categoryPills(); track pill.id) {
                      <button
                        type="button"
                        role="tab"
                        class="category-pill"
                        [class.category-pill--active]="activeCategoryId() === pill.id"
                        [attr.aria-selected]="activeCategoryId() === pill.id"
                        (click)="selectCategory(pill.id)"
                      >
                        {{ pill.label }}
                      </button>
                    }
                  </div>
                }
                @for (task of filteredPlaybookItems(); track task.id; let i = $index) {
                  <div
                    class="action-card action-card--enter"
                    [style.animation-delay]="i * 80 + 'ms'"
                  >
                    <div class="card-coordinator">
                      <div class="coordinator-avatar" aria-hidden="true">
                        <svg viewBox="0 0 612 792" class="coordinator-mark">
                          <path
                            d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                          />
                        </svg>
                      </div>
                      <div class="coordinator-copy">
                        <span class="coordinator-brand">Agent X</span>
                        @if (task.coordinator) {
                          <span class="coordinator-role">{{ task.coordinator.label }}</span>
                        }
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">{{ task.title }}</div>
                      <p class="card-description">{{ task.summary }}</p>
                      @if (task.why) {
                        <p class="card-why">
                          <svg
                            class="agent-x-mark"
                            width="16"
                            height="16"
                            viewBox="0 0 612 792"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path [attr.d]="agentXLogoPath" />
                            <polygon [attr.points]="agentXLogoPolygon" />
                          </svg>
                          {{ task.why }}
                        </p>
                      }
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn primary-btn"
                        (click)="onPlaybookAction(task)"
                      >
                        {{ task.actionLabel }}
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeTask(task)"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }
              } @else if (allTasksComplete()) {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <nxt1-icon name="checkmarkCircle" [size]="30"></nxt1-icon>
                  </div>
                  <h4 class="action-empty-title">Today's Action Plan Complete</h4>
                  <p class="action-empty-copy">
                    You crushed it. Agent X is still monitoring for new opportunities.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onRegeneratePlaybook()">
                    Give Me More
                  </button>
                </div>
              } @else {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">No Actions Yet</h4>
                  <p class="action-empty-copy">
                    Agent X will generate your personalized action plan based on your goals and
                    profile data.
                  </p>
                </div>
              }
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
    <nxt1-agent-x-prompt-input
      [hasMessages]="false"
      [selectedTask]="agentX.selectedTask()"
      [isLoading]="agentX.isLoading()"
      [canSend]="agentX.canSend()"
      [userMessage]="agentX.getUserMessage()"
      [placeholder]="'Message A Coordinator'"
      [pendingFiles]="agentX.pendingFiles()"
      [uploading]="agentX.uploading()"
      (messageChange)="agentX.setUserMessage($event)"
      (send)="onSendMessage()"
      (stop)="agentX.cancelStream()"
      (removeTask)="agentX.clearTask()"
      (toggleTasks)="onToggleTasks()"
      (filesAdded)="agentX.addFiles($event)"
      (fileRemoved)="agentX.removeFile($event)"
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

      .agent-error-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 320px;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
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

      /* Awaiting Input — orange pulse */
      .operation-card--awaiting-input {
        border-color: var(--nxt1-color-warning-border, rgba(255, 152, 0, 0.35));
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.06));
        animation: op-pulse-awaiting 2s ease-in-out infinite;
      }

      .operation-card--awaiting-input .operation-icon {
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.15));
        color: var(--nxt1-color-warning, #ff9800);
      }

      @keyframes op-pulse-awaiting {
        0%,
        100% {
          border-color: var(--nxt1-color-warning-border, rgba(255, 152, 0, 0.35));
        }
        50% {
          border-color: var(--nxt1-color-warning, rgba(255, 152, 0, 0.6));
        }
      }

      /* ════ ACTION REQUIRED BANNER ════ */
      .action-required-banner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.08));
        border: 1px solid var(--nxt1-color-warning-border, rgba(255, 152, 0, 0.25));
        border-radius: var(--nxt1-radius-lg, 14px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        animation: banner-entrance 0.4s ease-out;
      }

      .action-required-banner:active {
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.14));
      }

      .action-required-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.15));
        color: var(--nxt1-color-warning, #ff9800);
        flex-shrink: 0;
        animation: banner-icon-pulse 2s ease-in-out infinite;
      }

      .action-required-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .action-required-title {
        font-size: var(--nxt1-font-size-sm, 13px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--nxt1-color-warning, #ff9800);
        line-height: 1.2;
      }

      .action-required-subtitle {
        font-size: 12px;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.55));
        line-height: 1.3;
      }

      .action-required-chevron {
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.35));
        flex-shrink: 0;
      }

      @keyframes banner-entrance {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes banner-icon-pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.08);
        }
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

      .operation-status-badge--awaiting {
        color: var(--nxt1-color-warning, #ff9800);
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

      .operation-status-icon--awaiting {
        color: var(--nxt1-color-warning, #ff9800);
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
        margin-bottom: var(--nxt1-spacing-6, 24px);
        flex-wrap: wrap;
      }

      .header-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        appearance: none;
        -webkit-appearance: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        line-height: 1;
        white-space: nowrap;
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        color: var(--agent-text-primary);
        cursor: pointer;
        font-family: inherit;
        transition:
          color 0.15s ease,
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .header-badge:active {
        background: var(--agent-surface-hover);
      }

      .header-badge.status-badge {
        color: var(--agent-primary);
        border-color: var(--agent-primary-glow);
        background: var(--agent-primary-glow);
      }

      .header-badge.status-badge.status-badge--degraded {
        color: #f59e0b;
        border-color: rgba(245, 158, 11, 0.24);
        background: rgba(245, 158, 11, 0.12);
      }

      .header-badge.status-badge.status-badge--down {
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.24);
        background: rgba(239, 68, 68, 0.12);
      }

      .header-badge.budget-badge {
        color: var(--agent-text-primary);
      }

      .header-badge.goals-badge {
        color: var(--agent-text-secondary);
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

      .pulse-dot--degraded {
        background: #f59e0b;
      }

      .pulse-dot--down {
        background: #ef4444;
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
        color: var(--agent-text-muted);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
      }

      /* ──────────────────────────────────
         2. FLOATING COORDINATOR PILLS
         ────────────────────────────────── */
      .floating-coordinators {
        position: fixed;
        left: var(--agent-input-left, 0);
        right: var(--agent-input-right, 0);
        bottom: calc(76px + var(--keyboard-offset, 0px));
        z-index: calc(var(--nxt1-z-index-fixed, 999) - 1);
        pointer-events: none;
        transition: bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1);
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
            var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px + 52px +
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

      /* ──────────────────────────────────
         3. TODAY'S ACTION PLAN
         ────────────────────────────────── */
      .action-cards-section {
        width: 100%;
        border-top: 1px solid var(--agent-border);
        padding-top: var(--nxt1-spacing-5, 20px);
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .action-plan-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .action-plan-status {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        flex: 0 0 auto;
        min-width: 0;
        white-space: nowrap;
      }

      .action-plan-meta {
        margin: 0;
        font-size: 11px;
        line-height: 1;
        color: var(--agent-text-secondary);
      }

      .action-plan-percent {
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        color: var(--agent-text-primary);
      }

      .action-plan-progress {
        position: relative;
        width: 56px;
        flex: 0 0 56px;
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--agent-surface-hover);
      }

      .action-plan-progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--agent-primary),
          color-mix(in srgb, var(--agent-primary) 65%, white)
        );
        transition: width 0.28s ease;
      }

      /* ── Category Pill Filter ──────────────────── */
      .category-pills {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .category-pills::-webkit-scrollbar {
        display: none;
      }
      .category-pill {
        flex: 0 0 auto;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--agent-border);
        background: transparent;
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .category-pill--active {
        background: var(--agent-primary);
        color: #fff;
        border-color: var(--agent-primary);
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

      .card-coordinator {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .coordinator-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .coordinator-mark {
        width: 26px;
        height: 26px;
        fill: currentColor;
      }

      .coordinator-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .coordinator-brand {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--agent-text-primary, #fff);
      }

      .coordinator-role {
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-secondary);
      }

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

      .card-description {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
      }

      .card-why {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 6px 0 0;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
        border-radius: var(--nxt1-radius-md, 8px);
        border-left: 2px solid var(--agent-primary);
      }

      .card-why nxt1-icon {
        flex-shrink: 0;
        margin-top: 1px;
      }

      .card-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      @keyframes agent-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 var(--agent-primary-glow);
        }
        50% {
          box-shadow: 0 0 10px 4px var(--agent-primary-glow);
        }
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        border: none;
        align-self: flex-start;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
      }

      .action-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .action-btn.primary-btn {
        background: var(--agent-primary);
        color: #000;
        animation: agent-pulse 2.8s ease-in-out infinite;
      }

      .action-btn.snooze-btn {
        background: transparent;
        border: 1px solid var(--agent-border);
        color: var(--agent-text-secondary);
      }

      .action-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-5, 20px);
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px dashed var(--agent-border);
        background: var(--agent-surface);
        opacity: 0;
        transform: translateY(10px);
      }

      .action-empty-state--visible {
        opacity: 1;
        transform: translateY(0);
        transition:
          opacity 0.28s ease,
          transform 0.28s ease;
      }

      .action-empty-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
      }

      .action-empty-title {
        margin: 0;
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--agent-text-primary);
      }

      .action-empty-copy {
        margin: 0;
        font-size: var(--nxt1-font-size-sm, 14px);
        line-height: 1.5;
        color: var(--agent-text-secondary);
        max-width: 38ch;
      }

      .action-empty-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid transparent;
        background: var(--agent-primary);
        color: #000;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        animation: agent-pulse 2.8s ease-in-out infinite;
      }

      .action-empty-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      /* Generating State */
      .action-plan-generating {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6, 24px);
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        animation: gen-fade-in 0.4s ease forwards;
      }

      @keyframes gen-fade-in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .generating-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        text-align: center;
      }

      .generating-logo-ring {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        animation: gen-pulse 2s ease-in-out infinite;
      }

      @keyframes gen-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(var(--agent-primary-rgb, 198, 255, 0), 0.3);
        }
        50% {
          box-shadow: 0 0 0 12px rgba(var(--agent-primary-rgb, 198, 255, 0), 0);
        }
      }

      .generating-x-mark {
        width: 32px;
        height: 32px;
        fill: var(--agent-primary);
        animation: gen-spin 3s linear infinite;
      }

      @keyframes gen-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .generating-status {
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary, #fff);
        margin: 0;
      }

      .typing-dots span {
        animation: typing-blink 1.4s steps(1) infinite;
        opacity: 0;
      }
      .typing-dots span:nth-child(1) {
        animation-delay: 0s;
      }
      .typing-dots span:nth-child(2) {
        animation-delay: 0.3s;
      }
      .typing-dots span:nth-child(3) {
        animation-delay: 0.6s;
      }

      @keyframes typing-blink {
        0% {
          opacity: 0;
        }
        25% {
          opacity: 1;
        }
        100% {
          opacity: 1;
        }
      }

      .generating-sub {
        font-size: 13px;
        color: var(--agent-text-secondary);
        margin: 0;
        max-width: 280px;
      }

      .generating-steps {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        max-width: 280px;
      }

      .generating-step {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        opacity: 0;
        animation: step-appear 0.4s ease forwards;
      }

      @keyframes step-appear {
        from {
          opacity: 0;
          transform: translateX(-8px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
        animation: dot-pulse 1.6s ease-in-out infinite;
      }

      @keyframes dot-pulse {
        0%,
        100% {
          opacity: 0.4;
          transform: scale(0.8);
        }
        50% {
          opacity: 1;
          transform: scale(1.2);
        }
      }

      .step-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--agent-text-secondary);
      }

      /* Card entry animation */
      .action-card--enter {
        opacity: 0;
        animation: card-slide-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }

      @keyframes card-slide-in {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellComponent {
  protected readonly agentX = inject(AgentXService);
  protected readonly controlPanelState = inject(AgentXControlPanelStateService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly location = inject(Location);

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

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

  protected readonly generatingSteps = [
    { label: 'Loading your profile and goals' },
    { label: 'Reviewing recent activity and progress' },
    { label: 'Generating personalized tasks' },
    { label: 'Finalizing your playbook' },
  ];

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

  /** Briefing preview text — live from service only. */
  protected readonly briefingPreview = computed(() => this.agentX.briefingPreviewText());
  protected readonly agentStatusLabel = this.controlPanelState.statusLabel;
  protected readonly agentStatusTone = this.controlPanelState.statusTone;
  protected readonly agentBudgetBadgeLabel = this.controlPanelState.budgetBadgeLabel;

  // ============================================
  // COORDINATORS — Role-Aware Virtual Staff
  // ============================================

  /** AI-generated weekly playbook timeline items — live from service only. */
  protected readonly weeklyPlaybook = computed<ShellWeeklyPlaybookItem[]>(() =>
    this.agentX.weeklyPlaybook()
  );

  /** Number of completed playbook tasks. */
  protected readonly playbookCompletedCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status === 'complete').length
  );

  /** Total number of playbook tasks. */
  protected readonly playbookTotalCount = computed(() => this.weeklyPlaybook().length);

  /** Whether all playbook tasks are complete (show "Give Me More" state). */
  protected readonly allTasksComplete = computed(
    () =>
      this.weeklyPlaybook().length > 0 &&
      this.weeklyPlaybook().every((t) => t.status === 'complete')
  );

  /** Pending (non-complete) playbook items to render as action cards. */
  protected readonly pendingPlaybookItems = this.agentX.pendingPlaybookItems;

  // ── Category Pill Filter (delegated to AgentXService) ──────────────────

  protected readonly activeCategoryId = this.agentX.activeCategoryId;
  protected readonly categoryPills = this.agentX.categoryPills;
  protected readonly showCategoryPills = this.agentX.showCategoryPills;
  protected readonly filteredPlaybookItems = this.agentX.filteredPlaybookItems;

  protected selectCategory(id: string): void {
    this.agentX.selectCategory(id);
  }

  /** Playbook-derived progress label. */
  protected readonly actionPlanCompletionLabel = computed(() => {
    const completed = this.playbookCompletedCount();
    const total = this.playbookTotalCount();
    return `${completed} of ${total} cleared today`;
  });

  /** Playbook-derived progress percentage. */
  protected readonly actionPlanProgressPercent = computed(() => {
    const total = this.playbookTotalCount();
    if (total === 0) return 0;
    return Math.round((this.playbookCompletedCount() / total) * 100);
  });

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
        pending.icon ?? 'bolt',
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
   * Opens the shared Agent X goals panel.
   */
  protected async onSetupGoals(): Promise<void> {
    await this.openControlPanel('goals');
  }

  protected async openControlPanel(panel: AgentXControlPanelKind, required = false): Promise<void> {
    await this.haptics.impact('light');

    const goalIds =
      panel === 'goals'
        ? this.agentX
            .goals()
            .map((goal) =>
              goal.id.startsWith('custom') && goal.text ? `custom:${goal.text}` : goal.id
            )
        : [];

    if (panel === 'goals') {
      this.controlPanelState.hydrateGoals(goalIds);
    }

    this.controlPanelState.notePanelOpened(panel, 'sheet');

    const result = await this.bottomSheet.openSheet<{
      panel: AgentXControlPanelKind;
      saved?: boolean;
    }>({
      component: AgentXControlPanelComponent,
      componentProps: {
        panel,
        presentation: 'sheet',
        required,
        ...(panel === 'goals' ? { initialGoals: goalIds } : {}),
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: !required,
      canDismiss: required
        ? async (_data?: unknown, role?: string) => role === 'save' || role === 'back'
        : true,
      cssClass: 'agent-x-control-panel-sheet',
    });

    // User tapped close without saving in required mode — navigate back
    if (result?.role === 'back') {
      this.location.back();
      return;
    }

    // After saving goals, sync to backend and trigger generation
    if (panel === 'goals' && result?.role === 'save') {
      const goalIds = this.controlPanelState.goals();
      const dashboardGoals: AgentDashboardGoal[] = goalIds.map((id) => {
        if (id.startsWith('custom:')) {
          return { id, text: id.slice(7), category: 'custom', createdAt: new Date().toISOString() };
        }
        const option = AGENT_X_GOAL_OPTIONS.find((o) => o.id === id);
        return {
          id,
          text: option?.label ?? id,
          category: 'custom',
          createdAt: new Date().toISOString(),
        };
      });

      await this.agentX.setGoals(dashboardGoals);
      this.agentX.generateBriefing(true).catch(() => undefined);
    }
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
   * Open the dedicated bottom sheet chat for an operation or command.
   */
  private async openOperationChat(
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    contextType: 'operation' | 'command',
    quickActions: OperationQuickAction[] = [],
    contextDescription = '',
    threadId = '',
    initialMessage = '',
    yieldState: AgentYieldState | null = null,
    operationStatus: 'processing' | 'complete' | 'error' | 'awaiting_input' = 'processing',
    errorMessage: string | null = null
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
        initialMessage,
        yieldState,
        operationStatus,
        errorMessage,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle playbook action card tap — route through the SSE chat loop
   * so the operations log receives real-time status updates.
   */
  protected async onPlaybookAction(task: WeeklyPlaybookItem): Promise<void> {
    if (task.id === 'goal-setup') {
      await this.onSetupGoals();
      return;
    }

    if (this.agentX.dashboardLoaded()) {
      const { intent, title } = this.agentX.preparePlaybookAction(task as ShellWeeklyPlaybookItem);
      // Open operation chat sheet with the intent as initialMessage so it
      // streams via SSE — giving the operations log real-time status events.
      await this.openOperationChat(
        `playbook-${task.id}`,
        title,
        'sparkles',
        'command',
        [],
        '',
        '',
        intent
      );
    } else {
      this.agentX.setUserMessage(`${task.actionLabel}: ${task.title}`);
      await this.onSendMessage();
    }
  }

  /**
   * Handle "Regenerate" playbook button.
   */
  protected async onRegeneratePlaybook(): Promise<void> {
    await this.agentX.generatePlaybook(true);
  }

  /**
   * Snooze an action card — dismisses it from the list with haptic feedback.
   */
  protected async onSnoozeTask(task: ShellWeeklyPlaybookItem): Promise<void> {
    await this.haptics.impact('light');
    this.agentX.snoozePlaybookItem(task.id);
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

  /** Retry dashboard load after an error. */
  protected onRetryDashboard(): void {
    void this.agentX.loadDashboard();
  }

  /**
   * Handle refresh timeout.
   */
  protected async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh timed out');
  }
}
