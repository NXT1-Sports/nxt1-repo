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
import { searchOutline, notificationsOutline } from 'ionicons/icons';
import { type NewsArticle, NEWS_CATEGORIES, type NewsCategoryId } from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NewsService } from './news.service';
import { NewsCategoryFilterComponent } from './news-category-filter.component';
import { NewsListComponent } from './news-list.component';
import { NewsArticleDetailComponent } from './news-article-detail.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
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
        (back)="onDetailBack()"
        (share)="onDetailShare()"
        (readFullStory)="onReadFullStory($event)"
      />
    } @else {
      <!-- Feed View -->
      <div class="news-shell">
        <!-- Header -->
        <nxt1-page-header title="News">
          <div headerActions class="news-shell__actions">
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
  constructor() {
    addIcons({
      searchOutline,
      notificationsOutline,
    });
  }

  readonly newsService = inject(NewsService);
  private readonly haptics = inject(HapticsService);

  /** Available categories */
  readonly categories = NEWS_CATEGORIES;

  /** Whether to show detail view */
  readonly showDetail = signal(false);

  /** Emitted when an article is selected for external handling */
  readonly articleSelect = output<NewsArticle>();

  /** Emitted when search is clicked */
  readonly searchClick = output<void>();

  /** Emitted when "Read Full Story" is clicked (sourceUrl) */
  readonly readFullStoryClick = output<string>();

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
    this.showDetail.set(true);
    this.articleSelect.emit(article);
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

  async onDetailShare(): Promise<void> {
    const article = this.newsService.selectedArticle();
    if (article) {
      await this.newsService.shareArticle(article);
    }
  }

  onReadFullStory(sourceUrl: string): void {
    this.readFullStoryClick.emit(sourceUrl);
  }

  // ============================================
  // HEADER ACTION HANDLERS
  // ============================================

  async onSearchClick(): Promise<void> {
    await this.haptics.impact('light');
    this.searchClick.emit();
  }
}
