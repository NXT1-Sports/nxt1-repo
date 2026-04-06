/**
 * @fileoverview Agent X Confirmation Card — Action Approval / Decision
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a confirmation dialog card inline in the Agent X chat timeline.
 * Surfaces a message and a set of action buttons (primary / secondary / destructive).
 * Emits the selected action ID so the parent can relay the choice to the backend.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import type {
  AgentXRichCard,
  AgentXConfirmationAction,
  AgentXConfirmationPayload,
} from '@nxt1/core/ai';

/** Event emitted when the user clicks a confirmation action. */
export interface ConfirmationActionEvent {
  /** The card title (for context). */
  readonly cardTitle: string;
  /** The selected action ID. */
  readonly actionId: string;
}

@Component({
  selector: 'nxt1-agent-x-confirmation-card',
  standalone: true,
  template: `
    <div class="confirm-card" [class.confirm-card--answered]="answered()">
      <div class="confirm-card__header">
        <svg class="confirm-card__icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
          <path d="M10 6V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="10" cy="14" r="1" fill="currentColor" />
        </svg>
        <span class="confirm-card__title">{{ card().title }}</span>
      </div>

      <p class="confirm-card__message">{{ message() }}</p>

      <div class="confirm-card__actions">
        @for (action of actions(); track action.id) {
          <button
            class="confirm-btn"
            [class.confirm-btn--primary]="action.variant === 'primary'"
            [class.confirm-btn--secondary]="action.variant === 'secondary'"
            [class.confirm-btn--destructive]="action.variant === 'destructive'"
            [class.confirm-btn--selected]="selectedId() === action.id"
            [disabled]="answered()"
            (click)="onAction(action)"
          >
            {{ action.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .confirm-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .confirm-card--answered {
        opacity: 0.7;
      }

      .confirm-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .confirm-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .confirm-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .confirm-card__message {
        padding: 12px;
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .confirm-card__actions {
        display: flex;
        gap: 8px;
        padding: 0 12px 12px;
        flex-wrap: wrap;
      }

      .confirm-btn {
        flex: 1 1 auto;
        min-width: 80px;
        padding: 8px 16px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.15));
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        background: transparent;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .confirm-btn:disabled {
        cursor: default;
      }

      .confirm-btn:not(:disabled):hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .confirm-btn:not(:disabled):active {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* Primary variant */
      .confirm-btn--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        border-color: transparent;
      }

      .confirm-btn--primary:not(:disabled):hover {
        background: var(--nxt1-color-primary-hover, #b8e600);
      }

      .confirm-btn--primary:not(:disabled):active {
        background: var(--nxt1-color-primary-active, #a3cc00);
      }

      /* Destructive variant */
      .confirm-btn--destructive {
        color: var(--nxt1-color-error, #ef4444);
        border-color: var(--nxt1-color-error, #ef4444);
      }

      .confirm-btn--destructive:not(:disabled):hover {
        background: rgba(239, 68, 68, 0.1);
      }

      .confirm-btn--destructive:not(:disabled):active {
        background: rgba(239, 68, 68, 0.2);
      }

      /* Selected state */
      .confirm-btn--selected {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 1px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXConfirmationCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user clicks an action button. */
  readonly actionSelected = output<ConfirmationActionEvent>();

  /** Track the selected action (one-time — disables buttons after choice). */
  protected readonly selectedId = signal<string | null>(null);

  /** Whether the user has already made a choice. */
  protected readonly answered = computed(() => this.selectedId() !== null);

  /** Extract the message from the confirmation payload. */
  protected readonly message = computed<string>(() => {
    const payload = this.card().payload as AgentXConfirmationPayload;
    return typeof payload?.message === 'string' ? payload.message : '';
  });

  /** Extract actions from the confirmation payload. */
  protected readonly actions = computed<readonly AgentXConfirmationAction[]>(() => {
    const payload = this.card().payload as AgentXConfirmationPayload;
    return Array.isArray(payload?.actions) ? payload.actions : [];
  });

  protected onAction(action: AgentXConfirmationAction): void {
    if (this.answered()) return;
    this.selectedId.set(action.id);
    this.actionSelected.emit({
      cardTitle: this.card().title,
      actionId: action.id,
    });
  }
}
