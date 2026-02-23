/**
 * @fileoverview XP Item Component - Single Task Row
 * @module @nxt1/ui/xp
 * @version 1.0.0
 *
 * Interactive XP task item with checkbox, points, and status indicators.
 * Gamified design with animations and haptic feedback.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated checkbox with completion effect
 * - Points badge with priority colors
 * - Progress indicator for multi-step tasks
 * - Quick action button
 * - Status indicators (locked, in-progress, etc.)
 * - Time estimate display
 * - Social proof message
 *
 * @example
 * ```html
 * <nxt1-xp-item
 *   [mission]="mission"
 *   [isCompleting]="isCompleting()"
 *   (complete)="onComplete(mission.id)"
 *   (quickAction)="onQuickAction(mission.quickAction)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  checkmarkCircleOutline,
  lockClosed,
  lockClosedOutline,
  timeOutline,
  chevronForward,
  star,
  flash,
  alertCircle,
  peopleOutline,
  // Category icons
  cameraOutline,
  createOutline,
  footballOutline,
  speedometerOutline,
  videocamOutline,
  schoolOutline,
  trophyOutline,
  peopleCircleOutline,
  shareSocialOutline,
  imagesOutline,
  mailOutline,
  heartOutline,
  listOutline,
  calendarOutline,
  checkmarkCircleOutline as checkCircle,
  shieldCheckmarkOutline,
  locationOutline,
  statsChartOutline,
  filmOutline,
  chatbubblesOutline,
  ticketOutline,
  shieldOutline,
  callOutline,
  personAddOutline,
  eyeOutline,
  documentTextOutline,
  flagOutline,
  bulbOutline,
  gitNetworkOutline,
  newspaperOutline,
  starOutline,
  fitnessOutline,
  analyticsOutline,
  sendOutline,
  mapOutline,
  ribbonOutline,
  desktopOutline,
  documentOutline,
  bookOutline,
} from 'ionicons/icons';
import type { Mission } from '@nxt1/core';

// Register all potential icons
@Component({
  selector: 'nxt1-xp-item',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, IonSpinner],
  template: `
    <div
      class="xp-item"
      [class.xp-item--completed]="isCompleted()"
      [class.xp-item--locked]="isLocked()"
      [class.xp-item--in-progress]="isInProgress()"
      [class.xp-item--featured]="mission().featured"
      [class.xp-item--critical]="mission().priority === 'critical'"
      [class.xp-item--high]="mission().priority === 'high'"
      role="listitem"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Checkbox / Status Icon -->
      <button
        type="button"
        class="xp-item__checkbox"
        [disabled]="isLocked() || isCompleting()"
        (click)="handleCheckboxClick($event)"
        [attr.aria-label]="isCompleted() ? 'Completed' : 'Mark as complete'"
      >
        @if (isCompleting()) {
          <ion-spinner name="crescent" class="xp-item__spinner"></ion-spinner>
        } @else if (isCompleted()) {
          <ion-icon name="checkmark-circle" class="xp-item__check-icon"></ion-icon>
        } @else if (isLocked()) {
          <ion-icon name="lock-closed-outline" class="xp-item__lock-icon"></ion-icon>
        } @else {
          <div class="xp-item__checkbox-empty">
            @if (hasProgress()) {
              <svg class="xp-item__mini-progress" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  opacity="0.2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  [attr.stroke-dasharray]="miniProgressDasharray()"
                  [attr.stroke-dashoffset]="miniProgressOffset()"
                  stroke-linecap="round"
                  transform="rotate(-90 12 12)"
                />
              </svg>
            }
          </div>
        }
      </button>

      <!-- Content -->
      <div class="xp-item__content" (click)="handleContentClick()">
        <!-- Title Row -->
        <div class="xp-item__title-row">
          <div class="xp-item__icon-wrapper" [style.--icon-color]="priorityColor()">
            <ion-icon [name]="mission().icon"></ion-icon>
          </div>
          <h4 class="xp-item__title" [class.xp-item__title--completed]="isCompleted()">
            {{ mission().title }}
          </h4>
        </div>

        <!-- Description -->
        @if (showDescription()) {
          <p class="xp-item__description">{{ mission().description }}</p>
        }

        <!-- Meta Row -->
        <div class="xp-item__meta">
          <!-- Time Estimate -->
          @if (mission().estimatedMinutes) {
            <span class="xp-item__time">
              <ion-icon name="time-outline"></ion-icon>
              {{ mission().estimatedMinutes }}m
            </span>
          }

          <!-- Social Proof -->
          @if (mission().socialProof && !isCompleted()) {
            <span class="xp-item__social-proof">
              <ion-icon name="people-outline"></ion-icon>
              {{ mission().socialProof }}
            </span>
          }

          <!-- Progress -->
          @if (hasProgress() && !isCompleted()) {
            <span class="xp-item__progress-text"> {{ mission().progress }}% done </span>
          }

          <!-- Expiration -->
          @if (isExpiringSoon()) {
            <span class="xp-item__expiring">
              <ion-icon name="alert-circle"></ion-icon>
              Expires soon
            </span>
          }
        </div>
      </div>

      <!-- Trailing Section -->
      <div class="xp-item__trailing">
        <!-- Points Badge -->
        <div class="xp-item__points" [class.xp-item__points--earned]="isCompleted()">
          @if (!isCompleted()) {
            <ion-icon name="star" class="xp-item__points-icon"></ion-icon>
          }
          <span>{{ isCompleted() ? '+' : '' }}{{ mission().reward.points }}</span>
        </div>

        <!-- Quick Action or Chevron -->
        @if (mission().quickAction && !isCompleted() && !isLocked()) {
          <button type="button" class="xp-item__quick-action" (click)="handleQuickAction($event)">
            <ion-icon name="chevron-forward"></ion-icon>
          </button>
        }
      </div>

      <!-- Featured Indicator -->
      @if (mission().featured && !isCompleted()) {
        <div class="xp-item__featured-badge">
          <ion-icon name="flash"></ion-icon>
          <span>Recommended</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       XP ITEM - Gamified Task Row
       iOS 26 Design Language
       ============================================ */

      :host {
        display: block;
      }

      .xp-item {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        cursor: pointer;
        transition: all 0.2s ease;
        overflow: hidden;
      }

      .xp-item:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
      }

      .xp-item:active {
        transform: scale(0.995);
      }

      /* Completed state */
      .xp-item--completed {
        background: var(--nxt1-color-alpha-success6, rgba(34, 197, 94, 0.06));
        border-color: var(--nxt1-color-alpha-success20, rgba(34, 197, 94, 0.2));
      }

      .xp-item--completed:hover {
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
      }

      /* Locked state */
      .xp-item--locked {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .xp-item--locked:hover {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      /* In progress state */
      .xp-item--in-progress {
        border-color: var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.3));
      }

      /* Featured state */
      .xp-item--featured {
        border-color: var(--nxt1-color-alpha-primary40, rgba(204, 255, 0, 0.4));
        box-shadow: 0 0 20px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      /* Priority indicators */
      .xp-item--critical {
        border-left: 3px solid var(--nxt1-color-error, #ef4444);
      }

      .xp-item--high {
        border-left: 3px solid var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
       CHECKBOX
       ============================================ */

      .xp-item__checkbox {
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        transition: transform 0.2s ease;
      }

      .xp-item__checkbox:not(:disabled):hover {
        transform: scale(1.1);
      }

      .xp-item__checkbox:not(:disabled):active {
        transform: scale(0.95);
      }

      .xp-item__checkbox:disabled {
        cursor: not-allowed;
      }

      .xp-item__checkbox-empty {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        position: relative;
        transition: border-color 0.2s ease;
      }

      .xp-item__checkbox:hover .xp-item__checkbox-empty {
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .xp-item__check-icon {
        font-size: 28px;
        color: var(--nxt1-color-success, #22c55e);
        animation: check-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes check-pop {
        0% {
          transform: scale(0.5);
          opacity: 0;
        }
        50% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .xp-item__lock-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .xp-item__spinner {
        width: 24px;
        height: 24px;
        --color: var(--nxt1-color-primary, #ccff00);
      }

      .xp-item__mini-progress {
        position: absolute;
        inset: -2px;
        width: calc(100% + 4px);
        height: calc(100% + 4px);
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
       CONTENT
       ============================================ */

      .xp-item__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .xp-item__title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .xp-item__icon-wrapper {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: var(--icon-color, var(--nxt1-color-primary));
        opacity: 0.15;
      }

      .xp-item__icon-wrapper ion-icon {
        font-size: 14px;
        color: var(--icon-color, var(--nxt1-color-primary));
        opacity: 1;
      }

      .xp-item__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
      }

      .xp-item__title--completed {
        text-decoration: line-through;
        opacity: 0.7;
      }

      .xp-item__description {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .xp-item__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }

      .xp-item__time,
      .xp-item__social-proof,
      .xp-item__progress-text {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .xp-item__time ion-icon,
      .xp-item__social-proof ion-icon {
        font-size: 12px;
      }

      .xp-item__progress-text {
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: 500;
      }

      .xp-item__expiring {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--nxt1-color-warning, #f59e0b);
        font-weight: 500;
      }

      .xp-item__expiring ion-icon {
        font-size: 12px;
      }

      /* ============================================
       TRAILING
       ============================================ */

      .xp-item__trailing {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        flex-shrink: 0;
      }

      .xp-item__points {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border-radius: 20px;
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .xp-item__points--earned {
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
        color: var(--nxt1-color-success, #22c55e);
        animation: points-earned 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes points-earned {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
        }
      }

      .xp-item__points-icon {
        font-size: 12px;
      }

      .xp-item__quick-action {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .xp-item__quick-action:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .xp-item__quick-action ion-icon {
        font-size: 16px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
       FEATURED BADGE
       ============================================ */

      .xp-item__featured-badge {
        position: absolute;
        top: 0;
        right: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary),
          var(--nxt1-color-primaryLight)
        );
        border-radius: 0 0 8px 8px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--nxt1-color-text-onPrimary);
      }

      .xp-item__featured-badge ion-icon {
        font-size: 10px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpItemComponent {
  constructor() {
    addIcons({
      checkmarkCircle,
      checkmarkCircleOutline,
      lockClosed,
      lockClosedOutline,
      timeOutline,
      chevronForward,
      star,
      flash,
      alertCircle,
      peopleOutline,
      cameraOutline,
      createOutline,
      footballOutline,
      speedometerOutline,
      videocamOutline,
      schoolOutline,
      trophyOutline,
      peopleCircleOutline,
      shareSocialOutline,
      imagesOutline,
      mailOutline,
      heartOutline,
      listOutline,
      calendarOutline,
      checkCircle,
      shieldCheckmarkOutline,
      locationOutline,
      statsChartOutline,
      filmOutline,
      chatbubblesOutline,
      ticketOutline,
      shieldOutline,
      callOutline,
      personAddOutline,
      eyeOutline,
      documentTextOutline,
      flagOutline,
      bulbOutline,
      gitNetworkOutline,
      newspaperOutline,
      starOutline,
      fitnessOutline,
      analyticsOutline,
      sendOutline,
      mapOutline,
      ribbonOutline,
      desktopOutline,
      documentOutline,
      bookOutline,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Mission data */
  readonly mission = input.required<Mission>();

  /** Whether this mission is currently being completed */
  readonly isCompleting = input<boolean>(false);

  /** Whether to show description */
  readonly showDescription = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when checkbox is clicked */
  readonly complete = output<string>();

  /** Emitted when quick action is clicked */
  readonly quickAction = output<Mission['quickAction']>();

  /** Emitted when item content is clicked */
  readonly itemClick = output<Mission>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Whether mission is completed */
  protected readonly isCompleted = computed(() => this.mission().status === 'completed');

  /** Whether mission is locked */
  protected readonly isLocked = computed(() => this.mission().status === 'locked');

  /** Whether mission is in progress */
  protected readonly isInProgress = computed(() => this.mission().status === 'in-progress');

  /** Whether mission has progress */
  protected readonly hasProgress = computed(() => {
    const progress = this.mission().progress;
    return progress !== undefined && progress > 0 && progress < 100;
  });

  /** Priority color */
  protected readonly priorityColor = computed(() => {
    switch (this.mission().priority) {
      case 'critical':
        return 'var(--nxt1-color-error)';
      case 'high':
        return 'var(--nxt1-color-warning)';
      default:
        return 'var(--nxt1-color-primary)';
    }
  });

  /** Whether expiring soon */
  protected readonly isExpiringSoon = computed(() => {
    const expiresAt = this.mission().expiresAt;
    if (!expiresAt) return false;
    const expiresDate = new Date(expiresAt);
    const now = new Date();
    const hoursUntil = (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil < 48;
  });

  /** Mini progress dasharray */
  protected readonly miniProgressDasharray = computed(() => {
    const circumference = 2 * Math.PI * 10;
    return circumference.toString();
  });

  /** Mini progress offset */
  protected readonly miniProgressOffset = computed(() => {
    const progress = this.mission().progress ?? 0;
    const circumference = 2 * Math.PI * 10;
    return (circumference - (progress / 100) * circumference).toString();
  });

  /** Aria label */
  protected readonly ariaLabel = computed(() => {
    const m = this.mission();
    let label = m.title;
    if (m.status === 'completed') label += ' - Completed';
    if (m.status === 'locked') label += ' - Locked';
    label += `. ${m.reward.points} points`;
    return label;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected handleCheckboxClick(event: Event): void {
    event.stopPropagation();
    if (!this.isLocked() && !this.isCompleted() && !this.isCompleting()) {
      this.complete.emit(this.mission().id);
    }
  }

  protected handleQuickAction(event: Event): void {
    event.stopPropagation();
    const action = this.mission().quickAction;
    if (action) {
      this.quickAction.emit(action);
    }
  }

  protected handleContentClick(): void {
    this.itemClick.emit(this.mission());
  }
}
