/**
 * @fileoverview Activity List Component - Feed List with States
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * List component for activity feed with skeleton, empty, and error states.
 * Supports infinite scroll and pull-to-refresh.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Skeleton loading state (no spinners)
 * - Tab-specific empty states with CTAs
 * - Error state with retry action
 * - Infinite scroll with "Load more" button
 * - Smooth item transitions
 *
 * @example
 * ```html
 * <nxt1-activity-list
 *   [items]="items()"
 *   [isLoading]="isLoading()"
 *   [isLoadingMore]="isLoadingMore()"
 *   [isEmpty]="isEmpty()"
 *   [error]="error()"
 *   [hasMore]="hasMore()"
 *   [activeTab]="activeTab()"
 *   (loadMore)="onLoadMore()"
 *   (retry)="onRetry()"
 *   (itemClick)="onItemClick($event)"
 *   (markRead)="onMarkRead($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  notificationsOutline,
  pricetagOutline,
  atOutline,
  checkmarkCircleOutline,
  sparklesOutline,
  alertCircleOutline,
  refreshOutline,
  chevronForward,
} from 'ionicons/icons';
import {
  type ActivityItem,
  type ActivityTabId,
  type ConnectedEmail,
  ACTIVITY_EMPTY_STATES,
  ACTIVITY_UI_CONFIG,
  INBOX_EMAIL_PROVIDERS,
  type InboxEmailProvider,
} from '@nxt1/core';
import { NxtIconComponent } from '../components/icon';
import { ActivityItemComponent } from './activity-item.component';
import { ActivitySkeletonComponent } from './activity-skeleton.component';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../agent-x/fab/agent-x-logo.constants';

// Register icons
@Component({
  selector: 'nxt1-activity-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonSpinner,
    NxtIconComponent,
    ActivityItemComponent,
    ActivitySkeletonComponent,
  ],
  template: `
    <div class="activity-list">
      <!-- Loading State: Skeletons -->
      @if (isLoading()) {
        <div class="activity-list__skeletons">
          @for (i of skeletonArray; track i) {
            <nxt1-activity-skeleton />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="activity-list__error">
          <div class="activity-list__error-icon">
            <ion-icon name="alert-circle-outline"></ion-icon>
          </div>
          <h3 class="activity-list__error-title">Something went wrong</h3>
          <p class="activity-list__error-message">{{ error() }}</p>
          <button type="button" class="activity-list__error-action" (click)="retry.emit()">
            <ion-icon name="refresh-outline"></ion-icon>
            <span>Try Again</span>
          </button>
        </div>
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <div class="activity-list__empty">
          <div class="activity-list__empty-icon">
            @if (isAgentTab()) {
              <svg
                class="activity-list__agent-logo"
                viewBox="0 0 612 792"
                width="48"
                height="48"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="10"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
            } @else if (isAnalyticsTab()) {
              <nxt1-icon name="analytics-outline" [size]="36" />
            } @else {
              <ion-icon [name]="emptyState().icon"></ion-icon>
            }
          </div>
          <h3 class="activity-list__empty-title">{{ emptyState().title }}</h3>
          <p class="activity-list__empty-message">{{ emptyState().message }}</p>
          @if (emptyState().ctaLabel) {
            <button type="button" class="activity-list__empty-action" (click)="emptyCta.emit()">
              {{ emptyState().ctaLabel }}
            </button>
          }

          <!-- Inbox: Connect Email Sources -->
          @if (isInboxTab() && hasUnconnectedProviders()) {
            <div class="activity-list__connect-sources">
              <h4 class="activity-list__connect-title">Connect your email</h4>
              <p class="activity-list__connect-subtitle">Sync messages from your email accounts</p>
              <div class="activity-list__provider-list">
                @for (provider of emailProviders; track provider.id) {
                  @if (!isProviderConnected(provider.id)) {
                    <button
                      type="button"
                      class="activity-list__provider-card"
                      (click)="onConnectProvider(provider)"
                    >
                      <nxt1-icon [name]="provider.icon" [size]="24" />
                      <div class="activity-list__provider-info">
                        <span class="activity-list__provider-name">{{ provider.name }}</span>
                        <span class="activity-list__provider-desc">{{ provider.description }}</span>
                      </div>
                      <ion-icon
                        name="chevron-forward"
                        class="activity-list__provider-arrow"
                      ></ion-icon>
                    </button>
                  }
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Activity Items -->
      @else {
        <div class="activity-list__items">
          @for (item of items(); track item.id) {
            <nxt1-activity-item
              [item]="item"
              (itemClick)="itemClick.emit($event)"
              (actionClick)="actionClick.emit($event)"
              (markRead)="markRead.emit($event)"
              (archive)="archive.emit($event)"
            />
          }
        </div>

        <!-- Load More / Infinite Scroll -->
        @if (hasMore()) {
          <div class="activity-list__load-more">
            @if (isLoadingMore()) {
              <ion-spinner name="crescent" color="primary"></ion-spinner>
            } @else {
              <button type="button" class="activity-list__load-more-btn" (click)="loadMore.emit()">
                Load More
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ACTIVITY LIST - Feed Container
       ============================================ */

      :host {
        display: block;
      }

      .activity-list {
        min-height: 200px;
      }

      /* ============================================
       SKELETONS
       ============================================ */

      .activity-list__skeletons {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
       ITEMS
       ============================================ */

      .activity-list__items {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
       EMPTY STATE
       ============================================ */

      .activity-list__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .activity-list__empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .activity-list__empty-icon ion-icon {
        font-size: 36px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .activity-list__empty-icon nxt1-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .activity-list__agent-logo {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        display: block;
      }

      .activity-list__empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      .activity-list__empty-message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
      }

      .activity-list__empty-action {
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

      .activity-list__empty-action:hover {
        background: var(--nxt1-color-primaryDark, #a3cc00);
      }

      /* ============================================
       CONNECT EMAIL SOURCES (Inbox Empty State)
       ============================================ */

      .activity-list__connect-sources {
        width: 100%;
        max-width: 360px;
        margin-top: 28px;
        padding-top: 24px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .activity-list__connect-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 4px;
        text-align: center;
      }

      .activity-list__connect-subtitle {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        margin: 0 0 16px;
        text-align: center;
      }

      .activity-list__provider-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .activity-list__provider-card {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        color: inherit;
        font-family: inherit;
      }

      .activity-list__provider-card:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.2));
      }

      .activity-list__provider-card--connected {
        border-color: var(--nxt1-color-success, #22c55e);
        opacity: 0.7;
        cursor: default;
      }

      .activity-list__provider-card--connected:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-success, #22c55e);
      }

      .activity-list__provider-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }

      .activity-list__provider-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
      }

      .activity-list__provider-desc {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        line-height: 1.3;
      }

      .activity-list__provider-check {
        font-size: 20px;
        color: var(--nxt1-color-success, #22c55e);
        flex-shrink: 0;
      }

      .activity-list__provider-arrow {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        flex-shrink: 0;
      }

      /* ============================================
       ERROR STATE
       ============================================ */

      .activity-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .activity-list__error-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .activity-list__error-icon ion-icon {
        font-size: 36px;
        color: var(--nxt1-color-error, #ef4444);
      }

      .activity-list__error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      .activity-list__error-message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
      }

      .activity-list__error-action {
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

      .activity-list__error-action:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      .activity-list__error-action ion-icon {
        font-size: 18px;
      }

      /* ============================================
       LOAD MORE
       ============================================ */

      .activity-list__load-more {
        display: flex;
        justify-content: center;
        padding: 20px;
      }

      .activity-list__load-more-btn {
        padding: 10px 32px;
        border-radius: 20px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .activity-list__load-more-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-primary, #ffffff);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityListComponent {
  constructor() {
    addIcons({
      mailOutline,
      notificationsOutline,
      pricetagOutline,
      atOutline,
      checkmarkCircleOutline,
      sparklesOutline,
      alertCircleOutline,
      refreshOutline,
      chevronForward,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Activity items to display */
  readonly items = input.required<readonly ActivityItem[]>();

  /** Whether initial loading is in progress */
  readonly isLoading = input(false);

  /** Whether loading more items */
  readonly isLoadingMore = input(false);

  /** Whether the list is empty */
  readonly isEmpty = input(false);

  /** Error message if any */
  readonly error = input<string | null>(null);

  /** Whether there are more items to load */
  readonly hasMore = input(false);

  /** Current active tab (for empty state) */
  readonly activeTab = input<ActivityTabId>('alerts');

  /** Connected email accounts (for inbox empty state) */
  readonly connectedEmails = input<readonly ConnectedEmail[]>([]);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when load more is requested */
  readonly loadMore = output<void>();

  /** Emitted when retry is requested */
  readonly retry = output<void>();

  /** Emitted when empty state CTA is clicked */
  readonly emptyCta = output<void>();

  /** Emitted when an item is clicked */
  readonly itemClick = output<ActivityItem>();

  /** Emitted when an item action is clicked */
  readonly actionClick = output<ActivityItem>();

  /** Emitted when an item should be marked read */
  readonly markRead = output<string>();

  /** Emitted when an item should be archived */
  readonly archive = output<string>();

  /** Emitted when a user wants to connect an email provider */
  readonly connectProvider = output<InboxEmailProvider>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Skeleton count array for @for loop */
  protected readonly skeletonArray = Array.from(
    { length: ACTIVITY_UI_CONFIG.skeletonCount },
    (_, i) => i
  );

  /** Empty state config for current tab */
  protected readonly emptyState = computed(() => {
    const tab = this.activeTab();
    return ACTIVITY_EMPTY_STATES[tab] ?? ACTIVITY_EMPTY_STATES['alerts'];
  });

  /** Whether the active tab is the Agent X tab */
  protected readonly isAgentTab = computed(() => false);

  /** Whether the active tab is the Analytics tab */
  protected readonly isAnalyticsTab = computed(() => this.activeTab() === 'analytics');

  /** Whether the active tab is the Inbox tab */
  protected readonly isInboxTab = computed(() => false);

  /** Whether any email accounts are connected */
  protected readonly hasConnectedEmails = computed(() => this.connectedEmails().length > 0);
  protected readonly hasUnconnectedProviders = computed(() =>
    INBOX_EMAIL_PROVIDERS.some((p) => !this.isProviderConnected(p.id))
  );

  /** Agent X logo SVG data */
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Available email providers */
  protected readonly emailProviders = INBOX_EMAIL_PROVIDERS;

  // ============================================
  // METHODS
  // ============================================

  /** Check if a specific email provider is already connected */
  protected isProviderConnected(providerId: string): boolean {
    return this.connectedEmails().some((e) => e.provider === providerId && e.isActive);
  }

  /** Handle connect provider button click */
  protected onConnectProvider(provider: InboxEmailProvider): void {
    if (!this.isProviderConnected(provider.id)) {
      this.connectProvider.emit(provider);
    }
  }
}
