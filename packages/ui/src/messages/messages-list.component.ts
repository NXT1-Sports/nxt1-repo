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
import { MessagesItemComponent } from './messages-item.component';
import { MessagesSkeletonComponent } from './messages-skeleton.component';

@Component({
  selector: 'nxt1-messages-list',
  standalone: true,
  imports: [CommonModule, MessagesItemComponent, MessagesSkeletonComponent],
  template: `
    <!-- Loading skeleton -->
    @if (isLoading()) {
      <nxt1-messages-skeleton [count]="6" />
    }

    <!-- Error state -->
    @else if (error()) {
      <div class="messages-error" role="alert">
        <div class="error-icon-wrapper">
          <svg
            class="error-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <p class="error-message">{{ error() }}</p>
        <button class="retry-btn" (click)="retry.emit()">Try Again</button>
      </div>
    }

    <!-- Empty state -->
    @else if (isEmpty()) {
      <div class="messages-empty" role="status">
        <div class="empty-icon-wrapper">
          <svg
            class="empty-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 class="empty-title">{{ emptyState().title }}</h3>
        <p class="empty-description">{{ emptyState().message }}</p>
        @if (activeFilter() === 'all') {
          <button class="compose-btn" (click)="compose.emit()">
            <svg
              class="compose-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
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

      /* Empty state */
      .messages-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-6);
        min-height: var(--nxt1-spacing-72);
      }

      .empty-icon-wrapper {
        width: calc(var(--nxt1-spacing-16) + var(--nxt1-spacing-2));
        height: calc(var(--nxt1-spacing-16) + var(--nxt1-spacing-2));
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-surface-100);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-5);
      }

      .empty-icon {
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        color: var(--nxt1-color-text-tertiary);
      }

      .empty-title {
        font-size: var(--nxt1-font-size-lg);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .empty-description {
        font-size: var(--nxt1-font-size-sm);
        line-height: 1.5;
        color: var(--nxt1-color-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-6);
        max-width: var(--nxt1-spacing-72);
      }

      .compose-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-semibold);
        border: none;
        cursor: pointer;
        transition: opacity var(--nxt1-ui-transition-fast);
      }

      .compose-btn:hover {
        opacity: 0.9;
      }

      .compose-btn:active {
        opacity: 0.8;
      }

      .compose-icon {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
      }

      /* Error state */
      .messages-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-6);
        min-height: var(--nxt1-spacing-72);
      }

      .error-icon-wrapper {
        width: calc(var(--nxt1-spacing-16) + var(--nxt1-spacing-2));
        height: calc(var(--nxt1-spacing-16) + var(--nxt1-spacing-2));
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-error-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-5);
      }

      .error-icon {
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        color: var(--nxt1-color-error);
      }

      .error-message {
        font-size: var(--nxt1-font-size-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-5);
        max-width: var(--nxt1-spacing-72);
      }

      .retry-btn {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-radius-full);
        background: transparent;
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-medium);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-primary);
        cursor: pointer;
        transition:
          background-color var(--nxt1-ui-transition-fast),
          color var(--nxt1-ui-transition-fast);
      }

      .retry-btn:hover {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
      }

      /* Load more */
      .load-more {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
      }

      .load-more-btn {
        width: 100%;
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-radius-md);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-medium);
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
