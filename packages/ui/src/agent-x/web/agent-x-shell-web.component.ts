/**
 * @fileoverview Agent X Shell — Web (SSR-Optimized, Zero Ionic)
 * @module @nxt1/ui/agent-x/web
 * @version 2.0.0
 *
 * Web-optimized Agent X AI Command Center using design token CSS.
 * 100% SSR-safe with semantic HTML. Zero Ionic components —
 * pure Angular + design tokens for the web shell layout.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * Layout (top → bottom):
 * 1. Desktop Page Header — Agent X title + subtitle
 * 2. Daily Briefing — Proactive AI insights card
 * 3. Today's Action Plan — AI-generated playbook cards (generating / pending / complete / empty states)
 * 4. Daily Operations — Active background task cards (conditional)
 * 5. Coordinators — Role-aware virtual staff cards
 * 6. Input Bar — Fixed above footer
 *
 * For mobile app, use AgentXShellComponent (Ionic variant) instead.
 *
 * @example
 * ```html
 * <nxt1-agent-x-shell-web
 *   [user]="userInfo()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  afterNextRender,
  AfterViewInit,
  OnDestroy,
  TemplateRef,
  viewChild,
} from '@angular/core';

import { NxtIconComponent } from '../../components/icon';
import { NxtHeaderPortalService } from '../../services/header-portal/header-portal.service';
import { NxtOverlayService } from '../../components/overlay';
import { AgentXService } from '../agent-x.service';
import { AgentXDashboardSkeletonComponent } from '../agent-x-dashboard-skeleton.component';
import { AgentXControlPanelComponent } from '../agent-x-control-panel.component';
import { AgentXOperationsLogComponent } from '../agent-x-operations-log.component';
import {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from '../agent-x-operation-chat.component';
import { AgentXInputComponent } from '../agent-x-input.component';
import {
  AgentXControlPanelStateService,
  AGENT_X_GOAL_OPTIONS,
  type AgentXControlPanelKind,
} from '../agent-x-control-panel-state.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import type { CommandCategory, WeeklyPlaybookItem } from '../agent-x-shell.component';
import {
  type ShellWeeklyPlaybookItem,
  type ShellActiveOperation,
  type AgentDashboardGoal,
} from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../fab/agent-x-logo.constants';

/**
 * User info for header display.
 */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
}

interface AgentXDesktopSession {
  readonly mountKey: number;
  readonly contextId: string;
  readonly contextTitle: string;
  readonly contextIcon: string;
  readonly contextType: 'operation' | 'command';
  readonly contextDescription?: string;
  readonly quickActions?: readonly OperationQuickAction[];
  readonly initialMessage?: string;
  readonly threadId?: string;
  readonly operationStatus?: 'processing' | 'complete' | 'error' | 'awaiting_input' | null;
  readonly errorMessage?: string | null;
  readonly yieldState?: ShellActiveOperation['yieldState'];
}

