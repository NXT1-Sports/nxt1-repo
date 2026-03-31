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

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Location, isPlatformBrowser } from '@angular/common';
import { ExploreShellWebComponent, type ExploreUser, ExploreService } from '@nxt1/ui/explore';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import type { ExploreItem, ExploreTabId, ScoutReport, FeedPost, FeedAuthor } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';
import {
  createGeolocationService,
  BrowserGeolocationAdapter,
  CachedGeocodingAdapter,
  NominatimGeocodingAdapter,
  GEOLOCATION_DEFAULTS,
} from '@nxt1/core';
import { NxtToastService } from '@nxt1/ui/services/toast';

/** Valid URL slugs that map to explore tab IDs */
const VALID_TAB_SLUGS = new Set(['pulse', 'discover']);

@Component({
  selector: 'app-explore',
  imports: [ExploreShellWebComponent],
  template: `
    <nxt1-explore-shell-web
      #shellRef
      [user]="userInfo()"
      (tabChange)="onTabChange($event)"
      (itemClick)="onItemClick($event)"
      (scoutReportSelect)="onScoutReportSelect($event)"
      (scoutReportFiltersOpen)="onScoutReportFiltersOpen()"
      (postSelect)="onPostSelect($event)"
      (authorSelect)="onAuthorSelect($event)"
      (newsArticleSelect)="onNewsArticleSelect($event)"
      (detectLocation)="onDetectLocation()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly logger = inject(NxtLoggingService).child('ExploreComponent');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly seo = inject(SeoService);
  private readonly exploreService = inject(ExploreService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toast = inject(NxtToastService);

  private readonly shellRef = viewChild<ExploreShellWebComponent>('shellRef');

  ngOnInit(): void {
    const tabParam = this.route.snapshot.paramMap.get('tab');

    // Reject unknown tab slugs — redirect to Pulse
    if (tabParam !== null && !VALID_TAB_SLUGS.has(tabParam)) {
      void this.router.navigate(['/explore', 'pulse'], { replaceUrl: true });
      return;
    }

    if (tabParam === 'pulse') {
      void this.exploreService.switchTab('news');
      this.updateSeoForTab('news');
    } else if (tabParam === 'discover') {
      void this.exploreService.switchTab('feed');
      this.updateSeoForTab('feed');
    } else {
      this.updateSeoForTab(this.exploreService.activeTab());
    }

    this.breadcrumb.trackStateChange('explore:initialized', { tab: tabParam ?? 'default' });
    this.analytics?.trackEvent(APP_EVENTS.EXPLORE_VIEWED, { tab: tabParam ?? 'default' });
  }

  private updateSeoForTab(tab: ExploreTabId): void {
    if (tab === 'news') {
      this.seo.updatePage({
        title: 'Pulse',
        description:
          'Stay updated with the real-time Pulse of NXT1. Discover sports news, latest highlights, recruiting updates, and daily briefings.',
        keywords: ['pulse', 'news', 'explore', 'briefing', 'recruiting updates', 'sports news'],
      });
    } else if (tab === 'feed') {
      this.seo.updatePage({
        title: 'Discover',
        description:
          'Discover top athletic talent, personalized team updates, dynamic content, and scout reports tuned to your preferences.',
        keywords: ['discover', 'explore', 'athletes', 'teams', 'colleges', 'sports'],
      });
    } else {
      this.seo.updatePage({
        title: 'Explore',
        description:
          'Discover top athletic talent, teams, and sports content from across the country.',
        keywords: ['explore', 'discover', 'athletes', 'recruiting', 'sports'],
      });
    }
  }

  /**
   * Transform auth user to ExploreUser interface.
   */
  protected readonly userInfo = computed<ExploreUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      sport: user.selectedSports?.[0] ?? null,
      state: user.state ?? null,
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
    this.breadcrumb.trackStateChange('explore:tab-changed', { tab });
    this.analytics?.trackEvent(APP_EVENTS.EXPLORE_TAB_CHANGED, { tab });

    if (tab === 'news') {
      this.location.replaceState('/explore/pulse');
    } else if (tab === 'feed') {
      this.location.replaceState('/explore/discover');
    } else {
      this.location.replaceState('/explore');
    }

    this.updateSeoForTab(tab);
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
   * Handle news article selection - navigate to article detail nested under Explore.
   * URL: /explore/pulse/:id — keeps user in the Explore context.
   */
  protected onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { id: article.id });
    void this.router.navigate(['/explore', 'pulse', article.id]);
  }

  /**
   * Handle detect-location event from sidebar.
   * Uses geolocation + reverse geocoding to get the user's state.
   */
  protected async onDetectLocation(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.logger.info('Detecting user location');
    this.breadcrumb.trackUserAction('detect-location-started');

    try {
      const geoService = createGeolocationService(
        new BrowserGeolocationAdapter(),
        new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
      );
      const result = await geoService.getCurrentLocation(GEOLOCATION_DEFAULTS.QUICK);

      if (result.success && result.data?.address?.state) {
        const state = result.data.address.state;
        this.logger.info('Location detected', { state });

        this.exploreService.applyDetectedState(state);
        this.shellRef()?.completeDetectLocation(state);
        this.analytics?.trackEvent(APP_EVENTS.LOCATION_DETECTED, { state, source: 'explore' });
        this.toast.success(`Location set to ${state}`);
      } else {
        this.logger.warn('Location detected but no state found');
        this.shellRef()?.completeDetectLocation(null);
        this.toast.error('Could not determine your state. Please set it manually.');
      }
    } catch (err) {
      this.logger.error('Failed to detect location', err);
      this.shellRef()?.completeDetectLocation(null);
      this.toast.error('Location detection failed. Please check your browser permissions.');
    }
  }
}
