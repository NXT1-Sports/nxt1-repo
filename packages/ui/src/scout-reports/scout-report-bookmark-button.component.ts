/**
 * @fileoverview Scout Report Bookmark Button Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Animated bookmark/save button with haptic feedback.
 * Premium micro-interaction design.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Filled/outline state toggle
 * - Pop animation on toggle
 * - Haptic feedback
 * - Loading state
 * - Accessible
 *
 * @example
 * ```html
 * <nxt1-scout-report-bookmark-button
 *   [isBookmarked]="report.isBookmarked"
 *   [isLoading]="isSaving()"
 *   (toggle)="onBookmark(report.id)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bookmark, bookmarkOutline } from 'ionicons/icons';

// Register icons
addIcons({ bookmark, bookmarkOutline });

@Component({
  selector: 'nxt1-scout-report-bookmark-button',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner],
  template: `
    <button
      class="bookmark-btn"
      [class.bookmark-btn--active]="isBookmarked()"
      [class.bookmark-btn--loading]="isLoading()"
      [class.bookmark-btn--animating]="isAnimating()"
      [disabled]="isLoading()"
      [attr.aria-label]="isBookmarked() ? 'Remove bookmark' : 'Add bookmark'"
      [attr.aria-pressed]="isBookmarked()"
      (click)="onClick($event)"
    >
      @if (isLoading()) {
        <ion-spinner name="crescent" class="bookmark-btn__spinner"></ion-spinner>
      } @else {
        <ion-icon
          [name]="isBookmarked() ? 'bookmark' : 'bookmark-outline'"
          class="bookmark-btn__icon"
        ></ion-icon>
      }

      <!-- Animation particles -->
      @if (isAnimating() && isBookmarked()) {
        <div class="bookmark-particles">
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <span class="particle" [style.--i]="i"></span>
          }
        </div>
      }
    </button>
  `,
  styles: [
    `
      /* ============================================
         BOOKMARK BUTTON
         ============================================ */

      :host {
        display: inline-flex;
      }

      .bookmark-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-elevated, #252525);
        cursor: pointer;
        transition: all 0.2s ease;
        overflow: visible;
      }

      .bookmark-btn:hover:not(:disabled) {
        background: var(--nxt1-color-surface, #1a1a1a);
        transform: scale(1.05);
      }

      .bookmark-btn:active:not(:disabled) {
        transform: scale(0.95);
      }

      .bookmark-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* ============================================
         ICON
         ============================================ */

      .bookmark-btn__icon {
        font-size: 20px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        transition: all 0.2s ease;
      }

      .bookmark-btn--active .bookmark-btn__icon {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .bookmark-btn:hover:not(:disabled) .bookmark-btn__icon {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .bookmark-btn--active:hover:not(:disabled) .bookmark-btn__icon {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
         ANIMATION STATE
         ============================================ */

      .bookmark-btn--animating .bookmark-btn__icon {
        animation: bookmark-pop 0.4s ease;
      }

      @keyframes bookmark-pop {
        0% {
          transform: scale(1);
        }
        25% {
          transform: scale(1.3);
        }
        50% {
          transform: scale(0.9);
        }
        75% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
        }
      }

      /* ============================================
         PARTICLES
         ============================================ */

      .bookmark-particles {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        pointer-events: none;
      }

      .particle {
        position: absolute;
        width: 6px;
        height: 6px;
        background: var(--nxt1-color-warning, #f59e0b);
        border-radius: var(--nxt1-radius-full, 9999px);
        animation: particle-burst 0.5s ease-out forwards;
        animation-delay: calc(var(--i) * 0.03s);
        transform: translate(-50%, -50%);
      }

      @keyframes particle-burst {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(
              calc(-50% + cos(calc(var(--i) * 60deg)) * 30px),
              calc(-50% + sin(calc(var(--i) * 60deg)) * 30px)
            )
            scale(0);
        }
      }

      /* Particle positions using CSS math */
      .particle:nth-child(1) {
        --angle: 0deg;
      }
      .particle:nth-child(2) {
        --angle: 60deg;
      }
      .particle:nth-child(3) {
        --angle: 120deg;
      }
      .particle:nth-child(4) {
        --angle: 180deg;
      }
      .particle:nth-child(5) {
        --angle: 240deg;
      }
      .particle:nth-child(6) {
        --angle: 300deg;
      }

      @keyframes particle-burst {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          /* Fallback for browsers not supporting trig functions */
          transform: translate(
              calc(-50% + var(--i) * 5px - 15px),
              calc(-50% + var(--i) * 5px - 15px)
            )
            scale(0);
        }
      }

      /* ============================================
         SPINNER
         ============================================ */

      .bookmark-btn__spinner {
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        width: 18px;
        height: 18px;
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .bookmark-btn {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        .bookmark-btn:hover:not(:disabled) {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .bookmark-btn__icon {
          color: var(--nxt1-color-gray-500, #6b7280);
        }

        .bookmark-btn:hover:not(:disabled) .bookmark-btn__icon {
          color: var(--nxt1-color-gray-900, #111827);
        }

        .bookmark-btn__spinner {
          --color: var(--nxt1-color-gray-500, #6b7280);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportBookmarkButtonComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Whether item is bookmarked */
  readonly isBookmarked = input<boolean>(false);

  /** Whether bookmark action is loading */
  readonly isLoading = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when bookmark is toggled */
  readonly toggle = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Whether animation is playing */
  protected readonly isAnimating = signal(false);

  // ============================================
  // METHODS
  // ============================================

  /**
   * Handle click.
   */
  protected onClick(event: MouseEvent): void {
    event.stopPropagation();

    if (this.isLoading()) return;

    // Trigger animation if bookmarking (not unbookmarking)
    if (!this.isBookmarked()) {
      this.isAnimating.set(true);
      setTimeout(() => this.isAnimating.set(false), 500);
    }

    this.toggle.emit();
  }
}
