/**
 * @fileoverview Agent X Task List Component
 * @module @nxt1/ui/agent-x/modes
 * @version 1.0.0
 *
 * Interactive task rows for Recruiting & Evaluation modes.
 * Each row shows icon, title, description, XP reward, time estimate,
 * priority indicators, social proof, and a CTA arrow.
 * Featured tasks get a highlighted accent.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXTaskItem } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'nxt1-agent-x-task-list',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="task-section" aria-label="Tasks">
      <div class="section-header">
        <div class="section-label">
          <nxt1-icon [name]="sectionIcon()" [size]="18" class="section-icon" />
          <h3 class="section-title">{{ sectionTitle() }}</h3>
        </div>
      </div>

      <div class="task-list">
        @for (task of tasks(); track task.id) {
          <button
            class="task-row"
            [class.task-row--featured]="task.featured"
            (click)="taskSelected.emit(task)"
          >
            <!-- Icon -->
            <div class="task-icon-wrap" [class.task-icon-wrap--glow]="task.featured">
              <nxt1-icon [name]="task.icon" [size]="24" class="task-icon" />
            </div>

            <!-- Main content -->
            <div class="task-body">
              <div class="task-title-row">
                <span class="task-title">{{ task.title }}</span>
                @if (task.priority === 'critical') {
                  <span class="priority-badge priority-badge--critical">
                    <nxt1-icon name="flame-outline" [size]="12" />
                    Hot
                  </span>
                } @else if (task.priority === 'high') {
                  <span class="priority-badge priority-badge--high">
                    <nxt1-icon name="arrow-up-outline" [size]="12" />
                    High
                  </span>
                }
              </div>
              <span class="task-desc">{{ task.description }}</span>
              <div class="task-meta">
                <span class="task-time">
                  <nxt1-icon name="time-outline" [size]="12" />
                  {{ task.estimatedTime }}
                </span>
                <span class="task-xp">+{{ task.xpReward }} XP</span>
                @if (task.socialProof) {
                  <span class="task-proof">{{ task.socialProof }}</span>
                }
              </div>
            </div>

            <!-- CTA arrow -->
            <div class="task-action">
              <nxt1-icon name="chevron-forward-outline" [size]="20" class="action-arrow" />
            </div>
          </button>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .task-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .section-header {
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .section-icon {
        color: var(--nxt1-color-text-secondary);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      /* Task list */
      .task-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      /* Task row */
      .task-row {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-xl, 16px);
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition:
          background var(--nxt1-duration-fast) var(--nxt1-easing-out),
          border-color var(--nxt1-duration-fast) var(--nxt1-easing-out),
          transform var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .task-row:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-primary);
        transform: translateX(2px);
      }

      .task-row:active {
        transform: scale(0.99);
      }

      .task-row--featured {
        border-color: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      /* Icon */
      .task-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;
      }

      .task-icon-wrap--glow {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .task-icon {
        color: var(--nxt1-color-primary);
      }

      /* Body */
      .task-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .task-title-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .task-title {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      /* Priority badges */
      .priority-badge {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 1px 6px;
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
      }

      .priority-badge--critical {
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.12);
      }

      .priority-badge--high {
        color: #f0b429;
        background: rgba(240, 180, 41, 0.12);
      }

      .task-desc {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* Meta row */
      .task-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
        margin-top: var(--nxt1-spacing-1);
      }

      .task-time {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        color: var(--nxt1-color-text-tertiary);
      }

      .task-xp {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      .task-proof {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        color: var(--nxt1-color-text-tertiary);
        font-style: italic;
      }

      /* CTA arrow */
      .task-action {
        display: flex;
        align-items: center;
        align-self: center;
        flex-shrink: 0;
      }

      .action-arrow {
        color: var(--nxt1-color-text-tertiary);
        transition: color var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .task-row:hover .action-arrow {
        color: var(--nxt1-color-primary);
      }

      @media (prefers-reduced-motion: reduce) {
        .task-row {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXTaskListComponent {
  /** Section heading. */
  readonly sectionTitle = input<string>('Ready to Go');

  /** Section icon name. */
  readonly sectionIcon = input<string>('rocket-outline');

  /** Tasks to display. */
  readonly tasks = input.required<readonly AgentXTaskItem[]>();

  /** Emitted when a task row is clicked. */
  readonly taskSelected = output<AgentXTaskItem>();
}
