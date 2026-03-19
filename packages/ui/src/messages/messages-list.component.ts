/**
 * @fileoverview Messages List Component
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Renders the conversation list with empty states and load-more support.
 * Delegates individual items to MessagesItemComponent.
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Conversation, MessagesFilterId } from '@nxt1/core';
import { MESSAGES_EMPTY_STATES } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon/icon.component';
import { MessagesItemComponent } from './messages-item.component';
import { MessagesSkeletonComponent } from './messages-skeleton.component';

@Component({
  selector: 'nxt1-messages-list',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, MessagesItemComponent, MessagesSkeletonComponent],
  template: `
    <!-- Loading skeleton -->
    @if (isLoading()) {
      <nxt1-messages-skeleton [count]="6" />
    }

    <!-- Error state -->
    @else if (error()) {
      <div class="messages-list__error" role="alert">
        <div class="messages-list__error-icon">
          <nxt1-icon name="alertCircle" [size]="36" />
        </div>
        <h3 class="messages-list__error-title">Something went wrong</h3>
        <p class="messages-list__error-message">{{ error() }}</p>
        <button type="button" class="messages-list__error-action" (click)="retry.emit()">
          <nxt1-icon name="refresh" [size]="18" />
          <span>Try Again</span>
        </button>
      </div>
    }

    <!-- Empty state -->
    @else if (isEmpty()) {
      <div class="messages-list__empty" role="status">
        <div class="messages-list__empty-icon">
          <nxt1-icon [name]="emptyState().icon" [size]="36" />
        </div>
        <h3 class="messages-list__empty-title">{{ emptyState().title }}</h3>
        <p class="messages-list__empty-message">{{ emptyState().message }}</p>
        @if (activeFilter() === 'all') {
          <button type="button" class="messages-list__empty-action" (click)="compose.emit()">
            New Message
          </button>
        }
      </div>
    }

    <!-- Conversation list -->
    @else {
      <div class="messages-list" role="list">
        @for (conversation of conversations(); track conversation.id) {
          <nxt1-messages-item
            [conversation]="conversation"
            (conversationClick)="conversationClick.emit($event)"
          />
        }

        <!-- Load more -->
        @if (hasMore()) {
          <div class="load-more">
            @if (isLoadingMore()) {
              <nxt1-messages-skeleton [count]="2" />
            } @else {
              <button class="load-more-btn" (click)="loadMore.emit()">
                Load more conversations
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .messages-list {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .messages-list__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .messages-list__empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .messages-list__empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      .messages-list__empty-message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
      }

      .messages-list__empty-action {
        padding: 10px 24px;
        border-radius: 20px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        font-size: 14px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .messages-list__empty-action:hover {
        background: var(--nxt1-color-primaryDark, #a3cc00);
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .messages-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .messages-list__error-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        color: var(--nxt1-color-error, #ef4444);
      }

      .messages-list__error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      .messages-list__error-message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
      }

      .messages-list__error-action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 24px;
        border-radius: 20px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .messages-list__error-action:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* Load more */
      .load-more {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
      }

      .load-more-btn {
        width: 100%;
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        border: var(--nxt1-spacing-px) dashed var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: border-color var(--nxt1-ui-transition-fast);
      }

      .load-more-btn:hover {
        border-color: var(--nxt1-color-border-strong);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesListComponent {
  /** List of conversations to display */
  readonly conversations = input.required<readonly Conversation[]>();

  /** Active filter id for empty state */
  readonly activeFilter = input.required<MessagesFilterId>();

  /** Loading state */
  readonly isLoading = input(false);

  /** Load more state */
  readonly isLoadingMore = input(false);

  /** Whether list is empty */
  readonly isEmpty = input(false);

  /** Whether there are more pages */
  readonly hasMore = input(false);

  /** Error message */
  readonly error = input<string | null>(null);

  /** Emitted when a conversation is clicked */
  readonly conversationClick = output<Conversation>();

  /** Emitted when load more is triggered */
  readonly loadMore = output<void>();

  /** Emitted when compose is clicked */
  readonly compose = output<void>();

  /** Emitted when retry is clicked */
  readonly retry = output<void>();

  /** Get the empty state config for the active filter */
  emptyState(): { title: string; message: string; icon: string } {
    return MESSAGES_EMPTY_STATES[this.activeFilter()] ?? MESSAGES_EMPTY_STATES['all'];
  }
}
