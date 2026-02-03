/**
 * @fileoverview Edit Profile Progress Component
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Gamified progress display with animated ring, tier badge, and XP counter.
 * Shows profile completion in an engaging, game-like manner.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated SVG progress ring
 * - Tier badge with glow effect
 * - XP progress bar
 * - Next tier preview
 * - Smooth animations
 *
 * @example
 * ```html
 * <nxt1-edit-profile-progress
 *   [percentage]="78"
 *   [tier]="'mvp'"
 *   [xpEarned]="625"
 *   [xpTotal]="800"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  starOutline,
  starHalfOutline,
  star,
  trophy,
  diamond,
  sparkles,
  chevronForward,
} from 'ionicons/icons';
import type { ProfileCompletionTier } from '@nxt1/core';
import { PROFILE_COMPLETION_TIERS } from '@nxt1/core';

// Register icons
addIcons({
  starOutline,
  starHalfOutline,
  star,
  trophy,
  diamond,
  sparkles,
  chevronForward,
});

@Component({
  selector: 'nxt1-edit-profile-progress',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="progress-container">
      <!-- Main Progress Ring -->
      <div class="progress-ring-wrapper">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <!-- Background circle -->
          <circle class="progress-ring__bg" cx="60" cy="60" r="52" fill="none" stroke-width="8" />

          <!-- Progress circle -->
          <circle
            class="progress-ring__progress"
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke-width="8"
            [attr.stroke]="tierConfig()?.color ?? '#ccff00'"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="progressOffset()"
            stroke-linecap="round"
          />

          <!-- Glow effect -->
          <defs>
            <filter id="progressGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <!-- Center Content -->
        <div class="progress-center">
          <div
            class="tier-badge"
            [style.--tier-color]="tierConfig()?.color"
            [style.--tier-glow]="tierConfig()?.color + '40'"
          >
            <ion-icon [name]="tierConfig()?.icon ?? 'star-outline'"></ion-icon>
          </div>
          <span class="percentage">{{ percentage() }}%</span>
          <span class="tier-label">{{ tierConfig()?.label ?? 'Rookie' }}</span>
        </div>
      </div>

      <!-- Progress Details -->
      <div class="progress-details">
        <!-- XP Bar -->
        <div class="xp-section">
          <div class="xp-header">
            <span class="xp-label">
              <ion-icon name="sparkles"></ion-icon>
              XP Progress
            </span>
            <span class="xp-count">{{ xpEarned() }} / {{ xpTotal() }}</span>
          </div>
          <div class="xp-bar">
            <div
              class="xp-bar__fill"
              [style.width.%]="xpPercent()"
              [style.background]="tierConfig()?.color"
            ></div>
          </div>
        </div>

        <!-- Next Tier Preview -->
        @if (nextTierConfig()) {
          <div class="next-tier">
            <span class="next-tier__label">Next:</span>
            <div class="next-tier__badge" [style.--tier-color]="nextTierConfig()?.color">
              <ion-icon [name]="nextTierConfig()?.icon ?? 'star'"></ion-icon>
              <span>{{ nextTierConfig()?.label }}</span>
            </div>
            <div class="next-tier__progress">
              <span>{{ progressToNextTier() | number: '1.0-0' }}%</span>
              <ion-icon name="chevron-forward"></ion-icon>
            </div>
          </div>
        } @else {
          <div class="max-tier">
            <ion-icon name="diamond"></ion-icon>
            <span>Maximum tier achieved!</span>
          </div>
        }

        <!-- Fields Progress -->
        <div class="fields-progress">
          <span class="fields-count">
            <strong>{{ fieldsCompleted() }}</strong> of {{ fieldsTotal() }} fields complete
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       EDIT PROFILE PROGRESS - Gamified Ring
       iOS 26 Liquid Glass Design
       ============================================ */

      :host {
        display: block;
      }

      .progress-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-5);
      }

      /* ============================================
         PROGRESS RING
         ============================================ */

      .progress-ring-wrapper {
        position: relative;
        width: 140px;
        height: 140px;
      }

      .progress-ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .progress-ring__bg {
        stroke: var(--nxt1-color-surface-200);
      }

      .progress-ring__progress {
        filter: url(#progressGlow);
        transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* ============================================
         CENTER CONTENT
         ============================================ */

      .progress-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1);
      }

      .tier-badge {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full);
        background: var(--tier-color, var(--nxt1-color-primary));
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 20px var(--tier-glow, rgba(204, 255, 0, 0.25));
        animation: badgePulse 2s ease-in-out infinite;

        ion-icon {
          font-size: 20px;
          color: var(--nxt1-color-bg-primary);
        }
      }

      @keyframes badgePulse {
        0%,
        100% {
          box-shadow: 0 0 20px var(--tier-glow, rgba(204, 255, 0, 0.25));
        }
        50% {
          box-shadow: 0 0 30px var(--tier-glow, rgba(204, 255, 0, 0.4));
        }
      }

      .percentage {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1;
      }

      .tier-label {
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ============================================
         PROGRESS DETAILS
         ============================================ */

      .progress-details {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         XP SECTION
         ============================================ */

      .xp-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .xp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .xp-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          color: var(--nxt1-color-primary);
        }
      }

      .xp-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .xp-bar {
        height: 8px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .xp-bar__fill {
        height: 100%;
        border-radius: var(--nxt1-radius-full);
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* ============================================
         NEXT TIER
         ============================================ */

      .next-tier {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .next-tier__label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .next-tier__badge {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        background: color-mix(in srgb, var(--tier-color) 15%, transparent);
        border-radius: var(--nxt1-radius-md);

        ion-icon {
          font-size: 14px;
          color: var(--tier-color);
        }

        span {
          font-size: var(--nxt1-fontSize-xs);
          font-weight: 600;
          color: var(--tier-color);
        }
      }

      .next-tier__progress {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 14px;
        }
      }

      /* ============================================
         MAX TIER
         ============================================ */

      .max-tier {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent),
          color-mix(in srgb, var(--nxt1-color-primary) 5%, transparent)
        );
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);

        ion-icon {
          color: var(--nxt1-color-primary);
        }

        span {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-primary);
          font-weight: 500;
        }
      }

      /* ============================================
         FIELDS PROGRESS
         ============================================ */

      .fields-progress {
        text-align: center;
      }

      .fields-count {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);

        strong {
          color: var(--nxt1-color-text-primary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileProgressComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly percentage = input.required<number>();
  readonly tier = input.required<ProfileCompletionTier>();
  readonly tierConfig = input<(typeof PROFILE_COMPLETION_TIERS)[ProfileCompletionTier] | null>(
    null
  );
  readonly nextTierConfig = input<(typeof PROFILE_COMPLETION_TIERS)[ProfileCompletionTier] | null>(
    null
  );
  readonly progressToNextTier = input<number>(0);
  readonly xpEarned = input<number>(0);
  readonly xpTotal = input<number>(800);
  readonly fieldsCompleted = input<number>(0);
  readonly fieldsTotal = input<number>(36);

  // ============================================
  // CONSTANTS
  // ============================================

  readonly radius = 52;
  readonly circumference = 2 * Math.PI * this.radius;

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly progressOffset = computed(() => {
    const percent = this.percentage();
    const offset = this.circumference - (percent / 100) * this.circumference;
    return offset;
  });

  protected readonly xpPercent = computed(() => {
    const earned = this.xpEarned();
    const total = this.xpTotal();
    return total > 0 ? (earned / total) * 100 : 0;
  });
}
