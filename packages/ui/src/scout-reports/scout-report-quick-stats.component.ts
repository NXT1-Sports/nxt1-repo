/**
 * @fileoverview Scout Report Quick Stats Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Compact stats grid showing key athlete metrics.
 * Used in cards and detail views.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Flexible stat grid layout
 * - Icon + label + value format
 * - Compact and expanded modes
 * - Animated value changes
 *
 * @example
 * ```html
 * <nxt1-scout-report-quick-stats
 *   [stats]="[
 *     { icon: 'eye-outline', label: 'Views', value: '1.2K' },
 *     { icon: 'bookmark-outline', label: 'Saves', value: '342' }
 *   ]"
 *   [compact]="true"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  eyeOutline,
  bookmarkOutline,
  heartOutline,
  shareOutline,
  trendingUpOutline,
  timeOutline,
  calendarOutline,
  locationOutline,
  schoolOutline,
  personOutline,
} from 'ionicons/icons';

// Register icons
/**
 * Single stat item.
 */
export interface QuickStatItem {
  readonly icon: string;
  readonly label: string;
  readonly value: string | number;
  readonly highlight?: boolean;
}

@Component({
  selector: 'nxt1-scout-report-quick-stats',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div
      class="quick-stats"
      [class.quick-stats--compact]="compact()"
      [class.quick-stats--inline]="inline()"
    >
      @for (stat of stats(); track stat.label) {
        <div class="stat" [class.stat--highlight]="stat.highlight">
          <ion-icon [name]="stat.icon" class="stat__icon"></ion-icon>
          @if (!compact()) {
            <span class="stat__label">{{ stat.label }}</span>
          }
          <span class="stat__value">{{ stat.value }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         QUICK STATS CONTAINER
         ============================================ */

      :host {
        display: block;
      }

      .quick-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: var(--nxt1-spacing-2, 8px);
      }

      .quick-stats--compact {
        grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
        gap: var(--nxt1-spacing-1, 4px);
      }

      .quick-stats--inline {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* ============================================
         STAT ITEM
         ============================================ */

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-surface-elevated, #252525);
        border-radius: var(--nxt1-radius-md, 8px);
        text-align: center;
        transition: all 0.2s ease;
      }

      .quick-stats--compact .stat {
        padding: var(--nxt1-spacing-1, 4px);
        gap: 2px;
      }

      .quick-stats--inline .stat {
        flex-direction: row;
        background: transparent;
        padding: 0;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .stat:hover {
        background: var(--nxt1-color-surface, #1a1a1a);
      }

      .quick-stats--inline .stat:hover {
        background: transparent;
      }

      .stat--highlight {
        background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
        border: 1px solid var(--nxt1-color-primary-alpha-20, rgba(59, 130, 246, 0.2));
      }

      .stat--highlight .stat__icon,
      .stat--highlight .stat__value {
        color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         STAT ICON
         ============================================ */

      .stat__icon {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .quick-stats--compact .stat__icon {
        font-size: 14px;
      }

      .quick-stats--inline .stat__icon {
        font-size: 16px;
      }

      /* ============================================
         STAT LABEL
         ============================================ */

      .stat__label {
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         STAT VALUE
         ============================================ */

      .stat__value {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-variant-numeric: tabular-nums;
      }

      .quick-stats--compact .stat__value {
        font-size: 12px;
      }

      .quick-stats--inline .stat__value {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .stat {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        .stat:hover {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .quick-stats--inline .stat,
        .quick-stats--inline .stat:hover {
          background: transparent;
        }

        .stat__icon {
          color: var(--nxt1-color-gray-400, #9ca3af);
        }

        .stat__label {
          color: var(--nxt1-color-gray-500, #6b7280);
        }

        .stat__value {
          color: var(--nxt1-color-gray-900, #111827);
        }

        .quick-stats--inline .stat__value {
          color: var(--nxt1-color-gray-600, #4b5563);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportQuickStatsComponent {
  constructor() {
    addIcons({
      eyeOutline,
      bookmarkOutline,
      heartOutline,
      shareOutline,
      trendingUpOutline,
      timeOutline,
      calendarOutline,
      locationOutline,
      schoolOutline,
      personOutline,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Stats to display */
  readonly stats = input<QuickStatItem[]>([]);

  /** Compact mode (smaller, no labels) */
  readonly compact = input<boolean>(false);

  /** Inline mode (horizontal row) */
  readonly inline = input<boolean>(false);
}
