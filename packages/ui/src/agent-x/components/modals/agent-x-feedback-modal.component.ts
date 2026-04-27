import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AGENT_X_FEEDBACK_MODAL_TEST_IDS } from '@nxt1/core/testing';

export interface AgentXFeedbackSubmitEvent {
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly category?: 'helpful' | 'incorrect' | 'incomplete' | 'confusing' | 'other';
  readonly text?: string;
}

@Component({
  selector: 'nxt1-agent-x-feedback-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="feedback-overlay" [attr.data-testid]="testIds.OVERLAY" (click)="close.emit()">
      <div
        class="feedback-modal"
        [attr.data-testid]="testIds.MODAL"
        (click)="$event.stopPropagation()"
      >
        <h4>Message Feedback</h4>

        <div class="feedback-stars">
          @for (star of [1, 2, 3, 4, 5]; track star) {
            <button
              type="button"
              class="feedback-stars__btn"
              [class.feedback-stars__btn--active]="ratingValue >= star"
              [attr.data-testid]="testIds.STAR_BUTTON"
              (click)="setRating(star)"
            >
              ★
            </button>
          }
        </div>

        <select
          [(ngModel)]="categoryValue"
          class="feedback-input"
          [attr.data-testid]="testIds.CATEGORY_SELECT"
        >
          <option value="">Select category (optional)</option>
          <option value="helpful">Helpful</option>
          <option value="incorrect">Incorrect</option>
          <option value="incomplete">Incomplete</option>
          <option value="confusing">Confusing</option>
          <option value="other">Other</option>
        </select>

        <textarea
          [(ngModel)]="textValue"
          rows="3"
          class="feedback-input"
          placeholder="Additional feedback (optional)"
          [attr.data-testid]="testIds.TEXTAREA"
        ></textarea>

        <div class="feedback-actions">
          <button
            type="button"
            class="feedback-btn"
            [attr.data-testid]="testIds.BTN_CANCEL"
            (click)="close.emit()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="feedback-btn feedback-btn--primary"
            [attr.data-testid]="testIds.BTN_SUBMIT"
            (click)="submitForm()"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .feedback-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: grid;
        place-items: center;
        z-index: 100;
        padding: 16px;
      }

      .feedback-modal {
        width: min(420px, 100%);
        border-radius: 12px;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        background: var(--op-panel-bg, #121312);
        padding: 12px;
      }

      .feedback-stars {
        display: flex;
        gap: 4px;
        margin: 10px 0;
      }

      .feedback-stars__btn {
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.35);
        font-size: 20px;
        cursor: pointer;
      }

      .feedback-stars__btn--active {
        color: #ffce3a;
      }

      .feedback-input {
        width: 100%;
        margin-top: 8px;
        border-radius: 8px;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        background: rgba(0, 0, 0, 0.2);
        color: var(--op-text, #fff);
        font: inherit;
        padding: 8px;
        box-sizing: border-box;
      }

      .feedback-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }

      .feedback-btn {
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        background: transparent;
        color: var(--op-text-muted, rgba(255, 255, 255, 0.75));
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
      }

      .feedback-btn--primary {
        border-color: color-mix(in srgb, var(--op-primary, #ccff00) 42%, var(--op-border));
        color: var(--op-text, #fff);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFeedbackModalComponent implements OnChanges {
  protected readonly testIds = AGENT_X_FEEDBACK_MODAL_TEST_IDS;

  readonly defaultRating = input<1 | 2 | 3 | 4 | 5>(5);
  readonly close = output<void>();
  readonly submit = output<AgentXFeedbackSubmitEvent>();

  protected ratingValue: 1 | 2 | 3 | 4 | 5 = 5;
  protected categoryValue: '' | 'helpful' | 'incorrect' | 'incomplete' | 'confusing' | 'other' = '';
  protected textValue = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultRating']) {
      this.ratingValue = this.defaultRating();
      this.categoryValue = '';
      this.textValue = '';
    }
  }

  protected setRating(value: number): void {
    const next = Math.max(1, Math.min(5, value)) as 1 | 2 | 3 | 4 | 5;
    this.ratingValue = next;
  }

  protected submitForm(): void {
    const payload: AgentXFeedbackSubmitEvent = {
      rating: this.ratingValue,
      ...(this.categoryValue ? { category: this.categoryValue } : {}),
      ...(this.textValue.trim() ? { text: this.textValue.trim() } : {}),
    };
    this.submit.emit(payload);
  }
}
