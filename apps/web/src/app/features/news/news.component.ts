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

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsShellComponent } from '@nxt1/ui/news';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { NewsArticle } from '@nxt1/core';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [NewsShellComponent],
  template: `
    <nxt1-news-shell (articleSelect)="onArticleSelect($event)" (searchClick)="onSearchClick()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('NewsComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Sports News',
      description:
        'Stay current with sports intelligence, athlete stories, and college sports updates on NXT1.',
      canonicalUrl: 'https://nxt1sports.com/pulse',
      keywords: ['sports intelligence news', 'college sports', 'athlete news', 'nxt1'],
    });
  }

  /**
   * Handle article selection — navigate to detail page.
   */
  protected onArticleSelect(article: NewsArticle): void {
    this.logger.debug('News article selected', {
      articleId: article.id,
      source: article.source,
    });
    this.router.navigate(['/pulse', article.id]);
  }

  /**
   * Handle search click - could open search overlay.
   */
  protected onSearchClick(): void {
    this.logger.debug('News search clicked');
    // Future: Open search overlay or navigate to search page
    // this.router.navigate(['/news/search']);
  }
}
