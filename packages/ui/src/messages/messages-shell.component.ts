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
  readonly photoURL?: string | null;
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
      title="Messages"
      [avatarSrc]="user()?.photoURL"
      [avatarName]="displayName()"
      [actions]="headerActions"
      (avatarClick)="avatarClick.emit()"
      (actionClick)="onHeaderAction($event.id)"
    />

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
