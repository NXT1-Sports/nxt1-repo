/**
 * @fileoverview Feed Card Shell Component (Smart Shell)
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * The outer wrapper for all polymorphic feed items.
 * Renders the shared UI: author header, engagement bar, type badge, menu.
 * Inner content (payload) is projected via <ng-content>.
 *
 * This replaces the "Omni Card" pattern where one component had 9+ @if blocks.
 * Now each feed type renders its own atomic card inside this shell.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-feed-card-shell [item]="item" (authorClick)="onAuthor($event)">
 *   @switch (item.feedType) {
 *     @case ('EVENT') { <nxt1-feed-event-card [data]="item" /> }
 *     @case ('STAT') { <nxt1-feed-stat-card [data]="item" /> }
 *     @case ('POST') { <nxt1-feed-post-content [data]="item" /> }
 *   }
 * </nxt1-feed-card-shell>
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  signal,
  effect,
  ElementRef,
  HostListener,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import type { FeedItem, FeedAuthor, FeedItemType } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtIconComponent } from '../components/icon';
import { HapticsService } from '../services/haptics/haptics.service';
import { FEED_ENGAGEMENT } from './feed-engagement.token';

/** Labels for the feed item type badge */
const FEED_ITEM_TYPE_LABELS: Readonly<Record<FeedItemType, string>> = {
  POST: 'Post',
  EVENT: 'Event',
  SCHEDULE: 'Game',
  STAT: 'Stats',
  METRIC: 'Metrics',
  OFFER: 'Offer',
  COMMITMENT: 'Commitment',
  VISIT: 'Visit',
  CAMP: 'Camp',
  AWARD: 'Award',
  NEWS: 'News',
  SCOUT_REPORT: 'Scout Report',
  ACADEMIC: 'Academic',
  SHARED_REFERENCE: 'Shared',
};

