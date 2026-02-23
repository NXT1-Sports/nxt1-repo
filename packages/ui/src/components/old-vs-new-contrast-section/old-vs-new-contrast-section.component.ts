import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

/**
 * A single row in the comparison table.
 * `old` = what databases do. `nxt1` = how we transform the same data.
 */
interface ComparisonRow {
  readonly id: string;
  readonly dataPoint: string;
  readonly oldResult: string;
  readonly nxt1Result: string;
}

/** A third-party sports platform brand shown in the logo strip. */
interface PlatformBrand {
  readonly id: string;
  readonly name: string;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    id: 'film',
    dataPoint: 'Game Film',
    oldResult: 'Stored in a library',
    nxt1Result: 'Auto-edited into branded highlight reels',
  },
  {
    id: 'stats',
    dataPoint: 'Player Stats',
    oldResult: 'Displayed in a table',
    nxt1Result: 'Turned into shareable graphics & rankings',
  },
  {
    id: 'profile',
    dataPoint: 'Athlete Profile',
    oldResult: 'Static page, waits to be found',
    nxt1Result: 'Matched & pushed to college coaches',
  },
  {
    id: 'roster',
    dataPoint: 'Team Roster',
    oldResult: 'A list of names',
    nxt1Result: 'Content generated for every player, every game',
  },
] as const;

const PLATFORM_BRANDS: readonly PlatformBrand[] = [
  { id: 'hudl', name: 'Hudl' },
  { id: 'maxpreps', name: 'MaxPreps' },
  { id: '247sports', name: '247Sports' },
  { id: 'ncsa', name: 'NCSA' },
  { id: 'rivals', name: 'Rivals' },
  { id: 'fieldlevel', name: 'FieldLevel' },
  { id: 'gamechanger', name: 'GameChanger' },
  { id: 'sportsrecruits', name: 'SportsRecruits' },
] as const;

let oldVsNewContrastInstanceCounter = 0;

