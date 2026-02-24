/**
 * @fileoverview XP Progress Ring Component
 * @module @nxt1/ui/xp
 * @version 1.0.0
 *
 * Animated circular progress indicator showing XP, level, and completion.
 * Gamified design with glowing effects and smooth animations.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated SVG progress ring
 * - Level badge display
 * - XP counter with animation
 * - Streak indicator
 * - Glow effects on progress
 *
 * @example
 * ```html
 * <nxt1-xp-progress
 *   [progress]="progress()"
 *   [levelProgress]="levelProgress()"
 *   size="large"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  star,
  starOutline,
  starHalfOutline,
  trophy,
  trophyOutline,
  flame,
  flameOutline,
} from 'ionicons/icons';
import type { MissionProgress } from '@nxt1/core';

// Register icons
type ProgressSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'nxt1-xp-progress',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div
      class="xp-progress"
      [class.xp-progress--small]="size() === 'small'"
      [class.xp-progress--medium]="size() === 'medium'"
      [class.xp-progress--large]="size() === 'large'"
    >
      <!-- SVG Progress Ring -->
      <svg
        class="xp-progress__ring"
        [attr.viewBox]="viewBox()"
        [style.--progress]="levelProgress()"
      >
        <!-- Background circle -->
        <circle
          class="xp-progress__ring-bg"
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          fill="none"
          [attr.stroke-width]="strokeWidth()"
        />

        <!-- Progress circle -->
        <circle
          class="xp-progress__ring-progress"
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          fill="none"
          [attr.stroke-width]="strokeWidth()"
          [attr.stroke-dasharray]="circumference()"
          [attr.stroke-dashoffset]="progressOffset()"
          [style.--level-color]="levelColor()"
        />

        <!-- Glow filter -->
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <!-- Center Content -->
      <div class="xp-progress__content">
        <!-- Level Icon -->
        <div class="xp-progress__level-icon" [style.color]="levelColor()">
          <ion-icon [name]="levelIcon()"></ion-icon>
        </div>

        <!-- Level Name -->
        <span class="xp-progress__level-name">{{ levelName() }}</span>

        <!-- XP Display -->
        <div class="xp-progress__xp">
          <span class="xp-progress__xp-current">{{ currentXp() }}</span>
          <span class="xp-progress__xp-divider">/</span>
          <span class="xp-progress__xp-total">{{ xpToNextLevel() }}</span>
          <span class="xp-progress__xp-label">XP</span>
        </div>
      </div>

      <!-- Streak Badge (if active) -->
      @if (showStreak() && streakCount() > 0) {
        <div class="xp-progress__streak" [class.xp-progress__streak--at-risk]="isStreakAtRisk()">
          <ion-icon name="flame"></ion-icon>
          <span>{{ streakCount() }}</span>
        </div>
      }

      <!-- Completion Percentage (for large size) -->
      @if (size() === 'large' && progress()) {
        <div class="xp-progress__completion">
          <span class="xp-progress__completion-value">{{ completionPercentage() }}</span>
          <span class="xp-progress__completion-label">% Complete</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       XP PROGRESS - Gamified Progress Ring
       iOS 26 Liquid Glass Design
       ============================================ */

      :host {
        display: block;
      }

      .xp-progress {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Size variations */
      .xp-progress--small {
        width: 60px;
        height: 60px;
      }

      .xp-progress--medium {
        width: 100px;
        height: 100px;
      }

      .xp-progress--large {
        width: 140px;
        height: 140px;
      }

      /* ============================================
       SVG RING
       ============================================ */

      .xp-progress__ring {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .xp-progress__ring-bg {
        stroke: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .xp-progress__ring-progress {
        stroke: var(--level-color, var(--nxt1-color-primary, #ccff00));
        stroke-linecap: round;
        transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        filter: url(#glow);
      }

      /* ============================================
       CENTER CONTENT
       ============================================ */

      .xp-progress__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        z-index: 1;
      }

      .xp-progress__level-icon {
        font-size: 20px;
        line-height: 1;
      }

      .xp-progress--small .xp-progress__level-icon {
        font-size: 14px;
      }

      .xp-progress--large .xp-progress__level-icon {
        font-size: 28px;
      }

      .xp-progress__level-name {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .xp-progress--small .xp-progress__level-name {
        display: none;
      }

      .xp-progress--large .xp-progress__level-name {
        font-size: 11px;
      }

      .xp-progress__xp {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
      }

      .xp-progress--small .xp-progress__xp {
        display: none;
      }

      .xp-progress__xp-current {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .xp-progress--large .xp-progress__xp-current {
        font-size: 18px;
      }

      .xp-progress__xp-divider {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .xp-progress__xp-total {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .xp-progress__xp-label {
        font-size: 8px;
        font-weight: 500;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin-left: 2px;
      }

      /* ============================================
       STREAK BADGE
       ============================================ */

      .xp-progress__streak {
        position: absolute;
        bottom: -4px;
        right: -4px;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px 8px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-warning),
          var(--nxt1-color-warningDark)
        );
        border-radius: 12px;
        box-shadow:
          0 2px 8px var(--nxt1-color-warningBg),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }

      .xp-progress__streak ion-icon {
        font-size: 12px;
        color: var(--nxt1-color-text-onPrimary);
      }

      .xp-progress__streak span {
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-onPrimary);
      }

      .xp-progress__streak--at-risk {
        animation: pulse-warning 1.5s ease-in-out infinite;
      }

      @keyframes pulse-warning {
        0%,
        100% {
          transform: scale(1);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 4px 16px rgba(245, 158, 11, 0.6);
        }
      }

      /* ============================================
       COMPLETION (Large only)
       ============================================ */

      .xp-progress__completion {
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: baseline;
        gap: 4px;
        white-space: nowrap;
      }

      .xp-progress__completion-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
        font-variant-numeric: tabular-nums;
      }

      .xp-progress__completion-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpProgressComponent {
  constructor() {
    addIcons({
      star,
      starOutline,
      starHalfOutline,
      trophy,
      trophyOutline,
      flame,
      flameOutline,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** User's mission progress */
  readonly progress = input<MissionProgress | null>(null);

  /** Level progress percentage (0-100) */
  readonly levelProgress = input<number>(0);

  /** Component size */
  readonly size = input<ProgressSize>('medium');

  /** Show streak badge */
  readonly showStreak = input<boolean>(true);

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** SVG viewBox based on size */
  protected readonly viewBox = computed(() => {
    const dim = this.dimensions();
    return `0 0 ${dim} ${dim}`;
  });

  /** Dimensions based on size */
  protected readonly dimensions = computed(() => {
    switch (this.size()) {
      case 'small':
        return 60;
      case 'large':
        return 140;
      default:
        return 100;
    }
  });

  /** Center point */
  protected readonly center = computed(() => this.dimensions() / 2);

  /** Radius */
  protected readonly radius = computed(() => {
    const dim = this.dimensions();
    const stroke = this.strokeWidth();
    return (dim - stroke) / 2;
  });

  /** Stroke width */
  protected readonly strokeWidth = computed(() => {
    switch (this.size()) {
      case 'small':
        return 4;
      case 'large':
        return 8;
      default:
        return 6;
    }
  });

  /** Circumference */
  protected readonly circumference = computed(() => {
    return 2 * Math.PI * this.radius();
  });

  /** Progress offset */
  protected readonly progressOffset = computed(() => {
    const progress = Math.min(100, Math.max(0, this.levelProgress()));
    const circumference = this.circumference();
    return circumference - (progress / 100) * circumference;
  });

  /** Level icon */
  protected readonly levelIcon = computed(() => {
    const prog = this.progress();
    return prog?.level.icon ?? 'star-outline';
  });

  /** Level name */
  protected readonly levelName = computed(() => {
    const prog = this.progress();
    return prog?.level.name ?? 'Rookie';
  });

  /** Level color */
  protected readonly levelColor = computed(() => {
    const prog = this.progress();
    return prog?.level.color ?? 'var(--nxt1-color-primary)';
  });

  /** Current XP */
  protected readonly currentXp = computed(() => {
    const prog = this.progress();
    return prog?.currentXp ?? 0;
  });

  /** XP to next level */
  protected readonly xpToNextLevel = computed(() => {
    const prog = this.progress();
    if (!prog) return 500;
    return prog.level.maxXp === Infinity ? prog.currentXp : prog.level.maxXp - prog.level.minXp;
  });

  /** Streak count */
  protected readonly streakCount = computed(() => {
    const prog = this.progress();
    return prog?.streak.current ?? 0;
  });

  /** Is streak at risk */
  protected readonly isStreakAtRisk = computed(() => {
    const prog = this.progress();
    return prog?.streak.status === 'at-risk';
  });

  /** Completion percentage */
  protected readonly completionPercentage = computed(() => {
    const prog = this.progress();
    return prog?.completionPercentage ?? 0;
  });
}
