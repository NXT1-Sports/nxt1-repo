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
              <div class="header-badge goals-badge">
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
              </div>
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

            <!-- ═══ 3. ACTION CARDS ═══ -->
            <section class="action-cards-section" aria-label="Action Cards">
              <h3 class="section-title">RECOMMENDED TODAY BASED ON YOUR GOALS AND PROFILE</h3>

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
                  <div class="card-actions">
                    <button type="button" class="action-btn primary-btn">Post highlight</button>
                    <button type="button" class="action-btn primary-btn">Send emails</button>
                    <button type="button" class="action-btn primary-btn">Update profile</button>
                  </div>
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

      /* ──────────────────────────────────
         3. ACTION CARDS
         ────────────────────────────────── */
      .action-cards-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .action-card {
        display: flex;
        align-items: flex-start;
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

      .action-card:hover {
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
        color: #2196f3;
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
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      /* Buttons */
      .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: var(--nxt1-spacing-3, 12px);
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
        transition: opacity 0.15s ease;
        border: none;
      }
      .action-btn:hover {
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
        box-shadow: var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.15s ease;
      }

      .floating-coordinator-pill:hover,
      .floating-coordinator-pill:active {
        border-color: var(--agent-primary);
        background: var(--agent-primary-glow);
        transform: translateY(-1px);
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
