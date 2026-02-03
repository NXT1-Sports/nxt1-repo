/**
 * @fileoverview News Content Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Content-only component for the News feed.
 * Designed to be embedded within a parent shell (home/feed shell).
 *
 * ⭐ NO HEADER OR NAVIGATION - CONTENT ONLY ⭐
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Category sub-filter (For You, Recruiting, Commits, etc.)
 * - News article feed with all states
 * - Article detail view (inline)
 * - Gamification XP display
 *
 * This component is meant to be used INSIDE a parent shell that provides:
 * - The main page header
 * - The main feed options scroller
 * - Pull-to-refresh container
 *
 * @example
 * ```html
 * <!-- Inside a parent shell -->
 * @if (selectedFeed() === 'news') {
 *   <nxt1-news-content
 *     (articleSelect)="onArticleSelect($event)"
 *   />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy, inject, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, trophyOutline, arrowBack } from 'ionicons/icons';
import { type NewsArticle, type NewsCategoryId } from '@nxt1/core';
import { NewsService } from './news.service';
import { NewsCategoryFilterComponent } from './news-category-filter.component';
import { NewsListComponent } from './news-list.component';
import { NewsArticleDetailComponent } from './news-article-detail.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  searchOutline,
  trophyOutline,
  arrowBack,
});

@Component({
  selector: 'nxt1-news-content',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    NewsCategoryFilterComponent,
    NewsListComponent,
    NewsArticleDetailComponent,
  ],
  template: `
    @if (showDetail()) {
      <!-- Article Detail View -->
      <nxt1-news-article-detail
        [article]="newsService.selectedArticle()"
        [readingProgress]="newsService.readingProgress()"
        [xpEarned]="currentXpEarned()"
        [relatedArticles]="relatedArticles()"
        (back)="onDetailBack()"
        (bookmarkToggle)="onDetailBookmark()"
        (share)="onDetailShare()"
        (progressUpdate)="onProgressUpdate($event)"
        (relatedClick)="onRelatedArticleClick($event)"
      />
    } @else {
      <!-- Feed View -->
      <div class="news-content">
        <!-- Top Bar: XP Badge + Search (compact, inline with category filter) -->
        <div class="news-content__top-bar">
          <!-- Category Sub-Filter -->
          <div class="news-content__categories">
            <nxt1-news-category-filter
              [selectedId]="newsService.activeCategory()"
              (selectionChange)="onCategoryChange($event)"
            />
          </div>

          <!-- Actions (XP + Search) -->
          <div class="news-content__actions">
            <button
              type="button"
              class="news-content__xp-badge"
              (click)="onXpBadgeClick()"
              aria-label="View XP"
            >
              <ion-icon name="trophy-outline"></ion-icon>
              <span>{{ newsService.totalXp() }} XP</span>
            </button>
          </div>
        </div>

        <!-- Article List -->
        <div class="news-content__list">
          <nxt1-news-list
            [articles]="newsService.articles()"
            [isLoading]="newsService.isLoading()"
            [error]="newsService.error()"
            [hasMore]="newsService.hasMore()"
            [activeCategory]="newsService.activeCategory()"
            (articleClick)="onArticleClick($event)"
            (bookmarkClick)="onBookmarkClick($event)"
            (shareClick)="onShareClick($event)"
            (loadMore)="onLoadMore()"
            (retry)="onRetry()"
          />
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         NEWS CONTENT - Embeddable Feed Content
         No header/navigation - designed for shell embedding
         ============================================ */

      :host {
        display: block;
        height: 100%;
      }

      .news-content {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* ============================================
         TOP BAR (Category Filter + Actions)
         ============================================ */

      .news-content__top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        gap: 12px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .news-content__categories {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      .news-content__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .news-content__xp-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.15) 0%,
          rgba(204, 255, 0, 0.05) 100%
        );
        border: 1px solid rgba(204, 255, 0, 0.3);
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .news-content__xp-badge:hover {
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.25) 0%,
          rgba(204, 255, 0, 0.1) 100%
        );
      }

      .news-content__xp-badge ion-icon {
        font-size: 14px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-content__xp-badge span {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         ARTICLE LIST
         ============================================ */

      .news-content__list {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsContentComponent implements OnInit {
  readonly newsService = inject(NewsService);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an article is selected */
  readonly articleSelect = output<NewsArticle>();

  /** Emitted when XP badge is clicked */
  readonly xpBadgeClick = output<void>();

  /** Emitted when user triggers refresh (for parent to handle) */
  readonly refresh = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Whether showing article detail */
  readonly showDetail = signal(false);

  /** XP earned from current article */
  readonly currentXpEarned = signal(0);

  /** Related articles for current detail view */
  readonly relatedArticles = signal<NewsArticle[]>([]);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load initial feed
    void this.newsService.loadFeed();
  }

  // ============================================
  // PUBLIC METHODS (for parent shell to call)
  // ============================================

  /**
   * Refresh the news feed.
   * Called by parent shell when pull-to-refresh triggers.
   */
  async refreshFeed(): Promise<void> {
    await this.newsService.refresh();
  }

  // ============================================
  // CATEGORY HANDLING
  // ============================================

  async onCategoryChange(categoryId: NewsCategoryId): Promise<void> {
    await this.haptics.impact('light');
    await this.newsService.setCategory(categoryId);
  }

  // ============================================
  // ARTICLE INTERACTIONS
  // ============================================

  async onArticleClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('light');
    await this.newsService.selectArticle(article);
    this.showDetail.set(true);
    this.articleSelect.emit(article);

    // Load related articles
    // In production: this.relatedArticles.set(await this.newsService.getRelated(article.id));
    this.relatedArticles.set([]);
  }

  async onBookmarkClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('medium');
    await this.newsService.toggleBookmark(article.id);
  }

  async onShareClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('light');
    await this.newsService.shareArticle(article);
  }

  // ============================================
  // DETAIL VIEW HANDLERS
  // ============================================

  async onDetailBack(): Promise<void> {
    await this.haptics.impact('light');
    this.showDetail.set(false);
    this.newsService.selectArticle(null);
    this.currentXpEarned.set(0);
  }

  async onDetailBookmark(): Promise<void> {
    const article = this.newsService.selectedArticle();
    if (article) {
      await this.onBookmarkClick(article);
    }
  }

  async onDetailShare(): Promise<void> {
    const article = this.newsService.selectedArticle();
    if (article) {
      await this.onShareClick(article);
    }
  }

  onProgressUpdate(progress: number): void {
    this.newsService.updateReadingProgress(progress);

    // Calculate XP based on progress
    const article = this.newsService.selectedArticle();
    if (article && progress >= 100) {
      this.currentXpEarned.set(article.xpReward);
    }
  }

  async onRelatedArticleClick(article: NewsArticle): Promise<void> {
    await this.onArticleClick(article);
  }

  // ============================================
  // LIST ACTIONS
  // ============================================

  async onLoadMore(): Promise<void> {
    await this.newsService.loadMore();
  }

  async onRetry(): Promise<void> {
    await this.newsService.loadFeed();
  }

  // ============================================
  // TOP BAR ACTIONS
  // ============================================

  async onXpBadgeClick(): Promise<void> {
    await this.haptics.impact('light');
    this.xpBadgeClick.emit();
  }
}
