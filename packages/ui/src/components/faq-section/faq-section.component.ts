import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

@Component({
  selector: 'nxt1-faq-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="faq-section" aria-labelledby="faq-title">
      <header class="faq-header">
        <h2 id="faq-title" class="faq-title">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="faq-subtitle">{{ subtitle() }}</p>
        }
      </header>

      <div class="faq-list">
        @for (item of items(); track item.id) {
          <article class="faq-item" [class.faq-item--open]="isOpen(item.id)">
            <h3 class="faq-item__question-wrap">
              <button
                type="button"
                class="faq-item__question"
                [attr.aria-expanded]="isOpen(item.id)"
                [attr.aria-controls]="'faq-panel-' + item.id"
                (click)="toggle(item.id)"
              >
                <span>{{ item.question }}</span>
                <span class="faq-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
            </h3>

            @if (isOpen(item.id)) {
              <div [id]="'faq-panel-' + item.id" class="faq-item__answer" role="region">
                <p>{{ item.answer }}</p>
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .faq-section {
        width: 100%;
        max-width: var(--nxt1-root-shell-max-width, var(--nxt1-content-max-width));
        margin: 0 auto;
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4) var(--nxt1-spacing-10);
        box-sizing: border-box;
      }

      .faq-header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-6);
      }

      .faq-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-2xl);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .faq-subtitle {
        margin: var(--nxt1-spacing-2) auto 0;
        max-width: var(--nxt1-content-max-width);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .faq-list {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .faq-item {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
        overflow: clip;
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard),
          background-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard);
      }

      .faq-item--open {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-surface-200);
      }

      .faq-item__question-wrap {
        margin: 0;
      }

      .faq-item__question {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        text-align: left;
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        cursor: pointer;
      }

      .faq-item__question:hover {
        color: var(--nxt1-color-text-primary);
      }

      .faq-item__icon {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        transition: transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard);
      }

      .faq-item--open .faq-item__icon {
        transform: rotate(180deg);
        color: var(--nxt1-color-primary);
      }

      .faq-item__answer {
        padding: 0 var(--nxt1-spacing-5) var(--nxt1-spacing-4);
      }

      .faq-item__answer p {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtFaqSectionComponent {
  readonly title = input('Frequently Asked Questions');
  readonly subtitle = input('Quick answers about how NXT1 works.');
  readonly items = input.required<readonly FaqItem[]>();
  readonly defaultOpenId = input<string | null>(null);

  /**
   * undefined = untouched (use defaultOpenId),
   * null = explicitly closed all,
   * string = explicitly opened id.
   */
  private readonly _openId = signal<string | null | undefined>(undefined);

  readonly openId = computed<string | null>(() => {
    const current = this._openId();
    return current === undefined ? this.defaultOpenId() : current;
  });

  protected isOpen(id: string): boolean {
    return this.openId() === id;
  }

  protected toggle(id: string): void {
    const currentOpenId = this.openId();
    this._openId.set(currentOpenId === id ? null : id);
  }
}
