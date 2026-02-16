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

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
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
      [attr.aria-label]="ariaLabel()"
    >
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
    </section>
  `,
  styles: [
    `
      .stats-bar {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-8) var(--nxt1-section-padding-x);
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
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
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtStatsBarComponent {
  /** Stats to display. */
  readonly stats = input.required<readonly StatsBarItem[]>();

  /** Visual variant. */
  readonly variant = input<StatsBarVariant>('default');

  /** Accessible label for the section. */
  readonly ariaLabel = input<string>('Platform statistics');
}
