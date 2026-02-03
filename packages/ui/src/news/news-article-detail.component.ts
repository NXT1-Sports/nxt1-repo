/**
 * @fileoverview News Article Detail Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Full-screen article reading experience with progress tracking and XP.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Full-width hero image with gradient overlay
 * - Floating back button
 * - Share/bookmark actions
 * - Sticky progress bar at top
 * - Rich text content with proper typography
 * - Related articles section
 * - XP reward celebration on completion
 * - Reading progress tracking
 *
 * @example
 * ```html
 * <nxt1-news-article-detail
 *   [article]="selectedArticle()"
 *   [readingProgress]="progress()"
 *   (back)="onBack()"
 *   (bookmark)="onBookmark()"
 *   (share)="onShare()"
 *   (progressUpdate)="onProgressUpdate($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  AfterViewInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  bookmarkOutline,
  bookmark,
  shareOutline,
  timeOutline,
  eyeOutline,
  sparklesOutline,
  checkmarkCircle,
} from 'ionicons/icons';
import { type NewsArticle, NEWS_CATEGORIES, NEWS_CATEGORY_BG_COLORS } from '@nxt1/core';
import { NxtImageComponent } from '../components/image';
import { NxtAvatarComponent } from '../components/avatar';
import { NewsBookmarkButtonComponent } from './news-bookmark-button.component';
import { NewsReadingProgressComponent } from './news-reading-progress.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  arrowBack,
  bookmarkOutline,
  bookmark,
  shareOutline,
  timeOutline,
  eyeOutline,
  sparklesOutline,
  checkmarkCircle,
});

@Component({
  selector: 'nxt1-news-article-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    NxtImageComponent,
    NxtAvatarComponent,
    NewsBookmarkButtonComponent,
    NewsReadingProgressComponent,
  ],
  template: `
    @if (article()) {
      <div class="article-detail">
        <!-- Sticky Progress Bar -->
        <div class="article-detail__progress-bar" [style.width.%]="readingProgress()"></div>

        <!-- Hero Section -->
        <div class="article-detail__hero">
          <nxt1-image
            [src]="article()!.heroImageUrl || article()!.thumbnailUrl || ''"
            [alt]="article()!.title"
            class="article-detail__hero-image"
            fit="cover"
          />

          <!-- Gradient Overlay -->
          <div class="article-detail__hero-overlay"></div>

          <!-- Floating Back Button -->
          <button
            type="button"
            class="article-detail__back-btn"
            (click)="onBackClick()"
            aria-label="Go back"
          >
            <ion-icon name="arrow-back"></ion-icon>
          </button>

          <!-- Floating Actions -->
          <div class="article-detail__hero-actions">
            <nxt1-news-bookmark-button
              [isBookmarked]="article()!.isBookmarked"
              (bookmarkToggle)="onBookmarkClick()"
            />
            <button
              type="button"
              class="article-detail__action-btn"
              (click)="onShareClick()"
              aria-label="Share article"
            >
              <ion-icon name="share-outline"></ion-icon>
            </button>
          </div>

          <!-- Category Badge -->
          <div class="article-detail__category" [style.background]="categoryColor()">
            {{ categoryLabel() }}
          </div>
        </div>

        <!-- Content Section -->
        <div class="article-detail__content">
          <!-- Title -->
          <h1 class="article-detail__title">{{ article()!.title }}</h1>

          <!-- Meta Info -->
          <div class="article-detail__meta">
            <!-- Source -->
            <div class="article-detail__source">
              <nxt1-avatar
                [src]="article()!.source.avatarUrl"
                [name]="article()!.source.name"
                size="sm"
              />
              <div class="article-detail__source-info">
                <span class="article-detail__source-name">
                  {{ article()!.source.name }}
                  @if (article()!.source.isVerified) {
                    <ion-icon name="checkmark-circle" class="article-detail__verified"></ion-icon>
                  }
                </span>
                <span class="article-detail__date">{{ formattedDate() }}</span>
              </div>
            </div>

            <!-- Reading Progress -->
            <nxt1-news-reading-progress
              [progress]="readingProgress()"
              [xpEarned]="xpEarned()"
              [xpTotal]="article()!.xpReward"
            />
          </div>

          <!-- Reading Time & Views -->
          <div class="article-detail__stats">
            <span class="article-detail__stat">
              <ion-icon name="time-outline"></ion-icon>
              {{ article()!.readingTimeMinutes }} min read
            </span>
            <span class="article-detail__stat">
              <ion-icon name="eye-outline"></ion-icon>
              {{ formatViewCount() }} views
            </span>
          </div>

          <!-- Article Body -->
          <div class="article-detail__body" [innerHTML]="article()!.content"></div>

          <!-- Tags -->
          @if (article()!.tags && article()!.tags!.length > 0) {
            <div class="article-detail__tags">
              @for (tag of article()!.tags; track tag) {
                <span class="article-detail__tag">#{{ tag }}</span>
              }
            </div>
          }

          <!-- XP Completion Banner -->
          @if (readingProgress() >= 100 && !xpClaimed) {
            <div class="article-detail__xp-banner">
              <ion-icon name="sparkles-outline"></ion-icon>
              <span>You earned +{{ article()!.xpReward }} XP!</span>
            </div>
          }

          <!-- Related Articles -->
          @if (relatedArticles().length > 0) {
            <div class="article-detail__related">
              <h2 class="article-detail__related-title">Related Articles</h2>
              <div class="article-detail__related-list">
                @for (related of relatedArticles(); track related.id) {
                  <button
                    type="button"
                    class="article-detail__related-item"
                    (click)="onRelatedClick(related)"
                  >
                    @if (related.thumbnailUrl) {
                      <nxt1-image
                        [src]="related.thumbnailUrl"
                        [alt]="related.title"
                        class="article-detail__related-image"
                        fit="cover"
                      />
                    }
                    <span class="article-detail__related-text">{{ related.title }}</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         NEWS ARTICLE DETAIL - Full Reading Experience
         ============================================ */

      :host {
        display: block;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        min-height: 100vh;
      }

      .article-detail {
        position: relative;
      }

      /* ============================================
         STICKY PROGRESS BAR
         ============================================ */

      .article-detail__progress-bar {
        position: fixed;
        top: 0;
        left: 0;
        height: 3px;
        background: var(--nxt1-color-primary, #ccff00);
        z-index: 100;
        transition: width 0.1s ease;
      }

      /* ============================================
         HERO SECTION
         ============================================ */

      .article-detail__hero {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 10;
        overflow: hidden;
      }

      .article-detail__hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .article-detail__hero-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60%;
        background: linear-gradient(
          to top,
          var(--nxt1-color-bg-primary, #0a0a0a) 0%,
          transparent 100%
        );
      }

      /* Back Button */
      .article-detail__back-btn {
        position: absolute;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        left: 12px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: white;
        cursor: pointer;
        z-index: 10;
        transition: background-color 0.15s ease;
      }

      .article-detail__back-btn:hover {
        background: rgba(0, 0, 0, 0.7);
      }

      .article-detail__back-btn ion-icon {
        font-size: 24px;
      }

      /* Hero Actions */
      .article-detail__hero-actions {
        position: absolute;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        right: 12px;
        display: flex;
        gap: 8px;
        z-index: 10;
      }

      .article-detail__action-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: white;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .article-detail__action-btn:hover {
        background: rgba(0, 0, 0, 0.7);
      }

      .article-detail__action-btn ion-icon {
        font-size: 20px;
      }

      /* Category Badge */
      .article-detail__category {
        position: absolute;
        bottom: 20px;
        left: 20px;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-onPrimary, #000);
        z-index: 10;
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .article-detail__content {
        padding: 24px 20px 48px;
        max-width: 680px;
        margin: 0 auto;
      }

      /* Title */
      .article-detail__title {
        margin: 0 0 20px;
        font-size: 28px;
        font-weight: 800;
        line-height: 1.2;
        color: var(--nxt1-color-text-primary, #fff);
      }

      /* Meta Info */
      .article-detail__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .article-detail__source {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .article-detail__source-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .article-detail__source-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .article-detail__verified {
        font-size: 16px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .article-detail__date {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Stats */
      .article-detail__stats {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .article-detail__stat {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .article-detail__stat ion-icon {
        font-size: 16px;
      }

      /* Article Body */
      .article-detail__body {
        font-size: 17px;
        line-height: 1.75;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.85));
      }

      .article-detail__body p {
        margin: 0 0 20px;
      }

      .article-detail__body h2 {
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 32px 0 16px;
      }

      .article-detail__body ul,
      .article-detail__body ol {
        margin: 0 0 20px;
        padding-left: 24px;
      }

      .article-detail__body li {
        margin-bottom: 8px;
      }

      .article-detail__body strong {
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      /* Tags */
      .article-detail__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .article-detail__tag {
        padding: 6px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* XP Banner */
      .article-detail__xp-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 16px;
        margin-top: 32px;
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.15) 0%,
          rgba(204, 255, 0, 0.05) 100%
        );
        border: 1px solid rgba(204, 255, 0, 0.3);
        border-radius: var(--nxt1-radius-lg, 16px);
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
        animation: xp-appear 0.5s ease;
      }

      .article-detail__xp-banner ion-icon {
        font-size: 24px;
        animation: sparkle 1s ease infinite;
      }

      @keyframes xp-appear {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes sparkle {
        0%,
        100% {
          transform: scale(1) rotate(0deg);
        }
        50% {
          transform: scale(1.1) rotate(10deg);
        }
      }

      /* Related Articles */
      .article-detail__related {
        margin-top: 40px;
        padding-top: 32px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .article-detail__related-title {
        margin: 0 0 16px;
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .article-detail__related-list {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 8px;
        -webkit-overflow-scrolling: touch;
      }

      .article-detail__related-item {
        flex: 0 0 200px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.15s ease;
      }

      .article-detail__related-item:hover {
        transform: translateY(-2px);
      }

      .article-detail__related-image {
        width: 100%;
        height: 100px;
        object-fit: cover;
      }

      .article-detail__related-text {
        padding: 8px 12px 12px;
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: left;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 480px) {
        .article-detail__title {
          font-size: 24px;
        }

        .article-detail__body {
          font-size: 16px;
        }

        .article-detail__content {
          padding: 20px 16px 40px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsArticleDetailComponent implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);

  /** Article to display */
  readonly article = input<NewsArticle | null>(null);

  /** Current reading progress (0-100) */
  readonly readingProgress = input<number>(0);

  /** XP earned so far */
  readonly xpEarned = input<number>(0);

  /** Related articles */
  readonly relatedArticles = input<NewsArticle[]>([]);

  /** Emitted when back button is clicked */
  readonly back = output<void>();

  /** Emitted when bookmark is toggled */
  readonly bookmarkToggle = output<void>();

  /** Emitted when share is clicked */
  readonly share = output<void>();

  /** Emitted when reading progress updates */
  readonly progressUpdate = output<number>();

  /** Emitted when related article is clicked */
  readonly relatedClick = output<NewsArticle>();

  /** Whether XP has been claimed (prevents re-showing banner) */
  xpClaimed = false;

  private scrollHandler: (() => void) | null = null;

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly categoryLabel = computed(() => {
    const art = this.article();
    if (!art) return '';
    const category = NEWS_CATEGORIES.find((c) => c.id === art.category);
    return category?.label || art.category;
  });

  protected readonly categoryColor = computed(() => {
    const art = this.article();
    if (!art) return '';
    return NEWS_CATEGORY_BG_COLORS[art.category] || 'var(--nxt1-color-surface-300)';
  });

  protected readonly formattedDate = computed(() => {
    const art = this.article();
    if (!art) return '';
    const date = new Date(art.publishedAt);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupScrollTracking();
    }
  }

  ngOnDestroy(): void {
    if (this.scrollHandler && isPlatformBrowser(this.platformId)) {
      window.removeEventListener('scroll', this.scrollHandler);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  async onBackClick(): Promise<void> {
    await this.haptics.impact('light');
    this.back.emit();
  }

  async onBookmarkClick(): Promise<void> {
    this.bookmarkToggle.emit();
  }

  async onShareClick(): Promise<void> {
    await this.haptics.impact('light');
    this.share.emit();
  }

  onRelatedClick(article: NewsArticle): void {
    this.relatedClick.emit(article);
  }

  formatViewCount(): string {
    const art = this.article();
    if (!art) return '0';
    const count = art.viewCount;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  }

  // ============================================
  // SCROLL TRACKING
  // ============================================

  private setupScrollTracking(): void {
    this.scrollHandler = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
      this.progressUpdate.emit(Math.round(progress));
    };

    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }
}
