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
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { type ActivityItem, type ConnectedEmail, type InboxEmailProvider } from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';

import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBrowserService } from '../services/browser';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ActivityService } from './activity.service';
import { ActivityListComponent } from './activity-list.component';

/**
 * User info for header display.
 */
export interface ActivityUser {
  readonly uid?: string | null;
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly connectedEmails?: readonly ConnectedEmail[];
  readonly email?: string | null;
  readonly role?: string | null;
}

@Component({
  selector: 'nxt1-activity-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    ActivityListComponent,
  ],
  template: `
    <!-- Professional Page Header (Twitter/X style) — hidden on web (uses top nav) -->
    @if (showHeader()) {
      <nxt1-page-header
        [actions]="headerActions()"
        (menuClick)="avatarClick.emit()"
        (actionClick)="onHeaderAction($event)"
      >
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Activity</span>
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
    }

    <ion-content [fullscreen]="true" class="activity-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="activity-container">
        <nxt1-activity-list
          [items]="activity.unifiedItems()"
          [isLoading]="activity.isLoading()"
          [isLoadingMore]="activity.isLoadingMore()"
          [isEmpty]="activity.isEmpty()"
          [error]="activity.error()"
          [hasMore]="activity.hasMore()"
          [activeTab]="activity.activeTab()"
          [connectedEmails]="connectedEmails()"
          (loadMore)="onLoadMore()"
          (retry)="onRetry()"
          (emptyCta)="onEmptyCta()"
          (itemClick)="onItemClick($event)"
          (actionClick)="onActionClick($event)"
          (markRead)="onMarkRead($event)"
          (archive)="onArchive($event)"
          (connectProvider)="onConnectProvider($event)"
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
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
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
        padding-bottom: max(
          220px,
          calc(var(--nxt1-safe-area-bottom, env(safe-area-inset-bottom, 0px)) + 128px)
        );
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityShellComponent {
  protected readonly activity = inject(ActivityService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityShell');
  private readonly browser = inject(NxtBrowserService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  private _hasLoadedInitialData = false;

  constructor() {
    effect(() => {
      const user = this.user();
      if (user && !this._hasLoadedInitialData) {
        this._hasLoadedInitialData = true;
        this.logger.debug('User authenticated, loading activity data');
        void this.activity.loadFeed(this.activity.activeTab());
      }
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** User info for header avatar */
  readonly user = input<ActivityUser | null>(null);

  /** Whether to show the built-in page header. False on web (uses its own top nav). */
  readonly showHeader = input(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when a user wants to connect an email provider */
  readonly connectProviderRequest = output<InboxEmailProvider>();

  /** Emitted when an activity item is clicked (for platform-specific navigation) */
  readonly itemNavigate = output<ActivityItem>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Display name for header */
  protected readonly displayName = computed(() => {
    const user = this.user();
    return user?.displayName ?? 'User';
  });

  /** Connected email accounts from user data */
  protected readonly connectedEmails = computed(() => {
    return this.user()?.connectedEmails ?? [];
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

  /** Total unread count */
  protected readonly totalUnread = computed(() => this.activity.totalUnread());

  // ============================================
  // EVENT HANDLERS
  // ============================================

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
   * ActivityService handles refreshing messages + activity internally.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    this.logger.debug('Pull-to-refresh triggered', { tab: this.activity.activeTab() });
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
    this.logger.debug('Empty CTA clicked', { tab: this.activity.activeTab() });
  }

  /**
   * Handle item click.
   * Emits the full ActivityItem for platform-specific navigation.
   * Message-type items include deepLink to /messages/:id.
   */
  protected onItemClick(item: ActivityItem): void {
    this.logger.debug('Item clicked', { id: item.id, type: item.type, deepLink: item.deepLink });
    this.analytics?.trackEvent(APP_EVENTS.ACTIVITY_ITEM_CLICKED, { id: item.id, type: item.type });

    // Mark as read handled by ActivityItemComponent → markRead output
    // Emit for platform-specific navigation
    this.itemNavigate.emit(item);
  }

  /**
   * Handle action button click on item.
   */
  protected onActionClick(item: ActivityItem): void {
    this.logger.debug('Item action clicked', { id: item.id, action: item.action?.id });
    this.analytics?.trackEvent(APP_EVENTS.ACTIVITY_ITEM_ACTION_CLICKED, {
      id: item.id,
      actionId: item.action?.id,
    });

    if (item.action?.route) {
      this.itemNavigate.emit(item);
    } else if (item.action?.url) {
      void this.browser.openLink({
        url: item.action.url,
        source: 'activity_action',
      });
    }
  }

  /**
   * Handle mark read request.
   * Delegates to ActivityService which handles both activity items and messages.
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

  /**
   * Handle connect email provider request.
   * Emits to parent for platform-specific OAuth flow.
   */
  protected onConnectProvider(provider: InboxEmailProvider): void {
    this.logger.info('Connect provider requested', { provider: provider.id });
    this.connectProviderRequest.emit(provider);
  }
}
