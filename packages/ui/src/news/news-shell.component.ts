/**
 * @fileoverview News Shell Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Main container for the News feed experience.
 * Orchestrates header, category filter, and article list.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Responsive page header with actions
 * - Category filter (horizontal scroller)
 * - News article feed with all states
 * - Pull-to-refresh support
 * - Article detail navigation
 * - Gamification badges display
 *
 * @example
 * ```html
 * <nxt1-news-shell
 *   (articleSelect)="onArticleSelect($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, inject, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonRefresher, IonRefresherContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, notificationsOutline, trophyOutline } from 'ionicons/icons';
import { type NewsArticle, NEWS_CATEGORIES, type NewsCategoryId } from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NewsService } from './news.service';
import { NewsCategoryFilterComponent } from './news-category-filter.component';
import { NewsListComponent } from './news-list.component';
import { NewsArticleDetailComponent } from './news-article-detail.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  searchOutline,
  notificationsOutline,
  trophyOutline,
});

@Component({
  selector: 'nxt1-news-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    NxtPageHeaderComponent,
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
      <div class="news-shell">
        <!-- Header -->
        <nxt1-page-header title="News">
          <div headerActions class="news-shell__actions">
            <!-- XP Badge -->
            <button
              type="button"
              class="news-shell__xp-badge"
              (click)="onXpBadgeClick()"
              aria-label="View XP"
            >
              <ion-icon name="trophy-outline"></ion-icon>
              <span>{{ newsService.totalXp() }}</span>
            </button>

            <!-- Search -->
            <button
              type="button"
              class="news-shell__action-btn"
              (click)="onSearchClick()"
              aria-label="Search news"
            >
              <ion-icon name="search-outline"></ion-icon>
            </button>
          </div>
        </nxt1-page-header>

        <!-- Category Filter -->
        <nxt1-news-category-filter
          [selectedId]="newsService.activeCategory()"
          (selectionChange)="onCategoryChange($event)"
        />

        <!-- Main Content -->
        <ion-content class="news-shell__content">
          <!-- Pull to Refresh -->
          <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
            <ion-refresher-content></ion-refresher-content>
          </ion-refresher>

          <!-- Article List -->
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
        </ion-content>
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         NEWS SHELL - Main Container
         ============================================ */

      :host {
        display: block;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .news-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* ============================================
         HEADER ACTIONS
         ============================================ */

      .news-shell__actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .news-shell__xp-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
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

      .news-shell__xp-badge:hover {
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.25) 0%,
          rgba(204, 255, 0, 0.1) 100%
        );
      }

      .news-shell__xp-badge ion-icon {
        font-size: 16px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-shell__xp-badge span {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .news-shell__action-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .news-shell__action-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .news-shell__action-btn ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
         CONTENT AREA
         ============================================ */

      .news-shell__content {
        flex: 1;
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      /* Refresher customization */
      ion-refresher-content {
        --color: var(--nxt1-color-primary, #ccff00);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsShellComponent implements OnInit {
  readonly newsService = inject(NewsService);
  private readonly haptics = inject(HapticsService);

  /** Available categories */
  readonly categories = NEWS_CATEGORIES;

  /** Whether to show detail view */
  readonly showDetail = signal(false);

  /** Currently earned XP for selected article */
  readonly currentXpEarned = signal(0);

  /** Related articles for detail view */
  readonly relatedArticles = signal<NewsArticle[]>([]);

  /** Emitted when an article is selected for external handling */
  readonly articleSelect = output<NewsArticle>();

  /** Emitted when search is clicked */
  readonly searchClick = output<void>();

  /** Emitted when XP badge is clicked */
  readonly xpBadgeClick = output<void>();

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.newsService.loadFeed();
  }

  // ============================================
  // FEED HANDLERS
  // ============================================

  async onCategoryChange(category: NewsCategoryId): Promise<void> {
    await this.haptics.impact('light');
    this.newsService.setCategory(category);
  }

  async onArticleClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('light');
    this.newsService.selectArticle(article);
    this.currentXpEarned.set(0);
    this.loadRelatedArticles(article);
    this.showDetail.set(true);
    this.articleSelect.emit(article);
  }

  async onBookmarkClick(article: NewsArticle): Promise<void> {
    await this.newsService.toggleBookmark(article.id);
  }

  async onShareClick(article: NewsArticle): Promise<void> {
    await this.newsService.shareArticle(article);
  }

  async onLoadMore(): Promise<void> {
    await this.newsService.loadMore();
  }

  async onRetry(): Promise<void> {
    await this.newsService.loadFeed();
  }

  async onRefresh(event: CustomEvent): Promise<void> {
    await this.newsService.refresh();
    (event.target as HTMLIonRefresherElement).complete();
  }

  // ============================================
  // DETAIL HANDLERS
  // ============================================

  async onDetailBack(): Promise<void> {
    await this.haptics.impact('light');
    this.showDetail.set(false);
    this.newsService.selectArticle(null);
  }

  async onDetailBookmark(): Promise<void> {
    const article = this.newsService.selectedArticle();
    if (article) {
      await this.newsService.toggleBookmark(article.id);
    }
  }

  async onDetailShare(): Promise<void> {
    const article = this.newsService.selectedArticle();
    if (article) {
      await this.newsService.shareArticle(article);
    }
  }

  onProgressUpdate(progress: number): void {
    this.newsService.updateReadingProgress(progress);

    // Calculate XP earned based on progress
    const article = this.newsService.selectedArticle();
    if (article) {
      const xp = Math.floor((progress / 100) * article.xpReward);
      this.currentXpEarned.set(xp);
    }
  }

  async onRelatedArticleClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('light');
    this.newsService.selectArticle(article);
    this.currentXpEarned.set(0);
    this.loadRelatedArticles(article);
    this.articleSelect.emit(article);
  }

  // ============================================
  // HEADER ACTION HANDLERS
  // ============================================

  async onSearchClick(): Promise<void> {
    await this.haptics.impact('light');
    this.searchClick.emit();
  }

  async onXpBadgeClick(): Promise<void> {
    await this.haptics.impact('light');
    this.xpBadgeClick.emit();
  }

  // ============================================
  // HELPERS
  // ============================================

  private loadRelatedArticles(article: NewsArticle): void {
    // Get articles from same category, excluding current
    const related = this.newsService
      .articles()
      .filter((a) => a.category === article.category && a.id !== article.id)
      .slice(0, 5);

    this.relatedArticles.set(related);
  }
}
