/**
 * @fileoverview Conversation Shell Component — Mobile (Ionic)
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Top-level container for a conversation thread on mobile.
 * Uses Ionic components for native iOS/Android feel.
 *
 * Professional chat layout (iMessage / WhatsApp pattern):
 * - Fixed header with back, avatar, name, actions
 * - Scrollable message area (oldest at top, newest at bottom)
 * - Auto-scroll to bottom on new messages
 * - Date separators between message groups
 * - Typing indicator at bottom
 * - Fixed message input bar at bottom above keyboard
 * - Pull-to-load older messages at top
 *
 * ⭐ MOBILE ONLY — Uses Ionic ⭐
 *
 * For web, use ConversationShellWebComponent instead.
 *
 * @example
 * ```html
 * <nxt1-conversation-shell
 *   [conversationId]="conversationId"
 *   (backClick)="goBack()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  OnInit,
  OnDestroy,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import type { Message, ConversationType } from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ConversationService } from './conversation.service';
import { ConversationHeaderComponent } from './conversation-header.component';
import { MessageBubbleComponent } from './message-bubble.component';
import { MessageInputComponent } from './message-input.component';

@Component({
  selector: 'nxt1-conversation-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    ConversationHeaderComponent,
    MessageBubbleComponent,
    MessageInputComponent,
  ],
  template: `
    <!-- Conversation header (fixed above content) -->
    <nxt1-conversation-header
      [conversation]="conversationService.conversation()"
      [title]="conversationService.title()"
      [subtitle]="conversationService.subtitle()"
      [isOnline]="conversationService.isOnline()"
      (backClick)="backClick.emit()"
      (infoClick)="infoClick.emit()"
      (callClick)="callClick.emit()"
      (videoClick)="videoClick.emit()"
    />

    <!-- Scrollable message area -->
    <ion-content class="conversation-content" [fullscreen]="true" [scrollEvents]="true">
      <div #messagesContainer class="messages-area">
        <!-- Loading state -->
        @if (conversationService.isLoading()) {
          <div class="messages-loading">
            @for (i of skeletonItems; track i) {
              <div class="message-skeleton" [class.message-skeleton--own]="i % 3 === 0">
                <div class="skeleton-bubble">
                  <div class="skeleton-line skeleton-line--long"></div>
                  <div class="skeleton-line skeleton-line--short"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Error state -->
        @else if (conversationService.error()) {
          <div class="messages-error">
            <div class="error-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                />
              </svg>
            </div>
            <p class="error-text">{{ conversationService.error() }}</p>
            <button class="error-retry" (click)="onRetry()">Try Again</button>
          </div>
        }

        <!-- Empty state -->
        @else if (conversationService.isEmpty()) {
          <div class="messages-empty">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"
                />
              </svg>
            </div>
            <p class="empty-title">Start the conversation</p>
            <p class="empty-text">Send your first message below</p>
          </div>
        }

        <!-- Messages -->
        @else {
          <!-- Load more indicator -->
          @if (conversationService.hasMore()) {
            <div class="load-more">
              <button
                class="load-more-button"
                [disabled]="conversationService.isLoadingMore()"
                (click)="onLoadMore()"
              >
                @if (conversationService.isLoadingMore()) {
                  Loading...
                } @else {
                  Load older messages
                }
              </button>
            </div>
          }

          <!-- Grouped by date -->
          @for (group of conversationService.groupedMessages(); track group.date) {
            <!-- Date separator -->
            <div class="date-separator">
              <span class="date-label">{{ group.label }}</span>
            </div>

            <!-- Messages in this date group -->
            @for (message of group.messages; track message.id; let i = $index) {
              <nxt1-message-bubble
                [message]="message"
                [conversationType]="conversationType()"
                [isConsecutive]="isConsecutiveMessage(group.messages, i)"
                [showAvatar]="shouldShowAvatar(group.messages, i)"
                [isFirstInGroup]="isFirstInSenderGroup(group.messages, i)"
                [isLastInGroup]="isLastInSenderGroup(group.messages, i)"
                (retry)="onRetrySend($event)"
                (reply)="onReply($event)"
              />
            }
          }

          <!-- Typing indicator -->
          @if (conversationService.isTyping()) {
            <div class="typing-indicator">
              <div class="typing-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
              <span class="typing-text">{{ conversationService.typingText() }}</span>
            </div>
          }

          <!-- Scroll anchor -->
          <div #scrollAnchor class="scroll-anchor"></div>
        }
      </div>
    </ion-content>

    <!-- Message input (fixed at bottom) -->
    <nxt1-message-input
      [replyTo]="conversationService.replyTo()"
      [isSending]="conversationService.isSending()"
      (messageSend)="onSend($event)"
      (dismissReply)="conversationService.clearReplyTo()"
    />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      /* ============================================
         SCROLLABLE MESSAGE AREA
         ============================================ */

      .conversation-content {
        --background: var(--nxt1-color-bg-primary);
        flex: 1;
      }

      .messages-area {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding-top: var(--nxt1-spacing-2);
        padding-bottom: var(--nxt1-spacing-2);
      }

      /* ============================================
         LOADING SKELETON
         ============================================ */

      .messages-loading {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
      }

      .message-skeleton {
        display: flex;
        max-width: 75%;
      }

      .message-skeleton--own {
        align-self: flex-end;
      }

      .skeleton-bubble {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-spacing-5);
        background: var(--nxt1-color-surface-100);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .message-skeleton--own .skeleton-bubble {
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
      }

      .skeleton-line {
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-radius-sm);
        background: var(--nxt1-skeleton-gradient);
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
      }

      .skeleton-line--long {
        width: calc(var(--nxt1-spacing-40) + var(--nxt1-spacing-10));
      }

      .skeleton-line--short {
        width: var(--nxt1-spacing-20);
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .messages-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-12) var(--nxt1-spacing-4);
        text-align: center;
      }

      .error-icon {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        color: var(--nxt1-color-error);
      }

      .error-icon svg {
        width: 100%;
        height: 100%;
      }

      .error-text {
        font-size: var(--nxt1-font-size-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .error-retry {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-medium);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: filter var(--nxt1-ui-transition-fast);
      }

      .error-retry:hover {
        filter: brightness(1.1);
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .messages-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-4);
        text-align: center;
        flex: 1;
      }

      .empty-icon {
        width: var(--nxt1-spacing-14);
        height: var(--nxt1-spacing-14);
        color: var(--nxt1-color-text-disabled);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .empty-title {
        font-size: var(--nxt1-font-size-lg);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .empty-text {
        font-size: var(--nxt1-font-size-sm);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ============================================
         DATE SEPARATOR
         ============================================ */

      .date-separator {
        display: flex;
        justify-content: center;
        padding: var(--nxt1-spacing-4) 0 var(--nxt1-spacing-2);
      }

      .date-label {
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-surface-100);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-font-weight-medium);
        color: var(--nxt1-color-text-tertiary);
        line-height: 1.4;
      }

      /* ============================================
         TYPING INDICATOR
         ============================================ */

      .typing-indicator {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        animation: fadeIn 200ms ease-out;
      }

      .typing-dots {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-spacing-5);
        background: var(--nxt1-color-surface-100);
      }

      .dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-text-tertiary);
        animation: typingBounce 1.4s infinite ease-in-out;
      }

      .dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      .typing-text {
        font-size: var(--nxt1-font-size-xs);
        color: var(--nxt1-color-text-tertiary);
        font-style: italic;
      }

      /* ============================================
         LOAD MORE
         ============================================ */

      .load-more {
        display: flex;
        justify-content: center;
        padding: var(--nxt1-spacing-3);
      }

      .load-more-button {
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-4);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-full);
        background: none;
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-font-size-xs);
        font-weight: var(--nxt1-font-weight-medium);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-ui-transition-fast);
      }

      .load-more-button:hover:not(:disabled) {
        background: var(--nxt1-color-surface-50);
      }

      .load-more-button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* Scroll anchor */
      .scroll-anchor {
        height: var(--nxt1-spacing-px);
      }

      /* ============================================
         ANIMATIONS
         ============================================ */

      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes typingBounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
        }
        30% {
          transform: translateY(calc(var(--nxt1-spacing-1) * -1));
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-line {
          animation: none;
        }
        .dot {
          animation: none;
        }
        .typing-indicator {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationShellComponent implements OnInit, OnDestroy {
  readonly conversationService = inject(ConversationService);
  private readonly logger = inject(NxtLoggingService).child('ConversationShell');

  private readonly scrollAnchor = viewChild<ElementRef>('scrollAnchor');

  /** Conversation ID to load */
  readonly conversationId = input.required<string>();

  /** Emitted when back button is pressed */
  readonly backClick = output<void>();

  /** Emitted when conversation info is requested */
  readonly infoClick = output<void>();

  /** Emitted when call is requested */
  readonly callClick = output<void>();

  /** Emitted when video call is requested */
  readonly videoClick = output<void>();

  /** Skeleton loading items */
  readonly skeletonItems = Array.from({ length: 8 }, (_, i) => i);

  /** Conversation type */
  readonly conversationType = computed((): ConversationType => {
    return this.conversationService.conversation()?.type ?? 'direct';
  });

  constructor() {
    // Auto-scroll to bottom when new messages arrive
    effect(() => {
      const msgs = this.conversationService.messages();
      if (msgs.length > 0) {
        this.scrollToBottom();
      }
    });
  }

  ngOnInit(): void {
    const id = this.conversationId();
    if (id) {
      this.conversationService.openConversation(id);
      this.logger.debug('Conversation shell initialized', { conversationId: id });
    }
  }

  ngOnDestroy(): void {
    this.conversationService.closeConversation();
  }

  /** Send a message */
  async onSend(body: string): Promise<void> {
    await this.conversationService.sendMessage(body);
    this.scrollToBottom();
  }

  /** Retry sending a failed message */
  async onRetrySend(messageId: string): Promise<void> {
    await this.conversationService.retrySend(messageId);
  }

  /** Reply to a message */
  onReply(message: Message): void {
    this.conversationService.setReplyTo(message);
  }

  /** Load older messages */
  async onLoadMore(): Promise<void> {
    await this.conversationService.loadMore();
  }

  /** Retry loading the conversation */
  async onRetry(): Promise<void> {
    this.conversationService.clearError();
    await this.conversationService.openConversation(this.conversationId());
  }

  /** Check if messages are consecutive from the same sender */
  isConsecutiveMessage(messages: Message[], index: number): boolean {
    if (index === 0) return false;
    return messages[index].sender.id === messages[index - 1].sender.id;
  }

  /** Show avatar only for the last message in a consecutive group */
  shouldShowAvatar(messages: Message[], index: number): boolean {
    if (messages[index].isOwn) return false;
    // Show avatar if this is the last message from this sender OR last in list
    if (index === messages.length - 1) return true;
    return messages[index].sender.id !== messages[index + 1].sender.id;
  }

  /** First in a group of consecutive same-sender messages */
  isFirstInSenderGroup(messages: Message[], index: number): boolean {
    if (index === 0) return true;
    return messages[index].sender.id !== messages[index - 1].sender.id;
  }

  /** Last in a group of consecutive same-sender messages */
  isLastInSenderGroup(messages: Message[], index: number): boolean {
    if (index === messages.length - 1) return true;
    return messages[index].sender.id !== messages[index + 1].sender.id;
  }

  /** Scroll the message list to the bottom */
  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      const anchor = this.scrollAnchor()?.nativeElement;
      if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }
}
