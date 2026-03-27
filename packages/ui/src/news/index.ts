/**
 * @fileoverview News Module Public API
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Exports all news-related components, services, and utilities.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   NewsShellComponent,
 *   NewsService,
 *   NewsApiService,
 * } from '@nxt1/ui';
 * ```
 */

// ==============================================
// COMPONENTS
// ==============================================

export { NewsShellComponent } from './news-shell.component';
export { NewsContentComponent } from './news-content.component';
export { NewsListComponent } from './news-list.component';
export { NewsArticleCardComponent } from './news-article-card.component';
export { NewsArticleDetailComponent } from './news-article-detail.component';
export { NewsCategoryFilterComponent } from './news-category-filter.component';
export { NewsSkeletonComponent } from './news-skeleton.component';
export { NewsEmptyStateComponent } from './news-empty-state.component';

// ==============================================
// SERVICES
// ==============================================
export { NewsService, NEWS_API_ADAPTER } from './news.service';
export type { INewsApiAdapter } from './news.service';
export { NewsApiService, NEWS_API_BASE_URL } from './news-api.service';
