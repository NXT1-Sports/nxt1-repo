/**
 * @fileoverview Agent X Planner Card — Interactive Checklist
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders an interactive to-do list card inline in the Agent X chat timeline.
 * Each item can be checked off, and the component emits events for the parent
 * to relay back to the backend.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import type { AgentXPlannerItem, AgentXRichCard } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-planner-card',
  standalone: true,
  template: `
    <div class="planner-card">
      <div class="planner-card__header">
        <svg class="planner-card__icon" viewBox="0 0 20 20" fill="none">
          <rect
            x="3"
            y="3"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            d="M7 10L9 12L13 8"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="planner-card__title">{{ card().title }}</span>
        <span class="planner-card__progress">{{ doneCount() }}/{{ items().length }}</span>
      </div>

      <div class="planner-card__items">
        @for (item of items(); track item.id) {
          <button
            class="planner-item"
            [class.planner-item--done]="item.done"
            (click)="onToggle(item)"
          >
            <div class="planner-item__checkbox">
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
            </div>
            <span class="planner-item__label">{{ item.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .planner-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .planner-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .planner-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .planner-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .planner-card__progress {
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        font-variant-numeric: tabular-nums;
      }

      .planner-card__items {
        display: flex;
        flex-direction: column;
      }

      /* ── Individual item ── */

      .planner-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.15s ease;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .planner-item:not(:last-child) {
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.05));
      }

      .planner-item:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .planner-item:active {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .planner-item--done .planner-item__label {
        text-decoration: line-through;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .planner-item__checkbox {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .planner-item__checkbox svg {
        width: 16px;
        height: 16px;
      }

      .planner-item__label {
        flex: 1;
        font-size: 0.8125rem;
        line-height: 1.4;
        transition: color 0.2s ease;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXPlannerCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when a user toggles a checklist item. Sends the item ID. */
  readonly itemToggled = output<string>();

  /** Extract the items array from the planner payload. */
  protected readonly items = computed<readonly AgentXPlannerItem[]>(() => {
    const payload = this.card().payload;
    if ('items' in payload && Array.isArray(payload.items)) {
      return payload.items as readonly AgentXPlannerItem[];
    }
    return [];
  });

  /** Count how many items are done. */
  protected readonly doneCount = computed(() => this.items().filter((i) => i.done).length);

  protected onToggle(item: AgentXPlannerItem): void {
    this.itemToggled.emit(item.id);
  }
}
