import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtIconComponent } from '../icon';

export type SectionHeaderLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type SectionHeaderVariant = 'standard' | 'hero';
export type SectionHeaderAlign = 'start' | 'center';

/**
 * Controls overall layout mode.
 * - `'stack'`  — default single-column layout (backward-compatible).
 * - `'split'`  — two-column grid with text on one side and projected
 *                content (`<ng-content>`) on the other. Stacks on mobile.
 */
export type SectionHeaderLayout = 'stack' | 'split';

/**
 * In `split` layout, controls where the projected content sits.
 * - `'end'`   — content appears **after** the text (right in LTR).
 * - `'start'` — content appears **before** the text (left in LTR).
 */
export type SectionHeaderContentPosition = 'start' | 'end';

@Component({
  selector: 'nxt1-section-header',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div
      class="section-header"
      [class.section-header--hero]="variant() === 'hero'"
      [class.section-header--center]="align() === 'center'"
      [class.section-header--title-single-line]="singleLineTitle()"
      [class.section-header--split]="layout() === 'split'"
      [class.section-header--content-start]="layout() === 'split' && contentPosition() === 'start'"
    >
      <div class="section-header__text">
        @if (eyebrow()) {
          <p class="section-header__eyebrow">
            @if (eyebrowIcon()) {
              <nxt1-icon [name]="eyebrowIcon()!" size="16" />
            }
            {{ eyebrow() }}
          </p>
        }

        @switch (headingLevel()) {
          @case (1) {
            <h1 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h1>
          }
          @case (3) {
            <h3 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h3>
          }
          @case (4) {
            <h4 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h4>
          }
          @case (5) {
            <h5 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h5>
          }
          @case (6) {
            <h6 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h6>
          }
          @default {
            <h2 [id]="titleId()" class="section-header__title">
              {{ title() }}
              @if (accentText()) {
                <span class="section-header__accent"> {{ accentText() }}</span>
              }
            </h2>
          }
        }

        @if (subtitle()) {
          <p class="section-header__subtitle">{{ subtitle() }}</p>
        }

        @if (support()) {
          <p class="section-header__support">{{ support() }}</p>
        }
      </div>

      <div class="section-header__aside">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Outer container ── */
      .section-header {
        display: grid;
        max-width: var(--nxt1-section-subtitle-max-width, 56rem);
      }

      /* ── Text column (inherits the gap that was on .section-header) ── */
      .section-header__text {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      /* ── Aside / projected content — hidden in stack mode ── */
      .section-header__aside {
        display: none;
      }

      /* ── Alignment ── */
      .section-header--center {
        margin-inline: auto;
        text-align: center;
        justify-items: center;
      }

      .section-header--center .section-header__text {
        justify-items: center;
      }

      /* ── Split layout — two-column grid ── */
      .section-header--split {
        grid-template-columns: 1fr 1fr;
        align-items: center;
        gap: var(--nxt1-spacing-10);
        max-width: none;
      }

      .section-header--split .section-header__aside {
        display: block;
      }

      /* Content on start side (left in LTR) — text moves to end */
      .section-header--content-start .section-header__aside {
        order: -1;
      }

      /* ── Typography ── */
      .section-header__eyebrow {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .section-header__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .section-header--title-single-line .section-header__title {
        white-space: nowrap;
        text-wrap: nowrap;
        font-size: clamp(var(--nxt1-fontSize-lg), 4.8vw, var(--nxt1-fontSize-3xl));
      }

      .section-header__accent {
        color: var(--nxt1-color-primary);
      }

      .section-header__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .section-header__support {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Responsive ── */
      @media (max-width: 991px) {
        .section-header__title {
          font-size: var(--nxt1-fontSize-2xl);
        }

        .section-header__subtitle {
          font-size: var(--nxt1-fontSize-base);
        }

        .section-header--title-single-line .section-header__title {
          font-size: clamp(var(--nxt1-fontSize-base), 5.2vw, var(--nxt1-fontSize-2xl));
        }

        /* Split collapses to single column on mobile */
        .section-header--split {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-8);
        }

        /* In content-start + mobile, reset order so text comes first */
        .section-header--content-start .section-header__aside {
          order: 0;
        }
      }

      @media (min-width: 768px) {
        .section-header--hero .section-header__title {
          font-size: var(--nxt1-fontSize-4xl);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSectionHeaderComponent {
  readonly eyebrow = input<string>();
  readonly eyebrowIcon = input<string>();
  readonly title = input.required<string>();
  readonly accentText = input<string>();
  readonly subtitle = input<string>();
  readonly support = input<string>();
  readonly variant = input<SectionHeaderVariant>('standard');
  readonly align = input<SectionHeaderAlign>('start');
  readonly singleLineTitle = input(false);
  readonly headingLevel = input<SectionHeaderLevel>(2);
  readonly titleId = input<string>('section-header-title');

  /** Two-column split with projected content, or default stacked text-only. */
  readonly layout = input<SectionHeaderLayout>('stack');

  /** Where projected `<ng-content>` sits in split mode (`'start'` = left, `'end'` = right). */
  readonly contentPosition = input<SectionHeaderContentPosition>('end');
}