@Component({
  selector: 'nxt1-old-vs-new-contrast-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="ov" [attr.aria-labelledby]="titleId()">
      <div class="ov__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Old vs. New"
          title="Same Data. Completely Different Outcome."
          [headingLevel]="headingLevel()"
          variant="hero"
          align="center"
          subtitle="Platforms like Hudl and MaxPreps store your data. We sit on top and turn it into action."
        />

        <!-- Platform logos — data-driven via @for -->
        <div class="ov__logos" role="list" aria-label="Platforms we integrate with">
          @for (brand of brands(); track brand.id) {
            <div class="ov__logo-chip" role="listitem" [attr.data-brand]="brand.id">
              <img
                class="ov__brand-mark"
                src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
                [alt]="brand.name + ' logo'"
                loading="lazy"
                decoding="async"
              />
            </div>
          }
        </div>

        <!-- Comparison table -->
        <div class="ov__table-wrap" role="table" [attr.aria-labelledby]="titleId()">
          <!-- Header row -->
          <div class="ov__row ov__row--head" role="row">
            <div class="ov__cell ov__cell--data" role="columnheader">Data</div>
            <div class="ov__cell ov__cell--old" role="columnheader">What They Do</div>
            <div class="ov__cell ov__cell--arrow" role="presentation" aria-hidden="true"></div>
            <div class="ov__cell ov__cell--new" role="columnheader">What We Do</div>
          </div>

          @for (row of rows(); track row.id; let i = $index) {
            <div class="ov__row" role="row" [style.animation-delay]="i * staggerMs() + 'ms'">
              <div class="ov__cell ov__cell--data" role="rowheader">
                <span class="ov__data-label">{{ row.dataPoint }}</span>
              </div>
              <div class="ov__cell ov__cell--old" role="cell">
                <span class="ov__old-text">{{ row.oldResult }}</span>
              </div>
              <div class="ov__cell ov__cell--arrow" role="presentation" aria-hidden="true">
                <svg
                  class="ov__arrow-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M5 10h10" />
                  <path d="M12 6l4 4-4 4" />
                </svg>
              </div>
              <div class="ov__cell ov__cell--new" role="cell">
                <span class="ov__new-text">{{ row.nxt1Result }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Bottom tagline -->
        <p class="ov__tagline">
          We don't replace your tools — we make them <strong>actually work</strong> for you.
        </p>
      </div>
    </section>
  `,
  styles: [
    `
      /* ─── Host & component-level sizing tokens ─── */
      :host {
        display: block;

        --_ov-chip-height: var(--nxt1-spacing-9);
        --_ov-chip-height-tablet: var(--nxt1-spacing-8);
        --_ov-chip-height-mobile: var(--nxt1-spacing-7);
        --_ov-brand-width: calc(var(--nxt1-spacing-9) * 2);
        --_ov-brand-height: var(--nxt1-spacing-5);
        --_ov-brand-height-tablet: var(--nxt1-spacing-4);
        --_ov-brand-height-mobile: var(--nxt1-spacing-3_5);
        --_ov-cell-min-height: var(--nxt1-spacing-12);
        --_ov-head-min-height: var(--nxt1-spacing-10);
        --_ov-arrow-col-width: var(--nxt1-spacing-7);
        --_ov-icon-size: var(--nxt1-spacing-4);
        --_ov-chip-opacity: 0.7;
        --_ov-stagger-delay: 80ms;
      }

      /* ─── Section container ─── */
      .ov {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-8) var(--nxt1-section-padding-x);
      }

      .ov__shell {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      /* ─── Logo row ─── */
      .ov__logos {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
        padding: var(--nxt1-spacing-1) 0;
      }

      .ov__logo-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: var(--_ov-chip-height);
        padding: 0 var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-muted);
        opacity: var(--_ov-chip-opacity);
        transition:
          opacity var(--nxt1-motion-duration-fast, 150ms) ease,
          border-color var(--nxt1-motion-duration-fast, 150ms) ease,
          background var(--nxt1-motion-duration-fast, 150ms) ease,
          transform var(--nxt1-motion-duration-fast, 150ms) ease;
      }

      .ov__logo-chip:hover {
        opacity: 1;
        border-color: var(--nxt1-color-text-tertiary);
        background: var(--nxt1-color-surface-100);
        transform: translateY(calc(var(--nxt1-spacing-px) * -1));
      }

      .ov__brand-mark {
        display: block;
        width: var(--_ov-brand-width);
        height: var(--_ov-brand-height);
        border-radius: var(--nxt1-borderRadius-sm);
        border: var(--nxt1-spacing-px) dashed var(--nxt1-color-border-subtle);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-100),
          var(--nxt1-color-surface-300)
        );
        object-fit: cover;
      }

      /* ─── Comparison table ─── */
      .ov__table-wrap {
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
      }

      .ov__row {
        display: grid;
        grid-template-columns: 1fr 1fr var(--_ov-arrow-col-width) 1fr;
        align-items: stretch;
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        transition: background var(--nxt1-motion-duration-fast, 150ms) ease;
        animation: ov-row-enter var(--nxt1-motion-duration-normal, 300ms)
          var(--nxt1-motion-easing-default, ease) both;
      }

      .ov__row:last-child {
        border-bottom: none;
      }

      .ov__row:not(.ov__row--head):hover {
        background: var(--nxt1-color-surface-200);
      }

      .ov__row:not(.ov__row--head):hover .ov__arrow-icon {
        color: var(--nxt1-color-primary);
        transform: translateX(var(--nxt1-spacing-0_5));
      }

      .ov__row:not(.ov__row--head):hover .ov__new-text {
        color: var(--nxt1-color-primary);
      }

      .ov__row--head {
        background: var(--nxt1-color-surface-200);
      }

      .ov__cell {
        display: flex;
        align-items: center;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        min-height: var(--_ov-cell-min-height);
      }

      .ov__row--head .ov__cell {
        min-height: var(--_ov-head-min-height);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .ov__cell--arrow {
        justify-content: center;
        padding: 0;
      }

      .ov__arrow-icon {
        width: var(--_ov-icon-size);
        height: var(--_ov-icon-size);
        color: var(--nxt1-color-text-muted);
        transition:
          color var(--nxt1-motion-duration-fast, 150ms) ease,
          transform var(--nxt1-motion-duration-fast, 150ms) ease;
        flex-shrink: 0;
      }

      .ov__data-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .ov__old-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-muted);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .ov__new-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-normal);
        transition: color var(--nxt1-motion-duration-fast, 150ms) ease;
      }

      /* ─── Bottom tagline ─── */
      .ov__tagline {
        margin: 0;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .ov__tagline strong {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ─── Animations ─── */
      @keyframes ov-row-enter {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-1_5));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .ov__row {
          animation: none;
        }
        .ov__row:not(.ov__row--head):hover .ov__arrow-icon {
          transform: none;
        }
      }

      /* ─── Mobile (below md: 768px) ─── */
      @media (max-width: 767.98px) {
        .ov {
          padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        }

        .ov__logos {
          gap: var(--nxt1-spacing-1_5);
          justify-content: center;
        }

        .ov__logo-chip {
          height: var(--_ov-chip-height-mobile);
          padding: 0 var(--nxt1-spacing-2);
        }

        .ov__brand-mark {
          height: var(--_ov-brand-height-mobile);
        }

        .ov__table-wrap {
          border: none;
          background: transparent;
          border-radius: 0;
          overflow: visible;
        }

        .ov__row--head {
          display: none;
        }

        .ov__row {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: auto auto auto;
          gap: var(--nxt1-spacing-2);
          padding: var(--nxt1-spacing-3_5);
          margin-bottom: var(--nxt1-spacing-3);
          border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
          border-radius: var(--nxt1-borderRadius-xl);
          background: var(--nxt1-color-surface-100);
        }

        .ov__row:last-child {
          margin-bottom: 0;
          border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        }

        .ov__cell {
          padding: 0;
          min-height: 0;
        }

        .ov__cell--data {
          order: 0;
        }

        .ov__cell--data .ov__data-label {
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-semibold);
          letter-spacing: var(--nxt1-letterSpacing-wide);
          text-transform: uppercase;
          color: var(--nxt1-color-text-tertiary);
        }

        .ov__cell--old {
          order: 1;
        }

        .ov__cell--old .ov__old-text {
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-muted);
          text-decoration: line-through;
          text-decoration-color: var(--nxt1-color-border-subtle);
        }

        .ov__cell--arrow {
          display: none;
        }

        .ov__cell--new {
          order: 2;
          padding-top: var(--nxt1-spacing-1);
          border-top: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        }

        .ov__cell--new .ov__new-text {
          color: var(--nxt1-color-primary);
          font-size: var(--nxt1-fontSize-sm);
        }
      }

      /* ─── Tablet (md → lg: 768px–991.98px) ─── */
      @media (min-width: 768px) and (max-width: 991.98px) {
        .ov__cell {
          padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        }

        .ov__data-label,
        .ov__old-text,
        .ov__new-text {
          font-size: var(--nxt1-fontSize-xs);
        }

        .ov__brand-mark {
          height: var(--_ov-brand-height-tablet);
        }

        .ov__logo-chip {
          height: var(--_ov-chip-height-tablet);
          padding: 0 var(--nxt1-spacing-2_5);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOldVsNewContrastSectionComponent {
  private readonly instanceId = ++oldVsNewContrastInstanceCounter;

  /** Heading level for the section title (default: h2). */
  readonly headingLevel = input<SectionHeaderLevel>(2);

  /** Comparison data rows. */
  readonly rows = input<readonly ComparisonRow[]>(COMPARISON_ROWS);

  /** Platform brands shown in the logo strip. */
  readonly brands = input<readonly PlatformBrand[]>(PLATFORM_BRANDS);

  /** Stagger delay (ms) between row entrance animations. */
  readonly staggerMs = input<number>(80);

  /** Deterministic unique ID for aria-labelledby (SSR-safe). */
  readonly titleId = computed(() => `old-vs-new-contrast-title-${this.instanceId}`);
}
