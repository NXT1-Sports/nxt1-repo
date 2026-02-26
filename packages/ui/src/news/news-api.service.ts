/**
 * @fileoverview News API Service - Angular HTTP Adapter
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Angular-specific HTTP adapter for the News API.
 * Wraps the pure TypeScript API factory from @nxt1/core.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class NewsComponent {
 *   private readonly api = inject(NewsApiService);
 *
 *   async loadArticles(): Promise<void> {
 *     const response = await this.api.getFeed({ category: 'recruiting' });
 *   }
 * }
 * ```
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createNewsApi, type NewsApi } from '@nxt1/core';

/**
 * Injection token for News API base URL.
 * Override in app config if needed.
 */
export const NEWS_API_BASE_URL = new InjectionToken<string>('NEWS_API_BASE_URL', {
  providedIn: 'root',
  // Constants in @nxt1/core already include the full /api/v1 prefix, so the
  // base URL here is the origin-only part (empty = same origin in dev).
  factory: () => '',
});

/**
 * Angular HTTP adapter for News API.
 * Implements the NewsApi interface using Angular's HttpClient.
 */
@Injectable({ providedIn: 'root' })
export class NewsApiService implements NewsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(NEWS_API_BASE_URL);

  /**
   * Internal API instance using pure TypeScript factory.
   */
  private readonly api = createNewsApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ============================================
  // DELEGATE TO PURE API
  // ============================================

  /** Get news feed with optional filters */
  readonly getFeed = this.api.getFeed;

  /** Get single article by ID */
  readonly getArticle = this.api.getArticle;

  /** Toggle bookmark status */
  readonly toggleBookmark = this.api.toggleBookmark;

  /** Update reading progress */
  readonly updateProgress = this.api.updateProgress;

  /** Get reading statistics */
  readonly getReadingStats = this.api.getReadingStats;

  /** Get trending articles */
  readonly getTrending = this.api.getTrending;

  /** Search articles */
  readonly search = this.api.search;

  /** Mark article as read */
  readonly markAsRead = this.api.markAsRead;
}
