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
import { type NewsArticle } from '@nxt1/core';
import { NewsService } from './news.service';
import { NewsListComponent } from './news-list.component';
import { NewsArticleDetailComponent } from './news-article-detail.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
@Component({
  selector: 'nxt1-news-content',
  standalone: true,
  imports: [CommonModule, NewsListComponent],
  template: `
    <!-- Feed View -->
    <div class="news-content">
      <!-- Article List -->
      <div class="news-content__list">
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
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         NEWS CONTENT - Embeddable Feed Content
         No header/navigation - designed for shell embedding
         ============================================ */

      :host {
        display: block;
      }

      .news-content {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         ARTICLE LIST
         ============================================ */

      .news-content__list {
        flex: 1;
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

  /** Emitted when user triggers refresh (for parent to handle) */
  readonly refresh = output<void>();

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
  // ARTICLE INTERACTIONS
  // ============================================

  async onArticleClick(article: NewsArticle): Promise<void> {
    await this.haptics.impact('light');
    await this.newsService.selectArticle(article);
    this.articleSelect.emit(article);
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
}
