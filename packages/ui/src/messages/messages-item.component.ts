/**
 * @fileoverview Messages Conversation Item Component
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Renders a single conversation entry in the message list.
 * Displays avatar, name, last message preview, timestamp, and badges.
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Conversation } from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { HapticsService } from '../services/haptics/haptics.service';

/** SVG path constants for inline icons */
const ICON_PATHS = {
  verified:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  pin: 'M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z',
  muted:
    'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  group:
    'M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0020 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z',
} as const;

@Component({
  selector: 'nxt1-messages-item',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <div
      class="conversation-item"
      [class.conversation-item--unread]="conversation().unreadCount > 0"
      [class.conversation-item--pinned]="conversation().isPinned"
      (click)="handleClick()"
      role="button"
      tabindex="0"
      [attr.aria-label]="ariaLabel()"
      (keydown.enter)="handleClick()"
      (keydown.space)="handleClick(); $event.preventDefault()"
    >
      <!-- Avatar with online indicator -->
      <div class="item-avatar">
        <nxt1-avatar [src]="conversation().avatarUrl" [name]="conversation().title" size="lg" />
        @if (conversation().isOnline) {
          <span class="online-indicator" aria-label="Online"></span>
        }
      </div>

      <!-- Conversation content -->
      <div class="item-content">
        <div class="item-header">
          <div class="item-name-row">
            <!-- Display name -->
            <span class="item-name" [class.item-name--unread]="conversation().unreadCount > 0">
              {{ conversation().title }}
            </span>

            <!-- Verified badge -->
            @if (conversation().hasVerifiedParticipant) {
              <svg
                class="verified-badge"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="Verified"
              >
                <path [attr.d]="iconPaths.verified" />
              </svg>
            }

            <!-- Type indicator (group/team) -->
            @if (conversation().type === 'group' || conversation().type === 'team') {
              <svg
                class="type-badge"
                viewBox="0 0 24 24"
                fill="currentColor"
                [attr.aria-label]="conversation().type === 'team' ? 'Team' : 'Group'"
              >
                <path [attr.d]="iconPaths.group" />
              </svg>
            }
          </div>

          <!-- Timestamp -->
          @if (conversation().lastMessage?.timestamp) {
            <span class="item-time" [class.item-time--unread]="conversation().unreadCount > 0">
              {{ formatTime(conversation().lastMessage!.timestamp) }}
            </span>
          }
        </div>

        <!-- Message preview row -->
        <div class="item-preview-row">
          <p class="item-preview" [class.item-preview--unread]="conversation().unreadCount > 0">
            @if (conversation().lastMessage?.isOwn) {
              <span class="preview-sender">You: </span>
            }
            {{ conversation().lastMessage?.body ?? 'No messages yet' }}
          </p>

          <!-- Status badges -->
          <div class="item-badges">
            @if (conversation().isPinned) {
              <svg
                class="badge-icon badge-icon--pin"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="Pinned"
              >
                <path [attr.d]="iconPaths.pin" />
              </svg>
            }
            @if (conversation().isMuted) {
              <svg
                class="badge-icon badge-icon--mute"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="Muted"
              >
                <path [attr.d]="iconPaths.muted" />
              </svg>
            }
            @if (conversation().unreadCount > 0) {
              <span class="unread-badge">
                {{ conversation().unreadCount > 9 ? '9+' : conversation().unreadCount }}
              </span>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .conversation-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        cursor: pointer;
        transition: background-color var(--nxt1-ui-transition-fast);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        -webkit-tap-highlight-color: transparent;
        outline: none;
      }

      .conversation-item:hover {
        background: var(--nxt1-color-surface-100);
      }

      .conversation-item:active {
        background: var(--nxt1-color-surface-200);
      }

      .conversation-item:focus-visible {
        box-shadow: inset 0 0 0 calc(var(--nxt1-spacing-px) * 2) var(--nxt1-color-primary);
      }

      /* Avatar container with online indicator */
      .item-avatar {
        position: relative;
        flex-shrink: 0;
      }

      .online-indicator {
        position: absolute;
        bottom: var(--nxt1-spacing-px);
        right: var(--nxt1-spacing-px);
        width: var(--nxt1-spacing-3);
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-success);
        border: calc(var(--nxt1-spacing-px) * 2) solid var(--nxt1-color-bg-primary);
      }

      /* Content area */
      .item-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .item-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        min-width: 0;
        flex: 1;
      }

      .item-name {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-name--unread {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .verified-badge {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .type-badge {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      .item-time {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .item-time--unread {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* Preview row */
      .item-preview-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .item-preview {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
        flex: 1;
        min-width: 0;
      }

      .item-preview--unread {
        color: var(--nxt1-color-text-secondary);
      }

      .preview-sender {
        color: var(--nxt1-color-text-tertiary);
      }

      /* Badges */
      .item-badges {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-shrink: 0;
      }

      .badge-icon {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
        color: var(--nxt1-color-text-disabled);
      }

      .unread-badge {
        min-width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        padding: 0 var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesItemComponent {
  private readonly haptics = inject(HapticsService);

  /** Conversation data to render */
  readonly conversation = input.required<Conversation>();

  /** Emitted when the conversation is clicked */
  readonly conversationClick = output<Conversation>();

  /** Icon path constants */
  readonly iconPaths = ICON_PATHS;

  /** Computed aria label */
  ariaLabel(): string {
    const conv = this.conversation();
    const unread = conv.unreadCount > 0 ? `, ${conv.unreadCount} unread` : '';
    return `${conv.title}${unread}`;
  }

  /** Handle click with haptic feedback */
  async handleClick(): Promise<void> {
    await this.haptics.impact('light');
    this.conversationClick.emit(this.conversation());
  }

  /** Format timestamp to relative time */
  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
