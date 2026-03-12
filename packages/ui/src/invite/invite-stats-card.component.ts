/**
 * @fileoverview Invite Stats Card Component - Stats Display
 * @module @nxt1/ui/invite
 * @version 2.0.0
 *
 * Card showing invite statistics: sent, joined, conversion rate, and streak.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { flame, flameOutline } from 'ionicons/icons';
import type { InviteStats } from '@nxt1/core';

@Component({
  selector: 'nxt1-invite-stats-card',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="stats-card">
      <!-- Stats Row -->
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
       STATS ROW
       ============================================ */

      .stats-card__quick-stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteStatsCardComponent {
  constructor() {
    addIcons({ flame, flameOutline });
  }

  // Inputs
  readonly stats = input<InviteStats | null>(null);
  readonly streakDays = input<number>(0);

  // Computed values
  protected readonly sentCount = computed(() => this.stats()?.totalSent ?? 0);
  protected readonly acceptedCount = computed(() => this.stats()?.accepted ?? 0);
  protected readonly conversionRate = computed(() => this.stats()?.conversionRate ?? 0);
  protected readonly hasStreak = computed(() => this.streakDays() > 0);
}
