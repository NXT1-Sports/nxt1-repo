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
 * 3. Coordinators — 2×2 grid of virtual staff cards (Recruiting, Media, Scout, Academics)
 * 4. Weekly Playbook — Always visible (with "Need a Game Plan" state if no goals)
 * 5. Daily Operations — Active background task cards (conditional)
 * 6. Chat Messages — Conversation history
 * 7. Input Bar — Fixed above footer (already exists)
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtIconComponent } from '../../components/icon';
import { NxtOverlayService } from '../../components/overlay';
import { AgentXService } from '../agent-x.service';
import { AgentXDashboardSkeletonComponent } from '../agent-x-dashboard-skeleton.component';
import { AgentXBriefingPanelComponent } from '../agent-x-briefing-panel.component';
import { AgentXInputComponent } from '../agent-x-input.component';
import { AgentXOperationsLogComponent } from '../agent-x-operations-log.component';
import {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from '../agent-x-operation-chat.component';
import {
  AgentXBriefingBadgeStateService,
  type AgentXBriefingPanelKind,
} from '../agent-x-briefing-badge-state.service';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../components/bottom-sheet';
import { NxtToastService } from '../../services/toast/toast.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import type { CommandCategory, WeeklyPlaybookItem } from '../agent-x-shell.component';
import { type ShellWeeklyPlaybookItem, type ShellActiveOperation } from '@nxt1/core/ai';

/**
 * User info for header display.
 */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
}

