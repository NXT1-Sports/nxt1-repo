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
  DestroyRef,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

import { NxtIconComponent } from '../../components/icon';
import { NxtHeaderPortalService } from '../../services/header-portal/header-portal.service';
import { NxtOverlayService } from '../../components/overlay';
import { ConnectedAccountsModalService } from '../../components/connected-sources';
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
  type OperationLogEntry,
} from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../fab/agent-x-logo.constants';
import type { OnboardingUserType } from '@nxt1/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgentXOperationEventService } from '../agent-x-operation-event.service';

/**
 * Content descriptor for the expanded side panel.
 * - `'live-view'` — Firecrawl interactive browser iframe
 * - `'image'`     — Rich image preview
 * - `'video'`     — Inline video player
 * - `'doc'`       — Document / PDF preview placeholder
 */
export interface ExpandedSidePanelContent {
  readonly type: 'live-view' | 'image' | 'video' | 'doc';
  readonly url: string;
  readonly title?: string;
}

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
    <!-- Portal: center — Agent X title + centered nav pills -->
    <ng-template #agentTitlePortal>
      <div class="nxt1-header-portal">
        <span class="nxt1-header-portal__title">Agent X</span>
        <div class="nxt1-header-portal__center header-portal-center-nav">
          <button
            type="button"
            class="header-nav-pill"
            [class.header-nav-pill--active]="showSessionsRail()"
            (click)="toggleSessionsRail()"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>Sessions</span>
          </button>
          <button
            type="button"
            class="header-nav-pill"
            [class.header-nav-pill--active]="showActionPlanModal()"
            (click)="toggleActionPlanPanel()"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
            </svg>
            <span>Action Plan</span>
            @if (playbookTotalCount() > 0) {
              <span class="header-nav-pill-count">{{ playbookTotalCount() }}</span>
            }
          </button>
          <button
            type="button"
            class="header-nav-pill"
            [class.header-nav-pill--active]="!!expandedSidePanel()"
            (click)="toggleDevLiveView()"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Live View</span>
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Portal: right — Status dot + Sources + Budget icons -->
    <ng-template #agentRightPortal>
      <div class="header-portal-actions">
        <button
          type="button"
          class="header-status-dot-btn"
          [class.header-status-dot-btn--degraded]="agentStatusTone() === 'warning'"
          [class.header-status-dot-btn--down]="agentStatusTone() === 'critical'"
          (click)="openControlPanel('status')"
          [attr.aria-label]="agentStatusLabel()"
        >
          <span
            class="status-hint"
            [class.status-hint--degraded]="agentStatusTone() === 'warning'"
            [class.status-hint--down]="agentStatusTone() === 'critical'"
            >{{ agentStatusLabel() }}</span
          >
          <span
            class="status-dot"
            [class.status-dot--degraded]="agentStatusTone() === 'warning'"
            [class.status-dot--down]="agentStatusTone() === 'critical'"
          ></span>
        </button>
        <button
          type="button"
          class="header-icon-btn"
          (click)="openConnectedAccounts()"
          aria-label="Connected Sources"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <button
          type="button"
          class="header-icon-btn"
          (click)="openControlPanel('budget')"
          aria-label="Budget"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z" />
            <path d="M2 7l16-2" />
            <path d="M17 13.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
          </svg>
        </button>
      </div>
    </ng-template>

    <main
      class="agent-main agent-desktop"
      [class.agent-main--with-sessions]="showSessionsRail()"
      [class.agent-main--with-plan]="showActionPlanModal() && !expandedSidePanel()"
      [class.agent-main--with-expanded-panel]="!!expandedSidePanel()"
      role="main"
    >
      @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
        <div class="agent-loading-shell">
          <nxt1-agent-x-dashboard-skeleton />
        </div>
      } @else if (agentX.dashboardLoaded()) {
        @if (showSessionsRail()) {
          <aside class="agent-column agent-rail-column" aria-label="Sessions and daily operations">
            <div class="agent-column-header">
              <div class="agent-column-header-row">
                <h2 class="agent-column-title">Sessions</h2>
                <button
                  type="button"
                  class="rail-close-btn"
                  (click)="showSessionsRail.set(false)"
                  aria-label="Close sessions"
                >
                  <nxt1-icon name="close" [size]="16"></nxt1-icon>
                </button>
              </div>
              <p class="agent-column-subtitle">Live operations and recent agent runs</p>
              <button type="button" class="new-session-button" (click)="onNewSession()">
                <svg
                  class="new-session-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 1v12M1 7h12"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
                New session
              </button>
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
                              <span
                                class="operation-status-badge operation-status-badge--processing"
                              >
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
                <nxt1-agent-x-operations-log [embedded]="true" (entryTap)="onLogEntryTap($event)" />
              </section>
            </div>
          </aside>
        }

        <section class="agent-column agent-chat-column" aria-label="Agent X Chat">
          <div class="agent-chat-unified">
            <!-- Briefing welcome block — only on default chat, hides after first message -->
            @if (showDesktopBriefing()) {
              <div class="chat-briefing">
                <h2 class="chat-briefing__greeting">{{ greeting() }}</h2>
                <div class="chat-briefing__content">
                  @if (!isBriefingExpanded()) {
                    <p class="chat-briefing__preview">
                      {{ briefingPreview() }}
                    </p>
                    <button
                      type="button"
                      class="chat-briefing__toggle"
                      (click)="isBriefingExpanded.set(true)"
                    >
                      Read full briefing
                    </button>
                  } @else {
                    <ul class="chat-briefing__list">
                      @for (insight of briefingInsights(); track insight.id) {
                        <li class="chat-briefing__item">{{ insight.text }}</li>
                      }
                    </ul>
                    <button
                      type="button"
                      class="chat-briefing__toggle"
                      (click)="isBriefingExpanded.set(false)"
                    >
                      Show less
                    </button>
                  }
                </div>
              </div>
            }
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
                (userMessageSent)="onUserMessageSent()"
                (responseComplete)="onResponseComplete()"
              />
            }
          </div>
        </section>

        <!-- ═══════════════════════════════════════════
             ACTION PLAN PANEL (right column in desktop grid)
             ═══════════════════════════════════════════ -->
        @if (showActionPlanModal() && !expandedSidePanel()) {
          <aside class="agent-column agent-action-plan-column" aria-label="Today's Action Plan">
            <!-- ── Manage Goals Button + Close (opens modal) ── -->
            <div class="inline-goals">
              <button
                type="button"
                class="inline-goals__manage-btn"
                (click)="openControlPanel('goals')"
              >
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
                @if (agentX.goals().length > 0) {
                  <span class="inline-goals__manage-count">{{ agentX.goals().length }}</span>
                }
              </button>
              <button
                type="button"
                class="action-plan-panel__close"
                (click)="closeActionPlanModal()"
                aria-label="Close action plan"
              >
                <nxt1-icon name="close" [size]="18"></nxt1-icon>
              </button>
            </div>

            <div class="action-plan-panel__header">
              <div class="action-plan-panel__header-top">
                <h2 class="action-plan-panel__title">Today's Action Plan</h2>
              </div>
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

            <!-- ── Category Pills (fixed above scroll) ── -->
            @if (
              !agentX.playbookGenerating() &&
              weeklyPlaybook().length > 0 &&
              !allTasksComplete() &&
              showCategoryPills()
            ) {
              <div class="action-plan-pills-bar">
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
              </div>
            }

            <div class="action-plan-panel__body">
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
                @for (task of filteredPlaybookItems(); track task.id; let i = $index) {
                  <div
                    class="action-card action-card--enter"
                    [style.animation-delay]="i * 80 + 'ms'"
                  >
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
                        <p class="card-why">{{ task.why }}</p>
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
            </div>
          </aside>
        }

        <!-- ═══════════════════════════════════════════
             EXPANDED SIDE PANEL (Firecrawl Live View / Media)
             Replaces Action Plan when active — wider column
             ═══════════════════════════════════════════ -->
        @if (expandedSidePanel(); as panel) {
          <aside class="agent-column agent-expanded-panel-column" aria-label="Expanded panel">
            <div class="agent-column-header">
              <div class="agent-column-header-row">
                <h2 class="agent-column-title">{{ expandedPanelTitle() }}</h2>
                <div class="expanded-panel__actions">
                  <!-- Copy Link -->
                  <button
                    type="button"
                    class="rail-close-btn"
                    (click)="copyExpandedPanelUrl(panel.url)"
                    aria-label="Copy link"
                    title="Copy link"
                  >
                    <nxt1-icon name="link" [size]="16"></nxt1-icon>
                  </button>
                  <!-- Open in New Tab -->
                  <a
                    [href]="panel.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rail-close-btn"
                    style="text-decoration: none;"
                    aria-label="Open in new tab"
                    title="Open in new tab"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                  <!-- Refresh (Live View Only) -->
                  @if (panel.type === 'live-view') {
                    <button
                      type="button"
                      class="rail-close-btn"
                      (click)="refreshExpandedPanel()"
                      aria-label="Refresh view"
                      title="Refresh"
                    >
                      <nxt1-icon name="refresh" [size]="16"></nxt1-icon>
                    </button>
                  }
                  <!-- Fullscreen (Big Screen / HDMI) -->
                  <button
                    type="button"
                    class="rail-close-btn"
                    (click)="toggleExpandedPanelFullscreen()"
                    aria-label="Toggle fullscreen"
                    title="Fullscreen"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
                      ></path>
                    </svg>
                  </button>
                  <!-- Download / Export PDF -->
                  <button
                    type="button"
                    class="rail-close-btn"
                    (click)="downloadExpandedPanelContent(panel)"
                    aria-label="Download content"
                    title="Download"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </button>
                  <!-- Close Button -->
                  <button
                    type="button"
                    class="rail-close-btn"
                    (click)="closeExpandedSidePanel()"
                    aria-label="Close panel"
                    title="Close"
                  >
                    <nxt1-icon name="close" [size]="16"></nxt1-icon>
                  </button>
                </div>
              </div>
            </div>

            <div class="expanded-panel__body">
              @switch (panel.type) {
                @case ('live-view') {
                  @if (expandedPanelIframeLoading()) {
                    <div class="expanded-panel__loader">
                      <div class="expanded-panel__spinner"></div>
                      <span class="expanded-panel__loader-text">Loading live view…</span>
                    </div>
                  }
                  @if (safeExpandedIframeUrl(); as safeUrl) {
                    <iframe
                      class="expanded-panel__iframe"
                      [class.expanded-panel__iframe--visible]="!expandedPanelIframeLoading()"
                      [src]="safeUrl"
                      allow="clipboard-read; clipboard-write"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                      [title]="expandedPanelTitle()"
                      (load)="onExpandedIframeLoad()"
                    ></iframe>
                  }
                }
                @case ('image') {
                  <div class="expanded-panel__media">
                    <img
                      [src]="panel.url"
                      [alt]="panel.title || 'Image preview'"
                      class="expanded-panel__img"
                    />
                  </div>
                }
                @case ('video') {
                  <div class="expanded-panel__media">
                    <video [src]="panel.url" controls class="expanded-panel__video"></video>
                  </div>
                }
                @case ('doc') {
                  <div class="expanded-panel__media expanded-panel__doc">
                    <div class="expanded-panel__doc-icon">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <p class="expanded-panel__doc-name">{{ panel.title || 'Document' }}</p>
                    <a
                      class="expanded-panel__doc-open"
                      [href]="panel.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in new tab
                    </a>
                  </div>
                }
              }
            </div>
          </aside>
        }
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
                      <p class="card-why">{{ task.why }}</p>
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
        [pendingFiles]="agentX.pendingFiles()"
        [uploading]="agentX.uploading()"
        (messageChange)="agentX.setUserMessage($event)"
        (send)="onMobileSendMessage()"
        (stop)="agentX.cancelStream()"
        (removeTask)="agentX.clearTask()"
        (toggleTasks)="onToggleTasks()"
        (filesAdded)="agentX.addFiles($event)"
        (fileRemoved)="agentX.removeFile($event)"
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
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;

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
        grid-template-columns: minmax(0, 1fr);
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      .agent-main--with-sessions {
        grid-template-columns: 280px minmax(0, 1fr);
      }

      .agent-main--with-plan {
        grid-template-columns: minmax(0, 1fr) 320px;
      }

      .agent-main--with-sessions.agent-main--with-plan {
        grid-template-columns: 280px minmax(0, 1fr) 320px;
      }

      .agent-main--with-expanded-panel {
        grid-template-columns: minmax(0, 1fr) clamp(400px, 45vw, 700px);
      }

      .agent-main--with-sessions.agent-main--with-expanded-panel {
        grid-template-columns: 280px minmax(0, 1fr) clamp(400px, 45vw, 700px);
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

      .agent-rail-column {
        border-right: 1px solid var(--agent-border);
      }

      .agent-column-header {
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        border-bottom: 1px solid var(--agent-border);
      }

      .agent-column-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .rail-close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--agent-text-muted);
        cursor: pointer;
        transition:
          background 0.15s,
          color 0.15s;
        flex-shrink: 0;
      }

      .rail-close-btn:hover {
        background: var(--agent-surface-hover);
        color: var(--agent-text-primary);
      }

      .expanded-panel__actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .new-session-button {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 12px;
        padding: 8px 12px;
        border-radius: var(--nxt1-radius-lg, 14px);
        border: 1px solid var(--agent-border);
        background: transparent;
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .new-session-button:hover {
        background: var(--agent-surface-hover);
        border-color: var(--agent-primary);
        color: var(--agent-primary);
      }

      .new-session-icon {
        flex-shrink: 0;
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
        padding: var(--nxt1-spacing-2, 8px);
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

      :host ::ng-deep .sessions-section .log-scroll {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      :host ::ng-deep .sessions-section .log-day-group {
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      :host ::ng-deep .sessions-section .log-entry {
        border-radius: var(--nxt1-radius-xl, 16px);
      }

      .agent-chat-column {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        max-width: 820px;
        margin: 0 auto;
        width: 100%;
      }

      /* ── Unified chat area (no border, fills the column) ── */
      .agent-chat-unified {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* ── Briefing block inside the chat stream ── */
      .chat-briefing {
        flex-shrink: 0;
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px);
        width: 100%;
        max-width: calc(100% - 48px);
        margin-left: auto;
        margin-right: auto;
        box-sizing: border-box;
      }

      .chat-briefing__greeting {
        font-size: 26px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        line-height: 1.25;
        letter-spacing: -0.02em;
      }

      .chat-briefing__content {
        margin-bottom: 0;
      }

      .chat-briefing__preview {
        font-size: 14px;
        line-height: 1.55;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .chat-briefing__toggle {
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
        font-family: inherit;
      }

      .chat-briefing__toggle:hover {
        text-decoration: underline;
      }

      .chat-briefing__list {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        width: 100%;
      }

      .chat-briefing__item {
        position: relative;
        padding-left: var(--nxt1-spacing-4, 16px);
        font-size: 14px;
        line-height: 1.55;
        color: var(--agent-text-secondary);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .chat-briefing__item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 8px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--agent-primary);
      }

      :host ::ng-deep .agent-chat-unified nxt1-agent-x-operation-chat {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      /* Remove the embedded border/radius so it blends seamlessly */
      :host ::ng-deep .agent-chat-unified .agent-x-operation-chat--embedded,
      :host
        ::ng-deep
        .agent-chat-unified
        nxt1-agent-x-operation-chat.agent-x-operation-chat--embedded {
        border: none;
        border-radius: 0;
        background: transparent;
      }

      /* ── Header portal: center nav pills (centering from design-tokens .nxt1-header-portal__center) ── */
      .header-portal-center-nav {
        gap: 6px;
      }

      .header-nav-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 16px;
        appearance: none;
        -webkit-appearance: none;
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .header-nav-pill:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .header-nav-pill:active {
        transform: scale(0.98);
      }

      .header-nav-pill--active {
        background: var(--agent-primary-glow);
        border-color: var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--agent-primary);
      }

      .header-nav-pill-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--agent-primary, #ccff00);
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }

      /* ── Header portal: right-side icon buttons ── */
      .header-portal-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .header-icon-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        padding: 0;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.56));
        cursor: pointer;
        transition:
          background-color 0.15s,
          color 0.15s,
          transform 0.15s;
        appearance: none;
        -webkit-appearance: none;
        font-family: inherit;
      }

      .header-icon-btn:hover {
        background: var(--nxt1-nav-hover-bg, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .header-icon-btn:active {
        transform: scale(0.95);
      }

      /* Status dot button — fixed size, hint overlays to the left */
      .header-status-dot-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        padding: 0;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s;
        appearance: none;
        -webkit-appearance: none;
        font-family: inherit;
      }

      .header-status-dot-btn:hover {
        background: var(--nxt1-nav-hover-bg, rgba(255, 255, 255, 0.06));
      }

      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--agent-primary, #ccff00);
        box-shadow: 0 0 6px rgba(204, 255, 0, 0.5);
        transition:
          background 0.2s,
          box-shadow 0.2s;
        flex-shrink: 0;
      }

      .status-dot--degraded {
        background: rgb(245, 158, 11);
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
      }

      .status-dot--down {
        background: rgb(239, 68, 68);
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
      }

      /* ── Status hint label (overlays left of dot, no layout shift) ── */
      @keyframes status-hint-reveal {
        0% {
          opacity: 0;
          transform: translateY(-50%) translateX(4px);
        }
        10% {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }
        72% {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }
        100% {
          opacity: 0;
          transform: translateY(-50%) translateX(4px);
        }
      }

      .status-hint {
        position: absolute;
        right: calc(100% + 2px);
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--agent-primary, #ccff00);
        white-space: nowrap;
        opacity: 0;
        animation: status-hint-reveal 3.5s ease-out 0.6s forwards;
        pointer-events: none;
      }

      .status-hint--degraded {
        color: rgb(245, 158, 11);
      }

      .status-hint--down {
        color: rgb(239, 68, 68);
      }

      /* ── Action Plan Panel (right column in desktop grid) ── */
      @keyframes ap-slide-in {
        from {
          opacity: 0;
          transform: translateX(12px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .agent-action-plan-column {
        border-left: 1px solid var(--agent-border);
        background: var(--agent-bg);
        animation: ap-slide-in 0.22s ease;
      }

      /* ── Expanded Side Panel (Firecrawl Live View / Media) ── */
      .agent-expanded-panel-column {
        border-left: 1px solid var(--agent-border);
        background: var(--agent-bg);
        animation: ap-slide-in 0.22s ease;
      }

      .agent-expanded-panel-column .agent-column-header {
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
      }

      .expanded-panel__body {
        flex: 1;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
      }

      .expanded-panel__iframe {
        width: 100%;
        height: 100%;
        border: none;
        flex: 1;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .expanded-panel__iframe--visible {
        opacity: 1;
      }

      .expanded-panel__loader {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        z-index: 1;
      }

      .expanded-panel__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--agent-border);
        border-top-color: var(--nxt1-primary, #6366f1);
        border-radius: 50%;
        animation: ep-spin 0.7s linear infinite;
      }

      @keyframes ep-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .expanded-panel__loader-text {
        font-size: 13px;
        color: var(--agent-text-muted);
      }

      .expanded-panel__media {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-4, 16px);
        overflow: auto;
      }

      .expanded-panel__img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
      }

      .expanded-panel__video {
        max-width: 100%;
        max-height: 100%;
        border-radius: 8px;
      }

      .expanded-panel__doc {
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-muted);
      }

      .expanded-panel__doc-icon {
        opacity: 0.5;
      }

      .expanded-panel__doc-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--agent-text-primary);
        margin: 0;
        text-align: center;
        word-break: break-word;
      }

      .expanded-panel__doc-open {
        font-size: 13px;
        color: var(--nxt1-primary, #6366f1);
        text-decoration: none;
        font-weight: 500;
      }

      .expanded-panel__doc-open:hover {
        text-decoration: underline;
      }

      .action-plan-panel__header {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        border-bottom: 1px solid var(--agent-border);
        flex-shrink: 0;
      }

      .action-plan-panel__header-top {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .action-plan-panel__title {
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0;
        flex: 1;
      }

      .action-plan-panel__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--agent-text-muted);
        cursor: pointer;
        transition:
          background 0.15s,
          color 0.15s;
        flex-shrink: 0;
      }

      .action-plan-panel__close:hover {
        background: var(--agent-surface-hover);
        color: var(--agent-text-primary);
      }

      .action-plan-panel__body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* ── Manage Goals Section ── */
      .inline-goals {
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-5, 20px);
        border-bottom: 1px solid var(--agent-border);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .inline-goals__manage-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        flex: 1;
        background: none;
        border: 1px solid var(--agent-border);
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-secondary);
        cursor: pointer;
        transition:
          border-color 0.15s,
          color 0.15s;
      }

      .inline-goals__manage-btn:hover {
        border-color: var(--nxt1-color-primary);
        color: var(--agent-text-primary);
      }

      .inline-goals__manage-count {
        margin-left: auto;
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary6, rgba(59, 130, 246, 0.06));
        border-radius: var(--nxt1-borderRadius-full, 999px);
        padding: 2px 8px;
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
        color: var(--nxt1-color-feedback-success, #4caf50);
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
        color: var(--nxt1-color-feedback-success, #4caf50);
        background: var(--nxt1-color-feedback-successBg, rgba(76, 175, 80, 0.12));
      }

      .operation-status-badge--error {
        color: var(--nxt1-color-feedback-error, #ef4444);
        background: var(--nxt1-color-feedback-errorBg, rgba(239, 68, 68, 0.12));
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
        color: var(--nxt1-color-feedback-warning, #f59e0b);
        border-color: var(--nxt1-color-feedback-warningBg, rgba(245, 158, 11, 0.24));
        background: var(--nxt1-color-feedback-warningBg, rgba(245, 158, 11, 0.12));
      }

      .header-badge.status-badge.status-badge--down {
        color: var(--nxt1-color-feedback-error, #ef4444);
        border-color: var(--nxt1-color-feedback-errorBg, rgba(239, 68, 68, 0.24));
        background: var(--nxt1-color-feedback-errorBg, rgba(239, 68, 68, 0.12));
      }

      .header-badge.budget-badge {
        color: var(--agent-text-primary);
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
        background: var(--nxt1-color-feedback-warning, #f59e0b);
      }

      .pulse-dot--down {
        background: var(--nxt1-color-feedback-error, #ef4444);
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
        justify-content: flex-start;
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

      /* ── Category Pill Filter (fixed bar above scroll) ── */
      .action-plan-pills-bar {
        flex-shrink: 0;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-5, 20px) 0;
        border-bottom: 1px solid var(--agent-border);
      }
      .category-pills {
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        padding-bottom: var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
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
        background: var(--agent-surface);
        color: var(--agent-text-primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        min-height: 32px;
        box-sizing: border-box;
      }
      .category-pill--active {
        background: var(--agent-primary);
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        border-color: var(--agent-primary);
        font-weight: 600;
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
        color: var(--nxt1-color-bg-primary, #0a0a0a);
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
        color: var(--nxt1-color-bg-primary, #0a0a0a);
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
          grid-template-columns: 260px minmax(0, 1fr);
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
        color: var(--nxt1-color-feedback-error, #ff3b30);
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
        color: var(--nxt1-color-feedback-error, #ff3b30);
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
        background: var(--nxt1-color-feedback-success, #34c759);
      }

      .m-operation-progress-bar--error {
        background: var(--nxt1-color-feedback-error, #ff3b30);
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
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly sanitizer = inject(DomSanitizer);

  // Portal template refs
  private readonly agentTitlePortal = viewChild<TemplateRef<unknown>>('agentTitlePortal');
  private readonly agentRightPortal = viewChild<TemplateRef<unknown>>('agentRightPortal');
  private readonly operationsLog = viewChild(AgentXOperationsLogComponent);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly destroyRef = inject(DestroyRef);
  private desktopSessionCounter = 0;

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    const centerTpl = this.agentTitlePortal();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.agentRightPortal();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);

    // Subscribe to real-time title updates — update the active desktop session
    // title when the backend auto-generates a concise thread title.
    this.operationEventService.titleUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        const current = this.activeDesktopSession();
        if (current && current.threadId === evt.threadId) {
          this.activeDesktopSession.set({ ...current, contextTitle: evt.title });
        }
      });
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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

  /** Whether the user has sent at least one message in the current desktop session. */
  protected readonly desktopChatActive = signal(false);

  /** Briefing shows only on the default agent-x-chat session before user sends a message. */
  protected readonly showDesktopBriefing = computed(() => {
    const session = this.activeDesktopSession();
    if (!session) return false;
    return (
      session.contextId === 'agent-x-chat' &&
      session.contextType === 'command' &&
      !this.desktopChatActive()
    );
  });

  /** Whether the action plan modal is visible (desktop). Starts open. */
  protected readonly showActionPlanModal = signal(true);

  // ── Expanded Side Panel (Firecrawl Live View / Media) ──────────────
  private static readonly FIRECRAWL_ALLOWED_ORIGINS = ['https://liveview.firecrawl.dev'];

  /** Currently-displayed expanded side panel content (replaces Action Plan when set). */
  protected readonly expandedSidePanel = signal<ExpandedSidePanelContent | null>(null);

  /** Whether the iframe inside the expanded panel is still loading. */
  protected readonly expandedPanelIframeLoading = signal(false);

  /** Sanitized iframe URL — only produced for `live-view` type with whitelisted origin. */
  protected readonly safeExpandedIframeUrl = computed<SafeResourceUrl | null>(() => {
    const panel = this.expandedSidePanel();
    if (!panel || panel.type !== 'live-view') return null;
    try {
      const parsed = new URL(panel.url);
      const allowed = AgentXShellWebComponent.FIRECRAWL_ALLOWED_ORIGINS.some(
        (origin) => parsed.origin === origin
      );
      if (!allowed) return null;
      return this.sanitizer.bypassSecurityTrustResourceUrl(panel.url);
    } catch {
      return null;
    }
  });

  /** Resolved panel title for the expanded side panel header. */
  protected readonly expandedPanelTitle = computed(() => {
    const panel = this.expandedSidePanel();
    if (!panel) return '';
    return panel.title || (panel.type === 'live-view' ? 'Live View' : 'Preview');
  });

  /** Whether the sessions rail column is visible (desktop). Starts open. */
  protected readonly showSessionsRail = signal(true);

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

    // React to agent-requested side panel (autoOpenPanel from backend)
    effect(() => {
      const panel = this.agentX.requestedSidePanel();
      if (!panel) return;

      this.agentX.clearRequestedSidePanel();

      this.openExpandedSidePanel({
        type: panel.type,
        url: panel.url,
        title: panel.title,
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
   * Handle "Set Your Goals" tap — opens goals modal.
   */
  protected onSetupGoals(): void {
    this.openControlPanel('goals');
  }

  protected async openControlPanel(panel: AgentXControlPanelKind, required = false): Promise<void> {
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
        ...(panel === 'goals' ? { initialGoals: goalIds } : {}),
      },
      size: panel === 'budget' ? 'xl' : panel === 'status' ? 'lg' : panel === 'goals' ? 'md' : 'lg',
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
   * Opens the shared Connected Accounts modal (same as /settings).
   */
  protected async openConnectedAccounts(): Promise<void> {
    const role = (this.user()?.role as OnboardingUserType) ?? null;
    await this.connectedAccountsModal.open({
      role,
      scope: 'athlete',
    });
  }

  /**
   * Handle weekly playbook action tap.
   * If the dashboard is loaded, dispatches a real background job via Agent X.
   * Otherwise falls back to chat message.
   */
  protected async onPlaybookAction(task: WeeklyPlaybookItem): Promise<void> {
    if (task.id === 'goal-setup') {
      this.onSetupGoals();
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
   * Start a fresh default chat session (desktop "+" button).
   */
  protected onNewSession(): void {
    this.resetToDefaultDesktopSession();
  }

  /**
   * Handle first user message sent in a session — mark chat active.
   */
  protected onUserMessageSent(): void {
    this.desktopChatActive.set(true);
  }

  /**
   * Handle chat response complete — refresh the operations log so the
   * new session/thread appears in the sidebar.
   */
  protected onResponseComplete(): void {
    this.operationsLog()?.refresh();
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
   * Handle session history entry tap (desktop) — open in right-side chat column.
   */
  protected onLogEntryTap(entry: OperationLogEntry): void {
    this.setDesktopSession({
      contextId: entry.id,
      contextTitle: entry.title,
      contextIcon: entry.icon,
      contextType: 'operation',
      threadId: entry.threadId ?? '',
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
    await this.openActionPlanModal();
  }

  /** Toggles the Sessions rail column (desktop). */
  protected async toggleSessionsRail(): Promise<void> {
    await this.haptics.impact('light');
    this.showSessionsRail.update((v) => !v);
  }

  /** Toggles the Action Plan right-column panel (desktop). */
  protected async toggleActionPlanPanel(): Promise<void> {
    await this.haptics.impact('light');
    this.showActionPlanModal.update((v) => !v);
  }

  /**
   * Opens the Action Plan panel (used programmatically, e.g. from onPlaybookAction).
   */
  protected async openActionPlanModal(): Promise<void> {
    await this.haptics.impact('light');
    this.showActionPlanModal.set(true);
  }

  /** Closes the Action Plan panel. */
  protected closeActionPlanModal(): void {
    this.showActionPlanModal.set(false);
  }

  // ── Expanded Side Panel methods ────────────────────────────────────

  /** Copies the expanded panel URL to clipboard */
  protected async copyExpandedPanelUrl(url: string): Promise<void> {
    await this.haptics.impact('light');
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Link copied to clipboard');
    } catch {
      this.toast.error('Failed to copy link');
    }
  }

  /** Refreshes the currently active live view IFRAME */
  protected async refreshExpandedPanel(): Promise<void> {
    await this.haptics.impact('light');
    const current = this.expandedSidePanel();
    if (!current) return;

    // Briefly clear the panel to force an iframe unmount/remount
    this.expandedSidePanel.set(null);
    setTimeout(() => {
      this.expandedSidePanel.set(current);
    }, 50);
  }

  /** Toggles native browser fullscreen mode for the expanded panel (for HDMI/Big Screens) */
  protected async toggleExpandedPanelFullscreen(): Promise<void> {
    await this.haptics.impact('light');
    try {
      if (!document.fullscreenElement) {
        const panel = document.querySelector('.agent-expanded-panel-column');
        if (panel && panel.requestFullscreen) {
          await panel.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      this.toast.error('Could not enter fullscreen mode');
    }
  }

  /** Downloads expanded panel content — direct download for files, print-to-PDF for live views. */
  protected async downloadExpandedPanelContent(panel: ExpandedSidePanelContent): Promise<void> {
    await this.haptics.impact('light');

    if (panel.type === 'live-view') {
      // For live views, use the browser's print dialog (Save as PDF)
      const iframe = document.querySelector('.expanded-panel__iframe') as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.print();
        } catch {
          window.open(panel.url, '_blank');
        }
      } else {
        window.open(panel.url, '_blank');
      }
      return;
    }

    // For images, videos, and documents — trigger a direct download
    try {
      const response = await fetch(panel.url);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = panel.title || 'download';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
      this.toast.success('Download started');
    } catch {
      // Fallback: open in new tab
      window.open(panel.url, '_blank');
    }
  }

  /**
   * Opens the expanded side panel with the given content.
   * Automatically hides the Action Plan while the expanded panel is active.
   */
  openExpandedSidePanel(content: ExpandedSidePanelContent): void {
    if (content.type === 'live-view') {
      this.expandedPanelIframeLoading.set(true);
    }
    this.expandedSidePanel.set(content);
  }

  /** Closes the expanded side panel and restores the Action Plan. */
  closeExpandedSidePanel(): void {
    this.expandedSidePanel.set(null);
    this.expandedPanelIframeLoading.set(false);
  }

  /** Dev toggle: opens a sample Firecrawl live view or closes the panel. */
  protected async toggleDevLiveView(): Promise<void> {
    await this.haptics.impact('light');
    if (this.expandedSidePanel()) {
      this.closeExpandedSidePanel();
    } else {
      this.openExpandedSidePanel({
        type: 'live-view',
        url: 'https://liveview.firecrawl.dev',
        title: 'Live View',
      });
    }
  }

  /** Called when the iframe inside the expanded panel finishes loading. */
  protected onExpandedIframeLoad(): void {
    this.expandedPanelIframeLoading.set(false);
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
      contextDescription: 'Use Coordinators to plan, create, and review work in one session.',
      quickActions: this.commandQuickActions(),
    });
  }

  private setDesktopSession(session: Omit<AgentXDesktopSession, 'mountKey'>): void {
    this.desktopSessionCounter += 1;
    // Only reset briefing state when going back to default chat
    if (session.contextId === 'agent-x-chat') {
      this.desktopChatActive.set(false);
      this.isBriefingExpanded.set(false);
    }
    this.activeDesktopSession.set({
      ...session,
      mountKey: this.desktopSessionCounter,
    });
  }
}
