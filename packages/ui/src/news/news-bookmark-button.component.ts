/**
 * @fileoverview News Bookmark Button Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Animated bookmark button with heart-style save animation.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-news-bookmark-button
 *   [isBookmarked]="article.isBookmarked"
 *   (bookmarkToggle)="onBookmarkToggle()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bookmarkOutline, bookmark } from 'ionicons/icons';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
@Component({
  selector: 'nxt1-news-bookmark-button',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <button
      type="button"
      class="bookmark-btn"
      [class.bookmark-btn--active]="isBookmarked()"
      [class.bookmark-btn--animating]="isAnimating"
      (click)="handleClick()"
      [attr.aria-label]="isBookmarked() ? 'Remove bookmark' : 'Bookmark article'"
      [attr.aria-pressed]="isBookmarked()"
    >
      <ion-icon
        [name]="isBookmarked() ? 'bookmark' : 'bookmark-outline'"
        class="bookmark-btn__icon"
      ></ion-icon>

      <!-- Pop particles for animation -->
      @if (isAnimating) {
        <div class="bookmark-btn__particles">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <span
              class="bookmark-btn__particle"
              [style.--particle-angle]="(i - 1) * 60 + 'deg'"
            ></span>
          }
        </div>
      }
    </button>
  `,
  styles: [
    `
      /* ============================================
         NEWS BOOKMARK BUTTON - Animated Save Action
         Instagram-style heart animation
         ============================================ */

      :host {
        display: inline-block;
      }

      .bookmark-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition: background-color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .bookmark-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
      }

      .bookmark-btn:active {
        transform: scale(0.9);
      }

      .bookmark-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* Icon */
      .bookmark-btn__icon {
        font-size: 24px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        transition:
          color 0.15s ease,
          transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      /* Active State */
      .bookmark-btn--active .bookmark-btn__icon {
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* Animating State - Pop Effect */
      .bookmark-btn--animating .bookmark-btn__icon {
        animation: bookmark-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      @keyframes bookmark-pop {
        0% {
          transform: scale(1);
        }
        25% {
          transform: scale(0.8);
        }
        50% {
          transform: scale(1.2);
        }
        75% {
          transform: scale(0.95);
        }
        100% {
          transform: scale(1);
        }
      }

      /* Particle Effects */
      .bookmark-btn__particles {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        pointer-events: none;
      }

      .bookmark-btn__particle {
        position: absolute;
        width: 6px;
        height: 6px;
        background: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(-20px);
        animation: particle-burst 0.4s ease-out forwards;
        opacity: 0;
      }

      @keyframes particle-burst {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(0);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(-30px) scale(0);
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .bookmark-btn__icon,
        .bookmark-btn__particle {
          animation: none;
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsBookmarkButtonComponent {
  constructor() {
    addIcons({ bookmarkOutline, bookmark });
  }

  private readonly haptics = inject(HapticsService);

  /** Whether the article is currently bookmarked */
  readonly isBookmarked = input<boolean>(false);

  /** Size variant */
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  /** Emitted when bookmark is toggled */
  readonly bookmarkToggle = output<void>();

  /** Animation state */
  isAnimating = false;

  /**
   * Handle button click.
   */
  async handleClick(): Promise<void> {
    // Trigger animation only when bookmarking (not unbookmarking)
    if (!this.isBookmarked()) {
      this.isAnimating = true;
      setTimeout(() => {
        this.isAnimating = false;
      }, 400);
    }

    await this.haptics.impact(this.isBookmarked() ? 'light' : 'medium');
    this.bookmarkToggle.emit();
  }
}
