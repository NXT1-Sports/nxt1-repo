/**
 * @fileoverview Invite Achievements Component - Badge Display
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Displays user's invite achievements with progress indicators.
 * Shows earned badges prominently and in-progress ones with bars.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { INVITE_TEST_IDS } from '@nxt1/core/testing';
import { IonIcon } from '@ionic/angular/standalone';
import type { InviteAchievement } from '@nxt1/core';

@Component({
  selector: 'nxt1-invite-achievements',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="achievements-container" [attr.data-testid]="testIds.ACHIEVEMENTS">
      <!-- Earned Badges Row -->
      @if (earnedAchievements().length > 0) {
        <div class="achievements-earned">
          @for (achievement of displayedEarned(); track achievement.id) {
            <div
              class="achievement-badge"
              [class.achievement-badge--earned]="achievement.isEarned"
              [style.--badge-color]="achievement.color"
            >
              <div class="achievement-badge__icon">
                <ion-icon [name]="achievement.icon"></ion-icon>
              </div>
              <span class="achievement-badge__name">{{ achievement.name }}</span>
              @if (achievement.creditReward) {
                <span class="achievement-badge__xp">+{{ achievement.creditReward }}¢</span>
              }
            </div>
          }
        </div>
      }

      <!-- In Progress Section -->
      @if (showAll() && inProgressAchievements().length > 0) {
        <div class="achievements-progress">
          <h3 class="achievements-progress__title">In Progress</h3>
          @for (achievement of inProgressAchievements(); track achievement.id) {
            <div class="achievement-progress-item">
              <div
                class="achievement-progress-item__icon"
                [style.background]="achievement.color + '20'"
                [style.color]="achievement.color"
              >
                <ion-icon [name]="achievement.icon"></ion-icon>
              </div>
              <div class="achievement-progress-item__content">
                <div class="achievement-progress-item__header">
                  <span class="achievement-progress-item__name">{{ achievement.name }}</span>
                  <span class="achievement-progress-item__percent"
                    >{{ achievement.progress }}%</span
                  >
                </div>
                <p class="achievement-progress-item__desc">{{ achievement.description }}</p>
                <div class="achievement-progress-item__bar">
                  <div
                    class="achievement-progress-item__fill"
                    [style.width.%]="achievement.progress"
                    [style.background]="achievement.color"
                  ></div>
                </div>
              </div>
              @if (achievement.creditReward) {
                <span class="achievement-progress-item__xp">+{{ achievement.creditReward }}¢</span>
              }
            </div>
          }
        </div>
      }

      <!-- Compact Preview (when showAll is false) -->
      @if (!showAll()) {
        <div class="achievements-preview">
          @for (achievement of previewAchievements(); track achievement.id) {
            <div
              class="achievement-mini"
              [class.achievement-mini--earned]="achievement.isEarned"
              [class.achievement-mini--progress]="!achievement.isEarned"
            >
              <div class="achievement-mini__icon" [style.--badge-color]="achievement.color">
                <ion-icon [name]="achievement.icon"></ion-icon>
              </div>
              @if (!achievement.isEarned && achievement.progress) {
                <div class="achievement-mini__progress-ring">
                  <svg viewBox="0 0 36 36">
                    <circle
                      class="achievement-mini__ring-bg"
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke-width="3"
                    />
                    <circle
                      class="achievement-mini__ring-fill"
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke-width="3"
                      [style.stroke]="achievement.color"
                      [style.stroke-dasharray]="circumference"
                      [style.stroke-dashoffset]="getProgressOffset(achievement.progress)"
                    />
                  </svg>
                </div>
              }
            </div>
          }
          @if (remainingCount() > 0) {
            <div class="achievement-mini achievement-mini--more">
              <span>+{{ remainingCount() }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ACHIEVEMENTS CONTAINER
       ============================================ */

      :host {
        display: block;
      }

      .achievements-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
       EARNED BADGES ROW
       ============================================ */

      .achievements-earned {
        display: flex;
        gap: var(--nxt1-spacing-3);
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-2);
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .achievements-earned::-webkit-scrollbar {
        display: none;
      }

      .achievement-badge {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        min-width: 90px;
      }

      .achievement-badge--earned {
        background: linear-gradient(
          135deg,
          var(--badge-color, var(--nxt1-color-primary)) 0%,
          color-mix(in srgb, var(--badge-color, var(--nxt1-color-primary)) 70%, black) 100%
        );
        border: none;
      }

      .achievement-badge__icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: white;
      }

      .achievement-badge--earned .achievement-badge__icon {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
      }

      .achievement-badge__name {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: white;
        text-align: center;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .achievement-badge__xp {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ============================================
       IN PROGRESS SECTION
       ============================================ */

      .achievements-progress {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .achievements-progress__title {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .achievement-progress-item {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .achievement-progress-item__icon {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-md);
        font-size: 20px;
      }

      .achievement-progress-item__content {
        flex: 1;
        min-width: 0;
      }

      .achievement-progress-item__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
      }

      .achievement-progress-item__name {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .achievement-progress-item__percent {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .achievement-progress-item__desc {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .achievement-progress-item__bar {
        height: 4px;
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .achievement-progress-item__fill {
        height: 100%;
        border-radius: var(--nxt1-radius-full);
        transition: width 0.3s ease;
      }

      .achievement-progress-item__xp {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-bold);
        white-space: nowrap;
      }

      /* ============================================
       PREVIEW (Compact View)
       ============================================ */

      .achievements-preview {
        display: flex;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .achievement-mini {
        position: relative;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .achievement-mini__icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-lg);
        font-size: 22px;
      }

      .achievement-mini--earned .achievement-mini__icon {
        background: var(--badge-color);
        color: white;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--badge-color) 50%, transparent);
      }

      .achievement-mini--progress .achievement-mini__icon {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-tertiary);
      }

      .achievement-mini__progress-ring {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }

      .achievement-mini__progress-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .achievement-mini__ring-bg {
        stroke: var(--nxt1-color-surface-300);
      }

      .achievement-mini__ring-fill {
        stroke-linecap: round;
        transition: stroke-dashoffset 0.3s ease;
      }

      .achievement-mini--more {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-lg);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-tertiary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteAchievementsComponent {
  protected readonly testIds = INVITE_TEST_IDS;

  readonly achievements = input<InviteAchievement[]>([]);
  readonly showAll = input<boolean>(false);

  protected readonly circumference = 2 * Math.PI * 15;

  protected readonly earnedAchievements = computed(() =>
    this.achievements().filter((a) => a.isEarned)
  );

  protected readonly inProgressAchievements = computed(() =>
    this.achievements().filter((a) => !a.isEarned && (a.progress ?? 0) > 0)
  );

  protected readonly displayedEarned = computed(() => {
    const earned = this.earnedAchievements();
    return this.showAll() ? earned : earned.slice(0, 4);
  });

  protected readonly previewAchievements = computed(() => {
    // Show mix of earned and in-progress
    const all = this.achievements();
    return all.slice(0, 5);
  });

  protected readonly remainingCount = computed(() => {
    const total = this.achievements().length;
    const shown = this.previewAchievements().length;
    return Math.max(0, total - shown);
  });

  protected getProgressOffset(progress: number | undefined): number {
    const p = (progress ?? 0) / 100;
    return this.circumference * (1 - p);
  }
}
