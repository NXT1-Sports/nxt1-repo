import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';

export interface AgentXRecurringTaskDockItem {
  readonly taskKey: string;
  readonly title: string;
  readonly nextSendLabel: string;
}

@Component({
  selector: 'nxt1-agent-x-operation-chat-recurring-tasks-dock',
  standalone: true,
  template: `
    <details
      class="recurring-dock"
      [open]="expanded"
      [attr.data-testid]="testIds.RECURRING_DOCK"
      (toggle)="onToggle($event)"
    >
      <summary class="recurring-dock__summary">
        <span class="recurring-dock__title">Recurring Tasks</span>
        <span class="recurring-dock__count">{{ tasks.length }}</span>
        <svg class="recurring-dock__chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </summary>

      <div class="recurring-dock__body">
        @if (loading && tasks.length === 0) {
          <div class="recurring-dock__loading" role="status" aria-live="polite">
            <span class="recurring-dock__spinner" aria-hidden="true"></span>
            <span>Checking recurring tasks...</span>
          </div>
        } @else {
          @for (task of tasks; track task.taskKey) {
            <div class="recurring-dock__item" [attr.data-testid]="testIds.RECURRING_ITEM">
              <div class="recurring-dock__item-copy">
                <span class="recurring-dock__item-title">{{ task.title }}</span>
                <span
                  class="recurring-dock__item-next"
                  [attr.data-testid]="testIds.RECURRING_NEXT_SEND"
                >
                  {{ task.nextSendLabel }}
                </span>
              </div>

              <button
                type="button"
                class="recurring-dock__cancel"
                [disabled]="isCancelling(task.taskKey)"
                [attr.data-testid]="testIds.BTN_RECURRING_CANCEL"
                (click)="onCancel(task.taskKey, $event)"
              >
                @if (isCancelling(task.taskKey)) {
                  <span class="recurring-dock__spinner" aria-hidden="true"></span>
                  <span>Cancelling...</span>
                } @else {
                  <span>Cancel</span>
                }
              </button>
            </div>
          }
        }
      </div>
    </details>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .recurring-dock {
        margin: 0 18px 6px;
        border: 1px solid var(--op-border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--op-surface) 86%, transparent);
        overflow: hidden;
      }

      .recurring-dock__summary {
        list-style: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid transparent;
      }

      .recurring-dock__summary::-webkit-details-marker,
      .recurring-dock__summary::marker {
        display: none;
        content: '';
      }

      .recurring-dock[open] .recurring-dock__summary {
        border-bottom-color: var(--op-border);
      }

      .recurring-dock__title {
        flex: 1;
        min-width: 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--op-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .recurring-dock__count {
        min-width: 1.25rem;
        height: 1.25rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 45%, transparent);
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-variant-numeric: tabular-nums;
        padding: 0 6px;
      }

      .recurring-dock__chevron {
        width: 14px;
        height: 14px;
        color: var(--op-text-muted);
        transition: transform 0.2s ease;
      }

      .recurring-dock[open] .recurring-dock__chevron {
        transform: rotate(90deg);
      }

      .recurring-dock__body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
      }

      .recurring-dock__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: 1px solid var(--op-border);
        border-radius: 10px;
        padding: 8px 10px;
        background: color-mix(in srgb, var(--op-surface) 80%, transparent);
      }

      .recurring-dock__loading {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        color: #a882ff;
        font-size: 0.74rem;
        font-weight: 600;
        padding: 2px 0;
      }

      .recurring-dock__item-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .recurring-dock__item-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--op-text);
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .recurring-dock__item-next {
        font-size: 0.72rem;
        line-height: 1.35;
        color: var(--op-text-muted);
      }

      .recurring-dock__cancel {
        flex-shrink: 0;
        min-width: 88px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, #ff7b7b 45%, transparent);
        background: color-mix(in srgb, #ff7b7b 10%, transparent);
        color: #ffb2b2;
        font-size: 0.72rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
      }

      .recurring-dock__cancel:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .recurring-dock__spinner {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 1.5px solid color-mix(in srgb, #a882ff 30%, transparent);
        border-top-color: #a882ff;
        box-shadow: 0 0 10px color-mix(in srgb, #a882ff 22%, transparent);
        animation: recurring-dock-spin 0.9s linear infinite;
      }

      @keyframes recurring-dock-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatRecurringTasksDockComponent {
  @Input() tasks: readonly AgentXRecurringTaskDockItem[] = [];
  @Input() loading = false;
  @Input() cancellingTaskKeys: readonly string[] = [];
  @Input() expanded = false;

  @Output() readonly cancelTask = new EventEmitter<string>();
  @Output() readonly expandedChange = new EventEmitter<boolean>();

  protected readonly testIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

  protected isCancelling(taskKey: string): boolean {
    return this.cancellingTaskKeys.includes(taskKey);
  }

  protected onCancel(taskKey: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancelTask.emit(taskKey);
  }

  protected onToggle(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement | null;
    this.expandedChange.emit(Boolean(details?.open));
  }
}
