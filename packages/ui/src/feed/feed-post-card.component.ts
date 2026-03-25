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
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_MAX_VISIBLE_TAGS,
  feedOfferToContentCard,
  feedCommitmentToContentCard,
  feedVisitToContentCard,
  feedCampToContentCard,
} from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtImageComponent } from '../components/image';
import { NxtIconComponent } from '../components/icon';
import { NxtActivityCardComponent } from '../components/activity-card';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-feed-post-card',
  standalone: true,
  imports: [
    CommonModule,
    IonRippleEffect,
    NxtAvatarComponent,
    NxtImageComponent,
    NxtIconComponent,
    NxtActivityCardComponent,
  ],
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
      [class.feed-post--compact]="compact()"
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

      <!-- Compact Meta Bar: shown on profile pages where author is known (hideAuthor=true) -->
      @if (hideAuthor()) {
        <div class="feed-post__meta-bar">
          <!-- Left: type badge + timestamp -->
          <div class="feed-post__meta-bar-left">
            @if (showTypeBadge()) {
              <div class="feed-post__type-badge">
                <span>{{ typeBadgeLabel() }}</span>
              </div>
            }
            <span class="feed-post__time">{{ timeAgo() }}</span>
          </div>

          <!-- Right: menu only -->
          @if (showMenu()) {
            <button
              type="button"
              class="feed-post__menu-btn"
              (click)="handleMenuClick($event)"
              aria-label="Post options"
            >
              <nxt1-icon name="moreHorizontal" [size]="18" />
            </button>
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
            />
          </button>

          <!-- Author Details -->
          <div class="feed-post__author" (click)="handleAuthorClick($event)">
            <div class="feed-post__author-row">
              <span class="feed-post__author-name">{{ post().author.displayName }}</span>
            </div>
            <div class="feed-post__author-meta">
              <span class="feed-post__time">{{ timeAgo() }}</span>
            </div>
          </div>

          <!-- Type Badge (next to author, right-aligned) -->
          @if (showTypeBadge()) {
            <div class="feed-post__type-badge">
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

        <!-- Offer/Commitment Card (shared atom) -->
        @if (offerCard()) {
          <nxt1-activity-card [item]="offerCard()!" [compact]="compact()" />
        }

        @if (commitmentCard()) {
          <nxt1-activity-card [item]="commitmentCard()!" [compact]="compact()" />
        }

        <!-- Visit Card (shared atom) -->
        @if (visitCard()) {
          <nxt1-activity-card [item]="visitCard()!" [compact]="compact()" />
        }

        <!-- Camp/Combine/Showcase Card (shared atom) -->
        @if (campCard()) {
          <nxt1-activity-card [item]="campCard()!" [compact]="compact()" />
        }

        <!-- Stat Update Card (Hero style) -->
        @if (post().statUpdateData) {
          <div class="feed-post__stat-card">
            <div class="feed-post__stat-card-header">
              <nxt1-icon name="barChart" [size]="16" />
              <span class="feed-post__stat-card-context">{{ post().statUpdateData!.context }}</span>
              @if (post().statUpdateData!.gameResult) {
                <span
                  class="feed-post__stat-card-result"
                  [class.feed-post__stat-card-result--win]="
                    post().statUpdateData!.gameResult!.startsWith('W')
                  "
                >
                  {{ post().statUpdateData!.gameResult }}
                </span>
              }
            </div>
            <div class="feed-post__stat-grid">
              @for (stat of post().statUpdateData!.stats; track stat.label) {
                <div
                  class="feed-post__stat-cell"
                  [class.feed-post__stat-cell--highlight]="stat.isHighlight"
                >
                  <span class="feed-post__stat-value">{{ stat.value }}</span>
                  <span class="feed-post__stat-label-text">{{ stat.label }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Metrics Card (Combine/Measurables) -->
        @if (post().metricsData) {
          <div class="feed-post__metrics-card">
            <div class="feed-post__metrics-header">
              <nxt1-icon name="barbell" [size]="16" />
              <span>{{ post().metricsData!.category || post().metricsData!.source }}</span>
            </div>
            <div class="feed-post__metrics-grid">
              @for (metric of post().metricsData!.metrics; track metric.label) {
                <div class="feed-post__metric-cell">
                  <span class="feed-post__metric-value"
                    >{{ metric.value
                    }}<span class="feed-post__metric-unit">{{ metric.unit }}</span></span
                  >
                  <span class="feed-post__metric-label-text">{{ metric.label }}</span>
                  @if (metric.verified) {
                    <nxt1-icon
                      name="checkmarkCircle"
                      [size]="12"
                      class="feed-post__metric-verified"
                    />
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Award Card -->
        @if (post().awardData) {
          <div class="feed-post__award-card">
            <div class="feed-post__award-icon">
              <nxt1-icon [name]="post().awardData!.icon || 'trophy'" [size]="28" />
            </div>
            <div class="feed-post__award-info">
              <span class="feed-post__award-name">{{ post().awardData!.awardName }}</span>
              @if (post().awardData!.organization) {
                <span class="feed-post__award-org">{{ post().awardData!.organization }}</span>
              }
              @if (post().awardData!.season) {
                <span class="feed-post__award-season">{{ post().awardData!.season }}</span>
              }
            </div>
          </div>
        }

        <!-- News Article Card (SEO: rendered as <a> when URL present) -->
        @if (post().newsData) {
          @if (post().newsData!.articleUrl) {
            <a
              class="feed-post__news-card feed-post__news-card--link"
              [href]="post().newsData!.articleUrl"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="'Read article: ' + post().newsData!.headline"
              (click)="$event.stopPropagation()"
            >
              @if (post().newsData!.imageUrl) {
                <div class="feed-post__news-image">
                  <nxt1-image
                    [src]="post().newsData!.imageUrl!"
                    [alt]="post().newsData!.headline"
                    fit="cover"
                  />
                  @if (post().newsData!.category) {
                    <span class="feed-post__news-category">{{ post().newsData!.category }}</span>
                  }
                </div>
              }
              <div class="feed-post__news-body">
                <span class="feed-post__news-headline">{{ post().newsData!.headline }}</span>
                @if (post().newsData!.excerpt) {
                  <p class="feed-post__news-excerpt">{{ post().newsData!.excerpt }}</p>
                }
                <div class="feed-post__news-source">
                  @if (post().newsData!.sourceLogoUrl) {
                    <img
                      [src]="post().newsData!.sourceLogoUrl"
                      class="feed-post__news-source-logo"
                      alt=""
                    />
                  }
                  <span>{{ post().newsData!.source }}</span>
                </div>
              </div>
            </a>
          } @else {
            <div class="feed-post__news-card">
              @if (post().newsData!.imageUrl) {
                <div class="feed-post__news-image">
                  <nxt1-image
                    [src]="post().newsData!.imageUrl!"
                    [alt]="post().newsData!.headline"
                    fit="cover"
                  />
                  @if (post().newsData!.category) {
                    <span class="feed-post__news-category">{{ post().newsData!.category }}</span>
                  }
                </div>
              }
              <div class="feed-post__news-body">
                <span class="feed-post__news-headline">{{ post().newsData!.headline }}</span>
                @if (post().newsData!.excerpt) {
                  <p class="feed-post__news-excerpt">{{ post().newsData!.excerpt }}</p>
                }
                <div class="feed-post__news-source">
                  @if (post().newsData!.sourceLogoUrl) {
                    <img
                      [src]="post().newsData!.sourceLogoUrl"
                      class="feed-post__news-source-logo"
                      alt=""
                    />
                  }
                  <span>{{ post().newsData!.source }}</span>
                </div>
              </div>
            </div>
          }
        }

        <!-- Schedule / Game Card -->
        @if (post().scheduleData) {
          <div
            class="feed-post__schedule-card"
            [class.feed-post__schedule-card--live]="post().scheduleData!.status === 'live'"
          >
            <div class="feed-post__schedule-status">
              <span
                class="feed-post__schedule-badge"
                [class]="'feed-post__schedule-badge--' + post().scheduleData!.status"
              >
                {{ post().scheduleData!.status | uppercase }}
              </span>
            </div>
            <div class="feed-post__schedule-matchup">
              @if (post().scheduleData!.isHome !== undefined) {
                <span class="feed-post__schedule-ha">{{
                  post().scheduleData!.isHome ? 'HOME' : 'AWAY'
                }}</span>
              }
              <span class="feed-post__schedule-vs">vs</span>
              @if (post().scheduleData!.opponentLogoUrl) {
                <img
                  [src]="post().scheduleData!.opponentLogoUrl"
                  class="feed-post__schedule-opp-logo"
                  alt=""
                />
              }
              <span class="feed-post__schedule-opponent">{{ post().scheduleData!.opponent }}</span>
            </div>
            @if (post().scheduleData!.result) {
              <span
                class="feed-post__schedule-result"
                [class.feed-post__schedule-result--win]="
                  post().scheduleData!.result!.startsWith('W')
                "
              >
                {{ post().scheduleData!.result }}
              </span>
            }
            @if (post().scheduleData!.venue) {
              <span class="feed-post__schedule-venue">
                <nxt1-icon name="location" [size]="12" />
                {{ post().scheduleData!.venue }}
              </span>
            }
          </div>
        }

        <!-- External Source Badge (AI-Synced Content) -->
        @if (post().externalSource) {
          <div class="feed-post__external-source">
            @if (post().externalSource!.logoUrl) {
              <img [src]="post().externalSource!.logoUrl" class="feed-post__external-logo" alt="" />
            } @else {
              <nxt1-icon [name]="externalSourceIconName()" [size]="14" />
            }
            <span>{{ post().externalSource!.label }}</span>
          </div>
        }

        <!-- Post Tags / Attached Profile Data Chips -->
        @if (hasTags()) {
          <div class="feed-post__tags">
            @for (tag of visibleTags(); track tag.id) {
              <div class="feed-post__tag">
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
         Professional sports intelligence post card
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
         COMPACT META BAR (shown when hideAuthor=true)
         Type badge + timestamp — Twitter/Instagram profile pattern
         ============================================ */

      .feed-post__meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 0;
        gap: 8px;
      }

      .feed-post__meta-bar-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;

        .feed-post__time {
          font-size: 12px;
          color: var(--post-text-tertiary);
          white-space: nowrap;
        }
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

      .feed-post--compact {
        border-radius: 12px;
      }

      .feed-post--compact .feed-post__repost-header {
        padding: 6px 10px;
        font-size: 11px;
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

      .feed-post--compact .feed-post__media--single .feed-post__media-item {
        aspect-ratio: 3;
      }

      .feed-post--compact .feed-post__media--double .feed-post__media-item {
        aspect-ratio: 1.5;
      }

      .feed-post--compact .feed-post__media--grid .feed-post__media-item {
        aspect-ratio: 1.5;
      }

      .feed-post--compact .feed-post__video-duration {
        bottom: 4px;
        right: 4px;
        padding: 2px 6px;
        font-size: 10px;
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

      .feed-post--compact .feed-post__header {
        gap: 6px;
        padding: 8px 10px 0;
      }

      .feed-post--compact .feed-post__avatar-btn nxt1-avatar {
        --avatar-size: 28px;
      }

      .feed-post--compact .feed-post__author-name {
        font-size: 13px;
        font-weight: 600;
      }

      .feed-post--compact .feed-post__author-meta {
        font-size: 11px;
        margin-top: 0;
      }

      .feed-post--compact .feed-post__type-badge {
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 600;
        box-shadow: none;
      }

      .feed-post--compact .feed-post__menu-btn {
        width: 26px;
        height: 26px;
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
        gap: 0;
        padding: 6px 12px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--post-bg) 80%, var(--post-primary) 20%) 0%,
          color-mix(in srgb, var(--post-bg) 86%, var(--post-primary) 14%) 100%
        );
        border: 1px solid color-mix(in srgb, var(--post-primary) 48%, transparent);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--post-primary) 22%, transparent),
          0 6px 14px rgba(0, 0, 0, 0.2);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--post-text-primary);
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

      .feed-post--compact .feed-post__content {
        padding: 4px 10px 0;
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

      .feed-post--compact .feed-post__title {
        font-size: 14px;
        margin-bottom: 1px;
        line-height: 1.25;
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

      .feed-post--compact .feed-post__text {
        font-size: 12px;
        line-height: 1.35;
        margin-bottom: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Compact: Stat/Metrics/Award cards */
      .feed-post--compact .feed-post__stat-card,
      .feed-post--compact .feed-post__metrics-card,
      .feed-post--compact .feed-post__award-card {
        padding: 8px;
        gap: 8px;
        margin-bottom: 4px;
      }

      .feed-post--compact .feed-post__award-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
      }

      .feed-post--compact .feed-post__award-name {
        font-size: 13px;
      }

      .feed-post--compact .feed-post__stat-value,
      .feed-post--compact .feed-post__metric-value {
        font-size: 15px;
      }

      .feed-post--compact .feed-post__news-image {
        aspect-ratio: 2.5 / 1;
      }

      .feed-post--compact .feed-post__news-body {
        padding: 8px 10px;
      }

      .feed-post--compact .feed-post__news-headline {
        font-size: 13px;
        margin-bottom: 2px;
      }

      .feed-post--compact .feed-post__news-excerpt {
        font-size: 12px;
        margin-bottom: 4px;
        -webkit-line-clamp: 1;
      }

      .feed-post--compact .feed-post__schedule-card {
        padding: 8px;
        gap: 4px;
        margin-bottom: 4px;
      }

      .feed-post--compact .feed-post__tags {
        gap: 4px;
        margin-bottom: 4px;
      }

      .feed-post--compact .feed-post__tag {
        padding: 3px 8px;
        font-size: 10px;
      }

      .feed-post--compact .feed-post__external-source {
        padding: 3px 8px;
        font-size: 10px;
        margin-bottom: 4px;
      }

      /* Offer/Commitment/Activity card styles now live in
         NxtActivityCardComponent (@nxt1/ui/components/activity-card) */

      /* ============================================
         STAT UPDATE CARD (Hero Style)
         ============================================ */

      .feed-post__stat-card {
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--post-border);
        margin-bottom: 8px;
      }

      .feed-post__stat-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: var(--post-text-secondary);
        font-size: 13px;
        font-weight: 600;
      }

      .feed-post__stat-card-context {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .feed-post__stat-card-result {
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 4px;
        color: var(--post-text-primary);
        background: rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }

      .feed-post__stat-card-result--win {
        background: color-mix(in srgb, #4ade80 15%, transparent);
        color: #4ade80;
      }

      .feed-post__stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
        gap: 4px;
      }

      .feed-post__stat-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 4px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
      }

      .feed-post__stat-cell--highlight {
        background: color-mix(in srgb, var(--post-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--post-primary) 30%, transparent);
      }

      .feed-post__stat-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--post-text-primary);
        font-variant-numeric: tabular-nums;
      }

      .feed-post__stat-label-text {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--post-text-tertiary);
      }

      /* ============================================
         METRICS CARD (Combine/Measurables)
         ============================================ */

      .feed-post__metrics-card {
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--post-border);
        margin-bottom: 8px;
      }

      .feed-post__metrics-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 13px;
        font-weight: 600;
        color: var(--post-text-secondary);
      }

      .feed-post__metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;

        @media (min-width: 480px) {
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        }
      }

      .feed-post__metric-cell {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 4px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
      }

      .feed-post__metric-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--post-text-primary);
        font-variant-numeric: tabular-nums;
      }

      .feed-post__metric-unit {
        font-size: 11px;
        font-weight: 500;
        color: var(--post-text-tertiary);
        margin-left: 1px;
      }

      .feed-post__metric-label-text {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--post-text-tertiary);
      }

      .feed-post__metric-verified {
        position: absolute;
        top: 4px;
        right: 4px;
        color: var(--post-verified);
      }

      /* ============================================
         AWARD CARD
         ============================================ */

      .feed-post__award-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, #fbbf24 8%, transparent),
          color-mix(in srgb, #f59e0b 3%, transparent)
        );
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid color-mix(in srgb, #fbbf24 25%, transparent);
        margin-bottom: 8px;
      }

      .feed-post__award-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: color-mix(in srgb, #fbbf24 15%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fbbf24;
        flex-shrink: 0;
      }

      .feed-post__award-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .feed-post__award-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--post-text-primary);
      }

      .feed-post__award-org {
        font-size: 13px;
        color: var(--post-text-secondary);
      }

      .feed-post__award-season {
        font-size: 12px;
        color: var(--post-text-tertiary);
      }

      /* ============================================
         NEWS CARD (Article embed)
         ============================================ */

      .feed-post__news-card {
        display: block;
        overflow: hidden;
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--post-border);
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.03);
        text-decoration: none;
        color: inherit;
      }

      .feed-post__news-card--link {
        cursor: pointer;
        transition: border-color 0.2s ease;

        &:hover {
          border-color: color-mix(in srgb, var(--post-primary) 40%, transparent);
        }

        &:hover .feed-post__news-headline {
          color: var(--post-primary);
        }
      }

      .feed-post__news-image {
        position: relative;
        width: 100%;
        aspect-ratio: 2 / 1;
        overflow: hidden;

        nxt1-image {
          width: 100%;
          height: 100%;
        }
      }

      .feed-post__news-category {
        position: absolute;
        top: 8px;
        left: 8px;
        padding: 3px 10px;
        background: rgba(0, 0, 0, 0.7);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--post-primary);
      }

      .feed-post__news-body {
        padding: 12px;
      }

      .feed-post__news-headline {
        display: block;
        font-size: 15px;
        font-weight: 700;
        color: var(--post-text-primary);
        line-height: 1.3;
        margin-bottom: 4px;
      }

      .feed-post__news-excerpt {
        font-size: 13px;
        line-height: 1.4;
        color: var(--post-text-secondary);
        margin: 0 0 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .feed-post__news-source {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--post-text-tertiary);
        font-weight: 500;
      }

      .feed-post__news-source-logo {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
      }

      /* ============================================
         SCHEDULE / GAME CARD
         ============================================ */

      .feed-post__schedule-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--post-border);
        margin-bottom: 8px;
      }

      .feed-post__schedule-card--live {
        border-color: color-mix(in srgb, #ef4444 40%, transparent);
        background: color-mix(in srgb, #ef4444 5%, transparent);
      }

      .feed-post__schedule-status {
        display: flex;
        align-items: center;
      }

      .feed-post__schedule-badge {
        padding: 3px 10px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
      }

      .feed-post__schedule-badge--upcoming {
        background: color-mix(in srgb, #3b82f6 15%, transparent);
        color: #3b82f6;
      }

      .feed-post__schedule-badge--live {
        background: color-mix(in srgb, #ef4444 15%, transparent);
        color: #ef4444;
        animation: livePulse 2s infinite;
      }

      .feed-post__schedule-badge--final {
        background: rgba(255, 255, 255, 0.06);
        color: var(--post-text-secondary);
      }

      .feed-post__schedule-badge--postponed,
      .feed-post__schedule-badge--cancelled {
        background: color-mix(in srgb, #f59e0b 15%, transparent);
        color: #f59e0b;
      }

      @keyframes livePulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.7;
        }
      }

      .feed-post__schedule-matchup {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--post-text-primary);
      }

      .feed-post__schedule-ha {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--post-text-tertiary);
        padding: 2px 8px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 4px;
      }

      .feed-post__schedule-vs {
        font-size: 12px;
        color: var(--post-text-tertiary);
        font-weight: 500;
      }

      .feed-post__schedule-opp-logo {
        width: 24px;
        height: 24px;
        object-fit: contain;
        border-radius: 4px;
      }

      .feed-post__schedule-opponent {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .feed-post__schedule-result {
        font-size: 14px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--post-text-primary);
      }

      .feed-post__schedule-result--win {
        background: color-mix(in srgb, #4ade80 15%, transparent);
        color: #4ade80;
      }

      .feed-post__schedule-venue {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--post-text-tertiary);
      }

      /* ============================================
         EXTERNAL SOURCE BADGE
         ============================================ */

      .feed-post__external-source {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--post-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 500;
        color: var(--post-text-tertiary);
        margin-bottom: 8px;
      }

      .feed-post__external-logo {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        object-fit: contain;
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
        gap: 0;
        padding: 6px 12px;
        background: color-mix(in srgb, var(--post-bg) 82%, var(--post-primary) 18%);
        border: 1px solid color-mix(in srgb, var(--post-primary) 55%, transparent);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--post-primary) 28%, transparent),
          0 6px 14px rgba(0, 0, 0, 0.22);
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--post-text-primary);
        white-space: nowrap;
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
        max-width: 140px;
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

      .feed-post--compact .feed-post__stats {
        padding: 6px 10px;
        margin-top: 4px;
      }

      .feed-post--compact .feed-post__stat-count {
        font-size: 12px;
      }

      .feed-post--compact .feed-post__stat-label {
        font-size: 9px;
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

      .feed-post--compact .feed-post__view-profile {
        width: calc(100% - 20px);
        margin: 0 10px 8px;
        padding: 6px 12px;
        font-size: 11px;
        letter-spacing: 0.8px;
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
  readonly compact = input(false);
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
    return FEED_POST_TYPE_ICONS[this.post().type] ?? 'documentText';
  });

  protected readonly typeBadgeLabel = computed(() => {
    return FEED_POST_TYPE_LABELS[this.post().type] ?? 'Post';
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
  // CONTENT CARD ATOMS (unified activity data)
  // ============================================

  /** Offer data → shared ContentCardItem */
  protected readonly offerCard = computed(() => {
    const data = this.post().offerData;
    return data ? feedOfferToContentCard(data) : null;
  });

  /** Commitment data → shared ContentCardItem */
  protected readonly commitmentCard = computed(() => {
    const data = this.post().commitmentData;
    return data ? feedCommitmentToContentCard(data) : null;
  });

  /** Visit data → shared ContentCardItem */
  protected readonly visitCard = computed(() => {
    const data = this.post().visitData;
    return data ? feedVisitToContentCard(data) : null;
  });

  /** Camp data → shared ContentCardItem */
  protected readonly campCard = computed(() => {
    const data = this.post().campData;
    return data ? feedCampToContentCard(data) : null;
  });

  protected externalSourceIconName(): string {
    const source = this.post().externalSource;
    const rawIcon = source?.icon?.trim().toLowerCase();

    if (!rawIcon) {
      return 'link';
    }

    const normalizedIconMap: Record<string, string> = {
      'stats-chart': 'stats-chart-outline',
      'bar-chart': 'bar-chart-outline',
      maxpreps: 'stats-chart-outline',
      hudl: 'play-circle-outline',
      '247sports': 'newspaper-outline',
      espn: 'newspaper-outline',
      on3: 'newspaper-outline',
      rivals: 'newspaper-outline',
    };

    return normalizedIconMap[rawIcon] ?? source?.icon ?? 'link';
  }

  // ============================================
  // HELPERS
  // ============================================

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
}
