import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';

export type SectionHeaderLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type SectionHeaderVariant = 'standard' | 'hero';
export type SectionHeaderAlign = 'start' | 'center';

@Component({
  selector: 'nxt1-section-header',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div
      class="section-header"
      [class.section-header--hero]="variant() === 'hero'"
      [class.section-header--center]="align() === 'center'"
      [class.section-header--title-single-line]="singleLineTitle()"
    >
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
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .section-header {
        display: grid;
        gap: var(--nxt1-spacing-3);
        max-width: var(--nxt1-section-subtitle-max-width, 56rem);
      }

      .section-header--center {
        margin-inline: auto;
        text-align: center;
        justify-items: center;
      }

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
}