@Component({
  selector: 'nxt1-feed-card-shell',
  standalone: true,
  imports: [IonRippleEffect, NxtAvatarComponent, NxtIconComponent],
  host: {
    '[class.feed-shell-host--menu-open]': 'menuOpen()',
  },
  template: `
    <article
      class="feed-shell"
      [class.feed-shell--pinned]="item().isPinned"
      [class.feed-shell--compact]="compact()"
      [class.feed-shell--menu-open]="menuOpen()"
      role="article"
      [attr.aria-label]="ariaLabel()"
      [attr.data-testid]="testIds.SHELL_ARTICLE"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Lead Media (full-bleed, sits above author) -->
      <div class="feed-shell__lead" (click)="handleContentClick($event)">
        <ng-content select="[feedShellLead]" />
      </div>

      <!-- Compact Meta Bar (when hideAuthor=true, e.g. on profile pages) -->
      @if (!hideHeader() && hideAuthor()) {
        <div class="feed-shell__meta-bar">
          <div class="feed-shell__meta-bar-left">
            @if (showTypeBadge()) {
              <div class="feed-shell__type-badge" [attr.data-testid]="testIds.SHELL_TYPE_BADGE">
                <span>{{ typeBadgeLabel() }}</span>
              </div>
            }
            <span class="feed-shell__time">{{ timeAgo() }}</span>
          </div>
          <div class="feed-shell__meta-bar-right">
            @if (item().isPinned) {
              <div
                class="feed-shell__pin-indicator"
                [attr.data-testid]="testIds.SHELL_PINNED_BADGE"
              >
                <nxt1-icon name="pin" [size]="12" />
                <span>Pinned</span>
              </div>
            }
            @if (canShowMenu()) {
              <div class="feed-shell__menu-wrap">
                <button
                  type="button"
                  class="feed-shell__menu-btn"
                  (click)="handleMenuClick($event)"
                  aria-label="Post options"
                  [attr.data-testid]="testIds.SHELL_MENU_BTN"
                >
                  <nxt1-icon name="moreHorizontal" [size]="18" />
                </button>
                @if (menuOpen()) {
                  <div class="feed-shell__dropdown" role="menu" (click)="$event.stopPropagation()">
                    @if (canPin()) {
                      <button
                        type="button"
                        class="feed-shell__dropdown-item"
                        role="menuitem"
                        (click)="handlePinClick($event)"
                      >
                        <nxt1-icon name="pin" [size]="16" />
                        <span>{{ item().isPinned ? 'Unpin' : 'Pin' }}</span>
                      </button>
                      <div class="feed-shell__dropdown-divider"></div>
                    }
                    <button
                      type="button"
                      class="feed-shell__dropdown-item feed-shell__dropdown-item--danger"
                      role="menuitem"
                      (click)="handleDeleteClick($event)"
                    >
                      <nxt1-icon name="trash" [size]="16" />
                      <span>Delete</span>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Author Header (below media, above body content) -->
      @if (!hideHeader() && !hideAuthor()) {
        <header class="feed-shell__header">
          <button
            type="button"
            class="feed-shell__avatar-btn"
            (click)="handleAuthorClick($event)"
            [attr.aria-label]="'View ' + item().author.displayName + ' profile'"
            [attr.data-testid]="testIds.SHELL_AVATAR_BTN"
          >
            <nxt1-avatar
              [src]="item().author.avatarUrl"
              [name]="item().author.displayName"
              size="md"
            />
          </button>
          <div
            class="feed-shell__author"
            [attr.data-testid]="testIds.SHELL_AUTHOR_INFO"
            (click)="handleAuthorClick($event)"
          >
            <div class="feed-shell__author-row">
              <span class="feed-shell__author-name">{{ item().author.displayName }}</span>
            </div>
            <div class="feed-shell__author-meta">
              <span class="feed-shell__time">{{ timeAgo() }}</span>
            </div>
          </div>
          @if (showTypeBadge()) {
            <div class="feed-shell__type-badge" [attr.data-testid]="testIds.SHELL_TYPE_BADGE">
              <span>{{ typeBadgeLabel() }}</span>
            </div>
          }
          @if (item().isPinned) {
            <div class="feed-shell__pin-indicator" [attr.data-testid]="testIds.SHELL_PINNED_BADGE">
              <nxt1-icon name="pin" [size]="12" />
              <span>Pinned</span>
            </div>
          }
          @if (canShowMenu()) {
            <div class="feed-shell__menu-wrap">
              <button
                type="button"
                class="feed-shell__menu-btn"
                (click)="handleMenuClick($event)"
                aria-label="Post options"
                [attr.data-testid]="testIds.SHELL_MENU_BTN"
              >
                <nxt1-icon name="moreHorizontal" [size]="20" />
              </button>
              @if (menuOpen()) {
                <div class="feed-shell__dropdown" role="menu" (click)="$event.stopPropagation()">
                  @if (canPin()) {
                    <button
                      type="button"
                      class="feed-shell__dropdown-item"
                      role="menuitem"
                      (click)="handlePinClick($event)"
                    >
                      <nxt1-icon name="pin" [size]="16" />
                      <span>{{ item().isPinned ? 'Unpin' : 'Pin' }}</span>
                    </button>
                    <div class="feed-shell__dropdown-divider"></div>
                  }
                  <button
                    type="button"
                    class="feed-shell__dropdown-item feed-shell__dropdown-item--danger"
                    role="menuitem"
                    (click)="handleDeleteClick($event)"
                  >
                    <nxt1-icon name="trash" [size]="16" />
                    <span>Delete</span>
                  </button>
                </div>
              }
            </div>
          }
        </header>
      }

      <!-- Projected Payload Content (title, body, tags, etc.) -->
      <div
        class="feed-shell__content"
        [attr.data-testid]="testIds.SHELL_CONTENT"
        (click)="handleContentClick($event)"
      >
        <ng-content />
      </div>

      <!-- Engagement Stats Bar -->
      <div class="feed-shell__stats" [attr.data-testid]="testIds.SHELL_STATS">
        <button
          type="button"
          class="feed-shell__stat feed-shell__stat--btn"
          [attr.data-testid]="testIds.SHELL_STAT_SHARES"
          [class.feed-shell__stat--sharing]="sharing()"
          (click)="handleShareClick($event)"
          aria-label="Share"
        >
          <nxt1-icon name="share" [size]="14" />
          <span class="feed-shell__stat-count">{{ formatCount(shareCount()) }}</span>
        </button>
        <div class="feed-shell__stat" [attr.data-testid]="testIds.SHELL_STAT_VIEWS">
          <nxt1-icon name="barChart" [size]="14" />
          <span class="feed-shell__stat-count">{{ formatCount(item().engagement.viewCount) }}</span>
        </div>
      </div>

      <!-- View Profile CTA -->
      @if (!hideAuthor()) {
        <button
          type="button"
          class="feed-shell__view-profile"
          (click)="handleAuthorClick($event)"
          [attr.data-testid]="testIds.SHELL_VIEW_PROFILE_BTN"
        >
          View Profile
        </button>
      }
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        content-visibility: auto;
        contain-intrinsic-size: auto 500px;
        --shell-bg: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        --shell-bg-hover: var(--nxt1-glass-bgSolid, rgba(20, 20, 20, 0.95));
        --shell-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        --shell-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --shell-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --shell-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --shell-primary: var(--nxt1-color-primary, #d4ff00);
      }

      :host.feed-shell-host--menu-open {
        content-visibility: visible;
        contain: none;
      }

      .feed-shell {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 0;
        background: var(--shell-bg);
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        box-shadow: var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        border: 1px solid var(--shell-border);
        border-radius: var(--nxt1-radius-lg, 16px);
        margin: 0 0 12px;
        overflow: visible;
        transition: background 0.2s ease;

        @media (min-width: 768px) {
          margin: 0;
          height: 100%;
          &:hover {
            background: var(--shell-bg-hover);
          }
        }
      }

      .feed-shell--menu-open {
        z-index: var(--nxt1-nav-z-dropdown, 1000);
      }

      /* Lead media clips to the top corners of the card */
      .feed-shell__lead {
        border-radius: var(--nxt1-radius-lg, 16px) var(--nxt1-radius-lg, 16px) 0 0;
        overflow: hidden;
      }

      .feed-shell--featured {
        border-left: 3px solid var(--shell-primary);
        @media (min-width: 768px) {
          border: 1px solid rgba(212, 255, 0, 0.2);
          border-left: 3px solid var(--shell-primary);
        }
      }

      .feed-shell--pinned {
        background: rgba(212, 255, 0, 0.02);
      }
      .feed-shell--compact {
        border-radius: 12px;
      }

      /* Meta Bar (compact / hideAuthor) */
      .feed-shell__meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 0;
        gap: 8px;
      }

      .feed-shell__meta-bar-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      /* Header */
      .feed-shell__header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px 0;
      }

      .feed-shell--compact .feed-shell__header {
        gap: 6px;
        padding: 8px 10px 0;
      }

      .feed-shell__avatar-btn {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
      }

      .feed-shell__author {
        flex: 1;
        min-width: 0;
        cursor: pointer;
      }

      .feed-shell__author-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .feed-shell__author-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--shell-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .feed-shell__author-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 1px;
      }

      .feed-shell__time {
        font-size: 12px;
        color: var(--shell-text-tertiary);
        white-space: nowrap;
      }

      .feed-shell__type-badge {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        padding: 4px 12px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-elevated, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));

        span {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--shell-primary);
          line-height: 1;
        }
      }

      .feed-shell__menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--shell-text-secondary);
        border-radius: 50%;
        transition: background 0.15s ease;
        flex-shrink: 0;
        &:hover {
          background: color-mix(in srgb, var(--shell-text-primary) 8%, transparent);
        }
      }

      /* Menu Wrap & Dropdown */
      .feed-shell__menu-wrap {
        position: relative;
        flex-shrink: 0;
        /* Creates its own stacking context above ALL card children */
        z-index: 9999;
        isolation: isolate;
      }

      .feed-shell__dropdown {
        position: absolute;
        top: calc(100% + var(--nxt1-spacing-2, 8px));
        right: 0;
        min-width: var(--nxt1-spacing-52, 13rem);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        box-shadow: var(--nxt1-navigation-dropdown);
        padding: var(--nxt1-spacing-1, 4px);
        overflow: hidden;
        z-index: var(--nxt1-nav-z-dropdown, 1000);
      }

      .feed-shell__dropdown-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        cursor: pointer;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-nav-text);
        text-align: left;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
        &:hover,
        &:active {
          background: var(--nxt1-nav-hover-bg);
        }
        &:focus-visible {
          outline: 2px solid var(--nxt1-nav-focus-ring);
          outline-offset: -2px;
        }
      }

      .feed-shell__dropdown-divider {
        height: 1px;
        margin: var(--nxt1-spacing-1, 4px) 0;
        background: var(--nxt1-color-border-default);
      }

      .feed-shell__dropdown-item--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }

      /* Pinned indicator — inline with three-dots menu */
      .feed-shell__pin-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--shell-primary);
        flex-shrink: 0;
      }

      /* Right-side wrapper in compact meta-bar */
      .feed-shell__meta-bar-right {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      /* Content Area (projected) */
      .feed-shell__content {
        padding: 12px 16px;
        cursor: pointer;
      }

      .feed-shell--compact .feed-shell__content {
        padding: 8px 10px;
      }

      /* Stats Bar */
      .feed-shell__stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        padding: 10px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .feed-shell__stat {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 4px;
        color: var(--shell-text-tertiary);
        font-variant-numeric: tabular-nums;
      }

      .feed-shell__stat--btn {
        background: none;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 8px;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        &:hover {
          background: color-mix(in srgb, var(--shell-primary) 8%, transparent);
          color: var(--shell-primary);
        }
        &:active {
          background: color-mix(in srgb, var(--shell-primary) 15%, transparent);
        }
      }

      .feed-shell__stat--sharing {
        color: var(--shell-primary);
        opacity: 0.7;
        pointer-events: none;
      }

      .feed-shell__stat-count {
        font-size: 13px;
        font-weight: 700;
        color: var(--shell-text-primary);
      }

      /* View Profile CTA */
      .feed-shell__view-profile {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 10px 16px;
        background: none;
        border: none;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--shell-primary);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .feed-shell__view-profile:hover {
        background: rgba(255, 255, 255, 0.04);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedCardShellComponent {
  private readonly haptics = inject(HapticsService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly feedEngagement = inject(FEED_ENGAGEMENT, { optional: true });
  protected readonly testIds = FEED_CARD_TEST_IDS;

  // ============================================
  // INPUTS
  // ============================================

  readonly item = input.required<FeedItem>();
  readonly showMenu = input(true);
  readonly hideAuthor = input(false);
  readonly hideHeader = input(false);
  readonly compact = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly contentClick = output<FeedItem>();
  readonly authorClick = output<FeedAuthor>();
  readonly menuClick = output<FeedItem>();
  readonly pinClick = output<FeedItem>();
  readonly deleteClick = output<FeedItem>();

  // ============================================
  // STATE
  // ============================================

  protected readonly menuOpen = signal(false);
  /** Optimistic local share count — updated immediately on tap */
  private readonly _shareCount = signal(0);
  protected readonly shareCount = computed(() => this._shareCount());
  /** True while share action is in-flight — prevents double-tap */
  protected readonly sharing = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly ariaLabel = computed(() => {
    const i = this.item();
    return `${FEED_ITEM_TYPE_LABELS[i.feedType]} by ${i.author.displayName}`;
  });

  protected readonly timeAgo = computed(() => {
    return this.formatRelativeTime(this.item().createdAt);
  });

  protected readonly showTypeBadge = computed(() => {
    return this.item().feedType !== 'POST';
  });

  protected readonly canShowMenu = computed(() => this.showMenu());

  /** Pin is available for all owned feed items (metric groups included). */
  protected readonly canPin = computed(() => this.showMenu());

  protected readonly typeBadgeLabel = computed(() => {
    return FEED_ITEM_TYPE_LABELS[this.item().feedType];
  });

  constructor() {
    // Sync local shareCount whenever the item input changes
    effect(() => {
      this._shareCount.set(this.item().engagement.shareCount);
    });

    // Set up IntersectionObserver after first render (SSR-safe)
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId) || !this.feedEngagement) return;
      this.setupViewObserver();
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleAuthorClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.authorClick.emit(this.item().author);
  }

  protected async handleContentClick(_event: Event): Promise<void> {
    await this.haptics.impact('light');
    this.contentClick.emit(this.item());
  }

  protected async handleMenuClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.menuOpen.update((v) => !v);
    this.menuClick.emit(this.item());
  }

  protected async handlePinClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.menuOpen.set(false);
    this.pinClick.emit(this.item());
  }

  protected async handleDeleteClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.notification('warning');
    this.menuOpen.set(false);
    this.deleteClick.emit(this.item());
  }

  protected async handleShareClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.sharing()) return;

    await this.haptics.impact('medium');

    // Optimistic increment before async work
    this._shareCount.update((c) => c + 1);
    this.sharing.set(true);

    try {
      await this.feedEngagement?.sharePost(this.item());
    } catch {
      // Rollback on failure
      this._shareCount.update((c) => Math.max(0, c - 1));
    } finally {
      this.sharing.set(false);
    }
  }

  // ============================================
  // INTERSECTION OBSERVER (view impressions)
  // ============================================

  private setupViewObserver(): void {
    const item = this.item();

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          this.feedEngagement?.viewPost(item.id);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(this.elementRef.nativeElement);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: Event): void {
    if (!this.menuOpen()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.feed-shell__menu-wrap')) {
      return;
    }
    if (!this.elementRef.nativeElement.isConnected) return;
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected handleEscapeKey(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  protected formatCount(count: number): string {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return count.toString();
  }

  protected formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
