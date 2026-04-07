/**
 * @fileoverview Settings User Card Component - Account Info Card
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Profile card component displayed at the top of settings.
 * Shows user avatar, name, email, and role/plan badge.
 * Following Instagram/Twitter account header pattern.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Large avatar with edit action
 * - User name and email
 * - Role/plan badge
 * - Tap to edit profile action
 * - Theme-aware styling
 *
 * @example
 * ```html
 * <nxt1-settings-user-card
 *   [user]="user()"
 *   [subscription]="subscription()"
 *   (editProfile)="onEditProfile()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import type { SettingsUserInfo, SettingsSubscription } from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtIconComponent } from '../components/icon';

// Register icons
@Component({
  selector: 'nxt1-settings-user-card',
  standalone: true,
  imports: [CommonModule, IonRippleEffect, NxtAvatarComponent, NxtIconComponent],
  template: `
    <div class="user-card" (click)="onCardClick()" role="button" tabindex="0">
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Avatar with Edit Overlay -->
      <div class="user-card__avatar-container">
        <nxt1-avatar
          [src]="user()?.profileImg"
          [name]="user()?.displayName ?? user()?.email"
          size="xl"
        />
        <div class="user-card__avatar-edit">
          <nxt1-icon name="pencil" [size]="14"></nxt1-icon>
        </div>
      </div>

      <!-- User Info -->
      <div class="user-card__info">
        <div class="user-card__name-row">
          <h2 class="user-card__name">{{ displayName() }}</h2>
          @if (isVerified()) {
            <nxt1-icon
              name="checkmarkCircle"
              [size]="18"
              className="user-card__verified"
            ></nxt1-icon>
          }
        </div>

        <p class="user-card__email">{{ user()?.email }}</p>

        <!-- Role/Plan Badge -->
        <div class="user-card__badges">
          @if (roleBadge()) {
            <span class="user-card__badge user-card__badge--role">
              {{ roleBadge() }}
            </span>
          }
          @if (planBadge()) {
            <span
              class="user-card__badge"
              [class.user-card__badge--pro]="subscription()?.tier === 'pro'"
              [class.user-card__badge--premium]="subscription()?.tier === 'premium'"
              [class.user-card__badge--team]="subscription()?.tier === 'team'"
              [class.user-card__badge--metered]="subscription()?.tier === 'metered'"
            >
              @if (subscription()?.tier !== 'free' && subscription()?.tier !== 'metered') {
                <nxt1-icon name="star" [size]="10" className="user-card__badge-icon"></nxt1-icon>
              }
              {{ planBadge() }}
            </span>
          }
        </div>
      </div>

      <!-- Edit Icon -->
      <div class="user-card__action">
        <nxt1-icon name="pencil" [size]="18"></nxt1-icon>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       USER CARD - Profile Header
       Instagram/Twitter Pattern
       100% Theme Aware
       ============================================ */

      :host {
        display: block;
        padding: 16px;
      }

      .user-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.15s ease;
      }

      .user-card:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .user-card:active {
        transform: scale(0.99);
      }

      /* ============================================
       AVATAR
       ============================================ */

      .user-card__avatar-container {
        position: relative;
        flex-shrink: 0;
      }

      .user-card__avatar-edit {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .user-card__avatar-edit nxt1-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      /* ============================================
       INFO
       ============================================ */

      .user-card__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .user-card__name-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .user-card__name {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .user-card__verified {
        font-size: 18px;
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .user-card__email {
        margin: 0;
        font-size: 14px;
        font-weight: 400;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
       BADGES
       ============================================ */

      .user-card__badges {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }

      .user-card__badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-radius: 6px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .user-card__badge--role {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
      }

      .user-card__badge--pro {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
        color: #a78bfa;
      }

      .user-card__badge--premium {
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 183, 0, 0.15));
        color: var(--nxt1-color-secondary, #ffd700);
      }

      .user-card__badge--team {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.15));
        color: var(--nxt1-color-success, #22c55e);
      }

      .user-card__badge-icon {
        font-size: 10px;
      }

      /* ============================================
       ACTION
       ============================================ */

      .user-card__action {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        flex-shrink: 0;
      }

      .user-card__action nxt1-icon {
        font-size: 18px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
       LIGHT MODE
       ============================================ */

      :host-context(.light),
      :host-context([data-theme='light']) {
        .user-card {
          background: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        }

        .user-card:hover {
          background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
          border-color: var(--nxt1-color-border-default, rgba(0, 0, 0, 0.12));
        }

        .user-card__avatar-edit {
          border-color: var(--nxt1-color-bg-primary, #ffffff);
        }

        .user-card__name {
          color: var(--nxt1-color-text-primary, #1a1a1a);
        }

        .user-card__email {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        }

        .user-card__badge {
          background: var(--nxt1-color-surface-300, rgba(0, 0, 0, 0.08));
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        }

        .user-card__action {
          background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
        }

        .user-card__action nxt1-icon {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsUserCardComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** User info to display */
  readonly user = input<SettingsUserInfo | null>(null);

  /** Subscription info */
  readonly subscription = input<SettingsSubscription | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when user wants to edit profile */
  readonly editProfile = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  protected displayName(): string {
    const user = this.user();
    return user?.displayName ?? user?.email?.split('@')[0] ?? 'User';
  }

  protected isVerified(): boolean {
    return this.user()?.emailVerified ?? false;
  }

  protected roleBadge(): string | null {
    const role = this.user()?.role;
    if (!role) return null;

    const roleLabels: Record<string, string> = {
      athlete: 'Athlete',
      coach: 'Coach',
      director: 'Director',
      recruiter: 'Recruiter',
      parent: 'Parent',
    };

    return roleLabels[role] ?? role;
  }

  protected planBadge(): string | null {
    const tier = this.subscription()?.tier;
    if (!tier || tier === 'free') return 'Free';

    const planLabels: Record<string, string> = {
      pro: 'Pro',
      premium: 'Premium',
      team: 'Team',
      metered: 'Usage-Based',
    };

    return planLabels[tier] ?? tier;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onCardClick(): Promise<void> {
    await this.haptics.impact('light');
    this.editProfile.emit();
  }
}
