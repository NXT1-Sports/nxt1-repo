/**
 * @fileoverview Profile Stats Bar Component
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Horizontal scrollable quick stats bar showing profile analytics.
 * Displays profile views, video views, offers, etc.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  eyeOutline,
  playCircleOutline,
  trophyOutline,
  videocamOutline,
  schoolOutline,
  shareOutline,
  newspaperOutline,
  calendarOutline,
  trendingUpOutline,
  trendingDownOutline,
} from 'ionicons/icons';
import type { ProfileStatItem } from '@nxt1/core';

// Register icons
addIcons({
  eyeOutline,
  playCircleOutline,
  trophyOutline,
  videocamOutline,
  schoolOutline,
  shareOutline,
  newspaperOutline,
  calendarOutline,
  trendingUpOutline,
  trendingDownOutline,
});

@Component({
  selector: 'nxt1-profile-stats-bar',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="stats-bar" [class.stats-bar--loading]="isLoading()">
      <div class="stats-container">
        @if (isLoading()) {
          <!-- Skeleton Loading -->
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="stat-card stat-card--skeleton">
              <div class="skeleton-icon"></div>
              <div class="skeleton-value"></div>
              <div class="skeleton-label"></div>
            </div>
          }
        } @else {
          <!-- Actual Stats -->
          @for (stat of stats(); track stat.key) {
            <button
              class="stat-card"
              [class.stat-card--clickable]="clickable()"
              (click)="statClick.emit(stat.key)"
            >
              <div class="stat-icon">
                <ion-icon [name]="stat.icon"></ion-icon>
              </div>
              <div class="stat-value">
                {{ formatValue(stat.value) }}
                @if (stat.trend) {
                  <ion-icon
                    [name]="stat.trend === 'up' ? 'trending-up-outline' : 'trending-down-outline'"
                    [class.trend-up]="stat.trend === 'up'"
                    [class.trend-down]="stat.trend === 'down'"
                    class="trend-icon"
                  ></ion-icon>
                }
              </div>
              <div class="stat-label">{{ stat.label }}</div>
            </button>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
       PROFILE STATS BAR
       2026 Professional Design
       ============================================ */

      :host {
        display: block;

        --stats-bg: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        --stats-card-bg: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        --stats-card-hover: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        --stats-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --stats-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --stats-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --stats-primary: var(--nxt1-color-primary, #d4ff00);
        --stats-success: var(--nxt1-color-success, #4ade80);
        --stats-error: var(--nxt1-color-error, #ff4444);
      }

      .stats-bar {
        background: var(--stats-bg);
        border-top: 1px solid var(--stats-border);
        border-bottom: 1px solid var(--stats-border);
      }

      .stats-container {
        display: flex;
        gap: 12px;
        padding: 16px 24px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        scroll-snap-type: x mandatory;

        &::-webkit-scrollbar {
          display: none;
        }

        @media (max-width: 768px) {
          padding: 12px 16px;
          gap: 10px;
        }
      }

      /* ============================================
         STAT CARD
         ============================================ */

      .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 16px 20px;
        min-width: 110px;
        background: var(--stats-card-bg);
        border: 1px solid var(--stats-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        scroll-snap-align: start;
        transition: all 0.2s ease;

        @media (max-width: 768px) {
          min-width: 95px;
          padding: 12px 14px;
        }
      }

      .stat-card--clickable {
        cursor: pointer;

        &:hover {
          background: var(--stats-card-hover);
          border-color: var(--stats-primary);
          transform: translateY(-2px);
        }

        &:active {
          transform: translateY(0);
        }
      }

      .stat-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(212, 255, 0, 0.1);
        color: var(--stats-primary);
        font-size: 20px;

        @media (max-width: 768px) {
          width: 36px;
          height: 36px;
          font-size: 18px;
        }
      }

      .stat-value {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 22px;
        font-weight: 700;
        color: var(--stats-text-primary);
        font-variant-numeric: tabular-nums;

        @media (max-width: 768px) {
          font-size: 18px;
        }
      }

      .trend-icon {
        font-size: 14px;
      }

      .trend-up {
        color: var(--stats-success);
      }

      .trend-down {
        color: var(--stats-error);
      }

      .stat-label {
        font-size: 12px;
        color: var(--stats-text-secondary);
        text-align: center;
        white-space: nowrap;
        font-weight: 500;

        @media (max-width: 768px) {
          font-size: 11px;
        }
      }

      /* ============================================
         SKELETON STATE
         ============================================ */

      .stat-card--skeleton {
        cursor: default;
      }

      .skeleton-icon,
      .skeleton-value,
      .skeleton-label {
        background: linear-gradient(
          90deg,
          var(--stats-card-bg) 0%,
          var(--stats-card-hover) 50%,
          var(--stats-card-bg) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .skeleton-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
      }

      .skeleton-value {
        width: 50px;
        height: 24px;
      }

      .skeleton-label {
        width: 70px;
        height: 14px;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStatsBarComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly stats = input<ProfileStatItem[]>([]);
  readonly isLoading = input(false);
  readonly clickable = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly statClick = output<string>();

  // ============================================
  // HELPERS
  // ============================================

  protected formatValue(value: number | string): string {
    if (typeof value === 'string') return value;

    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toLocaleString();
  }
}
