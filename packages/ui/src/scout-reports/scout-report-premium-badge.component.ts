/**
 * @fileoverview Scout Report Premium Badge Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Premium/exclusive content badge indicator.
 * Shows when content requires premium subscription.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Gradient shimmer animation
 * - Diamond/star icon
 * - Compact and full modes
 * - Tooltip on hover
 *
 * @example
 * ```html
 * <nxt1-scout-report-premium-badge
 *   [variant]="'gold'"
 *   [showLabel]="true"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { diamond, star, ribbon, trophy } from 'ionicons/icons';

// Register icons
/**
 * Badge variant styles.
 */
export type PremiumBadgeVariant = 'gold' | 'platinum' | 'elite' | 'verified';

/**
 * Badge configuration.
 */
interface BadgeConfig {
  readonly icon: string;
  readonly label: string;
  readonly gradient: string;
  readonly glow: string;
}

/**
 * Badge configs by variant.
 */
const BADGE_CONFIGS: Record<PremiumBadgeVariant, BadgeConfig> = {
  gold: {
    icon: 'star',
    label: 'Premium',
    gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  platinum: {
    icon: 'diamond',
    label: 'Platinum',
    gradient: 'linear-gradient(135deg, #94a3b8, #e2e8f0, #94a3b8)',
    glow: 'rgba(148, 163, 184, 0.4)',
  },
  elite: {
    icon: 'trophy',
    label: 'Elite',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa, #8b5cf6)',
    glow: 'rgba(139, 92, 246, 0.4)',
  },
  verified: {
    icon: 'ribbon',
    label: 'Verified',
    gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa, #3b82f6)',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
};

@Component({
  selector: 'nxt1-scout-report-premium-badge',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div
      class="premium-badge"
      [class.premium-badge--with-label]="showLabel()"
      [style.--gradient]="config.gradient"
      [style.--glow]="config.glow"
      [title]="config.label"
    >
      <ion-icon [name]="config.icon" class="premium-badge__icon"></ion-icon>
      @if (showLabel()) {
        <span class="premium-badge__label">{{ config.label }}</span>
      }
      <div class="premium-badge__shimmer"></div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         PREMIUM BADGE
         ============================================ */

      :host {
        display: inline-flex;
      }

      .premium-badge {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: var(--gradient);
        border-radius: var(--nxt1-radius-full, 9999px);
        box-shadow: 0 2px 8px var(--glow);
        overflow: hidden;
      }

      .premium-badge--with-label {
        width: auto;
        height: auto;
        padding: 4px 10px 4px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        gap: var(--nxt1-spacing-1, 4px);
      }

      /* ============================================
         ICON
         ============================================ */

      .premium-badge__icon {
        font-size: 14px;
        color: white;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
        z-index: 1;
      }

      .premium-badge--with-label .premium-badge__icon {
        font-size: 12px;
      }

      /* ============================================
         LABEL
         ============================================ */

      .premium-badge__label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: white;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        z-index: 1;
      }

      /* ============================================
         SHIMMER ANIMATION
         ============================================ */

      .premium-badge__shimmer {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
        animation: shimmer 3s ease-in-out infinite;
      }

      @keyframes shimmer {
        0% {
          left: -100%;
        }
        50%,
        100% {
          left: 100%;
        }
      }

      /* ============================================
         HOVER STATE
         ============================================ */

      .premium-badge:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px var(--glow);
      }

      .premium-badge:hover .premium-badge__shimmer {
        animation-duration: 1.5s;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportPremiumBadgeComponent {
  constructor() {
    addIcons({ diamond, star, ribbon, trophy });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Badge variant style */
  readonly variant = input<PremiumBadgeVariant>('gold');

  /** Show text label */
  readonly showLabel = input<boolean>(false);

  // ============================================
  // GETTERS
  // ============================================

  /** Get config for current variant */
  protected get config(): BadgeConfig {
    return BADGE_CONFIGS[this.variant()];
  }
}
