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
import { IonContent } from '@ionic/angular/standalone';
import {
  NxtPageHeaderComponent,
  NxtOptionScrollerComponent,
  NxtLoggingService,
  NewsContentComponent,
  FeedListComponent,
  FeedService,
  type PageHeaderAction,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
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
    IonContent,
    NxtPageHeaderComponent,
    NxtOptionScrollerComponent,
    NewsContentComponent,
    FeedListComponent,
  ],
  template: `
    <!-- Page Header with Logo (Twitter/X style) -->
    <nxt1-page-header
      [showLogo]="true"
      [actions]="headerActions()"
      (actionClick)="onHeaderAction($event)"
    />

    <!-- Twitter/TikTok Style Feed Selector -->
    <nxt1-option-scroller
      [options]="feedOptions()"
      [selectedId]="selectedFeed()"
      [config]="{ scrollable: false, stretchToFill: true }"
      (selectionChange)="onFeedChange($event)"
    />

    <ion-content>
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
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100%;
        background: var(--nxt1-color-background-primary, #0a0a0a);
      }

      /* Light theme support */
      :host-context([data-theme='light']) {
        background: var(--nxt1-color-background-primary, #ffffff);
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

  /** Header action buttons */
  readonly headerActions = signal<PageHeaderAction[]>([
    {
      id: 'create-post',
      icon: 'add',
      label: 'Create Post',
    },
  ]);

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
    void this.router.navigate(['/tabs/profile']);
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
   * Handle header action button clicks
   */
  onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'create-post':
        this.logger.debug('Create post clicked');
        void this.router.navigate(['/create-post']);
        break;
    }
  }
}
