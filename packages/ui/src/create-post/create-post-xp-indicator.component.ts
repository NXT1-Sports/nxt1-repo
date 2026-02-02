/**
 * @fileoverview Create Post XP Indicator Component - Gamified Display
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Animated XP reward indicator with breakdown tooltip.
 * Shows potential XP before posting and earned XP after.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated XP count on changes
 * - Breakdown tooltip/popover
 * - Confetti celebration on success
 * - Streak indicator
 * - First post bonus highlight
 *
 * @example
 * ```html
 * <nxt1-create-post-xp-indicator
 *   [xpBreakdown]="xpPreview()"
 *   [showCelebration]="showCelebration()"
 *   [isPreview]="true"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  sparkles,
  flameOutline,
  flame,
  starOutline,
  star,
  trendingUpOutline,
  chevronDownOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import type { PostXpBreakdown } from '@nxt1/core';

// Register icons
addIcons({
  'sparkles-outline': sparklesOutline,
  sparkles,
  'flame-outline': flameOutline,
  flame,
  'star-outline': starOutline,
  star,
  'trending-up-outline': trendingUpOutline,
  'chevron-down-outline': chevronDownOutline,
  'information-circle-outline': informationCircleOutline,
});

@Component({
  selector: 'nxt1-create-post-xp-indicator',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div
      class="xp-indicator"
      [class.xp-indicator--preview]="isPreview()"
      [class.xp-indicator--earned]="!isPreview()"
      [class.xp-indicator--celebrating]="showCelebration()"
      [class.xp-indicator--first-post]="xpBreakdown()?.isFirstPost"
      [class.xp-indicator--expanded]="isExpanded()"
      (click)="toggleExpand()"
      role="button"
      [attr.aria-expanded]="isExpanded()"
      aria-label="XP reward breakdown"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Main badge -->
      <div class="xp-badge">
        <!-- Icon with animation -->
        <div class="xp-icon" [class.xp-icon--animated]="showCelebration()">
          @if (showCelebration()) {
            <ion-icon name="sparkles" class="xp-icon__sparkle"></ion-icon>
          } @else {
            <ion-icon name="sparkles-outline"></ion-icon>
          }
        </div>

        <!-- XP Amount -->
        <span class="xp-amount" [class.xp-amount--counting]="isAnimating()">
          @if (isPreview()) {
            <span class="xp-label">+</span>
          }
          <span class="xp-value">{{ displayXp() }}</span>
          <span class="xp-suffix">XP</span>
        </span>

        <!-- Streak indicator -->
        @if (xpBreakdown()?.streakCount && xpBreakdown()!.streakCount > 1) {
          <div class="xp-streak">
            <ion-icon name="flame" class="xp-streak__icon"></ion-icon>
            <span class="xp-streak__count">{{ xpBreakdown()?.streakCount }}</span>
          </div>
        }

        <!-- Expand chevron -->
        @if (xpBreakdown()) {
          <ion-icon
            name="chevron-down-outline"
            class="xp-expand-icon"
            [class.xp-expand-icon--rotated]="isExpanded()"
          ></ion-icon>
        }
      </div>

      <!-- Celebration confetti particles -->
      @if (showCelebration()) {
        <div class="xp-confetti" aria-hidden="true">
          @for (i of confettiParticles; track i) {
            <div
              class="xp-confetti__particle"
              [style.--delay]="i * 0.05 + 's'"
              [style.--angle]="i * (360 / confettiParticles.length) + 'deg'"
            ></div>
          }
        </div>
      }

      <!-- Expanded breakdown -->
      @if (isExpanded() && xpBreakdown()) {
        <div class="xp-breakdown" (click)="$event.stopPropagation()">
          <div class="xp-breakdown__header">
            <span class="xp-breakdown__title">XP Breakdown</span>
            @if (xpBreakdown()?.isFirstPost) {
              <span class="xp-breakdown__badge">First Post!</span>
            }
          </div>

          <div class="xp-breakdown__items">
            <!-- Base XP -->
            <div class="xp-breakdown__item">
              <span class="xp-breakdown__item-label">Base XP</span>
              <span class="xp-breakdown__item-value">+{{ xpBreakdown()?.baseXp }}</span>
            </div>

            <!-- Media Bonus -->
            @if (xpBreakdown()?.mediaBonus && xpBreakdown()!.mediaBonus > 0) {
              <div class="xp-breakdown__item">
                <span class="xp-breakdown__item-label">Media Bonus</span>
                <span class="xp-breakdown__item-value xp-breakdown__item-value--bonus">
                  +{{ xpBreakdown()?.mediaBonus }}
                </span>
              </div>
            }

            <!-- Tag Bonus -->
            @if (xpBreakdown()?.tagBonus && xpBreakdown()!.tagBonus > 0) {
              <div class="xp-breakdown__item">
                <span class="xp-breakdown__item-label">Tag Bonus</span>
                <span class="xp-breakdown__item-value xp-breakdown__item-value--bonus">
                  +{{ xpBreakdown()?.tagBonus }}
                </span>
              </div>
            }

            <!-- Daily Bonus -->
            @if (xpBreakdown()?.dailyBonus && xpBreakdown()!.dailyBonus > 0) {
              <div class="xp-breakdown__item">
                <span class="xp-breakdown__item-label">
                  <ion-icon name="star-outline"></ion-icon>
                  Daily Bonus
                </span>
                <span class="xp-breakdown__item-value xp-breakdown__item-value--bonus">
                  +{{ xpBreakdown()?.dailyBonus }}
                </span>
              </div>
            }

            <!-- Streak Bonus -->
            @if (xpBreakdown()?.streakBonus && xpBreakdown()!.streakBonus > 0) {
              <div class="xp-breakdown__item">
                <span class="xp-breakdown__item-label">
                  <ion-icon name="flame-outline"></ion-icon>
                  Streak Bonus ({{ xpBreakdown()?.streakCount }} days)
                </span>
                <span class="xp-breakdown__item-value xp-breakdown__item-value--streak">
                  +{{ xpBreakdown()?.streakBonus }}
                </span>
              </div>
            }
          </div>

          <!-- Total -->
          <div class="xp-breakdown__total">
            <span class="xp-breakdown__total-label">Total</span>
            <span class="xp-breakdown__total-value">+{{ xpBreakdown()?.totalXp }} XP</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         XP INDICATOR - Gamified Reward Display
         Theme-aware with design tokens
         ============================================ */

      :host {
        display: inline-block;
      }

      /* Main container */
      .xp-indicator {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      /* Badge container */
      .xp-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        transition: all var(--nxt1-duration-normal, 200ms) var(--nxt1-easing-out, ease-out);
        overflow: hidden;
      }

      .xp-indicator:hover .xp-badge {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .xp-indicator--preview .xp-badge {
        background: var(--nxt1-color-alpha-primary6, rgba(204, 255, 0, 0.06));
        border-color: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      .xp-indicator--earned .xp-badge {
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
        border-color: var(--nxt1-color-success, #22c55e);
      }

      .xp-indicator--celebrating .xp-badge {
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
        border-color: var(--nxt1-color-primary, #ccff00);
        box-shadow: 0 0 20px var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.3));
        animation: xp-pulse 0.6s ease-out;
      }

      .xp-indicator--first-post .xp-badge {
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-warning20, rgba(245, 158, 11, 0.2)),
          var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2))
        );
        border-color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
         XP ICON
         ============================================ */

      .xp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 18px;
      }

      .xp-indicator--earned .xp-icon {
        color: var(--nxt1-color-success, #22c55e);
      }

      .xp-icon--animated {
        animation: xp-sparkle 0.8s ease-out;
      }

      .xp-icon__sparkle {
        filter: drop-shadow(0 0 8px var(--nxt1-color-primary, #ccff00));
      }

      /* ============================================
         XP AMOUNT
         ============================================ */

      .xp-amount {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-family: var(--nxt1-fontFamily-brand, 'Inter', sans-serif);
      }

      .xp-label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .xp-value {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        min-width: 24px;
        text-align: center;
      }

      .xp-indicator--preview .xp-value {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .xp-indicator--celebrating .xp-value {
        animation: xp-count 0.5s ease-out;
      }

      .xp-suffix {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* ============================================
         STREAK INDICATOR
         ============================================ */

      .xp-streak {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px 6px;
        margin-left: 4px;
        background: var(--nxt1-color-alpha-warning20, rgba(245, 158, 11, 0.2));
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .xp-streak__icon {
        font-size: 12px;
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .xp-streak__count {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 700;
        color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
         EXPAND ICON
         ============================================ */

      .xp-expand-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        transition: transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        margin-left: 2px;
      }

      .xp-expand-icon--rotated {
        transform: rotate(180deg);
      }

      /* ============================================
         CONFETTI PARTICLES
         ============================================ */

      .xp-confetti {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        pointer-events: none;
      }

      .xp-confetti__particle {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        animation: confetti-burst 0.8s ease-out forwards;
        animation-delay: var(--delay, 0s);
        transform-origin: center;
      }

      .xp-confetti__particle:nth-child(odd) {
        background: var(--nxt1-color-warning, #f59e0b);
      }

      .xp-confetti__particle:nth-child(3n) {
        background: var(--nxt1-color-success, #22c55e);
      }

      /* ============================================
         BREAKDOWN PANEL
         ============================================ */

      .xp-breakdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 220px;
        padding: 16px;
        background: var(--nxt1-color-surface-elevated, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 100;
        animation: breakdown-enter 0.2s ease-out;
      }

      .xp-breakdown__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .xp-breakdown__title {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .xp-breakdown__badge {
        padding: 2px 8px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-warning, #f59e0b);
        background: var(--nxt1-color-alpha-warning20, rgba(245, 158, 11, 0.2));
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .xp-breakdown__items {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .xp-breakdown__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .xp-breakdown__item-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .xp-breakdown__item-label ion-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .xp-breakdown__item-value {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .xp-breakdown__item-value--bonus {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .xp-breakdown__item-value--streak {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .xp-breakdown__total {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .xp-breakdown__total-label {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .xp-breakdown__total-value {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         ANIMATIONS
         ============================================ */

      @keyframes xp-pulse {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
        }
      }

      @keyframes xp-sparkle {
        0% {
          transform: scale(0.5) rotate(-15deg);
          opacity: 0;
        }
        50% {
          transform: scale(1.2) rotate(10deg);
          opacity: 1;
        }
        100% {
          transform: scale(1) rotate(0deg);
          opacity: 1;
        }
      }

      @keyframes xp-count {
        0% {
          transform: scale(0.8);
          opacity: 0.5;
        }
        50% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      @keyframes confetti-burst {
        0% {
          transform: translate(0, 0) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(
              calc(cos(var(--angle)) * 60px),
              calc(sin(var(--angle)) * 60px - 20px)
            )
            scale(0);
          opacity: 0;
        }
      }

      @keyframes breakdown-enter {
        0% {
          opacity: 0;
          transform: translateY(-8px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .xp-indicator--celebrating .xp-badge,
        .xp-icon--animated,
        .xp-indicator--celebrating .xp-value,
        .xp-confetti__particle,
        .xp-breakdown {
          animation: none;
        }

        .xp-indicator--celebrating .xp-badge {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostXpIndicatorComponent {
  /** XP breakdown data */
  readonly xpBreakdown = input<PostXpBreakdown | null>(null);

  /** Whether this is a preview (before posting) or earned (after posting) */
  readonly isPreview = input(true);

  /** Whether to show celebration animation */
  readonly showCelebration = input(false);

  /** Emitted when expand state changes */
  readonly expandChange = output<boolean>();

  /** Whether breakdown panel is expanded */
  protected readonly isExpanded = signal(false);

  /** Whether count animation is playing */
  protected readonly isAnimating = signal(false);

  /** Confetti particle indices */
  protected readonly confettiParticles = Array.from({ length: 12 }, (_, i) => i);

  /** Display XP value (for animation) */
  protected readonly displayXp = computed(() => this.xpBreakdown()?.totalXp ?? 0);

  constructor() {
    // Trigger animation when XP changes
    effect(() => {
      const xp = this.xpBreakdown();
      if (xp && this.showCelebration()) {
        this.isAnimating.set(true);
        setTimeout(() => this.isAnimating.set(false), 500);
      }
    });
  }

  /**
   * Toggle breakdown panel expansion.
   */
  protected toggleExpand(): void {
    const newState = !this.isExpanded();
    this.isExpanded.set(newState);
    this.expandChange.emit(newState);
  }
}
