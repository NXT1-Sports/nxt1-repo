/**
 * @fileoverview Invite Channel Grid Component - Share Channels Display
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Grid of shareable channels with native-like appearance.
 * Supports primary (large) and social (compact) variants.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { INVITE_TEST_IDS } from '@nxt1/core/testing';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import type { InviteChannelConfig } from '@nxt1/core';

type GridVariant = 'primary' | 'social';

@Component({
  selector: 'nxt1-invite-channel-grid',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div
      class="channel-grid"
      [attr.data-testid]="testIds.CHANNEL_GRID"
      [class.channel-grid--primary]="variant() === 'primary'"
      [class.channel-grid--social]="variant() === 'social'"
    >
      @for (channel of channels(); track channel.id) {
        <button
          type="button"
          class="channel-item"
          [attr.data-testid]="testIds.CHANNEL_ITEM"
          [class.channel-item--primary]="variant() === 'primary'"
          [class.channel-item--social]="variant() === 'social'"
          (click)="onSelect(channel)"
        >
          <ion-ripple-effect></ion-ripple-effect>

          <div
            class="channel-item__icon"
            [style.background]="getIconBg(channel)"
            [style.color]="getIconColor(channel)"
          >
            <ion-icon [name]="channel.icon"></ion-icon>
          </div>

          <span class="channel-item__label">{{ channel.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       CHANNEL GRID
       ============================================ */

      :host {
        display: block;
      }

      .channel-grid {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .channel-grid--primary {
        grid-template-columns: repeat(3, 1fr);
      }

      .channel-grid--social {
        grid-template-columns: repeat(4, 1fr);
      }

      /* ============================================
       CHANNEL ITEM
       ============================================ */

      .channel-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .channel-item:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-default);
        transform: translateY(-2px);
      }

      .channel-item:active {
        transform: scale(0.97);
      }

      /* ============================================
       PRIMARY VARIANT (Larger)
       ============================================ */

      .channel-item--primary {
        padding: var(--nxt1-spacing-4);
      }

      .channel-item--primary .channel-item__icon {
        width: 52px;
        height: 52px;
        border-radius: var(--nxt1-radius-xl);
        font-size: 26px;
      }

      .channel-item--primary .channel-item__label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ============================================
       SOCIAL VARIANT (Compact)
       ============================================ */

      .channel-item--social {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2);
      }

      .channel-item--social .channel-item__icon {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
        font-size: 22px;
      }

      .channel-item--social .channel-item__label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ============================================
       ICON
       ============================================ */

      .channel-item__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      }

      .channel-item:hover .channel-item__icon {
        transform: scale(1.05);
      }

      .channel-item__icon ion-icon {
        display: block;
      }

      /* ============================================
       LABEL
       ============================================ */

      .channel-item__label {
        color: var(--nxt1-color-text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      /* ============================================
       XP BADGE
       ============================================ */

      .channel-item__xp {
        position: absolute;
        top: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        padding: 2px 6px;
        background: var(--nxt1-color-alpha-primary20);
        color: var(--nxt1-color-primary);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-bold);
        border-radius: var(--nxt1-radius-full);
      }

      /* ============================================
       RESPONSIVE
       ============================================ */

      @media (min-width: 480px) {
        .channel-grid--primary {
          grid-template-columns: repeat(3, 1fr);
        }

        .channel-grid--social {
          grid-template-columns: repeat(4, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteChannelGridComponent {
  protected readonly testIds = INVITE_TEST_IDS;

  readonly channels = input<InviteChannelConfig[]>([]);
  readonly variant = input<GridVariant>('primary');

  readonly channelSelect = output<InviteChannelConfig>();

  protected onSelect(channel: InviteChannelConfig): void {
    this.channelSelect.emit(channel);
  }

  protected getIconBg(channel: InviteChannelConfig): string {
    // For social branded colors, add slight transparency
    if (channel.color.startsWith('#')) {
      return channel.color + '20'; // 12.5% opacity
    }
    return 'var(--nxt1-color-surface-200)';
  }

  protected getIconColor(channel: InviteChannelConfig): string {
    if (channel.color.startsWith('#')) {
      return channel.color;
    }
    return channel.color;
  }
}
