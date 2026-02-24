/**
 * @fileoverview Stats Bar Component — Social Proof Section
 * @module @nxt1/ui/components/stats-bar
 * @version 1.0.0
 *
 * Reusable social-proof stats bar for landing and marketing pages.
 * Displays key metrics in a horizontal row with dividers.
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, reduced-motion aware.
 *
 * @example
 * ```html
 * <nxt1-stats-bar
 *   [stats]="[
 *     { value: '50K+', label: 'Athletes' },
 *     { value: '8,400+', label: 'Coaches' },
 *   ]"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

// ============================================
// TYPES
// ============================================

/** Individual stat item configuration. */
export interface StatsBarItem {
  /** The primary display value (e.g., '50K+', '2.1M'). */
  readonly value: string;
  /** Descriptive label below the value. */
  readonly label: string;
}

/** Visual variant for the stats bar. */
export type StatsBarVariant = 'default' | 'minimal' | 'accent';

@Component({
  selector: 'nxt1-stats-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section
      class="stats-bar"
      [class.stats-bar--minimal]="variant() === 'minimal'"
      [class.stats-bar--accent]="variant() === 'accent'"
      [class.stats-bar--ticker]="hasTicker()"
      [class.stats-bar--full-width]="fullWidth()"
      [attr.aria-label]="ariaLabel()"
    >
      @if (hasTicker()) {
        @if (headline()) {
          <h2 class="ticker-headline">{{ headline() }}</h2>
        }

        <div class="ticker-viewport" role="list" aria-label="Agent X live wins ticker">
          <div class="ticker-track">
            @for (item of tickerLoopItems(); track $index) {
              <div class="ticker-item" role="listitem">{{ item }}</div>
            }
          </div>
        </div>

        @if (subtext()) {
          <p class="ticker-subtext">{{ subtext() }}</p>
        }
      } @else {
        <div class="stats-container">
          @for (stat of stats(); track stat.label; let last = $last) {
            <div class="stat">
              <span class="stat-value">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
            @if (!last) {
              <div class="stat-divider" aria-hidden="true"></div>
            }
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .stats-bar {
        box-sizing: border-box;
        width: min(
          var(--nxt1-section-max-width-narrow),
          calc(100% - (var(--nxt1-section-padding-x, var(--nxt1-spacing-4)) * 2))
        );
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-8) var(--nxt1-section-padding-x);
        margin: 0 auto;
      }

      .stats-bar--full-width {
        width: min(
          var(--nxt1-section-max-width),
          calc(100% - (var(--nxt1-section-padding-x, var(--nxt1-spacing-4)) * 2))
        );
      }

      .stats-bar--ticker {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .ticker-headline {
        margin: 0;
        text-align: center;
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .ticker-viewport {
        position: relative;
        width: 100%;
        overflow: hidden;
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
      }

      .ticker-track {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: max-content;
        animation: stats-ticker-scroll 22s linear infinite;
        will-change: transform;
      }

      .ticker-item {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
      }

      .ticker-subtext {
        margin: 0;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
      }

      .stats-bar--minimal {
        border: none;
        background: transparent;
      }

      .stats-bar--accent {
        background: var(--nxt1-color-alpha-primary4);
      }

      .stats-container {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-8);
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        flex-wrap: wrap;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        text-align: center;
      }

      .stat-value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .stat-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
      }

      .stat-divider {
        width: 1px;
        height: var(--nxt1-spacing-10);
        background: var(--nxt1-color-border-default);
      }

      @media (max-width: 575px) {
        .stat-divider {
          display: none;
        }

        .stats-container {
          gap: var(--nxt1-spacing-6);
        }

        .ticker-headline {
          font-size: var(--nxt1-fontSize-2xl);
        }
      }

      @keyframes stats-ticker-scroll {
        from {
          transform: translate3d(0, 0, 0);
        }
        to {
          transform: translate3d(-50%, 0, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .ticker-track {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtStatsBarComponent {
  /** Stats to display. */
  readonly stats = input<readonly StatsBarItem[]>([]);

  /** Visual variant. */
  readonly variant = input<StatsBarVariant>('default');

  /** Optional ticker headline shown above scrolling items. */
  readonly headline = input<string>('');

  /** Optional scrolling ticker items (enables ticker mode when provided). */
  readonly tickerItems = input<readonly string[]>([]);

  /** Optional supporting subtext shown below ticker. */
  readonly subtext = input<string>('');

  /** Expand to the standard full section shell width. */
  readonly fullWidth = input<boolean>(false);

  /** Accessible label for the section. */
  readonly ariaLabel = input<string>('Platform statistics');

  protected readonly hasTicker = computed(() => this.tickerItems().length > 0);
  protected readonly tickerLoopItems = computed(() => {
    const items = this.tickerItems();
    return items.length > 0 ? [...items, ...items] : [];
  });
}
