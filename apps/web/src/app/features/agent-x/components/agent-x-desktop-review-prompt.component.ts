import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { inject } from '@angular/core';
import { AGENT_X_DESKTOP_REVIEW_PROMPT_TEST_IDS } from '@nxt1/core/testing';

export interface AgentXDesktopReviewPromptCloseEvent {
  readonly action: 'dismissed' | 'submitted';
}

@Component({
  selector: 'app-agent-x-desktop-review-prompt',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="review-prompt" [attr.data-testid]="testIds.CONTAINER">
      <div class="review-prompt__eyebrow">Feedback request</div>
      <h2>Help us improve NXT1.</h2>
      <p class="review-prompt__lede">
        Tell us what works, what feels slow, and what would make NXT1 better. Your feedback goes
        straight to our team.
      </p>

      <div class="review-prompt__label">Rating</div>
      <div class="review-prompt__rating-wrap">
        <div
          class="review-prompt__rating"
          role="radiogroup"
          aria-label="Rate the current Agent X desktop experience from 1 to 5"
          [attr.data-testid]="testIds.RATING_GROUP"
        >
          @for (value of ratingOptions; track value) {
            <button
              type="button"
              class="review-prompt__rating-option"
              [class.review-prompt__rating-option--selected]="selectedRating() === value"
              [attr.aria-pressed]="selectedRating() === value"
              [attr.aria-label]="'Rate Agent X desktop experience ' + value + ' out of 5'"
              [disabled]="submitting()"
              [attr.data-testid]="testIds.RATING_OPTION_PREFIX + '-' + value"
              (click)="selectRating(value)"
            >
              <span class="review-prompt__rating-value">{{ value }}</span>
            </button>
          }
        </div>
        <p class="review-prompt__rating-note">1 = rough, 5 = excellent</p>
      </div>

      <label class="review-prompt__label" for="agent-x-desktop-review-textarea">
        Additional feedback (optional)
      </label>
      <textarea
        id="agent-x-desktop-review-textarea"
        class="review-prompt__textarea"
        rows="7"
        maxlength="1000"
        [ngModel]="reviewText()"
        (ngModelChange)="reviewText.set($event)"
        [disabled]="submitting()"
        placeholder="What do you like? What should we improve?"
        [attr.data-testid]="testIds.TEXTAREA"
      ></textarea>

      <div class="review-prompt__footer">
        <span class="review-prompt__counter" [attr.data-testid]="testIds.COUNTER">
          {{ trimmedLength() }}/1000
        </span>
      </div>

      @if (error()) {
        <p class="review-prompt__error" [attr.data-testid]="testIds.ERROR">{{ error() }}</p>
      }

      <div class="review-prompt__actions">
        <button
          type="button"
          class="review-prompt__secondary"
          [disabled]="submitting()"
          [attr.data-testid]="testIds.CTA_DISMISS"
          (click)="close.emit({ action: 'dismissed' })"
        >
          Not now
        </button>
        <button
          type="button"
          class="review-prompt__primary"
          [disabled]="!canSubmit()"
          [attr.data-testid]="testIds.CTA_SUBMIT"
          (click)="submit()"
        >
          {{ submitting() ? 'Sending...' : 'Send review' }}
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .review-prompt {
        --axrp-accent: var(--op-primary, #ccff00);
        --axrp-border: rgba(204, 255, 0, 0.16);
        --axrp-panel: linear-gradient(180deg, rgba(18, 20, 16, 0.98), rgba(10, 12, 10, 0.98));
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid var(--axrp-border);
        background:
          radial-gradient(circle at top right, rgba(204, 255, 0, 0.14), transparent 34%),
          radial-gradient(circle at bottom left, rgba(46, 198, 255, 0.1), transparent 36%),
          var(--axrp-panel);
        padding: 28px;
        color: #f3f7ee;
        box-shadow:
          0 26px 80px rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .review-prompt::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 30%);
        pointer-events: none;
      }

      .review-prompt__eyebrow {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(204, 255, 0, 0.1);
        color: var(--axrp-accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      h2 {
        position: relative;
        margin: 0;
        font-size: clamp(1.9rem, 3vw, 2.5rem);
        line-height: 1.02;
        letter-spacing: -0.04em;
      }

      .review-prompt__lede {
        position: relative;
        margin: 14px 0 0;
        color: rgba(243, 247, 238, 0.78);
        font-size: 0.98rem;
        line-height: 1.55;
      }

      .review-prompt__chips {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 20px;
      }

      .review-prompt__chip {
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(243, 247, 238, 0.86);
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-size: 0.88rem;
        cursor: pointer;
        transition:
          border-color 180ms ease,
          transform 180ms ease,
          background 180ms ease;
      }

      .review-prompt__chip:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(204, 255, 0, 0.3);
        background: rgba(204, 255, 0, 0.08);
      }

      .review-prompt__chip:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .review-prompt__label {
        position: relative;
        display: block;
        margin-top: 24px;
        margin-bottom: 10px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(243, 247, 238, 0.72);
      }

      .review-prompt__rating-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .review-prompt__rating {
        position: relative;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        width: min(100%, 420px);
        margin: 0 auto;
      }

      .review-prompt__rating-option {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 56px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(243, 247, 238, 0.82);
        cursor: pointer;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease,
          box-shadow 180ms ease;
      }

      .review-prompt__rating-option:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(204, 255, 0, 0.28);
        background: rgba(204, 255, 0, 0.08);
      }

      .review-prompt__rating-option--selected {
        border-color: rgba(204, 255, 0, 0.5);
        background: linear-gradient(135deg, rgba(204, 255, 0, 0.2), rgba(204, 255, 0, 0.08));
        box-shadow: 0 0 0 3px rgba(204, 255, 0, 0.08);
        color: #f8fff0;
      }

      .review-prompt__rating-value {
        font-size: 1.15rem;
        font-weight: 800;
        line-height: 1;
      }

      .review-prompt__rating-note {
        margin: 0;
        color: rgba(243, 247, 238, 0.62);
        font-size: 0.84rem;
        text-align: center;
      }

      .review-prompt__textarea {
        position: relative;
        width: 100%;
        min-height: 184px;
        resize: vertical;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(2, 6, 2, 0.42);
        color: #f3f7ee;
        padding: 18px 18px 20px;
        font: inherit;
        font-size: 1rem;
        line-height: 1.55;
        box-sizing: border-box;
        outline: none;
        transition:
          border-color 180ms ease,
          box-shadow 180ms ease,
          background 180ms ease;
      }

      .review-prompt__textarea:focus {
        border-color: rgba(204, 255, 0, 0.44);
        background: rgba(4, 10, 4, 0.56);
        box-shadow: 0 0 0 4px rgba(204, 255, 0, 0.08);
      }

      .review-prompt__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 16px;
        margin-top: 10px;
      }

      .review-prompt__counter {
        color: rgba(243, 247, 238, 0.58);
        font-size: 0.84rem;
      }

      .review-prompt__error {
        margin: 14px 0 0;
        color: #ffb1b8;
        font-size: 0.9rem;
      }

      .review-prompt__actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 22px;
      }

      .review-prompt__secondary,
      .review-prompt__primary {
        min-width: 138px;
        border-radius: 14px;
        padding: 13px 18px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          opacity 180ms ease;
      }

      .review-prompt__secondary {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: transparent;
        color: rgba(243, 247, 238, 0.8);
      }

      .review-prompt__primary {
        border: 1px solid rgba(204, 255, 0, 0.42);
        background: linear-gradient(135deg, rgba(204, 255, 0, 0.22), rgba(204, 255, 0, 0.12));
        color: #f8fff0;
      }

      .review-prompt__secondary:hover:not(:disabled),
      .review-prompt__primary:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .review-prompt__secondary:disabled,
      .review-prompt__primary:disabled {
        opacity: 0.55;
        cursor: default;
        transform: none;
      }

      @media (max-width: 640px) {
        .review-prompt {
          padding: 22px;
          border-radius: 22px;
        }

        .review-prompt__rating {
          grid-template-columns: repeat(5, minmax(44px, 1fr));
          gap: 8px;
        }

        .review-prompt__rating-option {
          min-height: 52px;
        }

        .review-prompt__footer,
        .review-prompt__actions {
          flex-direction: column;
          align-items: stretch;
        }

        .review-prompt__secondary,
        .review-prompt__primary {
          width: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDesktopReviewPromptComponent {
  private readonly toast = inject(NxtToastService);
  protected readonly testIds = AGENT_X_DESKTOP_REVIEW_PROMPT_TEST_IDS;
  protected readonly ratingOptions = [1, 2, 3, 4, 5] as const;

  readonly submitReview = input.required<(rating: number, reviewText: string) => Promise<void>>();
  readonly close = output<AgentXDesktopReviewPromptCloseEvent>();

  protected readonly selectedRating = signal<number | null>(null);
  protected readonly reviewText = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly trimmedLength = computed(() => this.reviewText().trim().length);
  protected readonly canSubmit = computed(
    () => this.selectedRating() !== null && this.trimmedLength() <= 1000 && !this.submitting()
  );

  protected selectRating(rating: number): void {
    if (this.submitting()) {
      return;
    }

    this.selectedRating.set(rating);
  }

  protected async submit(): Promise<void> {
    const payload = this.reviewText().trim();
    const rating = this.selectedRating();
    if (rating === null || payload.length > 1000 || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      await this.submitReview()(rating, payload);
      this.toast.success('Review sent. Thank you.');
      this.close.emit({ action: 'submitted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send review';
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.submitting.set(false);
    }
  }
}
