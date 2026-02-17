/**
 * @fileoverview Notification Popover Component - Desktop Web
 * @module @nxt1/web/features/activity
 * @version 2.0.0
 *
 * Professional notification dropdown panel anchored to the header bell icon.
 * Follows 2026 best practices from GitHub, Linear, Figma, and Notion panels.
 *
 * Features:
 * - Anchored popover positioned below the header
 * - Tab-based filtering (All, Notifications, Deals, etc.)
 * - Activity list with skeletons, empty, and error states
 * - Mark all read action
 * - Click backdrop or Escape to close
 * - Auto-closes on route navigation
 * - Smooth open/close spring animation
 * - "View All" link to full activity page
 * - Focus management for accessibility
 * - SSR-safe (all browser API access guarded)
 *
 * Architecture:
 * - Reuses ActivityService from @nxt1/ui for state management
 * - Reuses ActivityListComponent and ActivityItemComponent from @nxt1/ui
 * - Web-only component (not shared with mobile)
 * - ViewEncapsulation.None with scoped BEM class prefix
 */

import {
  Component,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  inject,
  computed,
  output,
  input,
  effect,
  DestroyRef,
  afterNextRender,
  PLATFORM_ID,
  viewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { type ActivityItem, type ActivityTabId, ACTIVITY_TABS } from '@nxt1/core';
import {
  ActivityService,
  ActivityListComponent,
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
  NxtIconComponent,
  NxtLoggingService,
} from '@nxt1/ui';

@Component({
  selector: 'app-notification-popover',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ActivityListComponent,
    NxtOptionScrollerComponent,
    NxtIconComponent,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    <!-- Backdrop (transparent, click to close) -->
    @if (isOpen()) {
      <div class="nxt1-notif-popover__backdrop" (click)="close()" aria-hidden="true"></div>
    }

    <!-- Popover Panel -->
    <div
      #panelEl
      class="nxt1-notif-popover__panel"
      [class.nxt1-notif-popover__panel--open]="isOpen()"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
    >
      <!-- Header -->
      <div class="nxt1-notif-popover__header">
        <div class="nxt1-notif-popover__header-left">
          <h2 class="nxt1-notif-popover__title">Notifications</h2>
          @if (activity.totalUnread() > 0) {
            <span class="nxt1-notif-popover__badge">
              {{ activity.totalUnread() > 99 ? '99+' : activity.totalUnread() }}
            </span>
          }
        </div>
        <div class="nxt1-notif-popover__header-actions">
          @if (activity.unreadItems().length > 0) {
            <button
              type="button"
              class="nxt1-notif-popover__action-btn"
              aria-label="Mark all as read"
              title="Mark all as read"
              (click)="onMarkAllRead()"
            >
              <nxt1-icon name="checkmarkDone" size="18" />
            </button>
          }
          <button
            type="button"
            class="nxt1-notif-popover__action-btn"
            aria-label="Notification settings"
            title="Settings"
            (click)="onSettingsClick()"
          >
            <nxt1-icon name="settings" size="18" />
          </button>
        </div>
      </div>

      <!-- Tab Selector -->
      <div class="nxt1-notif-popover__tabs">
        <nxt1-option-scroller
          [options]="tabOptions()"
          [selectedId]="activity.activeTab()"
          [config]="{ scrollable: true, stretchToFill: false, showDivider: true, size: 'sm' }"
          (selectionChange)="onTabChange($event)"
        />
      </div>

      <!-- Content (scrollable) -->
      <div class="nxt1-notif-popover__content">
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

      <!-- Footer -->
      <div class="nxt1-notif-popover__footer">
        <a class="nxt1-notif-popover__footer-link" routerLink="/activity" (click)="close()">
          View all notifications
          <nxt1-icon name="arrowForward" size="16" />
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       NOTIFICATION POPOVER — 2026 Professional Design
       Scoped via .nxt1-notif-popover__ BEM prefix
       (ViewEncapsulation.None — no ::ng-deep needed)

       ALL spacing, sizing, radius, and typography use design tokens.
       See: packages/design-tokens/dist/css/tokens.css
       ============================================ */

      /* ============================================
       HOST
       ============================================ */

      app-notification-popover {
        display: contents;
      }

      /* ============================================
       BACKDROP
       ============================================ */

      .nxt1-notif-popover__backdrop {
        position: fixed;
        inset: 0;
        z-index: 99;
      }

      /* ============================================
       PANEL
       ============================================ */

      .nxt1-notif-popover__panel {
        /* Panel-specific size (30rem = 480px) */
        --popover-width: 30rem;
        --popover-width-lg: 32.5rem;

        position: fixed;
        top: var(--shell-header-height, var(--nxt1-spacing-16));
        right: var(--nxt1-spacing-4);
        z-index: 100;
        width: var(--popover-width);
        max-height: calc(
          100dvh - var(--shell-header-height, var(--nxt1-spacing-16)) - var(--nxt1-spacing-6)
        );
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-primary, #141414);
        border: var(--nxt1-spacing-px) solid
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-borderRadius-2xl);
        box-shadow:
          0 var(--nxt1-spacing-6) var(--nxt1-spacing-12) calc(-1 * var(--nxt1-spacing-3))
            rgba(0, 0, 0, 0.5),
          0 0 0 var(--nxt1-spacing-px) rgba(255, 255, 255, 0.03);
        overflow: hidden;

        /* Closed state */
        opacity: 0;
        transform: translateY(calc(-1 * var(--nxt1-spacing-2))) scale(0.98);
        transform-origin: top right;
        pointer-events: none;
        transition:
          opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
          transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .nxt1-notif-popover__panel--open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      /* ============================================
       HEADER
       ============================================ */

      .nxt1-notif-popover__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5) var(--nxt1-spacing-3);
        flex-shrink: 0;
      }

      .nxt1-notif-popover__header-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
      }

      .nxt1-notif-popover__title {
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0;
        letter-spacing: -0.01em;
      }

      .nxt1-notif-popover__badge {
        /* Badge-specific size (1.375rem = 22px) */
        --badge-size: 1.375rem;

        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: var(--badge-size);
        height: var(--badge-size);
        padding: 0 var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        line-height: 1;
      }

      .nxt1-notif-popover__header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
      }

      .nxt1-notif-popover__action-btn {
        /* Action button size (2.125rem = 34px) */
        --action-btn-size: 2.125rem;

        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--action-btn-size);
        height: var(--action-btn-size);
        border: none;
        border-radius: var(--nxt1-borderRadius-lg);
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          color 0.15s ease,
          transform 0.1s ease;
      }

      .nxt1-notif-popover__action-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-notif-popover__action-btn:active {
        transform: scale(0.94);
      }

      .nxt1-notif-popover__action-btn:focus-visible {
        outline: var(--nxt1-spacing-0_5) solid var(--nxt1-color-primary, #ccff00);
        outline-offset: var(--nxt1-spacing-0_5);
      }

      /* ============================================
       TABS
       ============================================ */

      .nxt1-notif-popover__tabs {
        padding: 0 var(--nxt1-spacing-1);
        flex-shrink: 0;
        border-bottom: var(--nxt1-spacing-px) solid
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      /* ============================================
       CONTENT (scrollable)
       ============================================ */

      .nxt1-notif-popover__content {
        /* Content-specific dimensions */
        --content-min-height: 12.5rem;
        --content-max-height: 30rem;

        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        min-height: var(--content-min-height);
        max-height: var(--content-max-height);

        /* Custom scrollbar */
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
      }

      .nxt1-notif-popover__content::-webkit-scrollbar {
        width: var(--nxt1-spacing-1_5);
      }

      .nxt1-notif-popover__content::-webkit-scrollbar-track {
        background: transparent;
      }

      .nxt1-notif-popover__content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: var(--nxt1-borderRadius-sm);
      }

      .nxt1-notif-popover__content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      /* Compact overrides for popover context (scoped, no ::ng-deep) */
      .nxt1-notif-popover__content .activity-list__empty,
      .nxt1-notif-popover__content .activity-list__error {
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-5);
      }

      .nxt1-notif-popover__content .activity-item {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
      }

      .nxt1-notif-popover__content .activity-item__avatar,
      .nxt1-notif-popover__content .activity-item__icon-circle {
        /* Avatar size (2.375rem = 38px) */
        --avatar-size: 2.375rem;
        width: var(--avatar-size);
        height: var(--avatar-size);
      }

      .nxt1-notif-popover__content .activity-item__title {
        font-size: var(--nxt1-fontSize-sm);
      }

      .nxt1-notif-popover__content .activity-item__body {
        /* Slightly smaller than sm (0.8125rem ≈ 13px) */
        font-size: 0.8125rem;
        -webkit-line-clamp: 1;
      }

      .nxt1-notif-popover__content .activity-item__time {
        /* Slightly smaller than xs (0.6875rem ≈ 11px) */
        font-size: 0.6875rem;
      }

      .nxt1-notif-popover__content .activity-list__load-more {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
      }

      /* ============================================
       FOOTER
       ============================================ */

      .nxt1-notif-popover__footer {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-top: var(--nxt1-spacing-px) solid
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        flex-shrink: 0;
      }

      .nxt1-notif-popover__footer-link {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-lg);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-primary, #ccff00);
        text-decoration: none;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }

      .nxt1-notif-popover__footer-link:hover {
        background: var(--nxt1-color-alpha-primary8, rgba(204, 255, 0, 0.08));
      }

      .nxt1-notif-popover__footer-link:active {
        transform: scale(0.98);
      }

      .nxt1-notif-popover__footer-link:focus-visible {
        outline: var(--nxt1-spacing-0_5) solid var(--nxt1-color-primary, #ccff00);
        outline-offset: var(--nxt1-spacing-0_5);
      }

      /* ============================================
       RESPONSIVE
       ============================================ */

      @media (min-width: 1440px) {
        .nxt1-notif-popover__panel {
          width: var(--popover-width-lg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPopoverComponent {
  protected readonly activity = inject(ActivityService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(NxtLoggingService).child('NotificationPopover');

  /** Reference to the panel element for focus management */
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');

  // ============================================
  // INPUTS
  // ============================================

  /** Whether the popover is open */
  readonly isOpen = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when popover should be closed */
  readonly closePopover = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

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

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Load initial data once
    this.activity.loadFeed(this.activity.activeTab());
    this.activity.refreshBadges();

    // Auto-close on route navigation
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.isOpen()) {
          this.close();
        }
      });

    // Keyboard listener (SSR-safe)
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      };

      document.addEventListener('keydown', onKeydown);
      this.destroyRef.onDestroy(() => document.removeEventListener('keydown', onKeydown));
    });

    // Focus management — move focus into panel when opened
    effect(() => {
      const open = this.isOpen();
      const panel = this.panelEl()?.nativeElement;
      if (open && panel) {
        // Focus the first focusable element inside the panel
        requestAnimationFrame(() => {
          const firstFocusable = panel.querySelector<HTMLElement>(
            'button, [href], input, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        });
      }
    });
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  close(): void {
    this.closePopover.emit();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    const tabId = event.option.id as ActivityTabId;
    await this.activity.switchTab(tabId);
  }

  protected async onMarkAllRead(): Promise<void> {
    await this.activity.markAllRead();
  }

  protected onSettingsClick(): void {
    this.close();
    this.router.navigate(['/settings/notifications']);
  }

  protected async onLoadMore(): Promise<void> {
    await this.activity.loadMore();
  }

  protected async onRetry(): Promise<void> {
    this.activity.clearError();
    await this.activity.loadFeed(this.activity.activeTab());
  }

  protected onEmptyCta(): void {
    this.logger.debug('Empty CTA clicked');
  }

  protected onItemClick(item: ActivityItem): void {
    this.logger.debug('Item clicked', { id: item.id, type: item.type });
    this.close();
    if (item.deepLink) {
      this.router.navigateByUrl(item.deepLink);
    }
  }

  protected onActionClick(item: ActivityItem): void {
    if (item.action?.route) {
      this.close();
      this.router.navigateByUrl(item.action.route);
    } else if (item.action?.url && isPlatformBrowser(this.platformId)) {
      window.open(item.action.url, '_blank', 'noopener');
    }
  }

  protected async onMarkRead(id: string): Promise<void> {
    await this.activity.markRead([id]);
  }

  protected async onArchive(id: string): Promise<void> {
    await this.activity.archive(id);
  }
}
