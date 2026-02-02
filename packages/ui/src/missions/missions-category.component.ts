/**
 * @fileoverview Missions Category Component - Collapsible Section
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Collapsible category section for grouping missions.
 * Shows category progress and expands to reveal tasks.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated expand/collapse
 * - Category progress bar
 * - Completion counter
 * - Category icon and color
 * - Smooth height transitions
 *
 * @example
 * ```html
 * <nxt1-missions-category
 *   [category]="category"
 *   [missions]="missions"
 *   [isExpanded]="isExpanded()"
 *   [completingMissionId]="completingId()"
 *   (toggle)="onToggle()"
 *   (missionComplete)="onComplete($event)"
 *   (quickAction)="onQuickAction($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronDown,
  chevronUp,
  checkmarkCircle,
  // Category icons
  personCircleOutline,
  eyeOutline,
  flagOutline,
  calendarOutline,
  peopleOutline,
  heartOutline,
  imagesOutline,
  schoolOutline,
  ribbonOutline,
} from 'ionicons/icons';
import type { Mission, MissionCategoryConfig } from '@nxt1/core';
import { MissionsItemComponent } from './missions-item.component';

// Register icons
addIcons({
  chevronDown,
  chevronUp,
  checkmarkCircle,
  personCircleOutline,
  eyeOutline,
  flagOutline,
  calendarOutline,
  peopleOutline,
  heartOutline,
  imagesOutline,
  schoolOutline,
  ribbonOutline,
});

@Component({
  selector: 'nxt1-missions-category',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, MissionsItemComponent],
  template: `
    <div
      class="mission-category"
      [class.mission-category--expanded]="isExpanded()"
      [class.mission-category--complete]="isFullyCompleted()"
    >
      <!-- Header -->
      <button
        type="button"
        class="mission-category__header"
        (click)="handleToggle()"
        [attr.aria-expanded]="isExpanded()"
        [attr.aria-controls]="'category-content-' + category().id"
      >
        <ion-ripple-effect></ion-ripple-effect>

        <!-- Icon -->
        <div class="mission-category__icon" [style.--category-color]="category().color">
          <ion-icon [name]="category().icon"></ion-icon>
        </div>

        <!-- Title & Progress -->
        <div class="mission-category__info">
          <div class="mission-category__title-row">
            <h3 class="mission-category__title">{{ category().label }}</h3>
            <span class="mission-category__count"> {{ completedCount() }}/{{ totalCount() }} </span>
          </div>

          <!-- Progress Bar -->
          <div class="mission-category__progress-bar">
            <div
              class="mission-category__progress-fill"
              [style.--progress]="progressPercentage() + '%'"
              [style.--category-color]="category().color"
            ></div>
          </div>
        </div>

        <!-- Expand Icon -->
        <ion-icon
          [name]="isExpanded() ? 'chevron-up' : 'chevron-down'"
          class="mission-category__chevron"
        ></ion-icon>
      </button>

      <!-- Content -->
      <div
        [id]="'category-content-' + category().id"
        class="mission-category__content"
        [class.mission-category__content--visible]="isExpanded()"
      >
        @if (isExpanded()) {
          <div class="mission-category__missions">
            @for (mission of missions(); track mission.id) {
              <nxt1-missions-item
                [mission]="mission"
                [isCompleting]="completingMissionId() === mission.id"
                (complete)="handleMissionComplete($event)"
                (quickAction)="handleQuickAction($event)"
                (itemClick)="handleMissionClick($event)"
              />
            } @empty {
              <div class="mission-category__empty">
                <ion-icon name="checkmark-circle"></ion-icon>
                <span>All missions in this category are complete!</span>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       MISSION CATEGORY - Collapsible Section
       iOS 26 Liquid Glass Design
       ============================================ */

      :host {
        display: block;
      }

      .mission-category {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-ui-radius-xl, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        overflow: hidden;
        transition: all 0.25s ease;
      }

      .mission-category:hover {
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
      }

      .mission-category--expanded {
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
      }

      .mission-category--complete {
        border-color: var(--nxt1-color-alpha-success30, rgba(34, 197, 94, 0.3));
        background: var(--nxt1-color-alpha-success4, rgba(34, 197, 94, 0.04));
      }

      /* ============================================
       HEADER
       ============================================ */

      .mission-category__header {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 16px;
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        position: relative;
        overflow: hidden;
      }

      .mission-category__icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        background: color-mix(in srgb, var(--category-color) 15%, transparent);
        flex-shrink: 0;
      }

      .mission-category__icon ion-icon {
        font-size: 22px;
        color: var(--category-color, var(--nxt1-color-primary));
      }

      .mission-category__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mission-category__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .mission-category__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .mission-category__count {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-variant-numeric: tabular-nums;
      }

      .mission-category--complete .mission-category__count {
        color: var(--nxt1-color-success, #22c55e);
      }

      /* ============================================
       PROGRESS BAR
       ============================================ */

      .mission-category__progress-bar {
        height: 6px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-radius: 3px;
        overflow: hidden;
      }

      .mission-category__progress-fill {
        height: 100%;
        width: var(--progress, 0%);
        background: linear-gradient(
          90deg,
          var(--category-color, var(--nxt1-color-primary)),
          color-mix(in srgb, var(--category-color) 70%, white)
        );
        border-radius: 3px;
        transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mission-category--complete .mission-category__progress-fill {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-success),
          var(--nxt1-color-successLight)
        );
      }

      .mission-category__chevron {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        transition: transform 0.25s ease;
        flex-shrink: 0;
      }

      .mission-category--expanded .mission-category__chevron {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
       CONTENT
       ============================================ */

      .mission-category__content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mission-category__content--visible {
        max-height: 2000px; /* Large enough for content */
      }

      .mission-category__missions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 12px 12px;
      }

      .mission-category__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px;
        color: var(--nxt1-color-success, #22c55e);
        font-size: 14px;
      }

      .mission-category__empty ion-icon {
        font-size: 20px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsCategoryComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Category configuration */
  readonly category = input.required<MissionCategoryConfig>();

  /** Missions in this category */
  readonly missions = input<Mission[]>([]);

  /** Whether category is expanded */
  readonly isExpanded = input<boolean>(false);

  /** ID of mission currently being completed */
  readonly completingMissionId = input<string | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when header is clicked to toggle */
  readonly toggle = output<void>();

  /** Emitted when a mission checkbox is clicked */
  readonly missionComplete = output<string>();

  /** Emitted when quick action is clicked */
  readonly quickAction = output<Mission['quickAction']>();

  /** Emitted when mission item is clicked */
  readonly missionClick = output<Mission>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Number of completed missions */
  protected readonly completedCount = computed(() => {
    return this.missions().filter((m) => m.status === 'completed').length;
  });

  /** Total number of missions */
  protected readonly totalCount = computed(() => this.missions().length);

  /** Progress percentage */
  protected readonly progressPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.completedCount() / total) * 100);
  });

  /** Whether all missions are completed */
  protected readonly isFullyCompleted = computed(() => {
    const total = this.totalCount();
    return total > 0 && this.completedCount() === total;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected handleToggle(): void {
    this.toggle.emit();
  }

  protected handleMissionComplete(missionId: string): void {
    this.missionComplete.emit(missionId);
  }

  protected handleQuickAction(action: Mission['quickAction']): void {
    this.quickAction.emit(action);
  }

  protected handleMissionClick(mission: Mission): void {
    this.missionClick.emit(mission);
  }
}
