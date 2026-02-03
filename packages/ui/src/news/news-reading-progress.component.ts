/**
 * @fileoverview News Reading Progress Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Circular progress indicator with XP reward display.
 * Shows reading progress and earned XP.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-news-reading-progress
 *   [progress]="75"
 *   [xpEarned]="10"
 *   [xpTotal]="15"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, checkmarkCircle } from 'ionicons/icons';

// Register icons
addIcons({ sparklesOutline, checkmarkCircle });

@Component({
  selector: 'nxt1-news-reading-progress',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div
      class="reading-progress"
      [class.reading-progress--complete]="isComplete()"
      role="progressbar"
      [attr.aria-valuenow]="progress()"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="100"
      [attr.aria-label]="ariaLabel()"
    >
      <!-- Circular Progress Ring -->
      <svg class="reading-progress__ring" viewBox="0 0 36 36">
        <!-- Background Circle -->
        <circle
          class="reading-progress__bg"
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          stroke-width="2"
        />
        <!-- Progress Circle -->
        <circle
          class="reading-progress__fill"
          [class.reading-progress__fill--complete]="isComplete()"
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          stroke-width="2"
          [style.stroke-dasharray]="circumference"
          [style.stroke-dashoffset]="strokeDashoffset()"
          stroke-linecap="round"
        />
      </svg>

      <!-- Center Content -->
      <div class="reading-progress__center">
        @if (isComplete()) {
          <ion-icon name="checkmark-circle" class="reading-progress__complete-icon"></ion-icon>
        } @else {
          <span class="reading-progress__percent">{{ progress() }}%</span>
        }
      </div>

      <!-- XP Badge (below circle) -->
      @if (showXp() && xpTotal() > 0) {
        <div class="reading-progress__xp" [class.reading-progress__xp--earned]="xpEarned() > 0">
          <ion-icon name="sparkles-outline"></ion-icon>
          <span>{{ xpEarned() }}/{{ xpTotal() }} XP</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         NEWS READING PROGRESS - Circular Progress with XP
         ============================================ */

      :host {
        display: inline-flex;
      }

      .reading-progress {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        position: relative;
      }

      /* SVG Ring */
      .reading-progress__ring {
        width: 48px;
        height: 48px;
        transform: rotate(-90deg);
      }

      .reading-progress--complete .reading-progress__ring {
        animation: pulse-complete 0.5s ease;
      }

      @keyframes pulse-complete {
        0%,
        100% {
          transform: rotate(-90deg) scale(1);
        }
        50% {
          transform: rotate(-90deg) scale(1.1);
        }
      }

      /* Background Circle */
      .reading-progress__bg {
        stroke: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* Progress Fill */
      .reading-progress__fill {
        stroke: var(--nxt1-color-primary, #ccff00);
        transition: stroke-dashoffset 0.3s ease;
      }

      .reading-progress__fill--complete {
        stroke: var(--nxt1-color-feedback-success, #22c55e);
      }

      /* Center Content */
      .reading-progress__center {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .reading-progress__percent {
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .reading-progress__complete-icon {
        font-size: 20px;
        color: var(--nxt1-color-feedback-success, #22c55e);
        animation: check-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      @keyframes check-pop {
        0% {
          transform: scale(0);
        }
        50% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
        }
      }

      /* XP Badge */
      .reading-progress__xp {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .reading-progress__xp ion-icon {
        font-size: 12px;
      }

      .reading-progress__xp--earned {
        background: rgba(204, 255, 0, 0.1);
        color: var(--nxt1-color-primary, #ccff00);
      }

      .reading-progress__xp--earned ion-icon {
        animation: sparkle 0.5s ease;
      }

      @keyframes sparkle {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.2) rotate(15deg);
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .reading-progress__ring,
        .reading-progress__complete-icon,
        .reading-progress__xp--earned ion-icon,
        .reading-progress__fill {
          animation: none;
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsReadingProgressComponent {
  /** Current reading progress (0-100) */
  readonly progress = input<number>(0);

  /** XP earned so far */
  readonly xpEarned = input<number>(0);

  /** Total XP available for this article */
  readonly xpTotal = input<number>(15);

  /** Whether to show XP indicator */
  readonly showXp = input<boolean>(true);

  /** SVG circle circumference */
  readonly circumference = 100;

  /** Whether reading is complete */
  readonly isComplete = computed(() => this.progress() >= 100);

  /** Calculate stroke dashoffset for progress */
  readonly strokeDashoffset = computed(() => {
    const progress = Math.min(100, Math.max(0, this.progress()));
    return this.circumference - (progress / 100) * this.circumference;
  });

  /** Aria label for accessibility */
  readonly ariaLabel = computed(() => {
    if (this.isComplete()) {
      return `Reading complete. ${this.xpEarned()} of ${this.xpTotal()} XP earned.`;
    }
    return `Reading progress: ${this.progress()}%. ${this.xpEarned()} of ${this.xpTotal()} XP earned.`;
  });
}
