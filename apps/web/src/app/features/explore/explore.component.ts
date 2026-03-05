/**
 * @fileoverview Explore Page - Web App Wrapper
 * @module @nxt1/web/features/explore
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Explore shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR GRADE A+ SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ExploreShellWebComponent, type ExploreUser } from '@nxt1/ui/explore';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ExploreItem, ExploreTabId, ScoutReport, FeedPost, FeedAuthor } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [ExploreShellWebComponent],
  template: `
    <nxt1-explore-shell-web
      [user]="userInfo()"
      (tabChange)="onTabChange($event)"
      (itemClick)="onItemClick($event)"
      (scoutReportSelect)="onScoutReportSelect($event)"
      (scoutReportFiltersOpen)="onScoutReportFiltersOpen()"
      (postSelect)="onPostSelect($event)"
      (authorSelect)="onAuthorSelect($event)"
      (newsArticleSelect)="onNewsArticleSelect($event)"
      (xpBadgeClick)="onXpBadgeClick()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ExploreComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Explore',
      description:
        'Discover top athletic talent, teams, and sports content from across the country.',
      keywords: ['explore', 'discover', 'athletes', 'recruiting', 'sports'],
    });
  }
  /**
   * Transform auth user to ExploreUser interface.
   */
  protected readonly userInfo = computed<ExploreUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg,
      displayName: user.displayName,
      followingCount: user.followingCount,
      followingIds: user.followingIds,
    };
  });

  /**
   * Handle item click - navigate to detail page.
   */
  protected onItemClick(item: ExploreItem): void {
    this.logger.debug('Explore item clicked', { id: item.id, type: item.type, route: item.route });

    // Navigate to the item's route
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  /**
   * Handle scout report selection - navigate to detail page.
   */
  protected onScoutReportSelect(report: ScoutReport): void {
    this.logger.debug('Scout report selected', { reportId: report.id });
    void this.router.navigate(['/scout-reports', report.id]);
  }

  /**
   * Handle scout report filters open.
   */
  protected onScoutReportFiltersOpen(): void {
    this.logger.debug('Scout report filters opened');
    // TODO: Open filter modal/side panel
  }

  /**
   * Handle tab change for analytics/logging.
   */
  protected onTabChange(tab: ExploreTabId): void {
    this.logger.debug('Explore tab changed', { tab });
  }

  // ── Feed / Following / News Handlers ──

  /**
   * Handle post selection - navigate to post detail.
   */
  protected onPostSelect(post: FeedPost): void {
    this.logger.debug('Feed post selected', { id: post.id, type: post.type });
    // Navigate to post detail when ready
    // void this.router.navigate(['/post', post.id]);
  }

  /**
   * Handle author selection - navigate to author profile.
   */
  protected onAuthorSelect(author: FeedAuthor): void {
    this.logger.debug('Author selected', { uid: author.uid, profileCode: author.profileCode });
    void this.router.navigate(['/profile', author.profileCode]);
  }

  /**
   * Handle news article selection - navigate to article page.
   */
  protected onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { id: article.id });
    void this.router.navigate(['/news', article.id]);
  }

  /**
   * Handle XP badge click - navigate to XP/rewards.
   */
  protected onXpBadgeClick(): void {
    this.logger.debug('XP badge clicked');
    void this.router.navigate(['/rewards']);
  }
}
