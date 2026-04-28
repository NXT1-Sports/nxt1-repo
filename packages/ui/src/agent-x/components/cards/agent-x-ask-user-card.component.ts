/**
 * @fileoverview Agent X Ask-User Card — Inline Question from Agent X
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a question card inline in the Agent X chat timeline.
 * The user types a reply in the embedded input and submits it,
 * which resumes the yielded operation using its operationId.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import type { AgentXRichCard, AgentXAskUserPayload } from '@nxt1/core/ai';
import { NxtIconComponent } from '../../../components/icon/icon.component';

/** Event emitted when the user submits their reply to an ask_user card. */
export interface AskUserReplyEvent {
  /** The user's typed answer. */
  readonly answer: string;
  /** Thread ID to route the reply to the correct conversation. */
  readonly threadId?: string;
  /** Yielded operation ID to resume deterministically on backend. */
  readonly operationId?: string;
}

@Component({
  selector: 'nxt1-agent-x-ask-user-card',
  standalone: true,
  imports: [NxtIconComponent],
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
        @if (questionCount() > 1) {
          <span class="ask-card__progress"
            >{{ currentQuestionNumber() }}/{{ questionCount() }}</span
          >
        }
      </div>

      <!-- Question body -->
      <p class="ask-card__question">{{ currentQuestion() }}</p>

      @if (context()) {
        <p class="ask-card__context">{{ context() }}</p>
      }

      <!-- Answer area (hidden once answered) -->
      @if (!answered()) {
        @if (questionCount() > 1) {
          <div class="ask-card__pagination">
            <button
              type="button"
              class="ask-card__nav-btn"
              [disabled]="!canGoBack()"
              (click)="onBack()"
              aria-label="Previous question"
            >
              <svg class="ask-card__nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M9.5 3L4.5 8L9.5 13"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Back
            </button>
            <span class="ask-card__pagination-label">Question {{ currentQuestionNumber() }}</span>
            <button
              type="button"
              class="ask-card__nav-btn"
              [disabled]="!canAdvance() || isLastQuestion()"
              (click)="onNext()"
              aria-label="Next question"
            >
              Next
              <svg class="ask-card__nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6.5 3L11.5 8L6.5 13"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        }

        <div class="ask-card__input-card">
          <textarea
            class="ask-card__textarea"
            [placeholder]="placeholder()"
            [value]="draft()"
            (input)="onInput($event)"
            (keydown.enter)="onEnter($event)"
            rows="2"
          ></textarea>

          <div class="ask-card__actions">
            <button
              type="button"
              class="ask-card__send-btn"
              [class.active]="canAdvance()"
              [disabled]="!canAdvance()"
              (click)="onAdvance()"
              [attr.aria-label]="isLastQuestion() ? 'Submit answers' : 'Save and continue'"
            >
              <nxt1-icon [name]="isLastQuestion() ? 'arrowUp' : 'arrowForward'" [size]="16" />
            </button>
          </div>
        </div>
      } @else {
        <div class="ask-card__answered">
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

          @if (submittedAnswer()) {
            <div class="ask-card__answer">
              <span class="ask-card__answer-label">Your response</span>
              <p class="ask-card__answer-text">{{ submittedAnswer() }}</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ask-card {
        --ask-input-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
        --ask-input-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
        --ask-input-text: var(--nxt1-color-text-primary, #ffffff);
        --ask-input-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --ask-input-primary: var(--nxt1-color-primary, #ccff00);
        --ask-input-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --ask-input-selection-bg: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));

        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      :host {
        display: block;
        width: 100%;
        max-width: 100%;
      }

      :host-context(.light),
      :host-context([data-theme='light']),
      :host-context([data-base-theme='light']) {
        .ask-card {
          --ask-input-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.04));
          --ask-input-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.09));
          --ask-input-text: var(--nxt1-color-text-primary, #1a1a1a);
          --ask-input-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }
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

      .ask-card__progress {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 55%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 14%, transparent);
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 0.72rem;
        font-weight: 700;
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

      .ask-card__pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px 6px;
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .ask-card__pagination-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
      }

      .ask-card__nav-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid var(--ask-input-border);
        background: var(--ask-input-surface);
        color: var(--ask-input-text);
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }

      .ask-card__nav-icon {
        width: 14px;
        height: 14px;
        flex: 0 0 14px;
      }

      .ask-card__nav-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .ask-card__input-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 8px 8px 12px;
        margin: 0 10px 10px;
        border: 1px solid var(--ask-input-border);
        border-radius: 22px;
        background: var(--ask-input-surface);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .ask-card__textarea {
        width: 100%;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 0;
        color: var(--ask-input-text);
        font-size: 0.95rem;
        line-height: 1.5;
        min-height: 30px;
        max-height: 140px;
        overflow-y: auto;
        resize: none;
        outline: none;
        font-family: inherit;
        caret-color: var(--ask-input-primary);
      }

      .ask-card__textarea::placeholder {
        color: var(--ask-input-muted);
      }

      .ask-card__textarea::selection {
        color: var(--ask-input-text);
        background: var(--ask-input-selection-bg);
      }

      .ask-card__actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      .ask-card__send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid var(--ask-input-border);
        background: color-mix(in srgb, var(--ask-input-surface) 90%, transparent);
        color: var(--ask-input-muted);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease,
          opacity 0.15s ease;
      }

      .ask-card__send-btn.active {
        background: var(--ask-input-primary-glow);
        color: var(--ask-input-primary);
        border-color: var(--ask-input-primary);
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15);
      }

      .ask-card__send-btn:disabled {
        opacity: 0.25;
        cursor: default;
      }

      .ask-card__answered-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px 0;
        font-size: 0.8125rem;
        color: var(--nxt1-color-success, #22c55e);
      }

      .ask-card__answered {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 12px;
      }

      .ask-card__answer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0 12px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--ask-input-surface);
        border: 1px solid var(--ask-input-border);
      }

      .ask-card__answer-label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        text-transform: uppercase;
      }

      .ask-card__answer-text {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.55;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: pre-wrap;
        word-break: break-word;
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

  /** Parsed one-at-a-time question list from the payload prompt body. */
  protected readonly questions = computed(() => this.extractQuestions(this.question()));

  /** Zero-based pointer to the active question. */
  protected readonly currentQuestionIndex = signal(0);

  /** Per-question answers for multi-step question prompts. */
  protected readonly answers = signal<string[]>([]);

  /** True once the user has submitted — locks the card. */
  protected readonly answered = signal(false);

  /** Snapshot of the submitted reply shown inline once the card is answered. */
  protected readonly submittedAnswer = signal('');

  protected readonly canAdvance = computed(() => this.draft().trim().length > 0);

  protected readonly canGoBack = computed(() => this.currentQuestionIndex() > 0);

  protected readonly isLastQuestion = computed(
    () => this.currentQuestionIndex() >= this.questionCount() - 1
  );

  protected readonly questionCount = computed(() => this.questions().length || 1);

  protected readonly currentQuestionNumber = computed(() => this.currentQuestionIndex() + 1);

  protected readonly currentQuestion = computed(() => {
    const qs = this.questions();
    if (qs.length === 0) return this.question();
    return qs[this.currentQuestionIndex()] ?? qs[0];
  });

  protected readonly placeholder = computed(() =>
    this.questionCount() > 1
      ? `Answer question ${this.currentQuestionNumber()}...`
      : 'Type your answer...'
  );

  protected get question(): () => string {
    return () => (this.card().payload as AgentXAskUserPayload).question ?? '';
  }

  protected get context(): () => string | undefined {
    return () => (this.card().payload as AgentXAskUserPayload).context;
  }

  protected get threadId(): string | undefined {
    return (this.card().payload as AgentXAskUserPayload).threadId;
  }

  protected get operationId(): string | undefined {
    return (this.card().payload as AgentXAskUserPayload).operationId;
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Submit on Enter (without Shift). */
  protected onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey && this.canAdvance()) {
      event.preventDefault();
      this.onAdvance();
    }
  }

  protected onBack(): void {
    if (!this.canGoBack()) return;
    this.persistDraftForCurrentQuestion();
    const nextIndex = this.currentQuestionIndex() - 1;
    this.currentQuestionIndex.set(nextIndex);
    this.draft.set(this.answers()[nextIndex] ?? '');
  }

  protected onNext(): void {
    if (!this.canAdvance() || this.isLastQuestion()) return;
    this.persistDraftForCurrentQuestion();
    const nextIndex = this.currentQuestionIndex() + 1;
    this.currentQuestionIndex.set(nextIndex);
    this.draft.set(this.answers()[nextIndex] ?? '');
  }

  protected onAdvance(): void {
    if (!this.canAdvance()) return;
    if (this.isLastQuestion()) {
      this.onSubmit();
      return;
    }
    this.onNext();
  }

  protected onSubmit(): void {
    this.persistDraftForCurrentQuestion();
    const answer = this.buildSubmission();
    if (!answer) return;

    this.submittedAnswer.set(answer);
    this.answered.set(true);
    this.replySubmitted.emit({
      answer,
      threadId: this.threadId,
      operationId: this.operationId,
    });
  }

  private persistDraftForCurrentQuestion(): void {
    const index = this.currentQuestionIndex();
    const allQuestions = this.questions();
    if (allQuestions.length <= 1) return;

    const next = [...this.answers()];
    while (next.length < allQuestions.length) {
      next.push('');
    }
    next[index] = this.draft().trim();
    this.answers.set(next);
  }

  private buildSubmission(): string {
    const allQuestions = this.questions();
    if (allQuestions.length <= 1) {
      return this.draft().trim();
    }

    const allAnswers = [...this.answers()];
    while (allAnswers.length < allQuestions.length) {
      allAnswers.push('');
    }

    const merged = allQuestions
      .map((question, index) => {
        const answer = allAnswers[index]?.trim() ?? '';
        return `${index + 1}. ${question}\nAnswer: ${answer}`;
      })
      .join('\n\n')
      .trim();

    return merged;
  }

  private extractQuestions(rawQuestion: string): readonly string[] {
    const trimmed = rawQuestion.trim();
    if (!trimmed) return [''];

    const numberedLines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+[.):-]\s+/.test(line))
      .map((line) => line.replace(/^\d+[.):-]\s+/, '').trim())
      .filter((line) => line.length > 0);
    if (numberedLines.length >= 2) return numberedLines;

    const numberedInline: string[] = [];
    const inlineRegex = /(?:^|\s)\d+[.):-]\s+([^?\n]+\?)/g;
    let inlineMatch: RegExpExecArray | null = inlineRegex.exec(trimmed);
    while (inlineMatch) {
      const candidate = inlineMatch[1]?.trim();
      if (candidate) numberedInline.push(candidate);
      inlineMatch = inlineRegex.exec(trimmed);
    }
    if (numberedInline.length >= 2) return numberedInline;

    const questionFragments = trimmed
      .split(/\?/)
      .map((part) => part.trim())
      .filter((part) => part.length > 10)
      .map((part) => `${part}?`)
      .filter((part) => !/^i'?d be happy/i.test(part) && !/^these questions/i.test(part));
    if (questionFragments.length >= 2) return questionFragments;

    return [trimmed];
  }
}
