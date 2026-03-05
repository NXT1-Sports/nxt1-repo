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
 * 2. Active Operations — Horizontal WIP task cards (conditional)
 * 3. Daily Briefing — Proactive AI insights card
 * 4. Weekly Playbook — Collapsible weekly timeline
 * 5. Quick Commands — Utility action pills
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
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtIconComponent } from '../../components/icon';
import { AgentXService } from '../agent-x.service';
import { AgentXChatComponent } from '../agent-x-chat.component';
import { AgentXInputComponent } from '../agent-x-input.component';
import { AgentXOperationsLogComponent } from '../agent-x-operations-log.component';
import { NxtToastService } from '../../services/toast/toast.service';
import type {
  ActiveOperation,
  ActionChip,
  BriefingInsight,
  WeeklyPlaybookItem,
} from '../agent-x-shell.component';

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
    AgentXChatComponent,
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
          aria-label="Activity log"
          (click)="onActivityLogClick()"
        >
          <nxt1-icon name="time" [size]="20" className="agent-history-icon" />
        </button>
      </nxt1-desktop-page-header>

      <!-- Content Area -->
      <div class="agent-content">
        <!-- ═══ 1. DAILY BRIEFING ═══ -->
        @if (agentX.isEmpty()) {
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
                  I've reviewed your latest data, including {{ briefingInsights().length }} new
                  updates to your profile and Scout Report.
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

            <!-- ═══ 2. QUICK COMMANDS ═══ -->
            <div class="chips-section" aria-label="Quick commands">
              <h3 class="section-title">Quick Commands</h3>
              <div class="chips-scroll">
                @for (chip of actionChips(); track chip.id) {
                  <button type="button" class="action-chip" (click)="onChipTap(chip)">
                    {{ chip.label }}
                  </button>
                }
              </div>
            </div>

            <!-- ═══ 3. DAILY OPERATIONS ═══ -->
            @if (activeOperations().length > 0) {
              <section class="operations-section" aria-label="Daily operations">
                <h3 class="section-title">Daily Operations</h3>
                <div class="operations-scroll">
                  @for (op of activeOperations(); track op.id) {
                    <div
                      class="operation-card"
                      [class.operation-card--complete]="op.status === 'complete'"
                      [class.operation-card--error]="op.status === 'error'"
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

            <!-- ═══ 4. WEEKLY PLAYBOOK ═══ -->
            @if (weeklyPlaybook().length > 0) {
              <section class="playbook-section" aria-label="Weekly playbook">
                <div class="playbook-section-header">
                  <div class="playbook-title-row">
                    <h3 class="section-title">Weekly Playbook</h3>
                    <span class="playbook-counter"
                      >{{ playbookCompletedCount() }}/{{ playbookTotalCount() }}</span
                    >
                  </div>
                  <button
                    type="button"
                    class="playbook-goal-pill"
                    (click)="onGoalTap()"
                    aria-label="Goals"
                  >
                    <nxt1-icon name="flag" [size]="12" />
                    <span class="playbook-goal-pill-text">Goals</span>
                  </button>
                </div>

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
              </section>
            }
          </section>
        }

        <!-- ═══ CHAT MESSAGES ═══ -->
        @if (!agentX.isEmpty()) {
          <nxt1-agent-x-chat [messages]="agentX.messages()" />
        }
      </div>
    </main>

    <!-- ═══ OPERATIONS LOG SLIDE-OVER PANEL ═══ -->
    @if (isOperationsLogOpen()) {
      <div class="log-overlay-backdrop" (click)="closeOperationsLog()" aria-hidden="true"></div>
      <aside class="log-overlay-panel" role="dialog" aria-label="Operations log">
        <nxt1-agent-x-operations-log (closePanel)="closeOperationsLog()" />
      </aside>
    }

    <!-- Shared Input Bar (fixed, outside main scroll) -->
    @if (!hideInput()) {
      <nxt1-agent-x-input
        [hasMessages]="!agentX.isEmpty()"
        [selectedTask]="agentX.selectedTask()"
        [isLoading]="agentX.isLoading()"
        [canSend]="agentX.canSend()"
        [userMessage]="agentX.getUserMessage()"
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

      .playbook-counter {
        font-size: 12px;
        font-weight: 600;
        color: var(--agent-text-muted);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .playbook-goal-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 16px;
        border: 1px solid color-mix(in srgb, var(--agent-primary) 45%, transparent);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--agent-primary) 12%, transparent);
        color: var(--agent-primary);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.2s ease,
          border-color 0.2s ease,
          opacity 0.15s ease;
      }

      .playbook-goal-pill:hover {
        background: color-mix(in srgb, var(--agent-primary) 18%, transparent);
      }

      .playbook-goal-pill:active {
        opacity: 0.9;
      }

      .playbook-goal-pill-text {
        line-height: 1;
      }

      .playbook-section-toggle {
        border: 1px solid var(--agent-border);
        background: var(--agent-surface);
        color: var(--agent-text-secondary);
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
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

      /* ──────────────────────────────────
         4. QUICK COMMANDS
         ────────────────────────────────── */
      .chips-section {
        width: 100%;
        max-width: 480px;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .chips-label {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--agent-text-muted);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
      }

      .chips-scroll {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
        margin-top: var(--nxt1-spacing-1, 4px);
      }

      .chips-scroll::-webkit-scrollbar {
        display: none;
      }

      .action-chip {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .action-chip:hover {
        background: var(--agent-surface-hover);
        border-color: var(--agent-primary);
        color: var(--agent-primary);
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

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an action chip is tapped. */
  readonly chipTap = output<ActionChip>();

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
  // MOCK DATA — Active Operations
  // ============================================

  /** Active background operations (mock). */
  protected readonly activeOperations = signal<ActiveOperation[]>([
    {
      id: 'op-1',
      label: 'Analyzing game film...',
      progress: 45,
      icon: 'play',
      status: 'processing',
    },
    {
      id: 'op-2',
      label: 'Drafting recruiter emails',
      progress: 80,
      icon: 'mail',
      status: 'processing',
    },
  ]);

  // ============================================
  // MOCK DATA — Daily Briefing Insights
  // ============================================

  /** Proactive insights from Agent X (mock). */
  protected readonly briefingInsights = signal<BriefingInsight[]>([
    {
      id: 'bi-1',
      text: 'Your Scout Report was updated with new metrics from your last synced game film.',
      icon: 'clipboard',
      type: 'success',
    },
    {
      id: 'bi-2',
      text: '3 college programs viewed your profile this week. Two are D-I schools.',
      icon: 'eye',
      type: 'info',
    },
    {
      id: 'bi-3',
      text: 'Your GPA data is 30 days old. Sync your academic portal to stay current.',
      icon: 'alertCircle',
      type: 'warning',
    },
  ]);

  // ============================================
  // WEEKLY PLAYBOOK (Timeline)
  // ============================================

  /** AI-generated weekly playbook timeline items. */
  protected readonly weeklyPlaybook = signal<WeeklyPlaybookItem[]>([
    {
      id: 'wp-1',
      weekLabel: 'Mon',
      title: 'Finalize Recruiting Storyline',
      summary: 'Align your profile, headline metrics, and highlight context for recruiters.',
      details:
        'Agent X prepared a recruiting narrative from your latest film, stats, and profile views. Confirm it so all outbound content stays consistent this week.',
      actionLabel: 'Review Draft',
      status: 'in-progress',
      goal: { id: 'goal-1', label: 'D1 Recruitment' },
    },
    {
      id: 'wp-2',
      weekLabel: 'Tue',
      title: 'Ship Recruiter Outreach Batch',
      summary: 'Send personalized messages to your top priority programs.',
      details:
        'Your draft set is ready with coach-specific personalization. Approve and send to trigger tracking for opens and replies in Activity.',
      actionLabel: 'Send Batch',
      status: 'pending',
      goal: { id: 'goal-1', label: 'D1 Recruitment' },
    },
    {
      id: 'wp-3',
      weekLabel: 'Wed',
      title: 'Publish Midweek Performance Post',
      summary: 'Share your latest clip + stat proof point to keep momentum.',
      details:
        'Agent X generated copy and media options optimized for engagement windows. Choose one and publish directly from Create Post.',
      actionLabel: 'Publish Post',
      status: 'pending',
      goal: { id: 'goal-2', label: 'Grow Brand' },
    },
    {
      id: 'wp-4',
      weekLabel: 'Thu',
      title: 'Refresh Compliance & Academics',
      summary: 'Keep GPA and transcript context current for eligibility confidence.',
      details:
        'Sync your academic portal and verify profile fields used in eligibility summaries. This reduces recruiter friction during evaluation.',
      actionLabel: 'Sync Academics',
      status: 'pending',
    },
    {
      id: 'wp-5',
      weekLabel: 'Fri',
      title: 'Weekly Review and Next-Week Setup',
      summary: "Close this week and auto-generate next week's top priorities.",
      details:
        'Agent X will summarize completed tasks, update progress signals, and propose next-week objectives tailored to engagement and recruiter activity.',
      actionLabel: 'Run Weekly Review',
      status: 'pending',
    },
  ]);

  /** Number of completed playbook tasks. */
  protected readonly playbookCompletedCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status === 'complete').length
  );

  /** Total number of playbook tasks. */
  protected readonly playbookTotalCount = computed(() => this.weeklyPlaybook().length);

  // ============================================
  // QUICK COMMANDS (Utility Pills)
  // ============================================

  /** Generic quick-access action pills. */
  protected readonly actionChips = signal<ActionChip[]>([
    { id: 'chip-scout', label: 'Review Scout Report', icon: 'clipboard' },
    { id: 'chip-email', label: 'Draft Recruiter Email', icon: 'mail' },
    { id: 'chip-camps', label: 'Find Camps Near Me', icon: 'search' },
    { id: 'chip-compare', label: 'Compare My Stats', icon: 'stats' },
  ]);

  constructor() {
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
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
   * Handle goal pill tap.
   */
  protected async onGoalTap(): Promise<void> {
    this.agentX.setUserMessage('Edit Goals');
    await this.agentX.sendMessage();
  }

  /**
   * Handle weekly playbook action tap.
   */
  protected async onPlaybookAction(task: WeeklyPlaybookItem): Promise<void> {
    this.agentX.setUserMessage(`${task.actionLabel}: ${task.title}`);
    await this.agentX.sendMessage();
  }

  /**
   * Handle action chip tap — fill the input or trigger a workflow.
   */
  protected onChipTap(chip: ActionChip): void {
    this.agentX.setUserMessage(chip.label);
    this.chipTap.emit(chip);
  }

  protected async onSendMessage(): Promise<void> {
    await this.agentX.sendMessage();
  }

  protected async onToggleTasks(): Promise<void> {
    this.toast.info('Task panel coming soon');
  }
}
