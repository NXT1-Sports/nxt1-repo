/**
 * @fileoverview Conversation Shell Component — Web (Zero Ionic)
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Top-level container for a conversation thread on web.
 * Zero Ionic dependencies for SSR compatibility.
 *
 * Identical layout to mobile shell but uses native HTML scrolling
 * instead of `<ion-content>`.
 *
 * ⭐ WEB ONLY — Zero Ionic, SSR-optimized ⭐
 *
 * For mobile, use ConversationShellComponent instead.
 *
 * @example
 * ```html
 * <nxt1-conversation-shell-web
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
  signal,
  OnInit,
  OnDestroy,
  viewChild,
  ElementRef,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { Message, ConversationType } from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ConversationService } from './conversation.service';
import { ConversationHeaderComponent } from './conversation-header.component';
import { MessageBubbleComponent } from './message-bubble.component';
import { AgentXInputComponent } from '../../agent-x/agent-x-input.component';

@Component({
  selector: 'nxt1-conversation-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    ConversationHeaderComponent,
    MessageBubbleComponent,
    AgentXInputComponent,
  ],
  template: `
    <div class="conversation-container">
      <!-- Header -->
      <nxt1-conversation-header
        [conversation]="conversationService.conversation()"
        [title]="conversationService.title()"
        [subtitle]="conversationService.subtitle()"
        [isOnline]="conversationService.isOnline()"
        (backClick)="backClick.emit()"
        (infoClick)="infoClick.emit()"
        (agentXClick)="agentXClick.emit()"
      />

      <!-- Scrollable messages area -->
      <div #messagesScroll class="messages-scroll">
        <div class="messages-area">
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
            <!-- Load more -->
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
              <div class="date-separator">
                <span class="date-label">{{ group.label }}</span>
              </div>

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

            <div #scrollAnchor class="scroll-anchor"></div>
          }
        </div>
      </div>

      <!-- Shared Agent X input used across the app -->
      <nxt1-agent-x-input
        [hasMessages]="!conversationService.isEmpty()"
        [selectedTask]="null"
        [isLoading]="conversationService.isSending()"
        [canSend]="canSendDraft()"
        [userMessage]="draftMessage()"
        [placeholder]="'Type a message'"
        (messageChange)="onDraftChange($event)"
        (send)="onSendFromDraft()"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .conversation-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      /* ============================================
         SCROLLABLE MESSAGE AREA
         ============================================ */

      .messages-scroll {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
      }

      .messages-area {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding-top: var(--nxt1-spacing-2);
        padding-bottom: calc(
          var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px + 140px +
            env(safe-area-inset-bottom, 0px)
        );
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
        flex: 1;
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
        transition: all var(--nxt1-ui-transition-fast);
      }

      .load-more-button:hover:not(:disabled) {
        background: var(--nxt1-color-surface-50);
      }

      .load-more-button:disabled {
        opacity: 0.5;
        cursor: default;
      }

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
        .skeleton-line,
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
export class ConversationShellWebComponent implements OnInit, OnDestroy {
  readonly conversationService = inject(ConversationService);
  private readonly logger = inject(NxtLoggingService).child('ConversationShellWeb');
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly draftMessage = signal('');

  private readonly scrollAnchor = viewChild<ElementRef>('scrollAnchor');

  /** Conversation ID to load */
  readonly conversationId = input.required<string>();

  /** Emitted when back button is pressed */
  readonly backClick = output<void>();

  /** Emitted when conversation info is requested */
  readonly infoClick = output<void>();

  /** Emitted when Agent X action is requested */
  readonly agentXClick = output<void>();

  /** Skeleton items */
  readonly skeletonItems = Array.from({ length: 8 }, (_, i) => i);

  /** Conversation type */
  readonly conversationType = computed((): ConversationType => {
    return this.conversationService.conversation()?.type ?? 'direct';
  });

  readonly canSendDraft = computed(() => this.draftMessage().trim().length > 0);

  constructor() {
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
      this.logger.debug('Web conversation shell initialized', { conversationId: id });
    }
  }

  ngOnDestroy(): void {
    this.conversationService.closeConversation();
  }

  async onSend(body: string): Promise<void> {
    await this.conversationService.sendMessage(body);
    this.scrollToBottom();
  }

  onDraftChange(value: string): void {
    this.draftMessage.set(value);
  }

  async onSendFromDraft(): Promise<void> {
    const body = this.draftMessage().trim();
    if (!body) return;
    await this.onSend(body);
    this.draftMessage.set('');
  }

  async onRetrySend(messageId: string): Promise<void> {
    await this.conversationService.retrySend(messageId);
  }

  onReply(message: Message): void {
    this.conversationService.setReplyTo(message);
  }

  async onLoadMore(): Promise<void> {
    await this.conversationService.loadMore();
  }

  async onRetry(): Promise<void> {
    this.conversationService.clearError();
    await this.conversationService.openConversation(this.conversationId());
  }

  isConsecutiveMessage(messages: Message[], index: number): boolean {
    if (index === 0) return false;
    return messages[index].sender.id === messages[index - 1].sender.id;
  }

  shouldShowAvatar(messages: Message[], index: number): boolean {
    if (messages[index].isOwn) return false;
    if (index === messages.length - 1) return true;
    return messages[index].sender.id !== messages[index + 1].sender.id;
  }

  isFirstInSenderGroup(messages: Message[], index: number): boolean {
    if (index === 0) return true;
    return messages[index].sender.id !== messages[index - 1].sender.id;
  }

  isLastInSenderGroup(messages: Message[], index: number): boolean {
    if (index === messages.length - 1) return true;
    return messages[index].sender.id !== messages[index + 1].sender.id;
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    requestAnimationFrame(() => {
      const anchor = this.scrollAnchor()?.nativeElement;
      if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }
}