@Component({
  selector: 'nxt1-agent-x-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtDesktopPageHeaderComponent,
    NxtIconComponent,
    AgentXDashboardSkeletonComponent,
    AgentXInputComponent,
    AgentXOperationsLogComponent,
  ],
  template: `
    <main class="agent-main" role="main">
      <!-- Desktop Page Header -->
      <nxt1-desktop-page-header title="Agent X" subtitle="Your AI command center.">
        <button
          type="button"
          class="agent-history-action"
          aria-label="Agent Logs"
          (click)="onActivityLogClick()"
        >
          <nxt1-icon name="time" [size]="20" className="agent-history-icon" />
        </button>
      </nxt1-desktop-page-header>

      <!-- Content Area -->
      <div class="agent-content">
        @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
          <nxt1-agent-x-dashboard-skeleton />
        }

        <!-- ═══ 1. DAILY BRIEFING ═══ -->
        @if (agentX.dashboardLoaded()) {
          <section class="briefing-section" aria-label="Daily briefing">
            <!-- Greeting -->
            <h2 class="briefing-greeting">{{ greeting() }}</h2>

            <!-- Briefing Summary (Expandable) -->
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

            <!-- AI Pulse Indicator & Badges -->
            <div class="briefing-top-badges">
              <button
                type="button"
                class="header-badge status-badge"
                [class.status-badge--degraded]="agentStatusTone() === 'warning'"
                [class.status-badge--down]="agentStatusTone() === 'critical'"
                (click)="openBriefingPanel('status')"
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
                (click)="openBriefingPanel('budget')"
              >
                <nxt1-icon name="wallet" [size]="14"></nxt1-icon>
                <span>{{ agentBudgetBadgeLabel() }}</span>
              </button>
              <button type="button" class="header-badge goals-badge" (click)="onSetupGoals()">
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
              </button>
            </div>

            <!-- ═══ 2. DAILY OPERATIONS (Conditional) ═══ -->
            @if (activeOperations().length > 0) {
              <section class="operations-section" aria-label="Daily operations">
                <h3 class="section-title">Daily Operations</h3>
                <div class="operations-scroll">
                  @for (op of activeOperations(); track op.id) {
                    <button
                      protected
                      readonly
                      briefingBadges="inject(AgentXBriefingBadgeStateService);"
                      type="button"
                      class="operation-card"
                      [class.operation-card--processing]="op.status === 'processing'"
                      [class.operation-card--complete]="op.status === 'complete'"
                      [class.operation-card--error]="op.status === 'error'"
                      protected
                      readonly
                      agentStatusLabel="this.briefingBadges.statusLabel;"
                      protected
                      readonly
                      agentStatusTone="this.briefingBadges.statusTone;"
                      protected
                      readonly
                      agentBudgetBadgeLabel="this.briefingBadges.budgetBadgeLabel;"
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
              <div class="action-plan-header">
                <h3 class="section-title action-plan-title">Today's Action Plan</h3>
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
              </div>

              @if (hasPendingActionCards()) {
                @if (shouldRenderActionCard('post-game-package')) {
                  <div
                    class="action-card"
                    [class.action-card--exiting]="isActionCardExiting('post-game-package')"
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
                        <span class="coordinator-role">Media Coordinator</span>
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">
                        You scored 22 points last night. Want me to turn that into a post-game
                        graphic package?
                      </div>
                      <p class="card-description">
                        I can build the creative, write the caption, and queue it for approval.
                      </p>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn primary-btn"
                        (click)="
                          onActionCardExecute(
                            'post-game-package',
                            'post-game-package',
                            'Post-Game Package',
                            'image',
                            'Create a post-game graphic package from my 22-point performance last night.'
                          )
                        "
                      >
                        Build post-game package
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeActionCard('post-game-package')"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }

                @if (shouldRenderActionCard('warm-lead-follow-up')) {
                  <div
                    class="action-card"
                    [class.action-card--exiting]="isActionCardExiting('warm-lead-follow-up')"
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
                        <span class="coordinator-role">Recruiting Coordinator</span>
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">
                        Three coaches viewed your profile this week. Want me to draft the follow-up
                        outreach?
                      </div>
                      <p class="card-description">
                        I can prioritize the warmest leads and prep messages for approval.
                      </p>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn secondary-btn"
                        (click)="
                          onActionCardExecute(
                            'warm-lead-follow-up',
                            'warm-lead-follow-up',
                            'Warm Lead Follow-Up',
                            'mail',
                            'Draft follow-up outreach for the three coaches who viewed my profile this week.'
                          )
                        "
                      >
                        Draft follow-up outreach
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeActionCard('warm-lead-follow-up')"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }

                @if (shouldRenderActionCard('bundle-big-game-plan')) {
                  <div
                    class="action-card action-card--featured"
                    [class.action-card--exiting]="isActionCardExiting('bundle-big-game-plan')"
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
                        <span class="coordinator-role">Game Plan Coordinator</span>
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">
                        Big game detected. Want me to package the best next moves into one approval
                        flow?
                      </div>
                      <p class="card-description">
                        I can group the most important recruiting, media, and profile updates into
                        one run.
                      </p>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn secondary-btn"
                        (click)="onBundleCardExecute()"
                      >
                        Execute game plan
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeActionCard('bundle-big-game-plan')"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }

                @if (shouldRenderActionCard('momentum-outreach')) {
                  <div
                    class="action-card"
                    [class.action-card--exiting]="isActionCardExiting('momentum-outreach')"
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
                        <span class="coordinator-role">Growth Coordinator</span>
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">
                        Your exposure is up 32% this week. Want me to turn that momentum into
                        targeted outreach?
                      </div>
                      <p class="card-description">
                        I can choose the strongest angle and prepare the next set of messages.
                      </p>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn secondary-btn"
                        (click)="
                          onActionCardExecute(
                            'momentum-outreach',
                            'momentum-outreach',
                            'Momentum Outreach',
                            'trendingUp',
                            'Use my 32 percent exposure increase to build the next best outreach wave.'
                          )
                        "
                      >
                        Turn momentum into outreach
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeActionCard('momentum-outreach')"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }

                @if (shouldRenderActionCard('coach-shortlist')) {
                  <div
                    class="action-card"
                    [class.action-card--exiting]="isActionCardExiting('coach-shortlist')"
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
                        <span class="coordinator-role">Prospecting Coordinator</span>
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">
                        I found 18 matching coaches. Want me to shortlist the five best fits and
                        prep intros?
                      </div>
                      <p class="card-description">
                        I can rank them by fit, urgency, and likelihood to respond.
                      </p>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn secondary-btn"
                        (click)="
                          onActionCardExecute(
                            'coach-shortlist',
                            'coach-shortlist',
                            'Coach Shortlist',
                            'search',
                            'Shortlist the five best coach matches and prepare intro outreach for me.'
                          )
                        "
                      >
                        Shortlist best-fit coaches
                      </button>
                      <button
                        type="button"
                        class="action-btn snooze-btn"
                        (click)="onSnoozeActionCard('coach-shortlist')"
                      >
                        Snooze for now
                      </button>
                    </div>
                  </div>
                }
              } @else {
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
                    You are all caught up. Agent X is still monitoring for new opportunities you can
                    execute right now.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onReloadActionPlan()">
                    Load More Actions
                  </button>
                </div>
              }
            </section>
          </section>
        }
      </div>
    </main>

    <!-- ═══ OPERATIONS LOG SLIDE-OVER PANEL ═══ -->
    @if (isOperationsLogOpen()) {
      <div class="log-overlay-backdrop" (click)="closeOperationsLog()" aria-hidden="true"></div>
      <aside class="log-overlay-panel" role="dialog" aria-label="Agent Logs">
        <nxt1-agent-x-operations-log (closePanel)="closeOperationsLog()" />
      </aside>
    }

    <!-- Floating Coordinator Pills (fixed, above input) -->
    <section class="floating-coordinators" aria-label="Coordinators">
      <div class="floating-coordinators-scroll" role="list">
        @for (coord of commandCategories(); track coord.id) {
          <button
            type="button"
            role="listitem"
            class="floating-coordinator-pill"
            (click)="onCoordinatorTap(coord)"
          >
            {{ coord.label }}
          </button>
        }
      </div>
    </section>

    <!-- Shared Input Bar (fixed, outside main scroll) -->
    @if (!hideInput()) {
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
    }
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
        background: var(--agent-bg);
        min-height: 100%;
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        padding-bottom: 0;
      }

      .agent-content {
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 280px);
        padding-top: var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(180px + env(safe-area-inset-bottom, 0));
        max-width: 640px;
        margin: 0 auto;
      }

      /* ──────────────────────────────────
         1. ACTIVE OPERATIONS
         ────────────────────────────────── */
      .operations-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .operations-scroll {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scrollbar-width: none;
        padding-bottom: 2px;
      }

      .operations-scroll::-webkit-scrollbar {
        display: none;
      }

      .operation-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        flex-shrink: 0;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        max-width: 260px;
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
        font-weight: 500;
        color: var(--agent-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .operation-progress {
        width: 40px;
        height: 3px;
        background: var(--agent-border);
        border-radius: 2px;
        overflow: hidden;
        flex-shrink: 0;
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
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--agent-primary);
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

        .agent-content {
          padding-bottom: calc(240px + env(safe-area-inset-bottom, 0));
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
        padding: 0;
      }

      .floating-coordinators-scroll::-webkit-scrollbar {
        display: none;
      }

      .floating-coordinator-pill {
        flex-shrink: 0;
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 12px 16px;
        background: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
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

      .floating-coordinator-pill:hover {
        border-color: var(--agent-primary);
        background: var(--agent-primary-glow);
        transform: translateY(-1px);
      }

      .floating-coordinator-pill:active {
        border-color: var(--agent-primary);
        background: var(--agent-primary-glow);
        transform: scale(0.97);
      }

      /* ==============================
         RESPONSIVE
         ============================== */

      @media (max-width: 768px) {
        .agent-main {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: 0;
        }
      }

      /* ── Activity Log Button (Header) ── */
      .agent-history-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 0;
        background: var(--agent-surface);
        color: var(--agent-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .agent-history-action:hover {
        background: var(--agent-surface-hover);
        color: var(--agent-primary);
      }

      .agent-history-icon {
        display: block;
      }

      /* ── Operations Log Slide-Over Panel ── */
      .log-overlay-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 999;
        animation: log-fade-in 0.2s ease;
      }

      .log-overlay-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 420px;
        max-width: 100vw;
        background: var(--agent-bg, var(--nxt1-color-bg-primary, #0a0a0a));
        border-left: 1px solid var(--agent-border);
        z-index: 1000;
        animation: log-slide-in 0.25s ease;
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.2);
      }

      @keyframes log-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes log-slide-in {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }

      @media (max-width: 480px) {
        .log-overlay-panel {
          width: 100vw;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellWebComponent {
  protected readonly agentX = inject(AgentXService);
  protected readonly briefingBadges = inject(AgentXBriefingBadgeStateService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly toast = inject(NxtToastService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly haptics = inject(HapticsService);
  private static readonly ACTION_CARD_EXIT_MS = 220;
  private readonly actionCardIds = [
    'post-game-package',
    'warm-lead-follow-up',
    'bundle-big-game-plan',
    'momentum-outreach',
    'coach-shortlist',
  ] as const;

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

  /** Whether the operations log overlay panel is open. */
  protected readonly isOperationsLogOpen = signal(false);

  /** Active playbook tab. */
  protected readonly playbookTab = signal<'get-started' | 'create-goals'>('get-started');

  private readonly completedActionCardIds = signal<Set<string>>(new Set());
  private readonly snoozedActionCardIds = signal<Set<string>>(new Set());
  private readonly exitingActionCardIds = signal<Set<string>>(new Set());
  protected readonly actionPlanClearedCount = computed(
    () => this.completedActionCardIds().size + this.snoozedActionCardIds().size
  );
  protected readonly actionPlanCompletionLabel = computed(() => {
    const cleared = this.actionPlanClearedCount();
    const total = Number(this.actionCardIds.length);
    return `${cleared} of ${total} cleared today`;
  });
  protected readonly actionPlanProgressPercent = computed(() => {
    const total = Number(this.actionCardIds.length);
    if (total === 0) return 0;
    return Math.round((this.actionPlanClearedCount() / total) * 100);
  });
  protected readonly hasPendingActionCards = computed(
    () => this.actionPlanClearedCount() < this.actionCardIds.length
  );

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
  protected readonly agentStatusLabel = this.briefingBadges.statusLabel;
  protected readonly agentStatusTone = this.briefingBadges.statusTone;
  protected readonly agentBudgetBadgeLabel = this.briefingBadges.budgetBadgeLabel;

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

  // ============================================
  // COORDINATORS — Role-Aware Virtual Staff
  // ============================================

  /** Coordinator cards — live from service only. */
  protected readonly commandCategories = computed(() => this.agentX.coordinators());

  constructor() {
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
      this.agentX.loadDashboard();
    });

    // React to pending thread requests (push notifications, deep links, activity taps)
    effect(() => {
      const pending = this.agentX.pendingThread();
      if (!pending) return;

      this.agentX.clearPendingThread();

      void this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: pending.operationId ?? pending.threadId,
          contextTitle: pending.title,
          contextIcon: pending.icon ?? 'sparkles',
          contextType: 'operation',
          threadId: pending.threadId,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Open the operations log slide-over panel.
   */
  protected onActivityLogClick(): void {
    this.isOperationsLogOpen.set(true);
  }

  /**
   * Close the operations log slide-over panel.
   */
  protected closeOperationsLog(): void {
    this.isOperationsLogOpen.set(false);
  }

  /**
   * Handle "Set Your Goals" tap — opens the shared goals modal.
   */
  protected async onSetupGoals(): Promise<void> {
    await this.openBriefingPanel('goals');
  }

  protected async openBriefingPanel(panel: AgentXBriefingPanelKind): Promise<void> {
    this.briefingBadges.notePanelOpened(panel, 'modal');

    const ref = this.overlay.open<
      AgentXBriefingPanelComponent,
      { panel: AgentXBriefingPanelKind; saved?: boolean }
    >({
      component: AgentXBriefingPanelComponent,
      inputs: {
        panel,
        presentation: 'modal',
      },
      size: 'full',
      backdropDismiss: true,
      ariaLabel:
        panel === 'status'
          ? 'Agent status information'
          : panel === 'budget'
            ? 'Agent budget controls'
            : 'Agent goals manager',
      panelClass: 'agent-x-briefing-badge-modal',
    });

    await ref.closed;
  }

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
      quickActions,
      'Choose what Agent X should execute for this big-game moment.',
      'Bundle my best post-game actions into one approval flow.'
    );
  }

  protected async onBundleCardExecute(): Promise<void> {
    void this.resolveActionCard('bundle-big-game-plan', 'completed');
    await this.onBundleCardAction();
  }

  protected async onActionCardExecute(
    cardId: string,
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    initialMessage: string
  ): Promise<void> {
    void this.resolveActionCard(cardId, 'completed');
    await this.onActionCardTap(contextId, contextTitle, contextIcon, initialMessage);
  }

  protected shouldRenderActionCard(cardId: string): boolean {
    return !this.completedActionCardIds().has(cardId) && !this.snoozedActionCardIds().has(cardId);
  }

  protected isActionCardExiting(cardId: string): boolean {
    return this.exitingActionCardIds().has(cardId);
  }

  protected async onSnoozeActionCard(cardId: string): Promise<void> {
    await this.haptics.impact('light');
    await this.resolveActionCard(cardId, 'snoozed');
    this.toast.success('Task snoozed for now.');
  }

  protected onReloadActionPlan(): void {
    this.completedActionCardIds.set(new Set());
    this.snoozedActionCardIds.set(new Set());
    this.exitingActionCardIds.set(new Set());
    this.toast.success('Loaded more tasks for today.');
  }

  private markActionCardDone(cardId: string): void {
    this.completedActionCardIds.update((current) => {
      if (current.has(cardId)) return current;
      const next = new Set(current);
      next.add(cardId);
      return next;
    });
  }

  private markActionCardSnoozed(cardId: string): void {
    this.snoozedActionCardIds.update((current) => {
      if (current.has(cardId)) return current;
      const next = new Set(current);
      next.add(cardId);
      return next;
    });
  }

  private async resolveActionCard(
    cardId: string,
    resolution: 'completed' | 'snoozed'
  ): Promise<void> {
    if (!this.shouldRenderActionCard(cardId) || this.exitingActionCardIds().has(cardId)) {
      return;
    }

    this.exitingActionCardIds.update((current) => {
      const next = new Set(current);
      next.add(cardId);
      return next;
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, AgentXShellWebComponent.ACTION_CARD_EXIT_MS);
    });

    this.exitingActionCardIds.update((current) => {
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });

    if (resolution === 'completed') {
      this.markActionCardDone(cardId);
      return;
    }

    this.markActionCardSnoozed(cardId);
  }

  protected async onActionCardTap(
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    initialMessage: string
  ): Promise<void> {
    await this.haptics.impact('light');
    await this.openOperationChat(contextId, contextTitle, contextIcon, [], '', initialMessage);
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
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: op.id,
        contextTitle: op.label,
        contextIcon: op.icon,
        contextType: 'operation',
        // threadId drives loadThreadMessages() — shows the real worker logs.
        threadId: op.threadId ?? '',
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  private async openOperationChat(
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    quickActions: OperationQuickAction[] = [],
    contextDescription = '',
    initialMessage = ''
  ): Promise<void> {
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId,
        contextTitle,
        contextIcon,
        contextType: 'command',
        quickActions,
        contextDescription,
        initialMessage,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle coordinator card tap — open coordinator context.
   */
  protected onCoordinatorTap(coord: CommandCategory): void {
    void this.haptics.impact('light');
    this.agentX.setUserMessage(coord.label);
    this.coordinatorTap.emit(coord);
  }

  /**
   * Handle "Regenerate" playbook button.
   */
  protected async onRegeneratePlaybook(): Promise<void> {
    await this.agentX.generatePlaybook(true);
  }

  protected async onSendMessage(): Promise<void> {
    const message = this.agentX.getUserMessage().trim();
    if (!message) return;

    // Clear the shell input immediately
    this.agentX.setUserMessage('');
    this.agentX.clearTask();

    // Open a bottom sheet chat with the message
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

  protected async onToggleTasks(): Promise<void> {
    this.toast.info('Task panel coming soon');
  }
}
