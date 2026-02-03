/**
 * @fileoverview News Article Card Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Professional news article card following modern sports news app patterns.
 * Features hero image, category badge, headline, excerpt, and metadata.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Hero image with 16:9 aspect ratio (lazy loading)
 * - Category chip with color coding
 * - 2-line clamped headline
 * - 3-line clamped excerpt
 * - Metadata bar: AI agent avatar, time ago, reading time
 * - Animated bookmark button
 * - XP reward badge
 * - Haptic feedback on tap
 * - Breaking news indicator
 *
 * @example
 * ```html
 * <nxt1-news-article-card
 *   [article]="article"
 *   (articleClick)="onArticleClick($event)"
 *   (bookmarkClick)="onBookmark($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookmarkOutline,
  bookmark,
  timeOutline,
  eyeOutline,
  flashOutline,
  sparklesOutline,
  shareOutline,
} from 'ionicons/icons';
import { type NewsArticle, NEWS_CATEGORY_BG_COLORS, NEWS_CATEGORIES } from '@nxt1/core';
import { NxtImageComponent } from '../components/image';
import { NxtAvatarComponent } from '../components/avatar';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  bookmarkOutline,
  bookmark,
  timeOutline,
  eyeOutline,
  flashOutline,
  sparklesOutline,
  shareOutline,
});

@Component({
  selector: 'nxt1-news-article-card',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, NxtImageComponent, NxtAvatarComponent],
  template: `
    <article
      class="news-card"
      [class.news-card--featured]="article().isFeatured"
      [class.news-card--breaking]="article().isBreaking"
      [class.news-card--read]="article().isRead"
      (click)="handleCardClick($event)"
      role="article"
      [attr.aria-label]="ariaLabel()"
      tabindex="0"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Hero Image Section -->
      <div class="news-card__image-wrapper">
        <nxt1-image
          [src]="article().thumbnailUrl || article().heroImageUrl || ''"
          [alt]="article().title"
          class="news-card__image"
          fit="cover"
        />

        <!-- Category Badge (top-left) -->
        <div class="news-card__category-badge" [style.background]="categoryColor()">
          <ion-icon [name]="categoryIcon()"></ion-icon>
          <span>{{ categoryLabel() }}</span>
        </div>

        <!-- Breaking News Indicator -->
        @if (article().isBreaking) {
          <div class="news-card__breaking-badge">
            <ion-icon name="flash-outline"></ion-icon>
            <span>Breaking</span>
          </div>
        }

        <!-- XP Reward Badge (top-right) -->
        @if (article().xpReward > 0 && !article().isRead) {
          <div class="news-card__xp-badge">
            <ion-icon name="sparkles-outline"></ion-icon>
            <span>+{{ article().xpReward }} XP</span>
          </div>
        }
      </div>

      <!-- Content Section -->
      <div class="news-card__content">
        <!-- Headline -->
        <h3 class="news-card__title">{{ article().title }}</h3>

        <!-- Excerpt -->
        <p class="news-card__excerpt">{{ article().excerpt }}</p>

        <!-- Metadata Bar -->
        <div class="news-card__meta">
          <!-- Source Avatar & Name -->
          <div class="news-card__source">
            <nxt1-avatar
              [src]="article().source.avatarUrl"
              [name]="article().source.name"
              size="xs"
            />
            <span class="news-card__source-name">{{ article().source.name }}</span>
            @if (article().source.isVerified) {
              <ion-icon name="checkmark-circle" class="news-card__verified"></ion-icon>
            }
          </div>

          <!-- Time & Reading Time -->
          <div class="news-card__time-info">
            <span class="news-card__time-ago">{{ timeAgo() }}</span>
            <span class="news-card__separator">·</span>
            <ion-icon name="time-outline"></ion-icon>
            <span>{{ article().readingTimeMinutes }} min</span>
          </div>
        </div>

        <!-- View Count (optional, for trending) -->
        @if (article().viewCount > 1000) {
          <div class="news-card__stats">
            <ion-icon name="eye-outline"></ion-icon>
            <span>{{ formatViewCount() }}</span>
          </div>
        }
      </div>

      <!-- Actions Section -->
      <div class="news-card__actions">
        <!-- Bookmark Button -->
        <button
          type="button"
          class="news-card__action-btn news-card__bookmark-btn"
          [class.news-card__bookmark-btn--active]="article().isBookmarked"
          (click)="handleBookmarkClick($event)"
          [attr.aria-label]="article().isBookmarked ? 'Remove bookmark' : 'Bookmark article'"
          [attr.aria-pressed]="article().isBookmarked"
        >
          <ion-icon [name]="article().isBookmarked ? 'bookmark' : 'bookmark-outline'"></ion-icon>
        </button>

        <!-- Share Button -->
        <button
          type="button"
          class="news-card__action-btn"
          (click)="handleShareClick($event)"
          aria-label="Share article"
        >
          <ion-icon name="share-outline"></ion-icon>
        </button>
      </div>
    </article>
  `,
  styles: [
    `
      /* ============================================
         NEWS ARTICLE CARD - Professional Sports News Layout
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
      }

      /* Card Container */
      .news-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-lg, 16px);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .news-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }

      .news-card:active {
        transform: scale(0.98);
      }

      .news-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* Read state - subtle dimming */
      .news-card--read {
        opacity: 0.75;
      }

      .news-card--read:hover {
        opacity: 1;
      }

      /* ============================================
         IMAGE SECTION
         ============================================ */

      .news-card__image-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
      }

      .news-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* Category Badge */
      .news-card__category-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-onPrimary, #000);
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      .news-card__category-badge ion-icon {
        font-size: 12px;
      }

      /* Breaking News Badge */
      .news-card__breaking-badge {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        background: var(--nxt1-color-feedback-error, #ef4444);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: white;
        animation: pulse-breaking 2s infinite;
      }

      @keyframes pulse-breaking {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.8;
        }
      }

      /* XP Reward Badge */
      .news-card__xp-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-onPrimary, #000);
        box-shadow: 0 2px 8px rgba(204, 255, 0, 0.3);
      }

      .news-card__xp-badge ion-icon {
        font-size: 12px;
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .news-card__content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }

      /* Title */
      .news-card__title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--nxt1-color-text-primary, #fff);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Excerpt */
      .news-card__excerpt {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Metadata Bar */
      .news-card__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .news-card__source {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .news-card__source-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .news-card__verified {
        font-size: 14px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-card__time-info {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .news-card__time-info ion-icon {
        font-size: 14px;
      }

      .news-card__separator {
        margin: 0 2px;
      }

      /* Stats */
      .news-card__stats {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .news-card__stats ion-icon {
        font-size: 14px;
      }

      /* ============================================
         ACTIONS SECTION
         ============================================ */

      .news-card__actions {
        display: flex;
        justify-content: flex-end;
        gap: 4px;
        padding: 0 12px 12px;
      }

      .news-card__action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .news-card__action-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .news-card__action-btn ion-icon {
        font-size: 20px;
      }

      /* Bookmark Active State */
      .news-card__bookmark-btn--active {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-card__bookmark-btn--active:hover {
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* Bookmark Animation */
      .news-card__bookmark-btn--active ion-icon {
        animation: bookmark-pop 0.3s ease;
      }

      @keyframes bookmark-pop {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.3);
        }
        100% {
          transform: scale(1);
        }
      }

      /* ============================================
         FEATURED VARIANT
         ============================================ */

      .news-card--featured {
        border-color: var(--nxt1-color-primary, #ccff00);
        border-width: 2px;
      }

      .news-card--featured .news-card__image-wrapper {
        aspect-ratio: 2 / 1;
      }

      .news-card--featured .news-card__title {
        font-size: 18px;
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 480px) {
        .news-card__content {
          padding: 12px;
        }

        .news-card__title {
          font-size: 15px;
        }

        .news-card__excerpt {
          font-size: 13px;
          -webkit-line-clamp: 2;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsArticleCardComponent {
  private readonly haptics = inject(HapticsService);

  /** Article data to display */
  readonly article = input.required<NewsArticle>();

  /** Emitted when card is clicked */
  readonly articleClick = output<NewsArticle>();

  /** Emitted when bookmark button is clicked */
  readonly bookmarkClick = output<NewsArticle>();

  /** Emitted when share button is clicked */
  readonly shareClick = output<NewsArticle>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly categoryLabel = computed(() => {
    const category = NEWS_CATEGORIES.find((c) => c.id === this.article().category);
    return category?.label || this.article().category;
  });

  protected readonly categoryIcon = computed(() => {
    const category = NEWS_CATEGORIES.find((c) => c.id === this.article().category);
    return category?.icon || 'newspaper-outline';
  });

  protected readonly categoryColor = computed(() => {
    return NEWS_CATEGORY_BG_COLORS[this.article().category] || 'var(--nxt1-color-surface-300)';
  });

  protected readonly timeAgo = computed(() => {
    const date = new Date(this.article().publishedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  protected readonly ariaLabel = computed(() => {
    const article = this.article();
    return `${article.title}. ${article.excerpt}. Published ${this.timeAgo()}. ${article.readingTimeMinutes} minute read.`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleCardClick(event: Event): Promise<void> {
    // Don't trigger if clicking action buttons
    const target = event.target as HTMLElement;
    if (target.closest('.news-card__actions')) return;

    await this.haptics.impact('light');
    this.articleClick.emit(this.article());
  }

  protected async handleBookmarkClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.bookmarkClick.emit(this.article());
  }

  protected async handleShareClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.shareClick.emit(this.article());
  }

  protected formatViewCount(): string {
    const count = this.article().viewCount;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  }
}
