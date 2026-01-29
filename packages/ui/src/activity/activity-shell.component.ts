/**
 * @fileoverview Activity Shell Component - Main Container
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Top-level container component for Activity/Notifications feature.
 * Orchestrates header, tabs (options scroller), and content.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Sticky page header with avatar
 * - Sticky options scroller for tab navigation
 * - Pull-to-refresh support
 * - Mark all read action
 * - Badge counts on tabs
 *
 * @example
 * ```html
 * <nxt1-activity-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
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
import { type ActivityTabId, ACTIVITY_TABS } from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ActivityService } from './activity.service';
import { ActivityListComponent } from './activity-list.component';

/**
 * User info for header display.
 */
export interface ActivityUser {
  readonly photoURL?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-activity-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ActivityListComponent,
  ],
  template: `
    <!-- Professional Page Header (Twitter/X style) -->
    <nxt1-page-header
      title="Activity"
      [avatarSrc]="user()?.photoURL"
      [avatarName]="displayName()"
      [actions]="headerActions()"
      (avatarClick)="avatarClick.emit()"
      (actionClick)="onHeaderAction($event)"
    />

    <!-- Twitter/TikTok Style Tab Selector (Options Scroller) -->
    <nxt1-option-scroller
      [options]="tabOptions()"
      [selectedId]="activity.activeTab()"
      [config]="{ scrollable: true, stretchToFill: false, showDivider: true }"
      (selectionChange)="onTabChange($event)"
    />

    <ion-content [fullscreen]="true" class="activity-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="activity-container">
        <!-- Activity List with all states -->
        <nxt1-activity-list
          [items]="activity.items()"
          [isLoading]="activity.isLoading()"
          [isLoadingMore]="activity.isLoadingMore()"
          [isEmpty]="activity.isEmpty()"
          [error]="activity.error()"
          [hasMore]="activity.hasMore()"
          [activeTab]="activity.activeTab()"
          (loadMore)="onLoadMore()"
          (retry)="onRetry()"
          (emptyCta)="onEmptyCta()"
          (itemClick)="onItemClick($event)"
          (actionClick)="onActionClick($event)"
          (markRead)="onMarkRead($event)"
          (archive)="onArchive($event)"
        />
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       ACTIVITY SHELL - iOS 26 LIQUID GLASS DESIGN
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables */
        --activity-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --activity-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      /* Content area */
      .activity-content {
        --background: var(--activity-bg);
      }

      .activity-container {
        min-height: 100%;
        padding-bottom: env(safe-area-inset-bottom, 0);
      }

      /* Content padding for scrolling */
      .activity-container {
        padding-bottom: 80px; /* Space for tab bar */
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityShellComponent implements OnInit {
  protected readonly activity = inject(ActivityService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityShell');

  // ============================================
  // INPUTS
  // ============================================

  /** User info for header avatar */
  readonly user = input<ActivityUser | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when a tab changes */
  readonly tabChange = output<ActivityTabId>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Display name for header */
  protected readonly displayName = computed(() => {
    const user = this.user();
    return user?.displayName ?? 'User';
  });

  /** Header actions */
  protected readonly headerActions = computed((): PageHeaderAction[] => {
    const hasUnread = this.activity.currentTabBadge() > 0;

    return hasUnread
      ? [
          {
            id: 'mark-all-read',
            label: 'Mark all read',
            icon: 'checkmark-done-outline',
          },
        ]
      : [];
  });

  /** Tab options for options scroller */
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.activity.badges();

    return ACTIVITY_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      badge: badges[tab.id] ?? 0,
    }));
  });

  /** Total unread count */
  protected readonly totalUnread = computed(() => this.activity.totalUnread());

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load initial feed
    this.activity.loadFeed(this.activity.activeTab());

    // Load badge counts
    this.activity.refreshBadges();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle tab selection change.
   */
  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    const tabId = event.option.id as ActivityTabId;
    this.logger.debug('Tab changed', { tabId });
    await this.activity.switchTab(tabId);
    this.tabChange.emit(tabId);
  }

  /**
   * Handle header action click.
   */
  protected async onHeaderAction(action: PageHeaderAction): Promise<void> {
    if (action.id === 'mark-all-read') {
      await this.activity.markAllRead();
    }
  }

  /**
   * Handle pull-to-refresh.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    this.logger.debug('Pull-to-refresh triggered');
    await this.activity.refresh();
    event.complete();
  }

  /**
   * Handle refresh timeout.
   */
  protected handleRefreshTimeout(): void {
    this.toast.warning('Refresh timed out. Please try again.');
    this.logger.warn('Pull-to-refresh timed out');
  }

  /**
   * Handle load more (infinite scroll).
   */
  protected async onLoadMore(): Promise<void> {
    await this.activity.loadMore();
  }

  /**
   * Handle retry after error.
   */
  protected async onRetry(): Promise<void> {
    this.activity.clearError();
    await this.activity.loadFeed(this.activity.activeTab());
  }

  /**
   * Handle empty state CTA click.
   */
  protected onEmptyCta(): void {
    // Navigate based on tab - apps should handle this
    this.logger.debug('Empty CTA clicked', { tab: this.activity.activeTab() });
  }

  /**
   * Handle item click.
   */
  protected onItemClick(item: import('@nxt1/core').ActivityItem): void {
    this.logger.debug('Item clicked', { id: item.id, type: item.type });

    // Navigation should be handled by the app wrapper
    // based on item.deepLink or item.type
  }

  /**
   * Handle action button click on item.
   */
  protected onActionClick(item: import('@nxt1/core').ActivityItem): void {
    this.logger.debug('Item action clicked', { id: item.id, action: item.action?.id });

    // Handle action based on item.action config
    if (item.action?.route) {
      // Navigation handled by app wrapper
    } else if (item.action?.url) {
      // Open external URL
      window.open(item.action.url, '_blank', 'noopener');
    }
  }

  /**
   * Handle mark read request.
   */
  protected async onMarkRead(id: string): Promise<void> {
    await this.activity.markRead([id]);
  }

  /**
   * Handle archive request.
   */
  protected async onArchive(id: string): Promise<void> {
    await this.activity.archive(id);
  }
}
