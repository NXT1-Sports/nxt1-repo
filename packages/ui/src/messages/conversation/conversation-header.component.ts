/**
 * @fileoverview Conversation Header Component
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Renders the conversation header bar with:
 * - Back button (< arrow)
 * - Avatar + Name + Online status / member count
 * - Action buttons (call, video, info)
 *
 * Professional design matching iMessage, WhatsApp, Instagram DMs:
 * - Compact top bar with centered title
 * - Tap on name/avatar = open profile/info
 * - Green dot for online status
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Conversation } from '@nxt1/core';
import { NxtAvatarComponent } from '../../components/avatar';
import { HapticsService } from '../../services/haptics/haptics.service';

/** SVG icon paths */
const HEADER_ICONS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  call: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  video:
    'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
} as const;

@Component({
  selector: 'nxt1-conversation-header',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <div class="conversation-header">
      <!-- Back button -->
      <button class="header-back" (click)="onBack()" aria-label="Go back to messages">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path [attr.d]="icons.back" />
        </svg>
      </button>

      <!-- Tappable center: avatar + info -->
      <button class="header-info" (click)="onInfoClick()" aria-label="View conversation details">
        <div class="header-avatar">
          <nxt1-avatar [src]="conversation()?.avatarUrl" [name]="conversation()?.title" size="sm" />
          @if (isOnline()) {
            <span class="online-dot"></span>
          }
        </div>

        <div class="header-text">
          <span class="header-title">{{ title() }}</span>
          @if (subtitle()) {
            <span class="header-subtitle" [class.header-subtitle--online]="isOnline()">
              {{ subtitle() }}
            </span>
          }
        </div>
      </button>

      <!-- Action buttons -->
      <div class="header-actions">
        <button class="header-action" (click)="onCallClick()" aria-label="Voice call">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path [attr.d]="icons.call" />
          </svg>
        </button>
        <button class="header-action" (click)="onVideoClick()" aria-label="Video call">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path [attr.d]="icons.video" />
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .conversation-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-2);
        background: var(--nxt1-color-bg-primary);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        min-height: var(--nxt1-spacing-12);
      }

      /* Back button */
      .header-back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        border: none;
        background: none;
        color: var(--nxt1-color-primary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition: background-color var(--nxt1-ui-transition-fast);
      }

      .header-back:hover {
        background: var(--nxt1-color-surface-100);
      }

      .header-back:active {
        background: var(--nxt1-color-surface-200);
      }

      .header-back svg {
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
      }

      /* Center info (tappable) */
      .header-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
        flex: 1;
        min-width: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border: none;
        background: none;
        cursor: pointer;
        border-radius: var(--nxt1-radius-lg);
        -webkit-tap-highlight-color: transparent;
        transition: background-color var(--nxt1-ui-transition-fast);
        text-align: left;
      }

      .header-info:hover {
        background: var(--nxt1-color-surface-50);
      }

      .header-info:active {
        background: var(--nxt1-color-surface-100);
      }

      /* Avatar with online dot */
      .header-avatar {
        position: relative;
        flex-shrink: 0;
      }

      .online-dot {
        position: absolute;
        bottom: 0;
        right: 0;
        width: var(--nxt1-spacing-2_5);
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-success);
        border: calc(var(--nxt1-spacing-px) * 2) solid var(--nxt1-color-bg-primary);
      }

      /* Text */
      .header-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: var(--nxt1-spacing-0_5);
      }

      .header-title {
        font-size: var(--nxt1-font-size-base);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      }

      .header-subtitle {
        font-size: var(--nxt1-font-size-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      }

      .header-subtitle--online {
        color: var(--nxt1-color-success);
      }

      /* Action buttons */
      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-0_5);
        flex-shrink: 0;
      }

      .header-action {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        border: none;
        background: none;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-full);
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-ui-transition-fast);
      }

      .header-action:hover {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-primary);
      }

      .header-action:active {
        background: var(--nxt1-color-surface-200);
      }

      .header-action svg {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationHeaderComponent {
  private readonly haptics = inject(HapticsService);

  /** Conversation metadata */
  readonly conversation = input<Conversation | null>(null);

  /** Display title */
  readonly title = input('');

  /** Subtitle (online status, member count, etc.) */
  readonly subtitle = input('');

  /** Whether the other participant is online */
  readonly isOnline = input(false);

  /** Emitted when back button is pressed */
  readonly backClick = output<void>();

  /** Emitted when header center (info) is tapped */
  readonly infoClick = output<void>();

  /** Emitted when call button is pressed */
  readonly callClick = output<void>();

  /** Emitted when video button is pressed */
  readonly videoClick = output<void>();

  /** Icon paths */
  readonly icons = HEADER_ICONS;

  async onBack(): Promise<void> {
    await this.haptics.impact('light');
    this.backClick.emit();
  }

  async onInfoClick(): Promise<void> {
    await this.haptics.impact('light');
    this.infoClick.emit();
  }

  async onCallClick(): Promise<void> {
    await this.haptics.impact('medium');
    this.callClick.emit();
  }

  async onVideoClick(): Promise<void> {
    await this.haptics.impact('medium');
    this.videoClick.emit();
  }
}
