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
 *   (reactClick)="onLike($event)"
 *   (repostClick)="onComment($event)"
 *   (shareClick)="onShare($event)"
 *   (bookmarkClick)="onBookmark($event)"
 *   (authorClick)="onAuthorClick($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import {
  type FeedPost,
  type FeedAuthor,
  type FeedPostTag,
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_POST_TYPE_COLORS,
  FEED_TAG_TYPE_ICONS,
  FEED_MAX_VISIBLE_TAGS,
} from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtImageComponent } from '../components/image';
import { NxtIconComponent } from '../components/icon';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-feed-post-card',
  standalone: true,
  imports: [CommonModule, IonRippleEffect, NxtAvatarComponent, NxtImageComponent, NxtIconComponent],
  template: `
    <!-- Repost Header -->
    @if (post().repostData) {
      <div class="feed-post__repost-header" (click)="handleRepostAuthorClick($event)">
        <nxt1-icon name="repeat" [size]="14" />
        <span>{{ post().repostData!.reposterName }} reposted</span>
      </div>
    }

    <article
      class="feed-post"
      [class.feed-post--featured]="post().isFeatured"
      [class.feed-post--pinned]="post().isPinned"
      role="article"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Media Preview (above header, like old NXT1 design) -->
      @if (hasMedia()) {
        <div class="feed-post__media" [class]="mediaGridClass()" (click)="handlePostClick($event)">
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
                  <nxt1-icon name="playCircle" [size]="48" />
                </div>
                @if (media.duration) {
                  <span class="feed-post__video-duration">{{
                    formatDuration(media.duration)
                  }}</span>
                }
              }
              @if (i === 3 && moreMediaCount() > 0) {
                <div class="feed-post__media-more">+{{ moreMediaCount() }}</div>
              }
            </div>
          }
        </div>
      }

      <!-- Post Header: Author Info + Type Badge -->
      @if (!hideAuthor()) {
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
                <nxt1-icon name="checkmarkCircle" [size]="16" class="feed-post__verified" />
              }
            </div>
            <div class="feed-post__author-meta">
              <span class="feed-post__time">{{ timeAgo() }}</span>
            </div>
          </div>

          <!-- Type Badge (next to author, right-aligned) -->
          @if (showTypeBadge()) {
            <div class="feed-post__type-badge" [style.--badge-color]="typeBadgeColor()">
              <nxt1-icon [name]="typeBadgeIcon()" [size]="14" />
              <span>{{ typeBadgeLabel() }}</span>
            </div>
          }

          <!-- Menu Button -->
          @if (showMenu()) {
            <button
              type="button"
              class="feed-post__menu-btn"
              (click)="handleMenuClick($event)"
              aria-label="Post options"
            >
              <nxt1-icon name="moreHorizontal" [size]="20" />
            </button>
          }
        </header>
      }

      <!-- Post Content (clickable) -->
      <div class="feed-post__content" (click)="handlePostClick($event)">
        <!-- Pinned Badge -->
        @if (post().isPinned) {
          <div class="feed-post__pinned-badge">
            <nxt1-icon name="pin" [size]="12" />
            <span>Pinned</span>
          </div>
        }

        <!-- Post Title (bold heading) -->
        @if (post().title) {
          <h3 class="feed-post__title">{{ post().title }}</h3>
        }

        <!-- Text Content / Description -->
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

        <!-- Post Tags / Attached Profile Data Chips -->
        @if (hasTags()) {
          <div class="feed-post__tags">
            @for (tag of visibleTags(); track tag.id) {
              <div class="feed-post__tag" [style.--tag-color]="tag.color || 'var(--post-primary)'">
                <nxt1-icon [name]="getTagIcon(tag.type)" [size]="14" />
                <span class="feed-post__tag-label">{{ tag.label }}</span>
              </div>
            }
            @if (hiddenTagCount() > 0) {
              <div class="feed-post__tag feed-post__tag--more">
                <span>+{{ hiddenTagCount() }} more</span>
              </div>
            }
          </div>
        }

        <!-- Location Tag -->
        @if (post().location) {
          <div class="feed-post__location">
            <nxt1-icon name="location" [size]="14" />
            <span>{{ post().location }}</span>
          </div>
        }
      </div>

      <!-- Engagement Stats Bar -->
      <div class="feed-post__stats">
        <div class="feed-post__stat">
          <nxt1-icon name="flame" [size]="14" />
          <span class="feed-post__stat-count">{{
            formatCount(post().engagement.reactionCount)
          }}</span>
          <span class="feed-post__stat-label">REACT</span>
        </div>
        <div class="feed-post__stat">
          <nxt1-icon name="repeat" [size]="14" />
          <span class="feed-post__stat-count">{{
            formatCount(post().engagement.repostCount)
          }}</span>
          <span class="feed-post__stat-label">REPOST</span>
        </div>
        <div class="feed-post__stat">
          <nxt1-icon name="share" [size]="14" />
          <span class="feed-post__stat-count">{{ formatCount(post().engagement.shareCount) }}</span>
          <span class="feed-post__stat-label">SHARES</span>
        </div>
        <div class="feed-post__stat">
          <nxt1-icon name="barChart" [size]="14" />
          <span class="feed-post__stat-count">{{ formatCount(post().engagement.viewCount) }}</span>
          <span class="feed-post__stat-label">VIEWS</span>
        </div>
      </div>

      <!-- View Profile Button -->
      @if (showViewProfile()) {
        <button type="button" class="feed-post__view-profile" (click)="handleAuthorClick($event)">
          <nxt1-icon name="link" [size]="16" />
          <span>VIEW PROFILE</span>
        </button>
      }
    </article>
  `,
  styles: [
    `
      /* ============================================
         FEED POST CARD - NXT1 2026 Design System
         Professional sports recruiting post card
         ============================================ */

      :host {
        display: block;

        --post-bg: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        --post-bg-hover: var(--nxt1-glass-bgSolid, rgba(20, 20, 20, 0.95));
        --post-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        --post-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --post-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --post-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --post-primary: var(--nxt1-color-primary, #d4ff00);
        --post-react-active: #ff6b35;
        --post-repost-active: var(--nxt1-color-primary, #d4ff00);
        --post-bookmark-active: var(--nxt1-color-primary, #d4ff00);
        --post-verified: var(--nxt1-color-info, #3b82f6);
      }

      /* ============================================
         REPOST HEADER
         ============================================ */

      .feed-post__repost-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px 4px;
        font-size: 12px;
        font-weight: 600;
        color: var(--post-repost-active);
        cursor: pointer;

        &:hover {
          text-decoration: underline;
        }
      }

      /* ============================================
         CARD SHELL
         ============================================ */

      .feed-post {
        position: relative;
        padding: 0;
        background: var(--post-bg);
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        box-shadow: var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        border: 1px solid var(--post-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: 12px;
        overflow: hidden;
        transition: background 0.2s ease;

        @media (min-width: 768px) {
          &:hover {
            background: var(--post-bg-hover);
          }
        }
      }

      .feed-post--featured {
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
         MEDIA (top of card, no padding)
         ============================================ */

      .feed-post__media {
        display: grid;
        gap: 2px;
        overflow: hidden;
      }

      .feed-post__media--single {
        grid-template-columns: 1fr;

        .feed-post__media-item {
          aspect-ratio: 16 / 9;
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
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
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

        nxt1-icon {
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
         HEADER (below media)
         ============================================ */

      .feed-post__header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px 0;
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
        font-weight: 700;
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
        margin-top: 1px;
        font-size: 12px;
        color: var(--post-text-tertiary);
      }

      .feed-post__time {
        white-space: nowrap;
      }

      /* Type badge (inline next to author, right side) */
      .feed-post__type-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        background: color-mix(in srgb, var(--badge-color, var(--post-primary)) 15%, transparent);
        border: 1px solid
          color-mix(in srgb, var(--badge-color, var(--post-primary)) 40%, transparent);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        color: var(--badge-color, var(--post-primary));
        text-transform: capitalize;
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: auto;
      }

      .feed-post__menu-btn {
        width: 32px;
        height: 32px;
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

        &:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--post-text-primary);
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .feed-post__content {
        cursor: pointer;
        padding: 10px 16px 0;
      }

      .feed-post__pinned-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--post-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }

      .feed-post__title {
        font-size: 17px;
        font-weight: 700;
        color: var(--post-text-primary);
        margin: 0 0 4px;
        line-height: 1.3;
      }

      .feed-post__text {
        font-size: 14px;
        line-height: 1.45;
        color: var(--post-text-secondary);
        margin: 0 0 8px;
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
        gap: 12px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--post-border);
        margin-bottom: 8px;
      }

      .feed-post__offer-logo,
      .feed-post__commitment-logo {
        width: 44px;
        height: 44px;
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
        font-size: 15px;
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
        font-size: 10px;
        font-weight: 700;
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
         TAGS / CHIPS (attached profile data)
         ============================================ */

      .feed-post__tags {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }

      .feed-post__tag {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        background: color-mix(in srgb, var(--tag-color, var(--post-primary)) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--tag-color, var(--post-primary)) 35%, transparent);
        border-radius: 16px;
        font-size: 12px;
        font-weight: 600;
        color: var(--tag-color, var(--post-primary));
        white-space: nowrap;

        nxt1-icon {
          opacity: 0.8;
        }
      }

      .feed-post__tag--more {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.12);
        color: var(--post-text-secondary);
        font-weight: 500;
        cursor: pointer;

        &:hover {
          background: rgba(255, 255, 255, 0.08);
        }
      }

      .feed-post__tag-label {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
         LOCATION
         ============================================ */

      .feed-post__location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--post-text-tertiary);
        margin-bottom: 4px;
      }

      /* ============================================
         ENGAGEMENT STATS BAR
         ============================================ */

      .feed-post__stats {
        display: flex;
        align-items: center;
        gap: 0;
        padding: 10px 16px;
        border-top: 1px solid var(--post-border);
        margin-top: 8px;
      }

      .feed-post__stat {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        justify-content: center;
        font-variant-numeric: tabular-nums;
        color: var(--post-text-secondary);
      }

      .feed-post__stat-count {
        font-size: 13px;
        font-weight: 700;
        color: var(--post-text-primary);
      }

      .feed-post__stat-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--post-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;

        @media (max-width: 480px) {
          display: none;
        }
      }

      /* ============================================
         VIEW PROFILE BUTTON
         ============================================ */

      .feed-post__view-profile {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: calc(100% - 32px);
        margin: 0 16px 12px;
        padding: 10px 20px;
        background: transparent;
        border: 1px solid color-mix(in srgb, var(--post-primary) 40%, transparent);
        border-radius: var(--nxt1-radius-md, 8px);
        color: var(--post-primary);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: color-mix(in srgb, var(--post-primary) 8%, transparent);
          border-color: var(--post-primary);
        }

        &:active {
          transform: scale(0.98);
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
  readonly hideAuthor = input(false);
  /** Show the "View Profile" button at the bottom */
  readonly showProfileLink = input(true);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<FeedPost>();
  readonly authorClick = output<FeedAuthor>();
  readonly reactClick = output<FeedPost>();
  readonly repostClick = output<FeedPost>();
  readonly shareClick = output<FeedPost>();
  readonly bookmarkClick = output<FeedPost>();
  readonly menuClick = output<FeedPost>();
  readonly viewProfileClick = output<FeedAuthor>();
  readonly repostAuthorClick = output<string>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly ariaLabel = computed(() => {
    const p = this.post();
    const label = p.title || p.content?.substring(0, 100) || p.type;
    return `Post by ${p.author.displayName}: ${label}`;
  });

  protected readonly timeAgo = computed(() => {
    return this.formatRelativeTime(this.post().createdAt);
  });

  protected readonly formattedContent = computed(() => {
    const content = this.post().content;
    if (!content) return '';

    return content
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  });

  protected readonly showTypeBadge = computed(() => {
    const type = this.post().type;
    // Show badge for all non-generic types
    return type !== 'text' && type !== 'repost';
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

  protected readonly hasTags = computed(() => {
    return (this.post().postTags?.length ?? 0) > 0;
  });

  protected readonly visibleTags = computed(() => {
    return (this.post().postTags ?? []).slice(0, FEED_MAX_VISIBLE_TAGS);
  });

  protected readonly hiddenTagCount = computed(() => {
    return Math.max(0, (this.post().postTags?.length ?? 0) - FEED_MAX_VISIBLE_TAGS);
  });

  protected readonly showViewProfile = computed(() => {
    return this.showProfileLink() && !this.hideAuthor();
  });

  // ============================================
  // HELPERS
  // ============================================

  protected getTagIcon(type: FeedPostTag['type']): string {
    return FEED_TAG_TYPE_ICONS[type] ?? 'sparkles';
  }

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

  protected async handleReactClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.reactClick.emit(this.post());
  }

  protected async handleRepostClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.repostClick.emit(this.post());
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

  protected async handleRepostAuthorClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    const reposterId = this.post().repostData?.reposterId;
    if (reposterId) {
      this.repostAuthorClick.emit(reposterId);
    }
  }

  // ============================================
  // FORMAT HELPERS
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
