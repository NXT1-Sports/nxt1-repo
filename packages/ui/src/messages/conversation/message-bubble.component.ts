/**
 * @fileoverview Message Bubble Component
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Renders a single message bubble in a conversation thread.
 * Supports own/other alignment, status indicators, reply context,
 * timestamps, retry on failure, and read receipts.
 *
 * Professional iMessage/WhatsApp-style design:
 * - Right-aligned blue bubbles for own messages
 * - Left-aligned gray bubbles for received messages
 * - Sender avatar for group/team conversations
 * - Delivery status indicators (sending/sent/delivered/read/failed)
 * - Reply-to preview
 * - Long-press/right-click context (future)
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Message, ConversationType } from '@nxt1/core';
import { NxtAvatarComponent } from '../../components/avatar';
import { HapticsService } from '../../services/haptics/haptics.service';

/** SVG path constants for status icons */
const STATUS_ICONS = {
  /** Single checkmark (sent) */
  sent: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  /** Double checkmark (delivered) */
  delivered:
    'M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z',
  /** Clock (sending) */
  sending:
    'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zM12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  /** Warning (failed) */
  failed: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  /** Reply arrow */
  reply: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z',
} as const;

@Component({
  selector: 'nxt1-message-bubble',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <!-- Reply-to preview -->
    @if (message().replyTo) {
      <div class="reply-context" [class.reply-context--own]="message().isOwn">
        <div class="reply-bar"></div>
        <div class="reply-content">
          <span class="reply-sender">{{ message().replyTo!.senderName }}</span>
          <span class="reply-preview">{{ message().replyTo!.preview }}</span>
        </div>
      </div>
    }

    <!-- Message row -->
    <div
      class="message-row"
      [class.message-row--own]="message().isOwn"
      [class.message-row--consecutive]="isConsecutive()"
    >
      <!-- Avatar (other messages only, first in group) -->
      @if (!message().isOwn && showAvatar()) {
        <div class="message-avatar">
          <nxt1-avatar
            [src]="message().sender.avatarUrl"
            [name]="message().sender.name"
            size="sm"
          />
        </div>
      } @else if (!message().isOwn) {
        <div class="message-avatar-spacer"></div>
      }

      <div class="bubble-wrapper" [class.bubble-wrapper--own]="message().isOwn">
        <!-- Sender name (group chats, first in consecutive group) -->
        @if (!message().isOwn && showSenderName() && showAvatar()) {
          <span class="sender-name">{{ message().sender.name }}</span>
        }

        <!-- Bubble -->
        <div
          class="bubble"
          [class.bubble--own]="message().isOwn"
          [class.bubble--other]="!message().isOwn"
          [class.bubble--failed]="message().status === 'failed'"
          [class.bubble--first]="isFirstInGroup()"
          [class.bubble--last]="isLastInGroup()"
          (click)="onBubbleClick()"
          role="article"
          [attr.aria-label]="ariaLabel()"
        >
          <!-- Message body -->
          <p class="bubble-text">{{ message().body }}</p>

          <!-- Meta row: time + status -->
          <div class="bubble-meta">
            <span class="bubble-time">{{ formatTime(message().timestamp) }}</span>

            @if (message().isEdited) {
              <span class="bubble-edited">edited</span>
            }

            <!-- Status indicator (own messages only) -->
            @if (message().isOwn) {
              @switch (message().status) {
                @case ('sending') {
                  <svg
                    class="status-icon status-icon--sending"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path [attr.d]="statusIcons.sending" />
                  </svg>
                }
                @case ('sent') {
                  <svg
                    class="status-icon status-icon--sent"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path [attr.d]="statusIcons.sent" />
                  </svg>
                }
                @case ('delivered') {
                  <svg
                    class="status-icon status-icon--delivered"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path [attr.d]="statusIcons.delivered" />
                  </svg>
                }
                @case ('read') {
                  <svg
                    class="status-icon status-icon--read"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path [attr.d]="statusIcons.delivered" />
                  </svg>
                }
                @case ('failed') {
                  <svg
                    class="status-icon status-icon--failed"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path [attr.d]="statusIcons.failed" />
                  </svg>
                }
              }
            }
          </div>
        </div>

        <!-- Failed: retry button -->
        @if (message().status === 'failed') {
          <button class="retry-button" (click)="onRetry()" aria-label="Retry sending message">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
            Tap to retry
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --nxt1-message-own-bubble-bg: var(--nxt1-color-info, #3b82f6);
        --nxt1-message-own-text: var(--nxt1-color-text-inverse, #ffffff);
        --nxt1-message-other-bubble-bg: var(--nxt1-color-surface-100, #1f2937);
        --nxt1-message-other-text: var(--nxt1-color-text-primary, #f3f4f6);
      }

      /* ============================================
         REPLY CONTEXT
         ============================================ */

      .reply-context {
        display: flex;
        align-items: stretch;
        gap: var(--nxt1-spacing-2);
        margin: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-1);
        padding-left: calc(var(--nxt1-spacing-7) + var(--nxt1-spacing-3));
      }

      .reply-context--own {
        padding-left: 0;
        padding-right: 0;
        justify-content: flex-end;
      }

      .reply-bar {
        width: calc(var(--nxt1-spacing-px) * 3);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .reply-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
        padding: var(--nxt1-spacing-1) 0;
      }

      .reply-sender {
        font-size: var(--nxt1-font-size-xs);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-primary);
        line-height: 1.2;
      }

      .reply-preview {
        font-size: var(--nxt1-font-size-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      /* ============================================
         MESSAGE ROW LAYOUT
         ============================================ */

      .message-row {
        display: flex;
        align-items: flex-end;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-4);
        max-width: 100%;
      }

      .message-row--own {
        flex-direction: row-reverse;
      }

      .message-row--consecutive {
        padding-top: var(--nxt1-spacing-px);
      }

      /* Avatar */
      .message-avatar {
        flex-shrink: 0;
        margin-bottom: var(--nxt1-spacing-0_5);
      }

      .message-avatar-spacer {
        width: var(--nxt1-spacing-7);
        flex-shrink: 0;
      }

      /* Bubble wrapper */
      .bubble-wrapper {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        max-width: 78%;
        min-width: var(--nxt1-spacing-16);
      }

      .bubble-wrapper--own {
        align-items: flex-end;
      }

      /* Sender name */
      .sender-name {
        font-size: var(--nxt1-font-size-xs);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-primary);
        margin-left: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-0_5);
        line-height: 1.2;
      }

      /* ============================================
         BUBBLE STYLES
         ============================================ */

      .bubble {
        position: relative;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-spacing-5);
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      /* Other's bubble: gray, left-aligned */
      .bubble--other {
        background: var(--nxt1-message-other-bubble-bg);
        color: var(--nxt1-message-other-text);
        border-bottom-left-radius: var(--nxt1-spacing-1);
      }

      .bubble--other.bubble--first {
        border-top-left-radius: var(--nxt1-spacing-5);
      }

      .bubble--other.bubble--last {
        border-bottom-left-radius: var(--nxt1-spacing-5);
      }

      /* Own bubble: primary blue, right-aligned */
      .bubble--own {
        background: var(--nxt1-message-own-bubble-bg);
        color: var(--nxt1-message-own-text);
        border-bottom-right-radius: var(--nxt1-spacing-1);
      }

      .bubble--own.bubble--first {
        border-top-right-radius: var(--nxt1-spacing-5);
      }

      .bubble--own.bubble--last {
        border-bottom-right-radius: var(--nxt1-spacing-5);
      }

      /* Failed state */
      .bubble--failed {
        opacity: 0.7;
      }

      .bubble--failed.bubble--own {
        background: var(--nxt1-color-error);
      }

      /* Message text */
      .bubble-text {
        margin: 0;
        font-size: var(--nxt1-font-size-base);
        line-height: 1.45;
        white-space: pre-wrap;
      }

      /* Meta row */
      .bubble-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--nxt1-spacing-1);
        margin-top: var(--nxt1-spacing-0_5);
      }

      .bubble-time {
        font-size: var(--nxt1-fontSize-2xs);
        color: currentColor;
        line-height: 1;
      }

      .bubble-edited {
        font-size: var(--nxt1-fontSize-2xs);
        font-style: italic;
        color: currentColor;
        line-height: 1;
      }

      /* Status icons */
      .status-icon {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
        flex-shrink: 0;
      }

      .status-icon--sending {
        opacity: 0.5;
        animation: spin 1.5s linear infinite;
      }

      .status-icon--sent {
        color: currentColor;
        opacity: 1;
      }

      .status-icon--delivered {
        color: currentColor;
        opacity: 1;
      }

      .status-icon--read {
        color: currentColor;
        opacity: 1;
      }

      .bubble--own .status-icon--read {
        color: currentColor;
      }

      .status-icon--failed {
        color: var(--nxt1-color-error);
        opacity: 1;
      }

      .bubble--own .status-icon--failed {
        color: rgba(255, 255, 255, 0.9);
      }

      /* Retry button */
      .retry-button {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-1);
        background: none;
        border: none;
        color: var(--nxt1-color-error);
        font-size: var(--nxt1-font-size-xs);
        font-weight: var(--nxt1-font-weight-medium);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .retry-button svg {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
      }

      .retry-button:hover {
        text-decoration: underline;
      }

      /* Animations */
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .status-icon--sending {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBubbleComponent {
  private readonly haptics = inject(HapticsService);

  /** The message to render */
  readonly message = input.required<Message>();

  /** Conversation type (affects sender name display) */
  readonly conversationType = input<ConversationType>('direct');

  /** Whether this is a consecutive message from the same sender */
  readonly isConsecutive = input(false);

  /** Whether to show the avatar (first in a group of consecutive messages) */
  readonly showAvatar = input(true);

  /** Whether this is the first message in a consecutive group */
  readonly isFirstInGroup = input(true);

  /** Whether this is the last message in a consecutive group */
  readonly isLastInGroup = input(true);

  /** Whether to show sender name (for group/team chats) */
  readonly showSenderName = computed(
    () => this.conversationType() === 'group' || this.conversationType() === 'team'
  );

  /** Emitted when the user wants to reply to this message */
  readonly reply = output<Message>();

  /** Emitted when the user wants to retry a failed message */
  readonly retry = output<string>();

  /** Icon paths */
  readonly statusIcons = STATUS_ICONS;

  /** Aria label for the bubble */
  ariaLabel(): string {
    const msg = this.message();
    const sender = msg.isOwn ? 'You' : msg.sender.name;
    const time = this.formatTime(msg.timestamp);
    return `${sender}: ${msg.body}. ${time}`;
  }

  /** Handle bubble click (for reply swipe gesture — future) */
  async onBubbleClick(): Promise<void> {
    // Future: long-press menu for reply/copy/forward/delete
  }

  /** Retry sending a failed message */
  async onRetry(): Promise<void> {
    await this.haptics.impact('medium');
    this.retry.emit(this.message().id);
  }

  /** Format timestamp to short time */
  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}
