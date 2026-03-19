/**
 * @fileoverview Messages Shell Component — Mobile (Ionic)
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Top-level container for the Messages feature on mobile.
 * Uses Ionic components for native iOS/Android feel.
 *
 * Features:
 * - Page header with avatar and compose action
 * - Search bar with live filtering
 * - Filter tabs via option scroller
 * - Pull-to-refresh
 * - Conversation list with skeleton loading
 *
 * ⭐ MOBILE ONLY — Uses Ionic, NxtPageHeader, NxtRefresher ⭐
 *
 * For web, use MessagesShellWebComponent (zero Ionic) instead.
 *
 * @example
 * ```html
 * <nxt1-messages-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
 *   (conversationClick)="openThread($event)"
 *   (compose)="newMessage()"
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { type MessagesFilterId, type Conversation, MESSAGES_SEARCH_CONFIG } from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtSearchBarComponent } from '../components/search-bar';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { MessagesService } from './messages.service';
import { MessagesListComponent } from './messages-list.component';

/**
 * User info for the page header avatar.
 */
export interface MessagesUser {
  readonly displayName?: string | null;
  readonly profileImg?: string | null;
}

@Component({
  selector: 'nxt1-messages-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSearchBarComponent,
    MessagesListComponent,
  ],
  template: `
    <!-- Page header with avatar (fixed within shell) -->
    <nxt1-page-header
      [actions]="headerActions"
      (menuClick)="avatarClick.emit()"
      (actionClick)="onHeaderAction($event.id)"
    >
      <div pageHeaderSlot="title" class="header-logo">
        <span class="header-title-text">Inbox</span>
        <svg
          class="header-brand-logo"
          viewBox="0 0 612 792"
          width="40"
          height="40"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="10"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
          />
          <polygon
            points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
          />
        </svg>
      </div>
    </nxt1-page-header>

    <!-- Filter tabs (fixed within shell) -->
    <nxt1-option-scroller
      [options]="filterOptions()"
      [selectedId]="messagesService.activeFilter()"
      (selectionChange)="onFilterChange($event)"
    />

    <!-- Search bar (fixed within shell) -->
    <div class="search-section">
      <nxt1-search-bar
        [placeholder]="searchPlaceholder"
        [value]="messagesService.searchQuery()"
        [expanded]="true"
        (searchInput)="onSearch($event)"
        (searchClear)="onClearSearch()"
      />
    </div>

    <ion-content [fullscreen]="true" class="messages-content">
      <!-- Pull-to-refresh -->
      <nxt-refresher (onRefresh)="onRefresh($event)" />

      <div class="messages-container">
        <!-- Conversation list -->
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
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .header-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        margin-top: -8px;
        margin-left: -18px;
      }

      .header-title-text {
        display: inline-flex;
        align-items: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1;
        transform: translateY(1px);
      }

      .header-brand-logo {
        display: block;
        flex-shrink: 0;
        color: var(--nxt1-color-text-primary, #ffffff);
        transform: translateY(1px);
      }

      .messages-content {
        --background: var(--nxt1-color-bg-primary);
      }

      .messages-container {
        min-height: 100%;
        padding-bottom: env(safe-area-inset-bottom, 0);
      }

      .search-section {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-2);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesShellComponent implements OnInit {
  readonly messagesService = inject(MessagesService);
  private readonly logger = inject(NxtLoggingService).child('MessagesShell');
  private readonly haptics = inject(HapticsService);

  /** User info for avatar display */
  readonly user = input<MessagesUser | null>(null);

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when a conversation is selected */
  readonly conversationClick = output<Conversation>();

  /** Emitted when compose button is clicked */
  readonly compose = output<void>();

  /** Search placeholder text */
  readonly searchPlaceholder = MESSAGES_SEARCH_CONFIG.placeholder;

  /** Header actions */
  readonly headerActions: PageHeaderAction[] = [
    { id: 'compose', icon: 'create-outline', label: 'New Message' },
  ];

  /** Computed display name */
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');

  /** Filter tabs as option scroller items */
  readonly filterOptions = computed((): OptionScrollerItem[] => {
    const filters = this.messagesService.filtersWithCounts();
    return filters.map((f) => ({
      id: f.id,
      label: f.label,
      badge: f.count && f.count > 0 ? f.count : undefined,
    }));
  });

  ngOnInit(): void {
    this.messagesService.loadConversations();
    this.logger.debug('Messages shell initialized');
  }

  onHeaderAction(actionId: string): void {
    if (actionId === 'compose') {
      this.compose.emit();
    }
  }

  async onFilterChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.messagesService.switchFilter(event.option.id as MessagesFilterId);
  }

  async onSearch(query: string): Promise<void> {
    await this.messagesService.search(query);
  }

  async onClearSearch(): Promise<void> {
    await this.messagesService.clearSearch();
  }

  async onRefresh(event: RefreshEvent): Promise<void> {
    await this.messagesService.refresh();
    event.complete();
  }

  async onConversationClick(conversation: Conversation): Promise<void> {
    await this.haptics.impact('light');

    // Auto-mark as read when opening
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
