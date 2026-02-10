/**
 * @fileoverview Home Page Component
 * @module @nxt1/web/features/home
 *
 * Main landing page after successful authentication.
 * Protected by auth guard - requires user to be logged in.
 *
 * Uses NxtOptionScrollerComponent for tab navigation (Home/Following/News).
 * Uses FeedListComponent for Home and Following feeds.
 * Uses NewsContentComponent for News tab.
 * 2026 Best Practices: Backend-first, signal-based, design-token styling.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  NxtOptionScrollerComponent,
  NxtLoggingService,
  NewsContentComponent,
  FeedListComponent,
  FeedService,
  NxtHeroHeaderComponent,
  NxtPartnerMarqueeComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
  type HeroAudienceCardClickEvent,
} from '@nxt1/ui';
import { type FeedPost, type FeedAuthor } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AuthFlowService } from '../auth/services';
import { SeoService, AnalyticsService } from '../../core/services';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtOptionScrollerComponent,
    NewsContentComponent,
    FeedListComponent,
    NxtHeroHeaderComponent,
    NxtPartnerMarqueeComponent,
  ],
  template: `
    <!-- Hero Header Section -->
    <nxt1-hero-header
      [showLogo]="false"
      [showPrimaryCta]="true"
      [showAnimatedBg]="true"
      [showTrustBadges]="true"
      [showAppBadges]="false"
      (cardClick)="onHeroCardClick($event)"
    />

    <!-- Partners Section -->
    <nxt1-partner-marquee
      title="Trusted By Leading Organizations"
      subtitle="Partnering with the best to power the future of sports recruiting"
      label="Our Partners"
      [showLabel]="true"
    />

    <!-- Twitter/TikTok Style Feed Selector -->
    <nxt1-option-scroller
      [options]="feedOptions()"
      [selectedId]="selectedFeed()"
      [config]="{ scrollable: false, stretchToFill: true }"
      (selectionChange)="onFeedChange($event)"
    />

    <main class="feed-content">
      @switch (selectedFeed()) {
        @case ('news') {
          <nxt1-news-content
            (articleSelect)="onNewsArticleSelect($event)"
            (xpBadgeClick)="onXpBadgeClick()"
          />
        }
        @case ('following') {
          <nxt1-feed-list
            [posts]="feedService.posts()"
            [isLoading]="feedService.isLoading()"
            [isLoadingMore]="feedService.isLoadingMore()"
            [error]="feedService.error()"
            [filterType]="'following'"
            (postClick)="onPostSelect($event)"
            (authorClick)="onAuthorSelect($event)"
            (likeClick)="onLikeClick($event)"
            (commentClick)="onCommentClick($event)"
            (shareClick)="onShareClick($event)"
            (bookmarkClick)="onBookmarkClick($event)"
            (loadMore)="onLoadMore()"
            (retry)="onRetry()"
          />
        }
        @default {
          <nxt1-feed-list
            [posts]="feedService.posts()"
            [isLoading]="feedService.isLoading()"
            [isLoadingMore]="feedService.isLoadingMore()"
            [error]="feedService.error()"
            [filterType]="'for-you'"
            (postClick)="onPostSelect($event)"
            (authorClick)="onAuthorSelect($event)"
            (likeClick)="onLikeClick($event)"
            (commentClick)="onCommentClick($event)"
            (shareClick)="onShareClick($event)"
            (bookmarkClick)="onBookmarkClick($event)"
            (loadMore)="onLoadMore()"
            (retry)="onRetry()"
          />
        }
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        background: var(--nxt1-color-bg-primary);
        overflow-y: auto;
      }

      .feed-content {
        flex: 1;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('HomeComponent');
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly feedService = inject(FeedService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Home',
      description:
        'Your personalized feed of athletic highlights, training videos, and sports content.',
      keywords: ['home', 'feed', 'sports', 'highlights'],
      noIndex: true, // Protected page - don't index
    });

    // Load initial feed
    this.feedService.loadFeed();
  }

  /** Current authenticated user */
  readonly user = computed(() => this.authFlow.user());

  /** Feed navigation options (Twitter/TikTok style) */
  readonly feedOptions = signal<OptionScrollerItem[]>([
    { id: 'home', label: 'Home' },
    { id: 'following', label: 'Following' },
    { id: 'news', label: 'News' },
  ]);

  /** Currently selected feed */
  readonly selectedFeed = signal<string>('home');

  /**
   * Handle feed tab change - swaps inline content (no navigation)
   */
  onFeedChange(event: OptionScrollerChangeEvent): void {
    this.selectedFeed.set(event.option.id);
    this.logger.debug('Feed changed', {
      feed: event.option.label,
      via: event.fromSwipe ? 'swipe' : 'tap',
    });

    // Reload feed when switching between home/following
    if (event.option.id === 'home' || event.option.id === 'following') {
      this.feedService.loadFeed();
    }
  }

  /**
   * Handle news article selection
   */
  onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { articleId: article.id });
    // Article detail is handled inline by NewsContentComponent
  }

  /**
   * Handle XP badge click (navigate to profile/achievements)
   */
  onXpBadgeClick(): void {
    this.logger.debug('XP badge clicked');
    void this.router.navigate(['/profile']);
  }

  /**
   * Handle post selection - navigate to post detail
   */
  onPostSelect(post: FeedPost): void {
    this.logger.debug('Post selected', { postId: post.id, type: post.type });
    // TODO: Navigate to post detail page when implemented
  }

  /**
   * Handle author selection - navigate to profile
   */
  onAuthorSelect(author: FeedAuthor): void {
    this.logger.debug('Author selected', { authorId: author.uid });
    void this.router.navigate(['/profile', author.profileCode]);
  }

  /**
   * Handle like click
   */
  async onLikeClick(post: FeedPost): Promise<void> {
    // Track reaction before toggling
    const isCurrentlyLiked = post.userEngagement?.isLiked ?? false;
    if (!isCurrentlyLiked) {
      this.analytics.trackEvent(APP_EVENTS.REACTION_ADDED, {
        post_id: post.id,
        post_type: post.type,
        author_id: post.author.uid,
        reaction_type: 'like',
      });
    } else {
      this.analytics.trackEvent(APP_EVENTS.REACTION_REMOVED, {
        post_id: post.id,
        post_type: post.type,
        reaction_type: 'like',
      });
    }

    await this.feedService.toggleLike(post);
  }

  /**
   * Handle comment click
   */
  onCommentClick(post: FeedPost): void {
    this.logger.debug('Comment clicked', { postId: post.id });

    // Track comment intent (actual comment submission would be tracked separately)
    this.analytics.trackEvent('comment_intent', {
      post_id: post.id,
      post_type: post.type,
      author_id: post.author.uid,
    });

    // TODO: Open comment modal or navigate to post detail
  }

  /**
   * Handle share click
   */
  async onShareClick(post: FeedPost): Promise<void> {
    // Track post share
    this.analytics.trackEvent(APP_EVENTS.POST_SHARED, {
      post_id: post.id,
      post_type: post.type,
      author_id: post.author.uid,
      share_method: 'web_share_api',
    });

    await this.feedService.sharePost(post);
  }

  /**
   * Handle bookmark click
   */
  async onBookmarkClick(post: FeedPost): Promise<void> {
    await this.feedService.toggleBookmark(post);
  }

  /**
   * Handle load more (infinite scroll)
   */
  async onLoadMore(): Promise<void> {
    await this.feedService.loadMore();
  }

  /**
   * Handle retry after error
   */
  onRetry(): void {
    this.feedService.loadFeed();
  }

  /**
   * Handle hero audience card click
   */
  onHeroCardClick(event: HeroAudienceCardClickEvent): void {
    this.logger.debug('Hero card clicked', { cardId: event.card.id });
    // Navigation is handled by routerLink in the component
  }
}
