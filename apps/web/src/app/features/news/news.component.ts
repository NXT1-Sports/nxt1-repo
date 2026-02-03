/**
 * @fileoverview News Page - Web App Wrapper
 * @module @nxt1/web/features/news
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared News shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Search overlay integration
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NewsShellComponent, NxtSidenavService, NxtLoggingService } from '@nxt1/ui';
import type { NewsArticle } from '@nxt1/core';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [NewsShellComponent],
  template: `
    <nxt1-news-shell
      (articleSelect)="onArticleSelect($event)"
      (searchClick)="onSearchClick()"
      (xpBadgeClick)="onXpBadgeClick()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent {
  private readonly router = inject(Router);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('NewsComponent');

  /**
   * Handle article selection for analytics/logging.
   */
  protected onArticleSelect(article: NewsArticle): void {
    this.logger.debug('News article selected', {
      articleId: article.id,
      category: article.category,
    });
    // In production: track analytics event
    // this.analytics.track('news_article_view', { articleId: article.id, category: article.category });
  }

  /**
   * Handle search click - could open search overlay.
   */
  protected onSearchClick(): void {
    this.logger.debug('News search clicked');
    // Future: Open search overlay or navigate to search page
    // this.router.navigate(['/news/search']);
  }

  /**
   * Handle XP badge click - could show XP breakdown modal.
   */
  protected onXpBadgeClick(): void {
    this.logger.debug('News XP badge clicked');
    // Future: Show XP breakdown modal or navigate to XP page
    // this.router.navigate(['/xp']);
  }
}