@Component({
  selector: 'nxt1-agent-x-shell-web',
  standalone: true,
  imports: [
    NxtIconComponent,
    AgentXDashboardSkeletonComponent,
    AgentXOperationsLogComponent,
    AgentXOperationChatComponent,
    AgentXInputComponent,
  ],
  template: `
    <!-- Portal: center — Agent X title aligned like Explore -->
    <ng-template #agentTitlePortal>
      <div class="header-portal-agent">
        <span class="header-portal-agent-title">Agent X</span>
      </div>
    </ng-template>

    <main class="agent-main agent-desktop" role="main">
      @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
        <div class="agent-loading-shell">
          <nxt1-agent-x-dashboard-skeleton />
        </div>
      } @else if (agentX.dashboardLoaded()) {
        <aside class="agent-column agent-rail-column" aria-label="Sessions and daily operations">
          <div class="agent-column-header">
            <h2 class="agent-column-title">Sessions</h2>
            <p class="agent-column-subtitle">Live operations and recent agent runs</p>
          </div>
          <div class="agent-column-scroll agent-rail-scroll">
            @if (activeOperations().length > 0) {
              <section
                class="operations-section operations-section--rail"
                aria-label="Daily operations"
              >
                <p class="rail-subsection-label">Active now</p>
                <div class="operations-stack">
                  @for (op of activeOperations(); track op.id) {
                    <button
                      type="button"
                      class="operation-card"
                      [class.operation-card--processing]="op.status === 'processing'"
                      [class.operation-card--complete]="op.status === 'complete'"
                      [class.operation-card--error]="op.status === 'error'"
                      (click)="onOperationTap(op)"
                    >
                      <div class="operation-top">
                        <div class="operation-icon">
                          <svg
                            class="agent-x-mark"
                            width="20"
                            height="20"
                            viewBox="0 0 612 792"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path [attr.d]="agentXLogoPath" />
                            <polygon [attr.points]="agentXLogoPolygon" />
                          </svg>
                        </div>
                        <div class="operation-copy">
                          <span class="operation-label">{{ op.label }}</span>
                          <span class="operation-meta">{{ operationStatusCopy(op.status) }}</span>
                        </div>
                      </div>
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
            <section class="sessions-section" aria-label="Session history">
              <nxt1-agent-x-operations-log [embedded]="true" />
            </section>
          </div>
        </aside>

        <section class="agent-column agent-plan-column" aria-label="Today's action plan">
          <div class="agent-column-scroll agent-plan-scroll">
            <section
              class="action-cards-section action-cards-section--panel"
              aria-label="Today's Action Plan"
            >
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
          </div>
        </section>

        <section class="agent-column agent-session-column" aria-label="Current session">
          <section class="briefing-section briefing-section--panel" aria-label="Daily briefing">
            <h2 class="briefing-greeting">{{ greeting() }}</h2>

            <div class="briefing-content">
              @if (!isBriefingExpanded()) {
                <p class="briefing-preview">
                  {{ briefingPreview() }}
                </p>
                <button type="button" class="btn-expand" (click)="isBriefingExpanded.set(true)">
                  Read full briefing
                </button>
              } @else {
                <ul class="briefing-list">
                  @for (insight of briefingInsights(); track insight.id) {
                    <li class="briefing-item">{{ insight.text }}</li>
                  }
                </ul>
                <button type="button" class="btn-expand" (click)="isBriefingExpanded.set(false)">
                  Show less
                </button>
              }
            </div>

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
          </section>

          <section class="agent-chat-shell" aria-label="Active chat session">
            <div class="agent-chat-shell__header">
              <h3 class="agent-chat-shell__title">{{ activeSessionTitle() }}</h3>
              <p class="agent-chat-shell__subtitle">{{ activeSessionSubtitle() }}</p>
            </div>
            <div class="agent-chat-shell__body">
              @for (session of activeDesktopSessions(); track session.mountKey) {
                <nxt1-agent-x-operation-chat
                  [embedded]="true"
                  [contextId]="session.contextId"
                  [contextTitle]="session.contextTitle"
                  [contextIcon]="session.contextIcon"
                  [contextType]="session.contextType"
                  [contextDescription]="session.contextDescription ?? ''"
                  [quickActions]="session.quickActions ?? []"
                  [initialMessage]="session.initialMessage ?? ''"
                  [threadId]="session.threadId ?? ''"
                  [yieldState]="session.yieldState ?? null"
                  [operationStatus]="session.operationStatus ?? null"
                  [errorMessage]="session.errorMessage ?? null"
                />
              }
            </div>
          </section>
        </section>
      }
    </main>

    <!-- ═══════════════════════════════════════════
         MOBILE LAYOUT (single column, ≤768px)
         Mirrors exact mobile app AgentXShellComponent
         ═══════════════════════════════════════════ -->
    <main class="agent-mobile" role="main">
      @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
        <div class="m-container">
          <nxt1-agent-x-dashboard-skeleton />
        </div>
      }

      @if (agentX.dashboardLoaded()) {
        <div class="m-container">
          <!-- ═══ 1. DAILY BRIEFING ═══ -->
          <section class="m-briefing" aria-label="Daily briefing">
            <h2 class="m-greeting">{{ greeting() }}</h2>
            <p class="m-briefing-summary">{{ briefingPreview() }}</p>

            <div class="m-badges">
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

            <!-- ═══ ACTION REQUIRED BANNER (HITL) ═══ -->
            @if (awaitingInputOps().length > 0) {
              <button
                type="button"
                class="m-action-required-banner"
                (click)="onMobileActionRequiredTap()"
              >
                <div class="m-action-required-icon">
                  <nxt1-icon name="alertCircle" [size]="18" />
                </div>
                <div class="m-action-required-content">
                  <span class="m-action-required-title">Action Required</span>
                  <span class="m-action-required-subtitle">
                    Agent needs your input on {{ awaitingInputOps().length }}
                    {{ awaitingInputOps().length === 1 ? 'operation' : 'operations' }}
                  </span>
                </div>
                <nxt1-icon name="chevronForward" [size]="16" />
              </button>
            }
          </section>

          <!-- ═══ 2. DAILY OPERATIONS (Horizontal scroll) ═══ -->
          @if (activeOperations().length > 0) {
            <section class="m-operations" aria-label="Daily operations">
              <h3 class="m-section-title">Daily Operations</h3>
              <div class="m-operations-scroll">
                @for (op of activeOperations(); track op.id) {
                  <button
                    type="button"
                    class="m-operation-card"
                    [class.m-operation-card--processing]="op.status === 'processing'"
                    [class.m-operation-card--complete]="op.status === 'complete'"
                    [class.m-operation-card--error]="op.status === 'error'"
                    [class.m-operation-card--awaiting-input]="op.status === 'awaiting_input'"
                    (click)="onMobileOperationTap(op)"
                  >
                    <div class="m-operation-top">
                      <div class="m-operation-icon">
                        <svg
                          class="agent-x-mark"
                          width="20"
                          height="20"
                          viewBox="0 0 612 792"
                          fill="currentColor"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path [attr.d]="agentXLogoPath" />
                          <polygon [attr.points]="agentXLogoPolygon" />
                        </svg>
                      </div>
                      <span class="m-operation-label">{{ op.label }}</span>
                    </div>
                    <div
                      class="m-operation-progress"
                      [class.m-operation-progress--complete]="op.status === 'complete'"
                      [class.m-operation-progress--error]="op.status === 'error'"
                    >
                      <div
                        class="m-operation-progress-bar"
                        [class.m-operation-progress-bar--processing]="op.status === 'processing'"
                        [class.m-operation-progress-bar--complete]="op.status === 'complete'"
                        [class.m-operation-progress-bar--error]="op.status === 'error'"
                        [style.width.%]="op.status === 'complete' ? 100 : op.progress"
                      ></div>
                    </div>
                    <div class="m-operation-status-row">
                      @switch (op.status) {
                        @case ('processing') {
                          <span class="operation-status-badge operation-status-badge--processing"
                            >In progress</span
                          >
                          <span class="operation-spinner"
                            ><nxt1-icon name="refresh" [size]="12"
                          /></span>
                        }
                        @case ('complete') {
                          <span class="operation-status-badge operation-status-badge--complete"
                            >Complete</span
                          >
                          <span class="operation-status-icon operation-status-icon--complete"
                            ><nxt1-icon name="checkmarkCircle" [size]="12"
                          /></span>
                        }
                        @case ('error') {
                          <span class="operation-status-badge operation-status-badge--error"
                            >Failed</span
                          >
                          <span class="operation-status-icon operation-status-icon--error"
                            ><nxt1-icon name="alertCircle" [size]="12"
                          /></span>
                        }
                        @case ('awaiting_input') {
                          <span class="operation-status-badge operation-status-badge--awaiting"
                            >Needs Input</span
                          >
                          <span class="operation-status-icon operation-status-icon--awaiting"
                            ><nxt1-icon name="alertCircle" [size]="12"
                          /></span>
                        }
                      }
                    </div>
                  </button>
                }
              </div>
            </section>
          }

          <!-- ═══ 3. TODAY'S ACTION PLAN ═══ -->
          <section class="m-action-plan" aria-label="Today's Action Plan">
            <div class="action-plan-header">
              <h3 class="m-section-title action-plan-title">Today's Action Plan</h3>
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
                      <path [attr.d]="agentXLogoPath" />
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
                      <div class="step-indicator"><div class="step-dot"></div></div>
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
                <div class="action-card action-card--enter" [style.animation-delay]="i * 80 + 'ms'">
                  <div class="card-coordinator">
                    <div class="coordinator-avatar" aria-hidden="true">
                      <svg viewBox="0 0 612 792" class="coordinator-mark">
                        <path [attr.d]="agentXLogoPath" />
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
        </div>
      }

      <!-- ═══ FLOATING COORDINATOR CHIPS ═══ -->
      <section class="m-floating-coordinators" aria-label="Coordinators">
        <div class="m-coordinators-scroll" role="list">
          @for (cat of commandCategories(); track cat.id) {
            <button
              type="button"
              role="listitem"
              class="m-coordinator-pill"
              (click)="onMobileCategoryTap(cat)"
            >
              {{ cat.label }}
            </button>
          }
        </div>
      </section>

      <!-- ═══ INPUT BAR ═══ -->
      <nxt1-agent-x-input
        [hasMessages]="false"
        [selectedTask]="agentX.selectedTask()"
        [isLoading]="agentX.isLoading()"
        [canSend]="agentX.canSend()"
        [userMessage]="agentX.getUserMessage()"
        [placeholder]="'Message A Coordinator'"
        (messageChange)="agentX.setUserMessage($event)"
        (send)="onMobileSendMessage()"
        (removeTask)="agentX.clearTask()"
        (toggleTasks)="onToggleTasks()"
      />
    </main>
  `,
  styles: [
    `
      /* ============================================
         AGENT X WEB — AI Command Center
         Zero Ionic, SSR-safe, design-token CSS
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        --agent-bg: var(--nxt1-color-bg-primary);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-primary: var(--nxt1-color-primary, #ccff00);
        --agent-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      :host-context(.dark),
      :host-context([data-theme='dark']) {
        --agent-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --agent-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .agent-main {
        display: grid;
        grid-template-columns: 320px minmax(320px, 420px) minmax(0, 1fr);
        min-height: 100%;
        height: calc(100vh - var(--nxt1-nav-height, 56px));
        overflow: hidden;
      }

      .agent-loading-shell {
        grid-column: 1 / -1;
        padding: var(--nxt1-spacing-5, 20px);
      }

      .agent-column {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-width: 0;
        min-height: 0;
      }

      .agent-rail-column,
      .agent-plan-column {
        border-right: 1px solid var(--agent-border);
      }

      .agent-column-header {
        padding: var(--nxt1-spacing-5, 20px);
        border-bottom: 1px solid var(--agent-border);
      }

      .agent-column-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary);
        letter-spacing: -0.01em;
      }

      .agent-column-subtitle {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--agent-text-muted);
      }

      .agent-column-scroll {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--nxt1-spacing-5, 20px);
        scrollbar-width: thin;
      }

      .agent-rail-scroll {
        gap: var(--nxt1-spacing-5, 20px);
      }

      .sessions-section {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      :host ::ng-deep .sessions-section nxt1-agent-x-operations-log {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      .agent-session-column {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .agent-chat-shell {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        padding: var(--nxt1-spacing-5, 20px);
        gap: var(--nxt1-spacing-4, 16px);
      }

      .agent-chat-shell__header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .agent-chat-shell__title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--agent-text-primary);
        letter-spacing: -0.01em;
      }

      .agent-chat-shell__subtitle {
        margin: 0;
        font-size: 12px;
        color: var(--agent-text-muted);
      }

      .agent-chat-shell__body {
        display: flex;
        min-height: 0;
      }

      :host ::ng-deep .agent-chat-shell__body nxt1-agent-x-operation-chat {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      /* ── Header portal: match Explore left-anchored title ── */
      .header-portal-agent {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .header-portal-agent-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.01em;
        white-space: nowrap;
        user-select: none;
        position: absolute;
        left: var(--nxt1-spacing-2, 8px);
      }

      /* ──────────────────────────────────
         1. ACTIVE OPERATIONS
         ────────────────────────────────── */
      .operations-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .operations-section--rail {
        max-width: none;
        margin-bottom: 0;
      }

      .rail-subsection-label {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--agent-text-muted);
      }

      .operations-stack {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .operation-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
      }

      .operation-card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-xl, 16px);
        max-width: none;
        cursor: pointer;
        transition: opacity 0.15s ease;

        &:hover {
          opacity: 0.85;
        }

        &:active {
          opacity: 0.7;
        }
      }

      .operation-card--complete {
        border-color: rgba(76, 175, 80, 0.3);
        background: rgba(76, 175, 80, 0.06);
      }

      .operation-card--error {
        border-color: rgba(244, 67, 54, 0.3);
        background: rgba(244, 67, 54, 0.06);
      }

      .operation-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .operation-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .operation-meta {
        font-size: 12px;
        color: var(--agent-text-muted);
      }

      .operation-top {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        min-width: 0;
      }

      .operation-progress {
        width: 100%;
        height: 3px;
        background: var(--agent-border);
        border-radius: 2px;
        overflow: hidden;
      }

      .operation-progress-bar {
        height: 100%;
        background: var(--agent-primary);
        border-radius: 2px;
        transition: width 0.4s ease;
      }

      .operation-done {
        color: #4caf50;
      }

      .operation-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .operation-status-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .operation-status-badge--processing {
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
      }

      .operation-status-badge--complete {
        color: #4caf50;
        background: rgba(76, 175, 80, 0.12);
      }

      .operation-status-badge--error {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.12);
      }

      .operation-status-icon,
      .operation-spinner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: var(--agent-text-secondary);
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

      .briefing-section--panel {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px);
        border-bottom: 1px solid var(--agent-border);
      }

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
        font-family: inherit;
        cursor: pointer;
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

      .pulse-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--agent-primary);
        position: relative;
        z-index: 2;
      }

      .pulse-dot--degraded {
        background: #f59e0b;
      }

      .pulse-dot--down {
        background: #ef4444;
      }

      .briefing-greeting {
        font-size: 24px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-5, 20px);
        line-height: 1.3;
      }

      /* Expandable Briefing */
      .briefing-content {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .briefing-preview {
        font-size: 14px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .btn-expand {
        background: transparent;
        border: none;
        padding: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-primary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      /* Briefing List */
      .briefing-list {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        width: 100%;
        text-align: left;
      }

      .briefing-item {
        position: relative;
        padding-left: var(--nxt1-spacing-4, 16px);
        font-size: 14px;
        line-height: 1.6;
        color: var(--agent-text-secondary);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .briefing-item:last-child {
        margin-bottom: 0;
      }

      .briefing-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 9px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--agent-text-muted);
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
        margin-bottom: 0;
      }

      /* ──────────────────────────────────
         3. ACTION CARDS
         ────────────────────────────────── */
      .action-cards-section {
        width: 100%;
        max-width: 480px;
        border-top: 1px solid var(--agent-border);
        padding-top: var(--nxt1-spacing-5, 20px);
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .action-cards-section--panel {
        max-width: none;
        border-top: none;
        padding-top: 0;
        margin-bottom: 0;
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
          border-color 0.2s ease,
          opacity 0.22s ease,
          transform 0.22s ease,
          filter 0.22s ease;
      }

      .action-card:hover {
        background: var(--agent-surface-hover);
      }

      .action-card--exiting {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
        filter: blur(2px);
        pointer-events: none;
      }

      .action-card--featured {
        border-color: var(--agent-primary-glow);
        background: linear-gradient(180deg, var(--agent-surface), var(--agent-surface-hover));
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
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .coordinator-mark {
        width: 34px;
        height: 34px;
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
      }
      .action-btn:hover {
        opacity: 0.9;
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
      .action-btn.secondary-btn {
        background: var(--agent-surface-hover);
        border: 1px solid var(--agent-border);
        color: var(--agent-text-primary);
      }

      .action-btn.snooze-btn {
        background: transparent;
        border: 1px solid var(--agent-border);
        color: var(--agent-text-secondary);
      }

      .card-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
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
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        animation: agent-pulse 2.8s ease-in-out infinite;
      }

      .action-empty-btn:hover {
        opacity: 0.92;
      }

      .action-empty-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      /* ==============================
         RESPONSIVE — Desktop / Mobile toggle
         ============================== */

      /* Mobile layout hidden on desktop */
      .agent-mobile {
        display: none;
      }

      @media (max-width: 1200px) {
        .agent-desktop {
          grid-template-columns: 300px minmax(280px, 360px) minmax(0, 1fr);
        }
      }

      @media (max-width: 768px) {
        /* Hide desktop, show mobile */
        .agent-desktop {
          display: none !important;
        }
        .agent-mobile {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          position: relative;
        }
      }

      /* ==============================
         MOBILE LAYOUT STYLES
         ============================== */
      .m-container {
        padding: 0 var(--nxt1-spacing-4, 16px);
        /* Bottom space: input bar (~52px) + coordinator pills (~44px) + footer (~76px) + breathing room */
        padding-bottom: calc(
          var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px + 52px + 44px +
            32px
        );
      }

      /* --- Briefing --- */
      .m-briefing {
        padding-top: var(--nxt1-spacing-5, 20px);
      }

      .m-greeting {
        font-size: 22px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .m-briefing-summary {
        font-size: 14px;
        color: var(--agent-text-secondary);
        line-height: 1.5;
        margin: 0 0 var(--nxt1-spacing-6, 24px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .m-badges {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        flex-wrap: wrap;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      /* --- Action Required Banner --- */
      .m-action-required-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: rgba(255, 59, 48, 0.08);
        border: 1px solid rgba(255, 59, 48, 0.2);
        cursor: pointer;
        transition: background 0.15s;
        margin-top: 4px;
        -webkit-appearance: none;
        appearance: none;
        font-family: inherit;
        text-align: left;
        color: var(--agent-text-primary);
      }

      .m-action-required-banner:hover {
        background: rgba(255, 59, 48, 0.12);
      }

      .m-action-required-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 59, 48, 0.15);
        color: #ff3b30;
        flex-shrink: 0;
      }

      .m-action-required-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .m-action-required-title {
        font-size: 0.88rem;
        font-weight: 600;
        color: #ff3b30;
      }

      .m-action-required-subtitle {
        font-size: 0.78rem;
        color: var(--agent-text-secondary);
      }

      /* --- Section Titles --- */
      .m-section-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
      }

      .m-section-title.action-plan-title {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--agent-text-primary);
        text-transform: none;
        margin-bottom: 0;
      }

      /* --- Operations (Horizontal scroll) --- */
      .m-operations {
        margin-top: 20px;
      }

      .m-operations-scroll {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
        scrollbar-width: none;
      }

      .m-operations-scroll::-webkit-scrollbar {
        display: none;
      }

      .m-operation-card {
        flex: 0 0 200px;
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        cursor: pointer;
        transition:
          background 0.15s,
          border-color 0.15s;
        -webkit-appearance: none;
        appearance: none;
        font-family: inherit;
        text-align: left;
        color: var(--agent-text-primary);
      }

      .m-operation-card:hover {
        background: var(--agent-surface-hover);
      }

      .m-operation-card--awaiting-input {
        border-color: rgba(255, 149, 0, 0.4);
        background: rgba(255, 149, 0, 0.06);
      }

      .m-operation-top {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .m-operation-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--nxt1-color-accent, #e74c3c);
        color: white;
        flex-shrink: 0;
      }

      .m-operation-label {
        font-size: 0.82rem;
        font-weight: 600;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .m-operation-progress {
        width: 100%;
        height: 4px;
        background: var(--agent-border);
        border-radius: 2px;
        overflow: hidden;
      }

      .m-operation-progress--complete {
        background: rgba(52, 199, 89, 0.2);
      }
      .m-operation-progress--error {
        background: rgba(255, 59, 48, 0.2);
      }

      .m-operation-progress-bar {
        height: 100%;
        border-radius: 2px;
        transition: width 0.5s ease;
        background: var(--nxt1-color-accent, #e74c3c);
      }

      .m-operation-progress-bar--processing {
        background: var(--nxt1-color-accent, #e74c3c);
      }

      .m-operation-progress-bar--complete {
        background: #34c759;
      }

      .m-operation-progress-bar--error {
        background: #ff3b30;
      }

      .m-operation-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      /* --- Action Plan (mobile) --- */
      .m-action-plan {
        margin-top: 24px;
      }

      .m-action-plan .action-plan-header {
        margin-bottom: 16px;
      }

      .m-action-plan .action-card {
        margin-bottom: 16px;
      }

      /* --- Floating Coordinator Chips --- */
      .m-floating-coordinators {
        position: fixed;
        left: var(--nxt1-footer-left, 16px);
        right: var(--nxt1-footer-right, 16px);
        /* Positioned above the input bar: footer-bottom + pill-height + input-gap + input-height */
        bottom: calc(
          var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px + 52px +
            var(--keyboard-offset, 0px)
        );
        z-index: calc(var(--nxt1-z-index-fixed, 999) - 1);
        pointer-events: none;
        padding: 0;
        transition: bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      }

      .m-coordinators-scroll {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding: 0;
      }

      .m-coordinators-scroll::-webkit-scrollbar {
        display: none;
      }

      .m-coordinator-pill {
        flex-shrink: 0;
        padding: 12px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        background: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        color: var(--agent-text-primary);
        border: 1px solid var(--agent-border);
        cursor: pointer;
        white-space: nowrap;
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.15s ease;
        -webkit-appearance: none;
        appearance: none;
        font-family: inherit;
      }

      .m-coordinator-pill:active {
        transform: scale(0.96);
        border-color: var(--nxt1-color-accent, #e74c3c);
      }

      /* --- Input Bar (mobile) ---
         The AgentXInputComponent already has its own position:fixed
         with footer-aware bottom offset at <767px.
         Do NOT override its positioning — just let it be. */
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellWebComponent implements AfterViewInit, OnDestroy {
  protected readonly agentX = inject(AgentXService);
  protected readonly controlPanelState = inject(AgentXControlPanelStateService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly headerPortal = inject(NxtHeaderPortalService);

  // Portal template refs
  private readonly agentTitlePortal = viewChild<TemplateRef<unknown>>('agentTitlePortal');
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private desktopSessionCounter = 0;

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    const centerTpl = this.agentTitlePortal();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearCenterContent();
  }

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<AgentXUser | null>(null);

  /** Hide the input bar (e.g. when logged out) */
  readonly hideInput = input(false);

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Whether the full briefing list is expanded. */
  protected readonly isBriefingExpanded = signal(false);

  /** Active desktop session rendered in the right-hand pane. */
  protected readonly activeDesktopSession = signal<AgentXDesktopSession | null>(null);

  protected readonly activeDesktopSessions = computed(() => {
    const session = this.activeDesktopSession();
    return session ? [session] : [];
  });

  protected readonly activeSessionTitle = computed(
    () => this.activeDesktopSession()?.contextTitle || 'Agent X Session'
  );

  protected readonly activeSessionSubtitle = computed(() => {
    const session = this.activeDesktopSession();
    if (!session) return 'Open a task or message a coordinator to begin.';
    return session.contextType === 'operation'
      ? 'Live operation thread'
      : 'Direct chat with Agent X';
  });

  protected readonly commandQuickActions = computed<readonly OperationQuickAction[]>(() =>
    this.commandCategories().map((coord, index) => ({
      id: `coord-${coord.id || index}`,
      label: coord.label,
      icon: coord.icon || 'sparkles',
      description: coord.description,
    }))
  );

  /** Playbook-derived progress: count of completed items. */
  protected readonly actionPlanCompletionLabel = computed(() => {
    const completed = this.playbookCompletedCount();
    const total = this.playbookTotalCount();
    return `${completed} of ${total} cleared today`;
  });
  protected readonly actionPlanProgressPercent = computed(() => {
    const total = this.playbookTotalCount();
    if (total === 0) return 0;
    return Math.round((this.playbookCompletedCount() / total) * 100);
  });

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

  protected readonly generatingSteps = [
    { label: 'Loading your profile and goals' },
    { label: 'Reviewing recent activity and progress' },
    { label: 'Generating personalized tasks' },
    { label: 'Finalizing your playbook' },
  ];

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a coordinator card is tapped. */
  readonly coordinatorTap = output<CommandCategory>();

  // ============================================
  // COMPUTED
  // ============================================

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

  /** Proactive insights from Agent X — live from service only. */
  protected readonly briefingInsights = computed(() => this.agentX.briefingInsights());

  /** Briefing preview text — live from service only. */
  protected readonly briefingPreview = computed(() => this.agentX.briefingPreviewText());
  protected readonly agentStatusLabel = this.controlPanelState.statusLabel;
  protected readonly agentStatusTone = this.controlPanelState.statusTone;
  protected readonly agentBudgetBadgeLabel = this.controlPanelState.budgetBadgeLabel;

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

  // ============================================
  // COORDINATORS — Role-Aware Virtual Staff
  // ============================================

  /** Coordinator cards — live from service only. */
  protected readonly commandCategories = computed(() => this.agentX.coordinators());

  /** Operations awaiting user input (HITL — human-in-the-loop). */
  protected readonly awaitingInputOps = computed(() => this.agentX.awaitingInputOperations());

  protected readonly operationStatusCopy = (status: ShellActiveOperation['status']): string => {
    switch (status) {
      case 'processing':
        return 'Working now';
      case 'complete':
        return 'Completed';
      case 'awaiting_input':
        return 'Needs your input';
      case 'error':
        return 'Needs attention';
      default:
        return 'Active';
    }
  };

  constructor() {
    this.resetToDefaultDesktopSession();

    afterNextRender(() => {
      this.agentX.startTitleAnimation();
      this.agentX.loadDashboard();
    });

    // React to pending thread requests (push notifications, deep links, activity taps)
    effect(() => {
      const pending = this.agentX.pendingThread();
      if (!pending) return;

      this.agentX.clearPendingThread();

      this.setDesktopSession({
        contextId: pending.operationId ?? pending.threadId,
        contextTitle: pending.title,
        contextIcon: pending.icon ?? 'bolt',
        contextType: 'operation',
        threadId: pending.threadId,
      });
    });

    effect(() => {
      const session = this.activeDesktopSession();
      const quickActions = this.commandQuickActions();

      if (!session || session.contextId !== 'agent-x-chat' || session.contextType !== 'command') {
        return;
      }

      const existingLabels = (session.quickActions ?? []).map((action) => action.label).join('|');
      const nextLabels = quickActions.map((action) => action.label).join('|');

      if (!nextLabels || existingLabels === nextLabels) return;

      this.activeDesktopSession.set({
        ...session,
        quickActions,
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle "Set Your Goals" tap — opens the shared goals modal.
   */
  protected async onSetupGoals(): Promise<void> {
    await this.openControlPanel('goals');
  }

  protected async openControlPanel(panel: AgentXControlPanelKind, required = false): Promise<void> {
    this.controlPanelState.notePanelOpened(panel, 'modal');

    const ref = this.overlay.open<
      AgentXControlPanelComponent,
      { panel: AgentXControlPanelKind; saved?: boolean }
    >({
      component: AgentXControlPanelComponent,
      inputs: {
        panel,
        presentation: 'modal',
        required,
      },
      size: panel === 'budget' ? 'xl' : 'full',
      backdropDismiss: !required,
      escDismiss: !required,
      ariaLabel:
        panel === 'status'
          ? 'Agent status information'
          : panel === 'budget'
            ? 'Agent budget controls'
            : 'Agent goals manager',
      panelClass: 'agent-x-control-panel-modal',
    });

    const result = await ref.closed;

    // After saving goals, sync to backend and trigger generation
    if (panel === 'goals' && result?.data?.saved) {
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
      this.agentX.generateBriefing(true).catch(() => {
        /* noop */
      });
    }
  }

  /**
   * Handle weekly playbook action tap.
   * If the dashboard is loaded, dispatches a real background job via Agent X.
   * Otherwise falls back to chat message.
   */
  protected async onPlaybookAction(task: WeeklyPlaybookItem): Promise<void> {
    if (task.id === 'goal-setup') {
      await this.onSetupGoals();
      return;
    }

    if (this.agentX.dashboardLoaded()) {
      await this.agentX.executePlaybookAction(task as ShellWeeklyPlaybookItem);
    } else {
      this.agentX.setUserMessage(`${task.actionLabel}: ${task.title}`);
      await this.agentX.sendMessage();
    }
  }

  /**
   * Handle active operation card tap — opens the persisted worker conversation
   * in a bottom sheet so the user sees Agent X's actual output logs.
   */
  protected async onOperationTap(op: ShellActiveOperation): Promise<void> {
    this.setDesktopSession({
      contextId: op.id,
      contextTitle: op.label,
      contextIcon: op.icon,
      contextType: 'operation',
      threadId: op.threadId ?? '',
      yieldState: op.yieldState,
      operationStatus: op.status,
      errorMessage: op.errorMessage ?? null,
    });
  }

  /**
   * Handle coordinator card tap — open coordinator context.
   */
  protected onCoordinatorTap(coord: CommandCategory): void {
    void this.haptics.impact('light');
    this.setDesktopSession({
      contextId: `coordinator-${coord.id}`,
      contextTitle: coord.label,
      contextIcon: coord.icon || 'sparkles',
      contextType: 'command',
      contextDescription: coord.description,
      initialMessage: coord.label,
      quickActions: this.commandQuickActions(),
    });
    this.coordinatorTap.emit(coord);
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
    this.toast.success('Task snoozed');
  }

  protected async onSendMessage(): Promise<void> {
    const message = this.agentX.getUserMessage().trim();
    if (!message) return;

    // Clear the shell input immediately
    this.agentX.setUserMessage('');
    this.agentX.clearTask();

    this.setDesktopSession({
      contextId: 'agent-x-chat',
      contextTitle: 'Agent X',
      contextIcon: 'bolt',
      contextType: 'command',
      initialMessage: message,
      quickActions: this.commandQuickActions(),
    });
  }

  protected async onToggleTasks(): Promise<void> {
    this.toast.info('Task panel coming soon');
  }

  // ============================================
  // MOBILE-SPECIFIC EVENT HANDLERS
  // ============================================

  /**
   * Handle operation card tap on mobile — opens the operation chat in a
   * full-screen overlay (equivalent to mobile's bottom sheet).
   */
  protected async onMobileOperationTap(op: ShellActiveOperation): Promise<void> {
    await this.haptics.impact('light');

    const ref = this.overlay.open<AgentXOperationChatComponent>({
      component: AgentXOperationChatComponent,
      inputs: {
        embedded: true,
        contextId: op.id,
        contextTitle: op.label,
        contextIcon: op.icon,
        contextType: 'operation',
        threadId: op.threadId ?? '',
        yieldState: op.yieldState ?? null,
        operationStatus: op.status ?? null,
        errorMessage: op.errorMessage ?? null,
      },
      size: 'full',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: op.label,
    });

    await ref.closed;
  }

  /**
   * Handle coordinator pill tap on mobile — opens a fresh Agent X chat
   * in a full-screen overlay scoped to that coordinator.
   */
  protected async onMobileCategoryTap(cat: CommandCategory): Promise<void> {
    await this.haptics.impact('light');

    const ref = this.overlay.open<AgentXOperationChatComponent>({
      component: AgentXOperationChatComponent,
      inputs: {
        embedded: true,
        contextId: `coordinator-${cat.id}`,
        contextTitle: cat.label,
        contextIcon: cat.icon || 'sparkles',
        contextType: 'command',
        contextDescription: cat.description ?? '',
        initialMessage: cat.label,
        quickActions: this.commandQuickActions(),
      },
      size: 'full',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: cat.label,
    });

    this.coordinatorTap.emit(cat);
    await ref.closed;
  }

  /**
   * Handle send from mobile input bar — opens a full-screen Agent X chat
   * overlay pre-populated with the user's message.
   */
  protected async onMobileSendMessage(): Promise<void> {
    const message = this.agentX.getUserMessage().trim();
    if (!message) return;

    this.agentX.setUserMessage('');
    this.agentX.clearTask();

    const ref = this.overlay.open<AgentXOperationChatComponent>({
      component: AgentXOperationChatComponent,
      inputs: {
        embedded: true,
        contextId: 'agent-x-chat',
        contextTitle: 'Agent X',
        contextIcon: 'bolt',
        contextType: 'command',
        initialMessage: message,
        quickActions: this.commandQuickActions(),
      },
      size: 'full',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Agent X Chat',
    });

    await ref.closed;
  }

  /**
   * Handle "Action Required" banner tap — opens the first awaiting-input
   * operation in a full-screen overlay.
   */
  protected async onMobileActionRequiredTap(): Promise<void> {
    const ops = this.awaitingInputOps();
    if (ops.length === 0) return;

    await this.haptics.notification('warning');
    await this.onMobileOperationTap(ops[0]);
  }

  private resetToDefaultDesktopSession(): void {
    this.setDesktopSession({
      contextId: 'agent-x-chat',
      contextTitle: 'Agent X',
      contextIcon: 'bolt',
      contextType: 'command',
      contextDescription: 'Use Agent X to plan, create, and review work in one session.',
      quickActions: this.commandQuickActions(),
    });
  }

  private setDesktopSession(session: Omit<AgentXDesktopSession, 'mountKey'>): void {
    this.desktopSessionCounter += 1;
    this.activeDesktopSession.set({
      ...session,
      mountKey: this.desktopSessionCounter,
    });
  }
}
