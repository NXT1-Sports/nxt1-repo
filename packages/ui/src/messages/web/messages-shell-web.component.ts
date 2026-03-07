/**
 * @fileoverview Messages Shell Component — Web (Zero Ionic)
 * @module @nxt1/ui/messages/web
 * @version 1.0.0
 *
 * Web-optimized Messages Shell using design token CSS.
 * 100% SSR-safe with semantic HTML.
 * Zero Ionic components — pure Angular + design tokens.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use MessagesShellComponent (Ionic variant) instead.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  type MessagesFilterId,
  type Conversation,
  MESSAGES_FILTERS,
  MESSAGES_SEARCH_CONFIG,
} from '@nxt1/core';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { MessagesService } from '../messages.service';
import { MessagesListComponent } from '../messages-list.component';
import type { MessagesUser } from '../messages-shell.component';

@Component({
  selector: 'nxt1-messages-shell-web',
  standalone: true,
  imports: [CommonModule, FormsModule, NxtDesktopPageHeaderComponent, MessagesListComponent],
  template: `
    <!-- Desktop header -->
    <nxt1-desktop-page-header title="Messages">
      <!-- Desktop search + compose -->
      <div pageHeaderSlot="actions" class="flex items-center gap-3">
        <div class="relative">
          <svg
            class="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            [placeholder]="searchPlaceholder"
            [(ngModel)]="searchValue"
            (input)="onSearchInput($event)"
            (keydown.escape)="onClearSearch()"
            class="bg-surface-100 text-text-primary placeholder:text-text-tertiary focus:ring-primary/30 focus:border-primary h-9 w-64 rounded-full border border-transparent py-2 pr-10 pl-10 text-sm transition-all focus:ring-2 focus:outline-none"
            [attr.aria-label]="searchPlaceholder"
          />
          @if (searchValue().length > 0) {
            <button
              class="text-text-tertiary hover:text-text-primary absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
              (click)="onClearSearch()"
              aria-label="Clear search"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          }
        </div>
        <button class="compose-fab" (click)="compose.emit()" aria-label="New message">
          <svg class="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span class="compose-label hidden md:inline">Compose</span>
        </button>
      </div>
    </nxt1-desktop-page-header>

    <!-- Filter pills -->
    <nav class="filter-bar" role="tablist" aria-label="Message filters">
      @for (filter of filters; track filter.id) {
        <button
          class="filter-pill"
          [class.filter-pill--active]="filter.id === messagesService.activeFilter()"
          role="tab"
          [attr.aria-selected]="filter.id === messagesService.activeFilter()"
          (click)="onFilterClick(filter.id)"
        >
          {{ filter.label }}
          @if (filter.id === 'unread' && messagesService.totalUnreadCount() > 0) {
            <span class="filter-badge">{{ messagesService.totalUnreadCount() }}</span>
          }
        </button>
      }
    </nav>

    <!-- Conversation list -->
    <section class="messages-content">
      <nxt1-messages-list
        [conversations]="messagesService.conversations()"
        [activeFilter]="messagesService.activeFilter()"
        [isLoading]="messagesService.isLoading()"
        [isLoadingMore]="messagesService.isLoadingMore()"
        [isEmpty]="messagesService.isEmpty()"
        [hasMore]="messagesService.hasMore()"
        [error]="messagesService.error()"
        (conversationClick)="onConversationClick($event)"
        (loadMore)="onLoadMore()"
        (compose)="compose.emit()"
        (retry)="onRetry()"
      />
    </section>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        background: var(--nxt1-color-bg-primary);
        min-height: 0;
      }

      /* Filter bar */
      .filter-bar {
        display: flex;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .filter-bar::-webkit-scrollbar {
        display: none;
      }

      .filter-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1-5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-full);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-medium);
        white-space: nowrap;
        cursor: pointer;
        transition:
          background-color var(--nxt1-ui-transition-fast),
          border-color var(--nxt1-ui-transition-fast),
          color var(--nxt1-ui-transition-fast);
      }

      .filter-pill:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-100);
      }

      .filter-pill--active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        border-color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-font-weight-semibold);
      }

      .filter-pill--active:hover {
        background: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        opacity: 0.9;
      }

      .filter-badge {
        min-width: calc(var(--nxt1-spacing-4) + var(--nxt1-spacing-0_5));
        height: calc(var(--nxt1-spacing-4) + var(--nxt1-spacing-0_5));
        padding: 0 var(--nxt1-spacing-1);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-error);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-font-weight-bold);
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .filter-pill--active .filter-badge {
        background: var(--nxt1-color-text-inverse);
        color: var(--nxt1-color-primary);
      }

      /* Content area */
      .messages-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      /* Compose FAB */
      .compose-fab {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-size: var(--nxt1-font-size-sm);
        font-weight: var(--nxt1-font-weight-semibold);
        border: none;
        cursor: pointer;
        transition: opacity var(--nxt1-ui-transition-fast);
        white-space: nowrap;
      }

      .compose-fab:hover {
        opacity: 0.9;
      }

      .compose-fab:active {
        opacity: 0.8;
      }

      .compose-label {
        display: inline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesShellWebComponent implements OnInit {
  readonly messagesService = inject(MessagesService);
  private readonly logger = inject(NxtLoggingService).child('MessagesShellWeb');
  private readonly haptics = inject(HapticsService);

  /** User info for avatar */
  readonly user = input<MessagesUser | null>(null);

  /** Emitted when a conversation is selected */
  readonly conversationClick = output<Conversation>();

  /** Emitted when compose is clicked */
  readonly compose = output<void>();

  /** Search config */
  readonly searchPlaceholder = MESSAGES_SEARCH_CONFIG.placeholder;

  /** Search input value (local binding) */
  readonly searchValue = signal('');

  /** Filter tab definitions */
  readonly filters = MESSAGES_FILTERS;

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.messagesService.loadConversations();
    this.logger.debug('Messages web shell initialized');
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchValue.set(query);

    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.messagesService.search(query);
    }, MESSAGES_SEARCH_CONFIG.debounceMs);
  }

  async onClearSearch(): Promise<void> {
    this.searchValue.set('');
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    await this.messagesService.clearSearch();
  }

  async onFilterClick(filterId: MessagesFilterId): Promise<void> {
    await this.messagesService.switchFilter(filterId);
  }

  async onConversationClick(conversation: Conversation): Promise<void> {
    await this.haptics.impact('light');

    if (conversation.unreadCount > 0) {
      await this.messagesService.markAsRead(conversation.id);
    }

    this.conversationClick.emit(conversation);
  }

  async onLoadMore(): Promise<void> {
    await this.messagesService.loadMore();
  }

  async onRetry(): Promise<void> {
    this.messagesService.clearError();
    await this.messagesService.loadConversations();
  }
}
