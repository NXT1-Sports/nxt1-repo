/**
 * @fileoverview Missions Badge Component - Achievement Display
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Display component for earned badges and achievements.
 * Supports both single badge and badge grid views.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated badge reveal
 * - Rarity-based styling
 * - New badge indicator
 * - Badge grid layout
 * - Hover/tap effects
 *
 * @example
 * ```html
 * <nxt1-missions-badge
 *   [badge]="badge"
 *   [isNew]="true"
 *   size="medium"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personCircle,
  videocam,
  statsChart,
  shieldCheckmark,
  people,
  list,
  chatbubbles,
  create,
  star,
  checkmarkCircle,
  school,
  heart,
  megaphone,
  ribbon,
  flameOutline,
  flame,
  bonfire,
  rocket,
  footsteps,
  sparkles,
} from 'ionicons/icons';
import type { EarnedBadge, Badge, BadgeRarity } from '@nxt1/core';

// Register icons
addIcons({
  personCircle,
  videocam,
  statsChart,
  shieldCheckmark,
  people,
  list,
  chatbubbles,
  create,
  star,
  checkmarkCircle,
  school,
  heart,
  megaphone,
  ribbon,
  flameOutline,
  flame,
  bonfire,
  rocket,
  footsteps,
  sparkles,
});

type BadgeSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'nxt1-missions-badge',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <button
      type="button"
      class="mission-badge"
      [class.mission-badge--small]="size() === 'small'"
      [class.mission-badge--medium]="size() === 'medium'"
      [class.mission-badge--large]="size() === 'large'"
      [class.mission-badge--common]="rarity() === 'common'"
      [class.mission-badge--uncommon]="rarity() === 'uncommon'"
      [class.mission-badge--rare]="rarity() === 'rare'"
      [class.mission-badge--epic]="rarity() === 'epic'"
      [class.mission-badge--legendary]="rarity() === 'legendary'"
      [class.mission-badge--new]="isNew()"
      (click)="handleClick()"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Badge Icon -->
      <div class="mission-badge__icon" [style.--badge-color]="badge().color">
        <ion-icon [name]="badge().icon"></ion-icon>
      </div>

      <!-- New Indicator -->
      @if (isNew()) {
        <div class="mission-badge__new-dot"></div>
      }

      <!-- Rarity Glow -->
      <div class="mission-badge__glow"></div>

      <!-- Name (for medium/large) -->
      @if (showName()) {
        <span class="mission-badge__name">{{ badge().name }}</span>
      }

      <!-- Points (for large) -->
      @if (size() === 'large') {
        <span class="mission-badge__points">+{{ badge().points }} pts</span>
      }
    </button>
  `,
  styles: [
    `
      /* ============================================
       MISSION BADGE - Achievement Display
       Gamified with rarity-based styling
       ============================================ */

      :host {
        display: inline-block;
      }

      .mission-badge {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        cursor: pointer;
        transition: all 0.2s ease;
        overflow: hidden;
      }

      .mission-badge:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        transform: translateY(-2px);
      }

      .mission-badge:active {
        transform: translateY(0) scale(0.98);
      }

      /* Size variations */
      .mission-badge--small {
        padding: 6px;
        border-radius: var(--nxt1-ui-radius-default, 8px);
      }

      .mission-badge--medium {
        padding: 10px;
        min-width: 80px;
      }

      .mission-badge--large {
        padding: 16px;
        min-width: 100px;
      }

      /* ============================================
       RARITY STYLES
       ============================================ */

      .mission-badge--common {
        --rarity-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .mission-badge--uncommon {
        --rarity-color: var(--nxt1-color-success, #22c55e);
        border-color: rgba(34, 197, 94, 0.2);
      }

      .mission-badge--rare {
        --rarity-color: var(--nxt1-color-info, #3b82f6);
        border-color: rgba(59, 130, 246, 0.3);
      }

      .mission-badge--epic {
        --rarity-color: var(--nxt1-color-accent);
        border-color: var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
      }

      .mission-badge--legendary {
        --rarity-color: var(--nxt1-color-secondary, #ffd700);
        border-color: rgba(255, 215, 0, 0.4);
        background: rgba(255, 215, 0, 0.05);
      }

      .mission-badge--legendary .mission-badge__glow {
        opacity: 0.4;
        animation: legendary-pulse 2s ease-in-out infinite;
      }

      @keyframes legendary-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.3;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.5;
        }
      }

      /* ============================================
       ICON
       ============================================ */

      .mission-badge__icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: color-mix(in srgb, var(--badge-color, var(--rarity-color)) 15%, transparent);
      }

      .mission-badge--small .mission-badge__icon {
        width: 24px;
        height: 24px;
      }

      .mission-badge--large .mission-badge__icon {
        width: 48px;
        height: 48px;
      }

      .mission-badge__icon ion-icon {
        font-size: 18px;
        color: var(--badge-color, var(--rarity-color));
      }

      .mission-badge--small .mission-badge__icon ion-icon {
        font-size: 14px;
      }

      .mission-badge--large .mission-badge__icon ion-icon {
        font-size: 26px;
      }

      /* ============================================
       NEW DOT
       ============================================ */

      .mission-badge__new-dot {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        background: var(--nxt1-color-error, #ef4444);
        border-radius: 50%;
        animation: pulse-new 1.5s ease-in-out infinite;
      }

      @keyframes pulse-new {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.3);
          opacity: 0.7;
        }
      }

      /* ============================================
       GLOW
       ============================================ */

      .mission-badge__glow {
        position: absolute;
        inset: -50%;
        background: radial-gradient(circle, var(--rarity-color) 0%, transparent 70%);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .mission-badge:hover .mission-badge__glow {
        opacity: 0.15;
      }

      /* ============================================
       TEXT
       ============================================ */

      .mission-badge__name {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        text-align: center;
        line-height: 1.2;
      }

      .mission-badge--large .mission-badge__name {
        font-size: 13px;
      }

      .mission-badge__points {
        font-size: 10px;
        font-weight: 500;
        color: var(--rarity-color);
      }

      /* ============================================
       NEW BADGE ANIMATION
       ============================================ */

      .mission-badge--new {
        animation: badge-reveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes badge-reveal {
        0% {
          transform: scale(0) rotate(-180deg);
          opacity: 0;
        }
        50% {
          transform: scale(1.2) rotate(10deg);
        }
        100% {
          transform: scale(1) rotate(0deg);
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsBadgeComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Badge data */
  readonly badge = input.required<Badge | EarnedBadge>();

  /** Component size */
  readonly size = input<BadgeSize>('medium');

  /** Whether badge is new/unviewed */
  readonly isNew = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when badge is clicked */
  readonly badgeClick = output<Badge | EarnedBadge>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Badge rarity */
  protected readonly rarity = computed<BadgeRarity>(() => this.badge().rarity);

  /** Whether to show name */
  protected readonly showName = computed(() => this.size() === 'medium' || this.size() === 'large');

  /** Aria label */
  protected readonly ariaLabel = computed(() => {
    const b = this.badge();
    return `${b.name} badge - ${b.rarity} - ${b.description}`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected handleClick(): void {
    this.badgeClick.emit(this.badge());
  }
}

// ============================================
// BADGE GRID COMPONENT
// ============================================

@Component({
  selector: 'nxt1-missions-badge-grid',
  standalone: true,
  imports: [CommonModule, IonIcon, MissionsBadgeComponent],
  template: `
    <div class="badge-grid" [class.badge-grid--compact]="compact()">
      @for (badge of badges(); track badge.id) {
        <nxt1-missions-badge
          [badge]="badge"
          [isNew]="isBadgeNew(badge)"
          [size]="compact() ? 'small' : 'medium'"
          (badgeClick)="handleBadgeClick($event)"
        />
      } @empty {
        <div class="badge-grid__empty">
          <ion-icon name="sparkles"></ion-icon>
          <span>No badges earned yet</span>
          <p>Complete missions to earn badges!</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .badge-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
        gap: 12px;
      }

      .badge-grid--compact {
        grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
        gap: 8px;
      }

      .badge-grid__empty {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 32px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-align: center;
      }

      .badge-grid__empty ion-icon {
        font-size: 32px;
        color: var(--nxt1-color-text-disabled, rgba(255, 255, 255, 0.3));
      }

      .badge-grid__empty span {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .badge-grid__empty p {
        margin: 0;
        font-size: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsBadgeGridComponent {
  /** Badges to display */
  readonly badges = input<EarnedBadge[]>([]);

  /** Compact mode */
  readonly compact = input<boolean>(false);

  /** Emitted when badge is clicked */
  readonly badgeClick = output<EarnedBadge>();

  /** Check if badge is new */
  protected isBadgeNew(badge: EarnedBadge): boolean {
    return badge.isNew ?? false;
  }

  protected handleBadgeClick(badge: Badge | EarnedBadge): void {
    this.badgeClick.emit(badge as EarnedBadge);
  }
}
