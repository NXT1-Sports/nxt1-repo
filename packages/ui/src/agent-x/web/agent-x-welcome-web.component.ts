/**
 * @fileoverview Agent X Welcome Component — Web (Zero Ionic)
 * @module @nxt1/ui/agent-x/web
 * @version 1.0.0
 *
 * Web-optimized welcome screen with animated title and quick task grid.
 * Uses inline SVG icons instead of IonIcon for zero Ionic dependency.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXQuickTask } from '@nxt1/core';
import { ATHLETE_QUICK_TASKS, COACH_QUICK_TASKS, COLLEGE_QUICK_TASKS } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';

/** SVG path data keyed by ionicon name used in quick tasks */
const TASK_ICON_PATHS: Record<string, string> = {
  'school-outline':
    'M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zM18.82 9L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z',
  'person-outline':
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 7c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm6 5H6v-.99c.2-.72 3.3-2.01 6-2.01s5.8 1.29 6 2v1z',
  'mail-outline':
    'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  'stats-chart-outline': 'M3 3v18h18v-2H5V3H3zm4 12h2v-5H7v5zm4 0h2V7h-2v8zm4 0h2v-3h-2v3z',
  'search-outline':
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  'football-outline':
    'M2.2 6.36C4.56 3.97 8.13 2.64 12 2.64s7.44 1.33 9.8 3.72c.14.14.2.34.16.53-.96 4.89-4.44 8.81-9.05 10.2a.51.51 0 01-.32 0C7.98 15.7 4.5 11.78 3.54 6.89a.51.51 0 01.16-.53zM12 4.64c-3.34 0-6.43 1.1-8.5 3.06.94 4.18 3.97 7.52 7.96 8.8l.54.17.54-.17c3.99-1.28 7.02-4.62 7.96-8.8-2.07-1.96-5.16-3.06-8.5-3.06zm-2 4.5l1.5 1.5L10 12l-1.5-1.5L7 12l1.5 1.5L10 12l1.5 1.5L13 12l-1.5-1.5L13 9l-1.5-1.5L10 9 8.5 7.5z',
  'people-outline':
    'M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zm6 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-1.75c0-2.33-4.66-3.5-7-3.5zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z',
  'checkmark-circle-outline':
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8-1.41-1.42z',
};

@Component({
  selector: 'nxt1-agent-x-welcome-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="welcome-screen">
      <!-- Animated Welcome Heading -->
      <div class="welcome-header">
        <div class="ai-icon-container">
          <nxt1-icon name="bolt" [size]="48" class="ai-icon" />
        </div>
        <h1 class="welcome-title">{{ currentTitle() }}</h1>
        <p class="welcome-subtitle">Your AI-powered recruiting assistant</p>
      </div>

      <!-- Quick Actions Grid -->
      <div class="quick-actions-container">
        @if (showAthleteTasks()) {
          <div class="task-section">
            @if (isLoggedOut()) {
              <h3 class="section-title">For Athletes</h3>
            }
            <div class="task-grid">
              @for (task of athleteTasks; track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
                  <svg
                    class="task-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="24"
                    height="24"
                    aria-hidden="true"
                  >
                    <path [attr.d]="getIconPath(task.icon)" />
                  </svg>
                  <span class="task-title">{{ task.title }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (showCoachTasks()) {
          <div class="task-section">
            @if (isLoggedOut()) {
              <h3 class="section-title">For Coaches</h3>
            }
            <div class="task-grid">
              @for (task of coachTasks; track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
                  <svg
                    class="task-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="24"
                    height="24"
                    aria-hidden="true"
                  >
                    <path [attr.d]="getIconPath(task.icon)" />
                  </svg>
                  <span class="task-title">{{ task.title }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (showCollegeTasks()) {
          <div class="task-section">
            @if (isLoggedOut()) {
              <h3 class="section-title">For Colleges</h3>
            }
            <div class="task-grid">
              @for (task of collegeTasks; track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
                  <svg
                    class="task-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="24"
                    height="24"
                    aria-hidden="true"
                  >
                    <path [attr.d]="getIconPath(task.icon)" />
                  </svg>
                  <span class="task-title">{{ task.title }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         AGENT X WELCOME (WEB) — Design Token CSS
         Zero Ionic, SSR-safe
         ============================================ */

      .welcome-screen {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-top: var(--nxt1-spacing-8, 32px);
      }

      .welcome-header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-8, 32px);
      }

      .ai-icon-container {
        display: flex;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .ai-icon {
        color: var(--nxt1-color-primary, #ccff00);
        filter: drop-shadow(0 0 20px rgba(204, 255, 0, 0.3));
        animation: pulse 2s ease-in-out infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.05);
        }
      }

      .welcome-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl, 1.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        transition: opacity 0.3s ease;
        line-height: var(--nxt1-lineHeight-tight);
      }

      .welcome-subtitle {
        font-size: var(--nxt1-fontSize-base, 1rem);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      .quick-actions-container {
        flex: 1;
      }

      .task-section {
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .section-title {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        padding-left: var(--nxt1-spacing-1, 4px);
      }

      .task-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3, 12px);
      }

      @media (min-width: 600px) {
        .task-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .task-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition:
          background var(--nxt1-duration-fast, 150ms) ease,
          border-color var(--nxt1-duration-fast, 150ms) ease,
          transform var(--nxt1-duration-fast, 150ms) ease;
        min-height: 90px;
      }

      .task-card:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-primary, #ccff00);
        transform: translateY(-2px);
      }

      .task-card:active {
        transform: translateY(0) scale(0.98);
      }

      .task-icon {
        width: 24px;
        height: 24px;
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .task-title {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-primary);
        text-align: center;
        line-height: 1.3;
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-icon {
          animation: none;
        }

        .task-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXWelcomeWebComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly currentTitle = input.required<string>();
  readonly showAthleteTasks = input<boolean>(true);
  readonly showCoachTasks = input<boolean>(true);
  readonly showCollegeTasks = input<boolean>(true);
  readonly isLoggedOut = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly taskSelected = output<AgentXQuickTask>();

  // ============================================
  // TASKS (from core constants)
  // ============================================

  protected readonly athleteTasks = ATHLETE_QUICK_TASKS;
  protected readonly coachTasks = COACH_QUICK_TASKS;
  protected readonly collegeTasks = COLLEGE_QUICK_TASKS;

  // ============================================
  // HELPERS
  // ============================================

  /** Resolve ionicon name → SVG path data */
  protected getIconPath(icon: string): string {
    return TASK_ICON_PATHS[icon] ?? TASK_ICON_PATHS['search-outline'];
  }

  protected onTaskClick(task: AgentXQuickTask): void {
    this.taskSelected.emit(task);
  }
}
