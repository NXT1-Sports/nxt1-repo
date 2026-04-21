/**
 * @fileoverview Agent X Ask-User Card — Inline Question from Agent X
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a question card inline in the Agent X chat timeline.
 * The user types a reply in the embedded input and submits it,
 * which sends a follow-up message in the same thread so the agent
 * can continue naturally.  No special resume route is needed —
 * thread history IS the resume state (VS Code Copilot pattern).
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import type { AgentXRichCard, AgentXAskUserPayload } from '@nxt1/core/ai';

/** Event emitted when the user submits their reply to an ask_user card. */
export interface AskUserReplyEvent {
  /** The user's typed answer. */
  readonly answer: string;
  /** Thread ID to route the reply to the correct conversation. */
  readonly threadId?: string;
}

@Component({
  selector: 'nxt1-agent-x-ask-user-card',
  standalone: true,
  template: `
    <div class="ask-card" [class.ask-card--answered]="answered()">
      <!-- Header -->
      <div class="ask-card__header">
        <svg class="ask-card__icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M7.5 7.5C7.5 6.12 8.62 5 10 5s2.5 1.12 2.5 2.5c0 1.5-1.5 2-1.5 3"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="10" cy="14.5" r="1" fill="currentColor" />
        </svg>
        <span class="ask-card__title">{{ card().title }}</span>
      </div>

      <!-- Question body -->
      <p class="ask-card__question">{{ question() }}</p>

      @if (context()) {
        <p class="ask-card__context">{{ context() }}</p>
      }

      <!-- Answer area (hidden once answered) -->
      @if (!answered()) {
        <div class="ask-card__input-row">
          <textarea
            class="ask-card__textarea"
            [placeholder]="'Type your answer…'"
            [value]="draft()"
            (input)="onInput($event)"
            (keydown.enter)="onEnter($event)"
            rows="2"
          ></textarea>
          <button
            class="ask-card__send-btn"
            [disabled]="!canSubmit()"
            (click)="onSubmit()"
            aria-label="Send reply"
          >
            <svg viewBox="0 0 20 20" fill="none" class="ask-card__send-icon">
              <path
                d="M3 10L17 10M17 10L11 4M17 10L11 16"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      } @else {
        <div class="ask-card__answered-badge">
          <svg viewBox="0 0 16 16" fill="none" class="ask-card__check-icon">
            <path
              d="M3 8L6.5 11.5L13 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>Answered</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ask-card {
        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .ask-card--answered {
        border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        opacity: 0.75;
      }

      .ask-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-primary-subtle, rgba(204, 255, 0, 0.06));
        border-bottom: 1px solid var(--nxt1-color-primary, rgba(204, 255, 0, 0.2));
      }

      .ask-card--answered .ask-card__header {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .ask-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .ask-card--answered .ask-card__icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .ask-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .ask-card__question {
        padding: 12px 12px 6px;
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.55;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .ask-card__context {
        padding: 0 12px 8px;
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        font-style: italic;
      }

      .ask-card__input-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 8px 10px 10px;
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .ask-card__textarea {
        flex: 1;
        padding: 8px 10px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.07));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.12));
        border-radius: 8px;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 0.8125rem;
        line-height: 1.45;
        resize: none;
        outline: none;
        font-family: inherit;
        transition: border-color 0.15s ease;
      }

      .ask-card__textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
      }

      .ask-card__textarea:focus {
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .ask-card__send-btn {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: none;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
      }

      .ask-card__send-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .ask-card__send-btn:not(:disabled):hover {
        opacity: 0.9;
      }

      .ask-card__send-btn:not(:disabled):active {
        transform: scale(0.93);
      }

      .ask-card__send-icon {
        width: 16px;
        height: 16px;
      }

      .ask-card__answered-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        font-size: 0.8125rem;
        color: var(--nxt1-color-success, #22c55e);
      }

      .ask-card__check-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXAskUserCardComponent {
  /** The rich card data from the SSE stream. */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user submits a reply. */
  readonly replySubmitted = output<AskUserReplyEvent>();

  /** Current textarea draft value. */
  protected readonly draft = signal('');

  /** True once the user has submitted — locks the card. */
  protected readonly answered = signal(false);

  protected readonly canSubmit = computed(() => this.draft().trim().length > 0);

  protected get question(): () => string {
    return () => (this.card().payload as AgentXAskUserPayload).question ?? '';
  }

  protected get context(): () => string | undefined {
    return () => (this.card().payload as AgentXAskUserPayload).context;
  }

  protected get threadId(): string | undefined {
    return (this.card().payload as AgentXAskUserPayload).threadId;
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Submit on Enter (without Shift). */
  protected onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey && this.canSubmit()) {
      event.preventDefault();
      this.onSubmit();
    }
  }

  protected onSubmit(): void {
    const answer = this.draft().trim();
    if (!answer) return;

    this.answered.set(true);
    this.replySubmitted.emit({ answer, threadId: this.threadId });
  }
}
