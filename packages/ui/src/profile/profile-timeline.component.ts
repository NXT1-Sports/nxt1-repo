/**
 * @fileoverview Profile Timeline Component - Posts Feed
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Timeline content feed showing posts with filtering by type.
 * Supports loading states, empty states, and infinite scroll.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  heartOutline,
  heart,
  chatbubbleOutline,
  shareOutline,
  playCircle,
  playOutline,
  imageOutline,
  documentTextOutline,
  starOutline,
  newspaperOutline,
  statsChartOutline,
  trophyOutline,
  ellipsisHorizontal,
  pinOutline,
} from 'ionicons/icons';
import type { ProfilePost, ProfilePostType } from '@nxt1/core';
import { PROFILE_POST_TYPE_ICONS, PROFILE_POST_TYPE_LABELS } from '@nxt1/core';
import { ProfileSkeletonComponent } from './profile-skeleton.component';

// Register icons
addIcons({
  heartOutline,
  heart,
  chatbubbleOutline,
  shareOutline,
  playCircle,
  playOutline,
  imageOutline,
  documentTextOutline,
  starOutline,
  newspaperOutline,
  statsChartOutline,
  trophyOutline,
  ellipsisHorizontal,
  pinOutline,
});

@Component({
  selector: 'nxt1-profile-timeline',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner, ProfileSkeletonComponent],
  template: `
    <div class="profile-timeline">
      <!-- Loading State -->
      @if (isLoading()) {
        <div class="timeline-loading">
          @for (i of [1, 2, 3]; track i) {
            <nxt1-profile-skeleton variant="post" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="timeline-error">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <h3>Something went wrong</h3>
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="retry.emit()">Try Again</button>
        </div>
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <div class="timeline-empty">
          <div class="empty-icon">
            <ion-icon [name]="emptyIcon()"></ion-icon>
          </div>
          <h3 class="empty-title">{{ emptyTitle() }}</h3>
          <p class="empty-message">{{ emptyMessage() }}</p>
          @if (isOwnProfile() && emptyCta()) {
            <button class="empty-cta" (click)="emptyCtaClick.emit()">
              {{ emptyCta() }}
            </button>
          }
        </div>
      }

      <!-- Posts List -->
      @else {
        <div class="timeline-posts">
          @for (post of posts(); track post.id) {
            <article class="post-card" [class.post-card--pinned]="post.isPinned">
              <!-- Pinned Badge -->
              @if (post.isPinned) {
                <div class="pinned-badge">
                  <ion-icon name="pin-outline"></ion-icon>
                  <span>Pinned</span>
                </div>
              }

              <!-- Post Header -->
              <header class="post-header">
                <div class="post-type-badge" [attr.data-type]="post.type">
                  <ion-icon [name]="getPostTypeIcon(post.type)"></ion-icon>
                  <span>{{ getPostTypeLabel(post.type) }}</span>
                </div>
                <time class="post-time">{{ formatRelativeTime(post.createdAt) }}</time>
                @if (showMenu()) {
                  <button class="post-menu-btn" (click)="menuClick.emit(post)">
                    <ion-icon name="ellipsis-horizontal"></ion-icon>
                  </button>
                }
              </header>

              <!-- Post Content -->
              <div class="post-content" (click)="postClick.emit(post)">
                @if (post.title) {
                  <h3 class="post-title">{{ post.title }}</h3>
                }
                @if (post.body) {
                  <p class="post-body">{{ post.body }}</p>
                }

                <!-- Media -->
                @if (post.thumbnailUrl || post.mediaUrl) {
                  <div
                    class="post-media"
                    [class.post-media--video]="post.type === 'video' || post.type === 'highlight'"
                  >
                    <img
                      [src]="post.thumbnailUrl || post.mediaUrl"
                      [alt]="post.title || 'Post media'"
                      loading="lazy"
                    />
                    @if (post.type === 'video' || post.type === 'highlight') {
                      <div class="video-overlay">
                        <ion-icon name="play-circle"></ion-icon>
                        @if (post.duration) {
                          <span class="video-duration">{{ formatDuration(post.duration) }}</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Post Actions -->
              <footer class="post-actions">
                <button
                  class="action-btn"
                  [class.action-btn--active]="post.isLiked"
                  (click)="likeClick.emit(post)"
                >
                  <ion-icon [name]="post.isLiked ? 'heart' : 'heart-outline'"></ion-icon>
                  <span>{{ formatCount(post.likeCount) }}</span>
                </button>
                <button class="action-btn" (click)="commentClick.emit(post)">
                  <ion-icon name="chatbubble-outline"></ion-icon>
                  <span>{{ formatCount(post.commentCount) }}</span>
                </button>
                <button class="action-btn" (click)="shareClick.emit(post)">
                  <ion-icon name="share-outline"></ion-icon>
                  <span>{{ formatCount(post.shareCount) }}</span>
                </button>
                @if (post.viewCount !== undefined) {
                  <span class="view-count">
                    <ion-icon name="play-outline"></ion-icon>
                    {{ formatCount(post.viewCount) }} views
                  </span>
                }
              </footer>
            </article>
          }

          <!-- Load More -->
          @if (hasMore()) {
            <div class="load-more">
              @if (isLoadingMore()) {
                <ion-spinner name="crescent"></ion-spinner>
              } @else {
                <button class="load-more-btn" (click)="loadMore.emit()">Load More</button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROFILE TIMELINE - Posts Feed
       2026 Professional Native-Style Design
       ============================================ */

      :host {
        display: block;

        --timeline-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --timeline-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --timeline-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --timeline-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --timeline-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --timeline-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --timeline-primary: var(--nxt1-color-primary, #d4ff00);
        --timeline-error: var(--nxt1-color-error, #ff4444);
      }

      .profile-timeline {
        min-height: 200px;
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .timeline-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;

        ion-icon {
          font-size: 48px;
          color: var(--timeline-error);
          margin-bottom: 16px;
        }

        h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--timeline-text-primary);
          margin: 0 0 8px;
        }

        p {
          font-size: 14px;
          color: var(--timeline-text-secondary);
          margin: 0 0 20px;
        }
      }

      .retry-btn {
        padding: 10px 24px;
        background: var(--timeline-surface);
        border: 1px solid var(--timeline-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--timeline-text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .timeline-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
      }

      .empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--timeline-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;

        ion-icon {
          font-size: 36px;
          color: var(--timeline-text-tertiary);
        }
      }

      .empty-title {
        font-size: 20px;
        font-weight: 600;
        color: var(--timeline-text-primary);
        margin: 0 0 8px;
      }

      .empty-message {
        font-size: 15px;
        color: var(--timeline-text-secondary);
        margin: 0 0 24px;
        max-width: 300px;
      }

      .empty-cta {
        padding: 12px 32px;
        background: var(--timeline-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }

        &:active {
          transform: scale(0.97);
        }
      }

      /* ============================================
         POST CARD
         ============================================ */

      .post-card {
        padding: 16px 24px;
        border-bottom: 1px solid var(--timeline-border);
        transition: background 0.2s ease;

        @media (max-width: 768px) {
          padding: 14px 16px;
        }

        &:hover {
          background: var(--timeline-surface);
        }
      }

      .post-card--pinned {
        background: rgba(212, 255, 0, 0.02);
        border-left: 3px solid var(--timeline-primary);
      }

      .pinned-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--timeline-text-tertiary);
        margin-bottom: 8px;

        ion-icon {
          font-size: 14px;
        }
      }

      /* ============================================
         POST HEADER
         ============================================ */

      .post-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .post-type-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: var(--timeline-surface);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 500;
        color: var(--timeline-text-secondary);

        ion-icon {
          font-size: 14px;
        }

        &[data-type='video'],
        &[data-type='highlight'] {
          background: rgba(212, 255, 0, 0.1);
          color: var(--timeline-primary);
        }

        &[data-type='offer'] {
          background: rgba(74, 222, 128, 0.1);
          color: var(--nxt1-color-success, #4ade80);
        }
      }

      .post-time {
        font-size: 13px;
        color: var(--timeline-text-tertiary);
        margin-left: auto;
      }

      .post-menu-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: none;
        border: none;
        color: var(--timeline-text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;

        &:hover {
          background: var(--timeline-surface);
          color: var(--timeline-text-primary);
        }
      }

      /* ============================================
         POST CONTENT
         ============================================ */

      .post-content {
        cursor: pointer;
      }

      .post-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--timeline-text-primary);
        margin: 0 0 8px;
        line-height: 1.4;
      }

      .post-body {
        font-size: 15px;
        color: var(--timeline-text-secondary);
        margin: 0 0 12px;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* ============================================
         POST MEDIA
         ============================================ */

      .post-media {
        position: relative;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        margin-bottom: 12px;
        background: var(--timeline-surface);

        img {
          width: 100%;
          height: auto;
          max-height: 400px;
          object-fit: cover;
          display: block;
        }
      }

      .post-media--video {
        cursor: pointer;
      }

      .video-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.4);
        transition: background 0.2s ease;

        ion-icon {
          font-size: 64px;
          color: white;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
        }

        &:hover {
          background: rgba(0, 0, 0, 0.5);
        }
      }

      .video-duration {
        position: absolute;
        bottom: 12px;
        right: 12px;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.85);
        border-radius: 4px;
        font-size: 12px;
        color: white;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }

      /* ============================================
         POST ACTIONS
         ============================================ */

      .post-actions {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-top: 12px;
      }

      .action-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 0;
        background: none;
        border: none;
        color: var(--timeline-text-secondary);
        font-size: 14px;
        cursor: pointer;
        transition: color 0.2s ease;

        ion-icon {
          font-size: 20px;
        }

        &:hover {
          color: var(--timeline-text-primary);
        }
      }

      .action-btn--active {
        color: var(--timeline-error);

        &:hover {
          color: var(--timeline-error);
        }
      }

      .view-count {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
        font-size: 13px;
        color: var(--timeline-text-tertiary);

        ion-icon {
          font-size: 16px;
        }
      }

      /* ============================================
         LOAD MORE
         ============================================ */

      .load-more {
        display: flex;
        justify-content: center;
        padding: 24px;
      }

      .load-more-btn {
        padding: 12px 32px;
        background: var(--timeline-surface);
        border: 1px solid var(--timeline-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--timeline-text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--timeline-primary);
        }
      }

      ion-spinner {
        color: var(--timeline-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTimelineComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly posts = input<readonly ProfilePost[]>([]);
  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);
  readonly isOwnProfile = input(false);
  readonly showMenu = input(false);
  readonly emptyIcon = input('newspaper-outline');
  readonly emptyTitle = input('No posts yet');
  readonly emptyMessage = input('Start sharing your journey');
  readonly emptyCta = input<string | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<ProfilePost>();
  readonly likeClick = output<ProfilePost>();
  readonly commentClick = output<ProfilePost>();
  readonly shareClick = output<ProfilePost>();
  readonly menuClick = output<ProfilePost>();
  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly emptyCtaClick = output<void>();

  // ============================================
  // HELPERS
  // ============================================

  protected getPostTypeIcon(type: ProfilePostType): string {
    return PROFILE_POST_TYPE_ICONS[type] ?? 'document-text-outline';
  }

  protected getPostTypeLabel(type: ProfilePostType): string {
    return PROFILE_POST_TYPE_LABELS[type] ?? 'Post';
  }

  protected formatCount(count: number): string {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
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
