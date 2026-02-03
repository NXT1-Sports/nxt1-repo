/**
 * @fileoverview News Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/news
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
 * - Ionic container wrappers
 * - Search overlay integration
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import { NewsShellComponent, NxtLoggingService } from '@nxt1/ui';
import type { NewsArticle } from '@nxt1/core';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, NewsShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-news-shell
        (articleSelect)="onArticleSelect($event)"
        (searchClick)="onSearchClick()"
        (xpBadgeClick)="onXpBadgeClick()"
      />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent {
  private readonly navController = inject(NavController);
  private readonly router = inject(Router);
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
  protected async onSearchClick(): Promise<void> {
    this.logger.debug('News search clicked');
    // Future: Navigate to search page using NavController
    // await this.navController.navigateForward('/news/search');
  }

  /**
   * Handle XP badge click - could show XP breakdown modal.
   */
  protected async onXpBadgeClick(): Promise<void> {
    this.logger.debug('News XP badge clicked');
    // Future: Show XP breakdown modal or navigate to XP page
    // await this.navController.navigateForward('/tabs/xp');
  }
}
