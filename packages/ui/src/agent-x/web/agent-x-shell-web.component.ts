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
import { AgentXService } from '../agent-x.service';
import { AgentXDashboardSkeletonComponent } from '../agent-x-dashboard-skeleton.component';
import { AgentXInputComponent } from '../agent-x-input.component';
import { AgentXOperationsLogComponent } from '../agent-x-operations-log.component';
import { AgentXOperationChatComponent } from '../agent-x-operation-chat.component';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../components/bottom-sheet';
import { NxtToastService } from '../../services/toast/toast.service';
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
        @if (!agentX.dashboardLoading()) {
          <section class="briefing-section" aria-label="Daily briefing">
            <!-- AI Pulse Indicator -->
            <div class="briefing-status">
              <div class="pulse-ring"></div>
              <div class="pulse-dot"></div>
              <span class="status-label">Active</span>
            </div>

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

            <!-- ═══ 3. COORDINATORS (2×2 Grid) ═══ -->
            <section class="coordinators-section" aria-label="Coordinators">
              <h3 class="section-title">Coordinators</h3>
              <div class="coordinators-grid">
                @for (coord of commandCategories(); track coord.id) {
                  <button type="button" class="coordinator-card" (click)="onCoordinatorTap(coord)">
                    <div class="coordinator-card-icon">
                      <nxt1-icon [name]="coord.icon" [size]="18" />
                    </div>
                    <span class="coordinator-card-label">{{ coord.label }}</span>
                  </button>
                }
              </div>
            </section>

            <!-- ═══ 4. WEEKLY PLAYBOOK (Always Visible) ═══ -->
            <section class="playbook-section" aria-label="Weekly playbook">
              <div class="playbook-section-header">
                <div class="playbook-title-row">
                  <h3 class="section-title">Weekly Playbook</h3>
                  @if (agentX.hasGoals() && agentX.canRegenerate()) {
                    <button
                      type="button"
                      class="playbook-regen-btn"
                      [disabled]="agentX.playbookGenerating()"
                      (click)="onRegeneratePlaybook()"
                    >
                      @if (agentX.playbookGenerating()) {
                        <span class="regen-spinner"></span>
                        Generating...
                      } @else {
                        <nxt1-icon name="refresh" [size]="14" />
                        Regenerate
                      }
                    </button>
                  }
                </div>
              </div>

              <!-- Pill Tabs -->
              <div class="playbook-pills" role="tablist" aria-label="Playbook tabs">
                <button
                  type="button"
                  role="tab"
                  class="playbook-pill"
                  [class.playbook-pill--active]="playbookTab() === 'get-started'"
                  [attr.aria-selected]="playbookTab() === 'get-started'"
                  (click)="playbookTab.set('get-started')"
                >
                  @if (agentX.hasGoals()) {
                    My Playbook
                  } @else {
                    Get Started
                  }
                </button>
                <button
                  type="button"
                  role="tab"
                  class="playbook-pill"
                  [class.playbook-pill--active]="playbookTab() === 'create-goals'"
                  [attr.aria-selected]="playbookTab() === 'create-goals'"
                  (click)="playbookTab.set('create-goals')"
                >
                  @if (agentX.hasGoals()) {
                    My Goals
                  } @else {
                    Create Goals
                  }
                </button>
              </div>

              <!-- Tab Content: Get Started -->
              @if (playbookTab() === 'get-started') {
                <ol class="weekly-timeline">
                  @for (item of weeklyPlaybook(); track item.id; let isLast = $last) {
                    <li class="timeline-item">
                      <div class="timeline-rail" aria-hidden="true">
                        <span
                          class="timeline-marker"
                          [class.timeline-marker--pending]="item.status === 'pending'"
                          [class.timeline-marker--in-progress]="item.status === 'in-progress'"
                          [class.timeline-marker--complete]="item.status === 'complete'"
                          [class.timeline-marker--problem]="item.status === 'problem'"
                        >
                          @if (item.status === 'in-progress') {
                            <nxt1-icon name="play" [size]="10" />
                          } @else if (item.status === 'complete') {
                            <nxt1-icon name="checkmark" [size]="12" />
                          } @else if (item.status === 'problem') {
                            <nxt1-icon name="pause" [size]="10" />
                          } @else {
                            <span class="timeline-marker-dot"></span>
                          }
                        </span>
                        @if (!isLast) {
                          <span class="timeline-line"></span>
                        }
                      </div>

                      <article class="timeline-card">
                        <button
                          type="button"
                          class="timeline-toggle"
                          (click)="onPlaybookAction(item)"
                        >
                          <div class="timeline-toggle-top">
                            <h4 class="timeline-title">{{ item.title }}</h4>
                            @if (item.goal) {
                              <span class="timeline-goal-tag">{{ item.goal.label }}</span>
                            }
                          </div>
                        </button>
                      </article>
                    </li>
                  }
                </ol>
              }

              <!-- Tab Content: Create Goals / My Goals -->
              @if (playbookTab() === 'create-goals') {
                <div class="playbook-create-goals">
                  @if (agentX.hasGoals()) {
                    <!-- Show existing goals -->
                    <ul class="goals-list">
                      @for (goal of agentX.goals(); track goal.id) {
                        <li class="goal-item">
                          <nxt1-icon
                            [name]="goal.icon ?? 'flag'"
                            [size]="18"
                            className="goal-icon"
                          />
                          <span class="goal-text">{{ goal.text }}</span>
                        </li>
                      }
                    </ul>
                    <button
                      type="button"
                      class="playbook-setup-btn playbook-setup-btn--secondary"
                      (click)="onSetupGoals()"
                    >
                      <nxt1-icon name="create" [size]="16" />
                      Update Goals
                    </button>
                  } @else {
                    <div class="playbook-empty">
                      <div class="playbook-empty-icon">
                        <nxt1-icon name="flag" [size]="24" />
                      </div>
                      <h4 class="playbook-empty-title">Set Your Goals</h4>
                      <p class="playbook-empty-description">
                        Tell Agent X what you want to achieve this season and it will build a
                        personalized weekly playbook for you.
                      </p>
                      <button type="button" class="playbook-setup-btn" (click)="onSetupGoals()">
                        <nxt1-icon name="plus" [size]="16" />
                        Create Goals
                      </button>
                    </div>
                  }
                </div>
              }
            </section>

            <!-- ═══ 4. DAILY OPERATIONS (Conditional) ═══ -->
            @if (activeOperations().length > 0) {
              <section class="operations-section" aria-label="Daily operations">
                <h3 class="section-title">Daily Operations</h3>
                <div class="operations-scroll">
                  @for (op of activeOperations(); track op.id) {
                    <div
                      class="operation-card"
                      [class.operation-card--complete]="op.status === 'complete'"
                      [class.operation-card--error]="op.status === 'error'"
                      (click)="onOperationTap(op)"
                      role="button"
                      tabindex="0"
                      [attr.aria-label]="'View logs for ' + op.label"
                    >
                      <div class="operation-icon">
                        <nxt1-icon [name]="op.icon" [size]="16" />
                      </div>
                      <span class="operation-label">{{ op.label }}</span>
                      @if (op.status === 'processing') {
                        <div class="operation-progress">
                          <div class="operation-progress-bar" [style.width.%]="op.progress"></div>
                        </div>
                      } @else if (op.status === 'complete') {
                        <nxt1-icon name="checkCircle" [size]="14" className="operation-done" />
                      }
                    </div>
                  }
                </div>
              </section>
            }
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
        padding-bottom: calc(100px + env(safe-area-inset-bottom, 0));
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

      .briefing-status {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
        position: relative;
      }

      .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
      }

      .pulse-ring {
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: 1.5px solid var(--agent-primary);
        animation: pulse-expand 2s ease-out infinite;
      }

      @keyframes pulse-expand {
        0% {
          transform: translateY(-50%) scale(1);
          opacity: 0.8;
        }
        100% {
          transform: translateY(-50%) scale(3);
          opacity: 0;
        }
      }

      .status-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.03em;
        color: var(--agent-primary);
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
        color: var(--agent-text-muted);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
      }

      /* ──────────────────────────────────
         3. WEEKLY PLAYBOOK (Timeline)
         ────────────────────────────────── */
      .playbook-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .playbook-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .playbook-section-header .section-title {
        margin: 0;
        flex-shrink: 0;
      }

      .playbook-title-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        min-width: 0;
        flex: 1;
      }

      /* Playbook Pill Tabs */
      .playbook-pills {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .playbook-pill {
        display: inline-flex;
        align-items: center;
        padding: 6px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--agent-border);
        background: var(--agent-surface);
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }

      .playbook-pill:hover {
        background: var(--agent-surface-hover);
        border-color: var(--agent-text-muted);
      }

      .playbook-pill--active {
        background: var(--agent-primary);
        border-color: var(--agent-primary);
        color: #000;
      }

      .playbook-pill--active:hover {
        background: var(--agent-primary);
        border-color: var(--agent-primary);
        opacity: 0.9;
      }

      .playbook-create-goals {
        margin-top: var(--nxt1-spacing-1, 4px);
      }

      .weekly-timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .timeline-item {
        display: flex;
        align-items: stretch;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .timeline-rail {
        width: 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .timeline-marker {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        margin-top: 9px;
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
      }

      .timeline-marker-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
      }

      .timeline-marker--pending {
        border-color: color-mix(in srgb, var(--agent-primary) 40%, var(--agent-border));
      }

      .timeline-marker--in-progress {
        border-color: var(--agent-primary);
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
      }

      .timeline-marker--complete {
        border-color: var(--nxt1-color-success, #4caf50);
        background: color-mix(in srgb, var(--nxt1-color-success, #4caf50) 16%, transparent);
        color: var(--nxt1-color-success, #4caf50);
      }

      .timeline-marker--problem {
        border-color: var(--nxt1-color-warning, #ffb020);
        background: color-mix(in srgb, var(--nxt1-color-warning, #ffb020) 16%, transparent);
        color: var(--nxt1-color-warning, #ffb020);
      }

      .timeline-line {
        flex: 1;
        width: 1px;
        margin-top: 6px;
        background: var(--agent-border);
      }

      .timeline-card {
        flex: 1;
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        transition:
          border-color 0.2s ease,
          background 0.2s ease;
        overflow: hidden;
      }

      .timeline-item--expanded .timeline-card,
      .timeline-card:hover {
        background: var(--agent-surface-hover);
        border-color: var(--agent-primary);
      }

      .timeline-toggle {
        display: block;
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        border: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .timeline-toggle-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: 0;
      }

      .timeline-goal-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        background: var(--agent-primary-glow);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--agent-primary);
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .timeline-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--agent-text-primary);
        margin: 0;
        line-height: 1.3;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .timeline-summary {
        font-size: 13px;
        line-height: 1.4;
        color: var(--agent-text-secondary);
        margin: 0;
      }

      .timeline-details {
        border-top: 1px solid var(--agent-border);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
      }

      .timeline-details-text {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 13px;
        line-height: 1.45;
        color: var(--agent-text-secondary);
      }

      .timeline-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .timeline-status {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .timeline-status--pending {
        color: var(--agent-text-muted);
      }

      .timeline-status--in-progress {
        color: var(--agent-primary);
      }

      .timeline-status--complete {
        color: #4caf50;
      }

      .playbook-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: var(--agent-primary);
        color: #000;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }

      .playbook-action-btn:hover {
        opacity: 0.9;
      }

      /* Playbook Empty State ("Need a Game Plan") */
      .playbook-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px dashed color-mix(in srgb, var(--agent-primary) 35%, var(--agent-border));
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .playbook-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .playbook-empty-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
      }

      .playbook-empty-description {
        font-size: 13px;
        line-height: 1.45;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        max-width: 300px;
      }

      .playbook-setup-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 20px;
        background: var(--agent-primary);
        color: #000;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }

      .playbook-setup-btn:hover {
        opacity: 0.9;
      }

      .playbook-setup-btn--secondary {
        background: var(--agent-surface);
        color: var(--agent-text-primary);
        border: 1px solid var(--agent-border);
      }

      .playbook-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .playbook-regen-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--agent-text-secondary);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .playbook-regen-btn:hover:not(:disabled) {
        background: var(--agent-surface-hover);
        color: var(--agent-text-primary);
      }

      .playbook-regen-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .regen-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid var(--agent-border);
        border-top-color: var(--agent-text-secondary);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .goals-list {
        list-style: none;
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .goal-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .goal-icon {
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .goal-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--agent-text-primary);
      }

      /* ──────────────────────────────────
         2. COORDINATORS (2×2 Grid)
         ────────────────────────────────── */
      .coordinators-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .coordinators-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-3, 12px);
        margin-top: var(--nxt1-spacing-3, 12px);
      }

      .coordinator-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.1s ease;
      }

      .coordinator-card:hover {
        background: var(--agent-surface-hover);
        border-color: var(--agent-primary);
        transform: translateY(-1px);
      }

      .coordinator-card-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
      }

      .coordinator-card-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--agent-text-primary);
        text-align: center;
        line-height: 1.3;
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
  private readonly toast = inject(NxtToastService);
  private readonly bottomSheet = inject(NxtBottomSheetService);

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
   * Handle "Set Your Goals" tap — opens Agent X goal-setup flow.
   */
  protected async onSetupGoals(): Promise<void> {
    this.agentX.setUserMessage('Help me set my season goals');
    await this.agentX.sendMessage();
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

  /**
   * Handle coordinator card tap — open coordinator context.
   */
  protected onCoordinatorTap(coord: CommandCategory): void {
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
