/**
 * @fileoverview Invite Stats Card Component - Gamified Stats Display
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Gamified card showing invite statistics and XP progress.
 * Features animated progress ring, tier badge, and streak indicator.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  flame,
  flameOutline,
  star,
  starOutline,
  starHalf,
  trophy,
  trophyOutline,
  diamond,
  diamondOutline,
  sparkles,
  arrowUp,
} from 'ionicons/icons';
import type { InviteStats } from '@nxt1/core';

@Component({
  selector: 'nxt1-invite-stats-card',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="stats-card">
      <!-- Tier & Progress Section -->
      <div class="stats-card__main">
        <!-- Progress Ring -->
        <div class="stats-card__ring-container">
          <svg class="stats-card__ring" viewBox="0 0 100 100">
            <!-- Background circle -->
            <circle
              class="stats-card__ring-bg"
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke-width="8"
            />
            <!-- Progress circle -->
            <circle
              class="stats-card__ring-progress"
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke-width="8"
              [style.stroke-dasharray]="circumference"
              [style.stroke-dashoffset]="progressOffset()"
              [style.stroke]="tierColor()"
            />
          </svg>

          <!-- Center Content -->
          <div class="stats-card__ring-content">
            <div class="stats-card__tier-icon" [style.color]="tierColor()">
              <ion-icon [name]="tierIcon()"></ion-icon>
            </div>
            <span class="stats-card__tier-name">{{ tierName() }}</span>
          </div>
        </div>

        <!-- Stats Info -->
        <div class="stats-card__info">
          <div class="stats-card__xp-display">
            <span class="stats-card__xp-value">{{ totalXp() }}</span>
            <span class="stats-card__xp-label">Total XP</span>
          </div>

          <div class="stats-card__progress-info">
            <div class="stats-card__progress-bar">
              <div
                class="stats-card__progress-fill"
                [style.width.%]="tierProgress()"
                [style.background]="tierColor()"
              ></div>
            </div>
            <span class="stats-card__progress-text">
              {{ invitesToNext() }} more to {{ nextTierName() }}
            </span>
          </div>
        </div>
      </div>

      <!-- Quick Stats Row -->
      <div class="stats-card__quick-stats">
        <div class="stats-card__stat">
          <span class="stats-card__stat-value">{{ sentCount() }}</span>
          <span class="stats-card__stat-label">Sent</span>
        </div>
        <div class="stats-card__stat-divider"></div>
        <div class="stats-card__stat">
          <span class="stats-card__stat-value stats-card__stat-value--success">{{
            acceptedCount()
          }}</span>
          <span class="stats-card__stat-label">Joined</span>
        </div>
        <div class="stats-card__stat-divider"></div>
        <div class="stats-card__stat">
          <span class="stats-card__stat-value">{{ conversionRate() }}%</span>
          <span class="stats-card__stat-label">Rate</span>
        </div>
        <div class="stats-card__stat-divider"></div>
        <div
          class="stats-card__stat stats-card__stat--streak"
          [class.stats-card__stat--active]="hasStreak()"
        >
          <span class="stats-card__stat-value">
            <ion-icon name="flame"></ion-icon>
            {{ streakDays() }}
          </span>
          <span class="stats-card__stat-label">Streak</span>
        </div>
      </div>

      <!-- Achievements Badge -->
      @if (earnedCount() > 0) {
        <div class="stats-card__achievements-badge">
          <ion-icon name="trophy-outline"></ion-icon>
          <span>{{ earnedCount() }} badge{{ earnedCount() > 1 ? 's' : '' }} earned</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       STATS CARD - Gamified Design
       ============================================ */

      :host {
        display: block;
        margin-bottom: var(--nxt1-spacing-5);
      }

      .stats-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-4);
        overflow: hidden;
      }

      /* ============================================
       MAIN SECTION (Ring + Info)
       ============================================ */

      .stats-card__main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .stats-card__ring-container {
        position: relative;
        width: 100px;
        height: 100px;
        flex-shrink: 0;
      }

      .stats-card__ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .stats-card__ring-bg {
        stroke: var(--nxt1-color-surface-300);
      }

      .stats-card__ring-progress {
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ease-out;
        filter: drop-shadow(0 0 6px currentColor);
      }

      .stats-card__ring-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .stats-card__tier-icon {
        font-size: 28px;
        margin-bottom: 2px;
      }

      .stats-card__tier-icon ion-icon {
        display: block;
      }

      .stats-card__tier-name {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* ============================================
       INFO SECTION
       ============================================ */

      .stats-card__info {
        flex: 1;
        min-width: 0;
      }

      .stats-card__xp-display {
        display: flex;
        flex-direction: column;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .stats-card__xp-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: 1;
      }

      .stats-card__xp-label {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      .stats-card__progress-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .stats-card__progress-bar {
        height: 6px;
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .stats-card__progress-fill {
        height: 100%;
        border-radius: var(--nxt1-radius-full);
        transition: width 0.5s ease-out;
      }

      .stats-card__progress-text {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
       QUICK STATS ROW
       ============================================ */

      .stats-card__quick-stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .stats-card__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
      }

      .stats-card__stat-value {
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .stats-card__stat-value--success {
        color: var(--nxt1-color-feedback-success);
      }

      .stats-card__stat-value ion-icon {
        font-size: 16px;
      }

      .stats-card__stat-label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .stats-card__stat-divider {
        width: 1px;
        height: 32px;
        background: var(--nxt1-color-border-subtle);
      }

      .stats-card__stat--streak .stats-card__stat-value {
        color: var(--nxt1-color-text-secondary);
      }

      .stats-card__stat--active .stats-card__stat-value {
        color: #ff6b35;
      }

      .stats-card__stat--active .stats-card__stat-value ion-icon {
        animation: flame-pulse 1s ease-in-out infinite;
      }

      @keyframes flame-pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.15);
        }
      }

      /* ============================================
       ACHIEVEMENTS BADGE
       ============================================ */

      .stats-card__achievements-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2);
        background: var(--nxt1-color-alpha-primary10);
        border-radius: var(--nxt1-radius-md);
        margin-top: var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .stats-card__achievements-badge ion-icon {
        font-size: 16px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteStatsCardComponent {
  constructor() {
    addIcons({
      flame,
      flameOutline,
      star,
      starOutline,
      starHalf,
      trophy,
      trophyOutline,
      diamond,
      diamondOutline,
      sparkles,
      arrowUp,
    });
  }

  // Inputs
  readonly stats = input<InviteStats | null>(null);
  readonly streakDays = input<number>(0);
  readonly earnedCount = input<number>(0);

  // Constants
  protected readonly circumference = 2 * Math.PI * 42; // radius = 42

  // Computed values
  protected readonly totalXp = computed(() => this.stats()?.totalXp ?? 0);
  protected readonly tierProgress = computed(() => this.stats()?.tierProgress ?? 0);
  protected readonly tierName = computed(() => this.stats()?.tier?.name ?? 'Rookie');
  protected readonly tierIcon = computed(() => this.stats()?.tier?.badgeIcon ?? 'star-outline');
  protected readonly tierColor = computed(
    () => this.stats()?.tier?.badgeColor ?? 'var(--nxt1-color-text-tertiary)'
  );
  protected readonly invitesToNext = computed(() => this.stats()?.invitesToNextTier ?? 5);
  protected readonly sentCount = computed(() => this.stats()?.totalSent ?? 0);
  protected readonly acceptedCount = computed(() => this.stats()?.accepted ?? 0);
  protected readonly conversionRate = computed(() => this.stats()?.conversionRate ?? 0);
  protected readonly hasStreak = computed(() => this.streakDays() > 0);

  protected readonly nextTierName = computed(() => {
    const tiers = ['Rookie', 'Connector', 'Networker', 'Ambassador', 'Legend'];
    const currentIndex = tiers.indexOf(this.tierName());
    return tiers[currentIndex + 1] ?? 'Legend';
  });

  protected readonly progressOffset = computed(() => {
    const progress = this.tierProgress() / 100;
    return this.circumference * (1 - progress);
  });
}
