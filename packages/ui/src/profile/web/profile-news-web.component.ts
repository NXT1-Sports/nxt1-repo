/**
 * @fileoverview Profile News Web Component
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Web-optimized news section for the Profile page.
 * Uses mock data for development — pure Tailwind CSS, zero Ionic, SSR-safe.
 *
 * Features:
 * - Responsive article card grid (1 → 2 → 3 columns)
 * - Hero image with lazy loading
 * - Category badge with color coding
 * - Reading time and view count metadata
 * - Bookmark icon, XP badge, Breaking indicator
 * - Empty state for filtered views
 * - Skeleton loading state
 *
 * ⭐ WEB ONLY — Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  OnInit,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtAvatarComponent } from '../../components/avatar';
import {
  type NewsArticle,
  type NewsCategoryId,
  NEWS_CATEGORIES,
  NEWS_CATEGORY_BG_COLORS,
} from '@nxt1/core';
import { MOCK_NEWS_ARTICLES } from '../../news/news.mock-data';

// ============================================
// HELPER: Format view count (e.g., 2.8K)
// ============================================

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

@Component({
  selector: 'nxt1-profile-news-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent, NxtAvatarComponent],
  template: `
    <section class="profile-news" aria-labelledby="news-heading">
      <h2 id="news-heading" class="sr-only">News</h2>

      <!-- Loading Skeleton -->
      @if (isLoading()) {
        <div class="profile-news__grid" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="news-card-skeleton">
              <div class="news-card-skeleton__image"></div>
              <div class="news-card-skeleton__body">
                <div class="news-card-skeleton__badge"></div>
                <div class="news-card-skeleton__title"></div>
                <div class="news-card-skeleton__title news-card-skeleton__title--short"></div>
                <div class="news-card-skeleton__excerpt"></div>
                <div class="news-card-skeleton__excerpt news-card-skeleton__excerpt--short"></div>
                <div class="news-card-skeleton__meta"></div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @else if (filteredArticles().length === 0) {
        <div class="profile-news__empty" role="status">
          <div class="profile-news__empty-icon" aria-hidden="true">
            <nxt1-icon name="newspaper" [size]="48" />
          </div>
          <h3 class="profile-news__empty-title">{{ emptyTitle() }}</h3>
          <p class="profile-news__empty-msg">{{ emptyMessage() }}</p>
        </div>
      }

      <!-- Article Grid -->
      @else {
        <div class="profile-news__grid">
          @for (article of filteredArticles(); track article.id) {
            <article
              class="news-card"
              [class.news-card--featured]="article.isFeatured"
              [class.news-card--breaking]="!!article.isBreaking"
              [class.news-card--read]="article.isRead"
              (click)="onArticleClick(article)"
              role="article"
              [attr.aria-label]="article.title"
              tabindex="0"
            >
              <!-- Hero Image -->
              <div class="news-card__image-wrap">
                <nxt1-image
                  [src]="article.thumbnailUrl || article.heroImageUrl || ''"
                  [alt]="article.title"
                  class="news-card__image"
                  fit="cover"
                />

                <!-- Category Badge (top-left) -->
                <span
                  class="news-card__category"
                  [style.background]="getCategoryColor(article.category)"
                >
                  {{ getCategoryLabel(article.category) }}
                </span>

                <!-- Breaking Badge -->
                @if (article.isBreaking) {
                  <span class="news-card__breaking">
                    <nxt1-icon name="bolt" [size]="12" />
                    Breaking
                  </span>
                }

                <!-- XP Badge (top-right) -->
                @if (article.xpReward > 0 && !article.isRead) {
                  <span class="news-card__xp">
                    <nxt1-icon name="sparkles" [size]="12" />
                    +{{ article.xpReward }} XP
                  </span>
                }
              </div>

              <!-- Content -->
              <div class="news-card__body">
                <h3 class="news-card__title">{{ article.title }}</h3>
                <p class="news-card__excerpt">{{ article.excerpt }}</p>

                <!-- Metadata Row -->
                <div class="news-card__meta">
                  <div class="news-card__source">
                    <nxt1-avatar
                      [src]="article.source.avatarUrl"
                      [name]="article.source.name"
                      size="xs"
                    />
                    <span class="news-card__source-name">{{ article.source.name }}</span>
                    @if (article.source.isVerified) {
                      <nxt1-icon name="checkmarkCircle" [size]="14" class="news-card__verified" />
                    }
                  </div>
                  <div class="news-card__stats">
                    <span class="news-card__stat">
                      <nxt1-icon name="time" [size]="12" />
                      {{ article.readingTimeMinutes }}m
                    </span>
                    <span class="news-card__stat">
                      <nxt1-icon name="eye" [size]="12" />
                      {{ formatViewCount(article.viewCount) }}
                    </span>
                  </div>
                </div>

                <!-- Bookmark -->
                <button
                  type="button"
                  class="news-card__bookmark"
                  [class.news-card__bookmark--active]="article.isBookmarked"
                  [attr.aria-label]="article.isBookmarked ? 'Remove bookmark' : 'Bookmark article'"
                  (click)="onBookmarkClick($event, article)"
                >
                  <nxt1-icon
                    [name]="article.isBookmarked ? 'bookmark' : 'bookmarkOutline'"
                    [size]="18"
                  />
                </button>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ============================================
         PROFILE NEWS WEB — Pure Tailwind/CSS
         ============================================ */

      :host {
        display: block;
      }

      .profile-news {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* ── Article Grid ── */
      .profile-news__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        padding: 0 4px;
      }

      @media (min-width: 640px) {
        .profile-news__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .profile-news__grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ── Article Card ── */
      .news-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-100, #141414);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;
      }

      .news-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .news-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .news-card--featured {
        border-color: rgba(204, 255, 0, 0.2);
      }

      .news-card--featured:hover {
        border-color: rgba(204, 255, 0, 0.4);
      }

      .news-card--read {
        opacity: 0.7;
      }

      .news-card--read:hover {
        opacity: 1;
      }

      /* ── Card Image ── */
      .news-card__image-wrap {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }

      .news-card__image-wrap :host ::ng-deep nxt1-image,
      .news-card__image-wrap ::ng-deep nxt1-image {
        width: 100%;
        height: 100%;
      }

      .news-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ── Category Badge ── */
      .news-card__category {
        position: absolute;
        top: 8px;
        left: 8px;
        padding: 3px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: #fff;
        line-height: 1.4;
        backdrop-filter: blur(4px);
      }

      /* ── Breaking Badge ── */
      .news-card__breaking {
        position: absolute;
        bottom: 8px;
        left: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-feedback-error, #ef4444);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #fff;
        animation: pulse-glow 2s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%,
        100% {
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
        }
        50% {
          box-shadow: 0 0 14px rgba(239, 68, 68, 0.7);
        }
      }

      /* ── XP Badge ── */
      .news-card__xp {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 3px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.2) 0%,
          rgba(204, 255, 0, 0.08) 100%
        );
        border: 1px solid rgba(204, 255, 0, 0.3);
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
        backdrop-filter: blur(4px);
      }

      /* ── Card Body ── */
      .news-card__body {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        flex: 1;
      }

      .news-card__title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
        padding-right: 28px;
      }

      .news-card__excerpt {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
      }

      /* ── Metadata Row ── */
      .news-card__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: auto;
        padding-top: 8px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.04));
      }

      .news-card__source {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .news-card__source-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .news-card__verified {
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .news-card__stats {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }

      .news-card__stat {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ── Bookmark Button ── */
      .news-card__bookmark {
        position: absolute;
        top: 12px;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        cursor: pointer;
        border-radius: var(--nxt1-radius-full, 9999px);
        transition:
          color 0.15s ease,
          background 0.15s ease;
      }

      .news-card__bookmark:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .news-card__bookmark--active {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-card__bookmark--active:hover {
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ── Empty State ── */
      .profile-news__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px 24px;
        text-align: center;
      }

      .profile-news__empty-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
        margin-bottom: 4px;
      }

      .profile-news__empty-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
      }

      .profile-news__empty-msg {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        max-width: 360px;
        margin: 0;
        line-height: 1.5;
      }

      /* ── Skeleton Loading ── */
      .news-card-skeleton {
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-100, #141414);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        overflow: hidden;
      }

      .news-card-skeleton__image {
        aspect-ratio: 16 / 9;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .news-card-skeleton__body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .news-card-skeleton__badge {
        width: 60px;
        height: 18px;
        border-radius: 9999px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        animation: skeleton-pulse 1.5s ease-in-out 0.1s infinite;
      }

      .news-card-skeleton__title {
        width: 90%;
        height: 16px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        animation: skeleton-pulse 1.5s ease-in-out 0.2s infinite;
      }

      .news-card-skeleton__title--short {
        width: 60%;
      }

      .news-card-skeleton__excerpt {
        width: 100%;
        height: 12px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        animation: skeleton-pulse 1.5s ease-in-out 0.3s infinite;
      }

      .news-card-skeleton__excerpt--short {
        width: 75%;
      }

      .news-card-skeleton__meta {
        width: 40%;
        height: 12px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        margin-top: 4px;
        animation: skeleton-pulse 1.5s ease-in-out 0.4s infinite;
      }

      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileNewsWebComponent implements OnInit {
  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an article card is clicked */
  readonly articleClick = output<NewsArticle>();

  /** Emitted when a bookmark button is toggled */
  readonly bookmarkToggle = output<NewsArticle>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Loading state (brief simulated delay on init) */
  readonly isLoading = signal(true);

  // ============================================
  // COMPUTED
  // ============================================

  /** All mock articles for the profile news feed */
  readonly filteredArticles = computed((): NewsArticle[] => {
    return MOCK_NEWS_ARTICLES;
  });

  /** Empty state title */
  readonly emptyTitle = computed((): string => 'No news yet');

  /** Empty state message */
  readonly emptyMessage = computed((): string => {
    return 'News updates, announcements, and media mentions will appear here.';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Simulate brief loading state, then show mock data
    setTimeout(() => {
      this.isLoading.set(false);
    }, 400);
  }

  // ============================================
  // ARTICLE INTERACTIONS
  // ============================================

  onArticleClick(article: NewsArticle): void {
    this.articleClick.emit(article);
  }

  onBookmarkClick(event: MouseEvent, article: NewsArticle): void {
    event.stopPropagation();
    this.bookmarkToggle.emit(article);
  }

  // ============================================
  // TEMPLATE HELPERS
  // ============================================

  getCategoryColor(categoryId: string): string {
    return NEWS_CATEGORY_BG_COLORS[categoryId as NewsCategoryId] ?? 'var(--nxt1-color-surface-300)';
  }

  getCategoryLabel(categoryId: string): string {
    const cat = NEWS_CATEGORIES.find((c) => c.id === categoryId);
    return cat?.label ?? categoryId;
  }

  formatViewCount(count: number): string {
    return formatCount(count);
  }
}
