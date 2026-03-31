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

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { IonRippleEffect } from '@ionic/angular/standalone';
import type { FeedItem, FeedAuthor, FeedItemType } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtIconComponent } from '../components/icon';
import { HapticsService } from '../services/haptics/haptics.service';

/** Labels for the feed item type badge */
const FEED_ITEM_TYPE_LABELS: Readonly<Record<FeedItemType, string>> = {
  POST: 'Post',
  EVENT: 'Game',
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
  template: `
    <article
      class="feed-shell"
      [class.feed-shell--featured]="item().isFeatured"
      [class.feed-shell--pinned]="item().isPinned"
      [class.feed-shell--compact]="compact()"
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
          @if (showMenu()) {
            <button
              type="button"
              class="feed-shell__menu-btn"
              (click)="handleMenuClick($event)"
              aria-label="Post options"
              [attr.data-testid]="testIds.SHELL_MENU_BTN"
            >
              <nxt1-icon name="moreHorizontal" [size]="18" />
            </button>
          }
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
          @if (showMenu()) {
            <button
              type="button"
              class="feed-shell__menu-btn"
              (click)="handleMenuClick($event)"
              aria-label="Post options"
              [attr.data-testid]="testIds.SHELL_MENU_BTN"
            >
              <nxt1-icon name="moreHorizontal" [size]="20" />
            </button>
          }
        </header>
      }

      <!-- Pinned Badge -->
      @if (item().isPinned) {
        <div class="feed-shell__pinned-badge" [attr.data-testid]="testIds.SHELL_PINNED_BADGE">
          <nxt1-icon name="pin" [size]="12" />
          <span>Pinned</span>
        </div>
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
        <div class="feed-shell__stat" [attr.data-testid]="testIds.SHELL_STAT_REACT">
          <nxt1-icon name="flame" [size]="14" />
          <span class="feed-shell__stat-count">{{
            formatCount(item().engagement.reactionCount)
          }}</span>
        </div>
        <div class="feed-shell__stat" [attr.data-testid]="testIds.SHELL_STAT_REPOST">
          <nxt1-icon name="repeat" [size]="14" />
          <span class="feed-shell__stat-count">{{
            formatCount(item().engagement.repostCount)
          }}</span>
        </div>
        <div class="feed-shell__stat" [attr.data-testid]="testIds.SHELL_STAT_SHARES">
          <nxt1-icon name="share" [size]="14" />
          <span class="feed-shell__stat-count">{{
            formatCount(item().engagement.shareCount)
          }}</span>
        </div>
        <div class="feed-shell__stat" [attr.data-testid]="testIds.SHELL_STAT_VIEWS">
          <nxt1-icon name="barChart" [size]="14" />
          <span class="feed-shell__stat-count">{{ formatCount(item().engagement.viewCount) }}</span>
        </div>
      </div>

      <!-- View Profile CTA -->
      <button
        type="button"
        class="feed-shell__view-profile"
        (click)="handleAuthorClick($event)"
        [attr.data-testid]="testIds.SHELL_VIEW_PROFILE_BTN"
      >
        View Profile
      </button>
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
        margin: 0 16px 12px;
        overflow: hidden;
        transition: background 0.2s ease;

        @media (min-width: 768px) {
          margin: 0;
          height: 100%;
          &:hover {
            background: var(--shell-bg-hover);
          }
        }
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
          background: rgba(255, 255, 255, 0.08);
        }
      }

      /* Pinned Badge */
      .feed-shell__pinned-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        margin: 8px 16px 0;
        font-size: 11px;
        font-weight: 600;
        color: var(--shell-primary);
      }

      /* Content Area (projected) */
      .feed-shell__content {
        padding: 8px 16px;
        cursor: pointer;
      }

      .feed-shell--compact .feed-shell__content {
        padding: 6px 10px;
      }

      /* Stats Bar */
      .feed-shell__stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
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

      .feed-shell__lead {
        overflow: hidden;
        padding: 0 16px;
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

  protected readonly typeBadgeLabel = computed(() => {
    return FEED_ITEM_TYPE_LABELS[this.item().feedType];
  });

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
    this.menuClick.emit(this.item());
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
