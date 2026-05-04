import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { AgentXPlannerItem } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-operation-chat-execution-plan',
  standalone: true,
  template: `
    <details class="execution-plan-dock" [open]="expanded" (toggle)="onToggle($event)">
      <summary class="execution-plan-dock__summary">
        <span class="execution-plan-dock__title">{{ title }}</span>
        <span class="execution-plan-dock__progress">{{ doneCount }}/{{ totalCount }}</span>
        <svg class="execution-plan-dock__chevron" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </summary>

      <div class="execution-plan-dock__body">
        <div class="execution-plan-dock__items">
          @for (item of items; track item.id) {
            <div
              class="execution-plan-dock__item"
              [class.execution-plan-dock__item--done]="item.done"
              [class.execution-plan-dock__item--active]="item.active && !item.done && !paused"
              [class.execution-plan-dock__item--failed]="item.status === 'failed'"
              [class.execution-plan-dock__item--blocked]="item.status === 'blocked'"
              [class.execution-plan-dock__item--awaiting]="item.status === 'awaiting_tool_approval'"
            >
              <span class="execution-plan-dock__item-check" aria-hidden="true">
                @if (item.done) {
                  <svg viewBox="0 0 16 16" fill="none">
                    <rect
                      x="1"
                      y="1"
                      width="14"
                      height="14"
                      rx="3"
                      fill="var(--nxt1-color-primary, #ccff00)"
                    />
                    <path
                      d="M4.5 8L7 10.5L11.5 5.5"
                      stroke="var(--nxt1-color-text-onPrimary, #0a0a0a)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                } @else if (item.active && !paused) {
                  <svg class="execution-plan-dock__item-spinner" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="var(--op-border)" stroke-width="1.2" />
                    <path
                      d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
                      stroke="var(--nxt1-color-primary, #ccff00)"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                  </svg>
                } @else {
                  <svg viewBox="0 0 16 16" fill="none">
                    <rect
                      x="1.5"
                      y="1.5"
                      width="13"
                      height="13"
                      rx="2.5"
                      stroke="currentColor"
                      stroke-width="1"
                    />
                  </svg>
                }
              </span>
              <span class="execution-plan-dock__item-copy">
                <span class="execution-plan-dock__item-label">{{ item.label }}</span>
                @if (item.note) {
                  <span class="execution-plan-dock__item-note">{{ item.note }}</span>
                }
              </span>
            </div>
          }
        </div>
      </div>
    </details>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .execution-plan-dock {
        margin: 0 18px 4px;
        border: 1px solid var(--op-border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--op-surface) 86%, transparent);
        overflow: hidden;
      }

      .execution-plan-dock__summary {
        list-style: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid transparent;
      }

      .execution-plan-dock__summary::-webkit-details-marker,
      .execution-plan-dock__summary::marker {
        display: none;
        content: '';
      }

      .execution-plan-dock[open] .execution-plan-dock__summary {
        border-bottom-color: var(--op-border);
      }

      .execution-plan-dock__title {
        flex: 1;
        min-width: 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--op-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .execution-plan-dock__progress {
        font-size: 0.74rem;
        color: var(--op-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .execution-plan-dock__chevron {
        width: 14px;
        height: 14px;
        color: var(--op-text-muted);
        transition: transform 0.2s ease;
      }

      .execution-plan-dock[open] .execution-plan-dock__chevron {
        transform: rotate(90deg);
      }

      .execution-plan-dock__body {
        padding: 8px 10px 10px;
      }

      .execution-plan-dock__items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .execution-plan-dock__item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--op-text-secondary);
      }

      .execution-plan-dock__item--done .execution-plan-dock__item-label {
        text-decoration: line-through;
        color: var(--op-text-muted);
      }

      .execution-plan-dock__item--active .execution-plan-dock__item-label {
        color: var(--op-text);
        font-weight: 500;
      }

      .execution-plan-dock__item--failed .execution-plan-dock__item-note,
      .execution-plan-dock__item--blocked .execution-plan-dock__item-note {
        color: #ff8f8f;
      }

      .execution-plan-dock__item--awaiting .execution-plan-dock__item-note {
        color: #ffd27a;
      }

      .execution-plan-dock__item-check {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--op-text-muted);
      }

      .execution-plan-dock__item-check svg {
        width: 16px;
        height: 16px;
      }

      .execution-plan-dock__item-spinner {
        animation: nxt1-plan-spin 0.9s linear infinite;
        transform-origin: center;
      }

      @keyframes nxt1-plan-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .execution-plan-dock__item-label {
        font-size: 0.76rem;
        line-height: 1.45;
      }

      .execution-plan-dock__item-copy {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
      }

      .execution-plan-dock__item-note {
        font-size: 0.72rem;
        line-height: 1.35;
        color: var(--op-text-muted);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatExecutionPlanComponent {
  @Input() title = '';
  @Input() items: readonly AgentXPlannerItem[] = [];
  @Input() paused = false;
  @Input() expanded = true;
  @Output() readonly expandedChange = new EventEmitter<boolean>();

  protected get totalCount(): number {
    return this.items.length;
  }

  protected get doneCount(): number {
    return this.items.filter((item) => Boolean(item?.done)).length;
  }

  protected onToggle(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement | null;
    this.expandedChange.emit(Boolean(details?.open));
  }
}
