/**
 * @fileoverview Feed Post Card Component
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Professional social media post card following Twitter/Instagram patterns.
 * Features author info, content, media, engagement actions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Author avatar with verification badge
 * - Post type badges (offer, commitment, etc.)
 * - Text content with hashtag/mention highlighting
 * - Media grid (images/videos)
 * - Engagement action bar (like, comment, share, bookmark)
 * - Haptic feedback on interactions
 * - Optimistic UI updates
 * - Accessible with proper ARIA labels
 *
 * @example
 * ```html
 * <nxt1-feed-post-card
 *   [post]="post"
 *   (postClick)="onPostClick($event)"
 *   (likeClick)="onLike($event)"
 *   (commentClick)="onComment($event)"
 *   (shareClick)="onShare($event)"
 *   (bookmarkClick)="onBookmark($event)"
 *   (authorClick)="onAuthorClick($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  heartOutline,
  heart,
  chatbubbleOutline,
  shareOutline,
  bookmarkOutline,
  bookmark,
  ellipsisHorizontal,
  playCircle,
  checkmarkCircle,
  schoolOutline,
  trophyOutline,
  ribbonOutline,
  locationOutline,
  repeatOutline,
} from 'ionicons/icons';
import {
  type FeedPost,
  type FeedAuthor,
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_POST_TYPE_COLORS,
} from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtImageComponent } from '../components/image';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  heartOutline,
  heart,
  chatbubbleOutline,
  shareOutline,
  bookmarkOutline,
  bookmark,
  ellipsisHorizontal,
  playCircle,
  checkmarkCircle,
  schoolOutline,
  trophyOutline,
  ribbonOutline,
  locationOutline,
  repeatOutline,
});

@Component({
  selector: 'nxt1-feed-post-card',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, NxtAvatarComponent, NxtImageComponent],
  template: `
    <article
      class="feed-post"
      [class.feed-post--featured]="post().isFeatured"
      [class.feed-post--pinned]="post().isPinned"
      role="article"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Post Header: Author Info -->
      <header class="feed-post__header">
        <!-- Author Avatar -->
        <button
          type="button"
          class="feed-post__avatar-btn"
          (click)="handleAuthorClick($event)"
          [attr.aria-label]="'View ' + post().author.displayName + ' profile'"
        >
          <nxt1-avatar
            [src]="post().author.avatarUrl"
            [name]="post().author.displayName"
            size="md"
            [badge]="post().author.isVerified ? { type: 'verified' } : undefined"
          />
        </button>

        <!-- Author Details -->
        <div class="feed-post__author" (click)="handleAuthorClick($event)">
          <div class="feed-post__author-row">
            <span class="feed-post__author-name">{{ post().author.displayName }}</span>
            @if (post().author.isVerified) {
              <ion-icon name="checkmark-circle" class="feed-post__verified"></ion-icon>
            }
          </div>
          <div class="feed-post__author-meta">
            @if (post().author.sport && post().author.position) {
              <span class="feed-post__position">{{ post().author.position }}</span>
              <span class="feed-post__separator">•</span>
            }
            @if (post().author.schoolName) {
              <span class="feed-post__school">{{ post().author.schoolName }}</span>
              <span class="feed-post__separator">•</span>
            }
            <span class="feed-post__time">{{ timeAgo() }}</span>
          </div>
        </div>

        <!-- Menu Button -->
        @if (showMenu()) {
          <button
            type="button"
            class="feed-post__menu-btn"
            (click)="handleMenuClick($event)"
            aria-label="Post options"
          >
            <ion-icon name="ellipsis-horizontal"></ion-icon>
          </button>
        }
      </header>

      <!-- Post Type Badge (for special posts) -->
      @if (showTypeBadge()) {
        <div class="feed-post__type-badge" [style.--badge-color]="typeBadgeColor()">
          <ion-icon [name]="typeBadgeIcon()"></ion-icon>
          <span>{{ typeBadgeLabel() }}</span>
        </div>
      }

      <!-- Post Content (clickable) -->
      <div class="feed-post__content" (click)="handlePostClick($event)">
        <!-- Text Content -->
        @if (post().content) {
          <p class="feed-post__text" [innerHTML]="formattedContent()"></p>
        }

        <!-- Offer/Commitment Card -->
        @if (post().offerData) {
          <div class="feed-post__offer-card">
            @if (post().offerData!.collegeLogoUrl) {
              <img
                [src]="post().offerData!.collegeLogoUrl"
                [alt]="post().offerData!.collegeName"
                class="feed-post__offer-logo"
              />
            }
            <div class="feed-post__offer-info">
              <span class="feed-post__offer-college">{{ post().offerData!.collegeName }}</span>
              <span class="feed-post__offer-type">{{
                formatOfferType(post().offerData!.offerType)
              }}</span>
              @if (post().offerData!.division) {
                <span class="feed-post__offer-division">{{ post().offerData!.division }}</span>
              }
            </div>
          </div>
        }

        @if (post().commitmentData) {
          <div class="feed-post__commitment-card">
            @if (post().commitmentData!.collegeLogoUrl) {
              <img
                [src]="post().commitmentData!.collegeLogoUrl"
                [alt]="post().commitmentData!.collegeName"
                class="feed-post__commitment-logo"
              />
            }
            <div class="feed-post__commitment-info">
              <span class="feed-post__commitment-label">COMMITTED TO</span>
              <span class="feed-post__commitment-college">{{
                post().commitmentData!.collegeName
              }}</span>
              @if (post().commitmentData!.isSigned) {
                <span class="feed-post__commitment-signed">✍️ Signed</span>
              }
            </div>
          </div>
        }

        <!-- Media Grid -->
        @if (hasMedia()) {
          <div class="feed-post__media" [class]="mediaGridClass()">
            @for (media of visibleMedia(); track media.id; let i = $index) {
              <div
                class="feed-post__media-item"
                [class.feed-post__media-item--video]="media.type === 'video'"
              >
                <nxt1-image
                  [src]="media.thumbnailUrl || media.url"
                  [alt]="media.altText || 'Post media'"
                  fit="cover"
                />
                @if (media.type === 'video') {
                  <div class="feed-post__video-overlay">
                    <ion-icon name="play-circle"></ion-icon>
                    @if (media.duration) {
                      <span class="feed-post__video-duration">{{
                        formatDuration(media.duration)
                      }}</span>
                    }
                  </div>
                }
                @if (i === 3 && moreMediaCount() > 0) {
                  <div class="feed-post__media-more">+{{ moreMediaCount() }}</div>
                }
              </div>
            }
          </div>
        }

        <!-- Location Tag -->
        @if (post().location) {
          <div class="feed-post__location">
            <ion-icon name="location-outline"></ion-icon>
            <span>{{ post().location }}</span>
          </div>
        }
      </div>

      <!-- Engagement Stats (if large numbers) -->
      @if (showEngagementStats()) {
        <div class="feed-post__stats">
          @if (post().engagement.likeCount > 0) {
            <span class="feed-post__stat"
              >{{ formatCount(post().engagement.likeCount) }} likes</span
            >
          }
          @if (post().engagement.commentCount > 0) {
            <span class="feed-post__stat"
              >{{ formatCount(post().engagement.commentCount) }} comments</span
            >
          }
          @if ((post().engagement.viewCount ?? 0) > 1000) {
            <span class="feed-post__stat"
              >{{ formatCount(post().engagement.viewCount ?? 0) }} views</span
            >
          }
        </div>
      }

      <!-- Engagement Actions -->
      <footer class="feed-post__actions">
        <!-- Like -->
        <button
          type="button"
          class="feed-post__action"
          [class.feed-post__action--active]="post().userEngagement.isLiked"
          (click)="handleLikeClick($event)"
          [attr.aria-label]="post().userEngagement.isLiked ? 'Unlike' : 'Like'"
          [attr.aria-pressed]="post().userEngagement.isLiked"
        >
          <ion-icon [name]="post().userEngagement.isLiked ? 'heart' : 'heart-outline'"></ion-icon>
          @if (post().engagement.likeCount > 0) {
            <span>{{ formatCount(post().engagement.likeCount) }}</span>
          }
        </button>

        <!-- Comment -->
        <button
          type="button"
          class="feed-post__action"
          (click)="handleCommentClick($event)"
          aria-label="Comment"
        >
          <ion-icon name="chatbubble-outline"></ion-icon>
          @if (post().engagement.commentCount > 0) {
            <span>{{ formatCount(post().engagement.commentCount) }}</span>
          }
        </button>

        <!-- Share -->
        <button
          type="button"
          class="feed-post__action"
          (click)="handleShareClick($event)"
          aria-label="Share"
        >
          <ion-icon name="share-outline"></ion-icon>
          @if (post().engagement.shareCount > 0) {
            <span>{{ formatCount(post().engagement.shareCount) }}</span>
          }
        </button>

        <!-- Bookmark (right-aligned) -->
        <button
          type="button"
          class="feed-post__action feed-post__action--bookmark"
          [class.feed-post__action--active]="post().userEngagement.isBookmarked"
          (click)="handleBookmarkClick($event)"
          [attr.aria-label]="post().userEngagement.isBookmarked ? 'Remove bookmark' : 'Bookmark'"
          [attr.aria-pressed]="post().userEngagement.isBookmarked"
        >
          <ion-icon
            [name]="post().userEngagement.isBookmarked ? 'bookmark' : 'bookmark-outline'"
          ></ion-icon>
        </button>
      </footer>
    </article>
  `,
  styles: [
    `
      /* ============================================
         FEED POST CARD - Professional Social Post
         2026 Native-Style Design System
         ============================================ */

      :host {
        display: block;

        /* Theme-aware design tokens */
        --post-bg: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
        --post-bg-hover: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --post-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --post-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --post-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --post-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --post-primary: var(--nxt1-color-primary, #d4ff00);
        --post-like-active: var(--nxt1-color-error, #ff4757);
        --post-bookmark-active: var(--nxt1-color-primary, #d4ff00);
        --post-verified: var(--nxt1-color-info, #3b82f6);
      }

      .feed-post {
        position: relative;
        padding: 16px;
        background: var(--post-bg);
        border-bottom: 1px solid var(--post-border);
        transition: background 0.2s ease;

        @media (min-width: 768px) {
          padding: 20px 24px;
          border-radius: var(--nxt1-radius-lg, 12px);
          margin-bottom: 12px;
          border: 1px solid var(--post-border);

          &:hover {
            background: var(--post-bg-hover);
          }
        }
      }

      .feed-post--featured {
        background: linear-gradient(
          135deg,
          rgba(212, 255, 0, 0.03) 0%,
          rgba(212, 255, 0, 0.01) 100%
        );
        border-left: 3px solid var(--post-primary);

        @media (min-width: 768px) {
          border: 1px solid rgba(212, 255, 0, 0.2);
          border-left: 3px solid var(--post-primary);
        }
      }

      .feed-post--pinned {
        background: rgba(212, 255, 0, 0.02);
      }

      /* ============================================
         HEADER
         ============================================ */

      .feed-post__header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .feed-post__avatar-btn {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
      }

      .feed-post__author {
        flex: 1;
        min-width: 0;
        cursor: pointer;
      }

      .feed-post__author-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .feed-post__author-name {
        font-size: 15px;
        font-weight: 600;
        color: var(--post-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .feed-post__verified {
        font-size: 16px;
        color: var(--post-verified);
        flex-shrink: 0;
      }

      .feed-post__author-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
        font-size: 13px;
        color: var(--post-text-secondary);
        flex-wrap: wrap;
      }

      .feed-post__position {
        font-weight: 500;
        color: var(--post-primary);
      }

      .feed-post__separator {
        color: var(--post-text-tertiary);
      }

      .feed-post__school {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
      }

      .feed-post__time {
        color: var(--post-text-tertiary);
        white-space: nowrap;
      }

      .feed-post__menu-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: none;
        border: none;
        color: var(--post-text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
        margin: -8px -8px 0 0;

        &:hover {
          background: var(--post-bg-hover);
          color: var(--post-text-primary);
        }

        ion-icon {
          font-size: 20px;
        }
      }

      /* ============================================
         TYPE BADGE
         ============================================ */

      .feed-post__type-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: color-mix(in srgb, var(--badge-color, var(--post-primary)) 15%, transparent);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        color: var(--badge-color, var(--post-primary));
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;

        ion-icon {
          font-size: 14px;
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .feed-post__content {
        cursor: pointer;
      }

      .feed-post__text {
        font-size: 15px;
        line-height: 1.5;
        color: var(--post-text-primary);
        margin: 0 0 12px;
        word-wrap: break-word;
        white-space: pre-wrap;

        :host ::ng-deep .hashtag,
        :host ::ng-deep .mention {
          color: var(--post-primary);
          font-weight: 500;
        }
      }

      /* ============================================
         OFFER/COMMITMENT CARDS
         ============================================ */

      .feed-post__offer-card,
      .feed-post__commitment-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px solid var(--post-border);
        margin-bottom: 12px;
      }

      .feed-post__offer-logo,
      .feed-post__commitment-logo {
        width: 56px;
        height: 56px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .feed-post__offer-info,
      .feed-post__commitment-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .feed-post__offer-college,
      .feed-post__commitment-college {
        font-size: 16px;
        font-weight: 600;
        color: var(--post-text-primary);
      }

      .feed-post__offer-type {
        font-size: 13px;
        color: var(--nxt1-color-success, #4ade80);
        font-weight: 500;
      }

      .feed-post__offer-division {
        font-size: 12px;
        color: var(--post-text-secondary);
      }

      .feed-post__commitment-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--post-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .feed-post__commitment-signed {
        font-size: 12px;
        color: var(--post-primary);
        font-weight: 500;
      }

      /* ============================================
         MEDIA GRID
         ============================================ */

      .feed-post__media {
        display: grid;
        gap: 4px;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        margin-bottom: 12px;
      }

      .feed-post__media--single {
        grid-template-columns: 1fr;

        .feed-post__media-item {
          aspect-ratio: 16 / 9;
          max-height: 400px;
        }
      }

      .feed-post__media--double {
        grid-template-columns: repeat(2, 1fr);

        .feed-post__media-item {
          aspect-ratio: 1;
        }
      }

      .feed-post__media--triple {
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(2, 1fr);

        .feed-post__media-item:first-child {
          grid-row: span 2;
          aspect-ratio: auto;
        }

        .feed-post__media-item:not(:first-child) {
          aspect-ratio: 1;
        }
      }

      .feed-post__media--grid {
        grid-template-columns: repeat(2, 1fr);

        .feed-post__media-item {
          aspect-ratio: 1;
        }
      }

      .feed-post__media-item {
        position: relative;
        background: var(--nxt1-color-surface-100);
        overflow: hidden;

        nxt1-image {
          width: 100%;
          height: 100%;
        }
      }

      .feed-post__media-item--video {
        cursor: pointer;
      }

      .feed-post__video-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        transition: background 0.2s ease;

        ion-icon {
          font-size: 64px;
          color: white;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
        }

        &:hover {
          background: rgba(0, 0, 0, 0.4);
        }
      }

      .feed-post__video-duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.85);
        border-radius: 4px;
        font-size: 12px;
        color: white;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }

      .feed-post__media-more {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        font-size: 24px;
        font-weight: 600;
        color: white;
      }

      /* ============================================
         LOCATION
         ============================================ */

      .feed-post__location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        color: var(--post-text-secondary);
        margin-bottom: 12px;

        ion-icon {
          font-size: 14px;
        }
      }

      /* ============================================
         ENGAGEMENT STATS
         ============================================ */

      .feed-post__stats {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 0;
        border-top: 1px solid var(--post-border);
        margin-top: 8px;
      }

      .feed-post__stat {
        font-size: 13px;
        color: var(--post-text-secondary);
      }

      /* ============================================
         ACTIONS
         ============================================ */

      .feed-post__actions {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--post-border);
      }

      .feed-post__action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: none;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--post-text-secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;

        ion-icon {
          font-size: 20px;
        }

        &:hover {
          background: var(--post-bg-hover);
          color: var(--post-text-primary);
        }

        &:active {
          transform: scale(0.95);
        }
      }

      .feed-post__action--active {
        &:first-of-type {
          color: var(--post-like-active);

          &:hover {
            color: var(--post-like-active);
          }
        }
      }

      .feed-post__action--bookmark {
        margin-left: auto;

        &.feed-post__action--active {
          color: var(--post-bookmark-active);

          &:hover {
            color: var(--post-bookmark-active);
          }
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedPostCardComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  readonly post = input.required<FeedPost>();
  readonly showMenu = input(true);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<FeedPost>();
  readonly authorClick = output<FeedAuthor>();
  readonly likeClick = output<FeedPost>();
  readonly commentClick = output<FeedPost>();
  readonly shareClick = output<FeedPost>();
  readonly bookmarkClick = output<FeedPost>();
  readonly menuClick = output<FeedPost>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly ariaLabel = computed(() => {
    const p = this.post();
    return `Post by ${p.author.displayName}: ${p.content?.substring(0, 100) || p.type}`;
  });

  protected readonly timeAgo = computed(() => {
    return this.formatRelativeTime(this.post().createdAt);
  });

  protected readonly formattedContent = computed(() => {
    const content = this.post().content;
    if (!content) return '';

    // Highlight hashtags and mentions
    return content
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  });

  protected readonly showTypeBadge = computed(() => {
    const type = this.post().type;
    return ['offer', 'commitment', 'milestone', 'highlight'].includes(type);
  });

  protected readonly typeBadgeIcon = computed(() => {
    return FEED_POST_TYPE_ICONS[this.post().type] ?? 'document-text-outline';
  });

  protected readonly typeBadgeLabel = computed(() => {
    return FEED_POST_TYPE_LABELS[this.post().type] ?? 'Post';
  });

  protected readonly typeBadgeColor = computed(() => {
    return FEED_POST_TYPE_COLORS[this.post().type] ?? 'var(--post-primary)';
  });

  protected readonly hasMedia = computed(() => {
    return this.post().media.length > 0;
  });

  protected readonly visibleMedia = computed(() => {
    return this.post().media.slice(0, 4);
  });

  protected readonly moreMediaCount = computed(() => {
    return Math.max(0, this.post().media.length - 4);
  });

  protected readonly mediaGridClass = computed(() => {
    const count = this.post().media.length;
    if (count === 1) return 'feed-post__media--single';
    if (count === 2) return 'feed-post__media--double';
    if (count === 3) return 'feed-post__media--triple';
    return 'feed-post__media--grid';
  });

  protected readonly showEngagementStats = computed(() => {
    const e = this.post().engagement;
    return e.likeCount > 100 || e.commentCount > 20 || (e.viewCount ?? 0) > 1000;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleAuthorClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.authorClick.emit(this.post().author);
  }

  protected async handlePostClick(_event: Event): Promise<void> {
    await this.haptics.impact('light');
    this.postClick.emit(this.post());
  }

  protected async handleLikeClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.likeClick.emit(this.post());
  }

  protected async handleCommentClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.commentClick.emit(this.post());
  }

  protected async handleShareClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.shareClick.emit(this.post());
  }

  protected async handleBookmarkClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.bookmarkClick.emit(this.post());
  }

  protected async handleMenuClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.menuClick.emit(this.post());
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

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  protected formatOfferType(type: string): string {
    const labels: Record<string, string> = {
      scholarship: 'Full Scholarship',
      'preferred-walk-on': 'Preferred Walk-On',
      'walk-on': 'Walk-On',
      interest: 'Interest',
    };
    return labels[type] ?? type;
  }
}
