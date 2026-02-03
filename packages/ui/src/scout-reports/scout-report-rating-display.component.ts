/**
 * @fileoverview Scout Report Rating Display Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Visual rating display with stars, progress bar, and tier badge.
 * Supports multiple display modes for different contexts.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Star-based rating (1-5 stars)
 * - Progress bar visualization
 * - Tier badge (Elite, Excellent, etc.)
 * - Animated value transitions
 * - Compact and full modes
 *
 * @example
 * ```html
 * <nxt1-scout-report-rating-display
 *   [rating]="85"
 *   [showStars]="true"
 *   [showTier]="true"
 *   [size]="'medium'"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { star, starHalf, starOutline } from 'ionicons/icons';
import { getRatingTier, getRatingColor, calculateStars } from '@nxt1/core';

// Register icons
addIcons({ star, starHalf, starOutline });

/**
 * Rating display size.
 */
export type RatingDisplaySize = 'small' | 'medium' | 'large';

@Component({
  selector: 'nxt1-scout-report-rating-display',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div
      class="rating-display"
      [class.rating-display--small]="size() === 'small'"
      [class.rating-display--medium]="size() === 'medium'"
      [class.rating-display--large]="size() === 'large'"
    >
      <!-- Rating Value -->
      <div class="rating-display__value" [style.color]="color()">
        {{ rating() }}
      </div>

      <!-- Stars -->
      @if (showStars()) {
        <div class="rating-display__stars">
          @for (starType of stars(); track $index) {
            @if (starType === 'full') {
              <ion-icon name="star" class="star star--full" [style.color]="color()"></ion-icon>
            } @else if (starType === 'half') {
              <ion-icon name="star-half" class="star star--half" [style.color]="color()"></ion-icon>
            } @else {
              <ion-icon name="star-outline" class="star star--empty"></ion-icon>
            }
          }
        </div>
      }

      <!-- Progress Bar -->
      @if (showBar()) {
        <div class="rating-display__bar">
          <div
            class="rating-display__bar-fill"
            [style.width.%]="rating()"
            [style.background]="color()"
          ></div>
        </div>
      }

      <!-- Tier Badge -->
      @if (showTier()) {
        <div
          class="rating-display__tier"
          [style.background]="tierBackground()"
          [style.color]="color()"
        >
          {{ tier() }}
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         RATING DISPLAY CONTAINER
         ============================================ */

      :host {
        display: inline-flex;
      }

      .rating-display {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
         SIZE VARIANTS
         ============================================ */

      /* Small */
      .rating-display--small {
        gap: var(--nxt1-spacing-1, 4px);

        .rating-display__value {
          font-size: 14px;
          font-weight: 700;
        }

        .star {
          font-size: 10px;
        }

        .rating-display__bar {
          width: 40px;
          height: 3px;
        }

        .rating-display__tier {
          font-size: 9px;
          padding: 2px 4px;
        }
      }

      /* Medium (default) */
      .rating-display--medium {
        .rating-display__value {
          font-size: 20px;
          font-weight: 800;
        }

        .star {
          font-size: 14px;
        }

        .rating-display__bar {
          width: 60px;
          height: 4px;
        }

        .rating-display__tier {
          font-size: 10px;
          padding: 2px 6px;
        }
      }

      /* Large */
      .rating-display--large {
        gap: var(--nxt1-spacing-3, 12px);

        .rating-display__value {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .star {
          font-size: 20px;
        }

        .rating-display__bar {
          width: 100px;
          height: 6px;
        }

        .rating-display__tier {
          font-size: 12px;
          padding: 4px 10px;
        }
      }

      /* ============================================
         RATING VALUE
         ============================================ */

      .rating-display__value {
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }

      /* ============================================
         STARS
         ============================================ */

      .rating-display__stars {
        display: flex;
        gap: 1px;
      }

      .star {
        transition: transform 0.2s ease;
      }

      .star--empty {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      /* ============================================
         PROGRESS BAR
         ============================================ */

      .rating-display__bar {
        position: relative;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-elevated, #252525);
        overflow: hidden;
      }

      .rating-display__bar-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        border-radius: inherit;
        transition: width 0.5s ease-out;
      }

      /* ============================================
         TIER BADGE
         ============================================ */

      .rating-display__tier {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: var(--nxt1-radius-sm, 4px);
        white-space: nowrap;
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .star--empty {
          color: var(--nxt1-color-gray-300, #d1d5db);
        }

        .rating-display__bar {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportRatingDisplayComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Rating value (0-100) */
  readonly rating = input<number>(0);

  /** Display size */
  readonly size = input<RatingDisplaySize>('medium');

  /** Show star visualization */
  readonly showStars = input<boolean>(true);

  /** Show progress bar */
  readonly showBar = input<boolean>(false);

  /** Show tier badge */
  readonly showTier = input<boolean>(false);

  // ============================================
  // COMPUTED
  // ============================================

  /** Rating tier label */
  protected readonly tier = computed(() => getRatingTier(this.rating()));

  /** Rating color (CSS variable) */
  protected readonly color = computed(() => getRatingColor(this.rating()));

  /** Tier background with alpha */
  protected readonly tierBackground = computed(() => {
    const color = this.color();
    // Extract RGB and add alpha
    return color.replace(')', ', 0.15)').replace('var(', 'rgba(');
  });

  /** Star breakdown */
  protected readonly stars = computed(() => calculateStars(this.rating()));
}
