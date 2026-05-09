/**
 * @fileoverview Agent X Goal History Component
 * Displays the user's completed playbook task history.
 * Lazy-loaded via @defer — only fetches data when the panel is first opened.
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AgentXService } from '../../services/agent-x.service';
import { TEST_IDS } from '@nxt1/core/testing';

type CompletedTaskHistoryEntry = {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string;
  readonly category: string;
  readonly goalText: string;
};

/** Category icon map — mirrors AgentGoalCategory from core */
const CATEGORY_ICONS: Record<string, string> = {
  recruiting: '🔍',
  analytics: '📊',
  content: '🎨',
  communication: '✉️',
  scouting: '👁',
  development: '💪',
};

@Component({
  selector: 'nxt1-agent-x-goal-history',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="goal-history-panel" [attr.data-testid]="testIds.HISTORY_CONTAINER">
      <div class="goal-history-header">
        <span class="goal-history-title">Task History</span>
        <span class="goal-history-count">{{ totalCompleted() }}</span>
      </div>

      @if (loading()) {
        <div class="goal-history-skeleton">
          @for (i of skeletonItems; track i) {
            <div class="goal-history-skeleton-row animate-pulse">
              <div class="skeleton-icon"></div>
              <div class="skeleton-text-block">
                <div class="skeleton-line-lg"></div>
                <div class="skeleton-line-sm"></div>
              </div>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="goal-history-error" [attr.data-testid]="testIds.HISTORY_ERROR">
          <span>Failed to load history</span>
          <button class="goal-history-retry-btn" (click)="reload()">Retry</button>
        </div>
      } @else if (isEmpty()) {
        <div class="goal-history-empty" [attr.data-testid]="testIds.HISTORY_EMPTY">
          <span class="goal-history-empty-icon">🎯</span>
          <p class="goal-history-empty-text">Completed tasks will appear here.</p>
        </div>
      } @else {
        <ul class="goal-history-list" role="list">
          @for (task of completedTasks(); track task.id) {
            <li class="goal-history-item" [attr.data-testid]="testIds.HISTORY_ITEM">
              <span class="goal-history-item-icon" aria-hidden="true">
                {{ categoryIcon(task.category) }}
              </span>
              <div class="goal-history-item-body">
                <span class="goal-history-item-text">{{ task.title }}</span>
                <div class="goal-history-item-meta">
                  <span class="goal-history-item-date">
                    {{ task.completedAt | date: 'MMM d, y' }}
                  </span>
                  <span
                    class="goal-history-item-days"
                    [attr.data-testid]="testIds.HISTORY_ITEM_DAYS"
                    [title]="'Completed for goal: ' + task.goalText"
                  >
                    {{ task.goalText }}
                  </span>
                </div>
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .goal-history-panel {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .goal-history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px 8px;
      }

      .goal-history-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-text-secondary, #9ca3af);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .goal-history-count {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-text-secondary, #9ca3af);
        background: var(--nxt1-surface-elevated, rgba(255, 255, 255, 0.06));
        border-radius: 12px;
        padding: 2px 8px;
      }

      .goal-history-list {
        list-style: none;
        margin: 0;
        padding: 0 8px 8px;
      }

      .goal-history-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 8px;
        border-radius: 10px;
        transition: background 0.15s ease;
      }

      .goal-history-item:hover {
        background: var(--nxt1-surface-elevated, rgba(255, 255, 255, 0.04));
      }

      .goal-history-item-icon {
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
        padding-top: 1px;
      }

      .goal-history-item-body {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .goal-history-item-text {
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-text-primary, #f9fafb);
        line-height: 1.4;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .goal-history-item-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .goal-history-item-date {
        font-size: 11px;
        color: var(--nxt1-text-tertiary, #6b7280);
      }

      .goal-history-item-days {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-accent-blue, #60a5fa);
        background: rgba(96, 165, 250, 0.12);
        border-radius: 6px;
        padding: 1px 5px;
        cursor: default;
        max-width: 100%;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /* Loading skeleton */
      .goal-history-skeleton {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 4px 8px 8px;
      }

      .goal-history-skeleton-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 8px;
        border-radius: 10px;
      }

      .skeleton-icon {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: var(--nxt1-skeleton, rgba(255, 255, 255, 0.08));
        flex-shrink: 0;
      }

      .skeleton-text-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
      }

      .skeleton-line-lg {
        height: 12px;
        width: 75%;
        border-radius: 4px;
        background: var(--nxt1-skeleton, rgba(255, 255, 255, 0.08));
      }

      .skeleton-line-sm {
        height: 10px;
        width: 45%;
        border-radius: 4px;
        background: var(--nxt1-skeleton, rgba(255, 255, 255, 0.05));
      }

      /* Empty / Error states */
      .goal-history-empty,
      .goal-history-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 24px 16px;
        text-align: center;
      }

      .goal-history-empty-icon {
        font-size: 28px;
      }

      .goal-history-empty-text {
        font-size: 13px;
        color: var(--nxt1-text-secondary, #9ca3af);
        margin: 0;
      }

      .goal-history-error {
        font-size: 13px;
        color: var(--nxt1-text-secondary, #9ca3af);
      }

      .goal-history-retry-btn {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-accent-blue, #60a5fa);
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
      }
    `,
  ],
})
export class AgentXGoalHistoryComponent implements OnInit {
  private readonly agentX = inject(AgentXService);

  protected readonly testIds = TEST_IDS.AGENT_X_GOALS;
  protected readonly skeletonItems = [1, 2, 3];

  protected readonly history = this.agentX.goalHistory;
  protected readonly loading = this.agentX.goalHistoryLoading;
  protected readonly error = this.agentX.goalHistoryError;
  protected readonly completedTasks = computed<CompletedTaskHistoryEntry[]>(() =>
    this.history()
      .flatMap((record) =>
        (record.completedItems ?? []).map((task) => ({
          id: `${record.goalId}:${task.id}:${task.completedAt}`,
          title: task.title,
          completedAt: String(task.completedAt),
          category: record.category,
          goalText: record.text,
        }))
      )
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
  );
  protected readonly totalCompleted = computed(() => this.completedTasks().length);
  protected readonly isEmpty = computed(
    () => this.completedTasks().length === 0 && !this.loading()
  );

  ngOnInit(): void {
    // Fetch on first open — if already loaded (non-empty history), skip
    if (this.history().length === 0 && !this.loading()) {
      this.agentX.loadGoalHistory();
    }
  }

  protected reload(): void {
    this.agentX.loadGoalHistory();
  }

  protected categoryIcon(category: string): string {
    return CATEGORY_ICONS[category] ?? '🎯';
  }
}
