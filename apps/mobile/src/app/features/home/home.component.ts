/**
 * @fileoverview Home Page Component - Mobile
 * @module @nxt1/mobile/features/home
 *
 * Main home page shown after successful authentication and onboarding completion.
 * Protected by onboardingCompleteGuard.
 *
 * Uses NxtOptionScrollerComponent for tab navigation (Home/Following/News).
 * Uses FeedListComponent for Home and Following feeds.
 * Uses NewsContentComponent for News tab.
 * Avatar click opens the sidenav (Twitter/X pattern).
 * ⭐ IDENTICAL TO WEB - Uses shared @nxt1/ui components ⭐
 */

import {
  Component,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
  HostBinding,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, NavController } from '@ionic/angular/standalone';
import {
  NxtPageHeaderComponent,
  NxtOptionScrollerComponent,
  NxtRefresherComponent,
  NxtSidenavService,
  NxtLoggingService,
  HapticsService,
  NewsContentComponent,
  FeedListComponent,
  FeedService,
  type PageHeaderAction,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
  type RefreshEvent,
} from '@nxt1/ui';
import { type FeedPost, type FeedAuthor } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { AUTH_ROUTES } from '@nxt1/core/constants';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtOptionScrollerComponent,
    NxtRefresherComponent,
    NewsContentComponent,
    FeedListComponent,
  ],
  template: `
    <!-- Professional Page Header with Logo (Twitter/X style) -->
    <nxt1-page-header
      [showLogo]="true"
      [actions]="headerActions()"
      (menuClick)="onAvatarClick()"
      (actionClick)="onHeaderAction($event)"
    />

    <!-- Twitter/TikTok Style Feed Selector (fixed below header) -->
    <nxt1-option-scroller
      [options]="feedOptions()"
      [selectedId]="selectedFeed()"
      [config]="{ scrollable: false, stretchToFill: true }"
      (selectionChange)="onFeedChange($event)"
    />

    <ion-content [fullscreen]="true">
      <!-- Pull-to-refresh -->
      <nxt-refresher (onRefresh)="onRefresh($event)" />

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
            (reactClick)="onLikeClick($event)"
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
            (reactClick)="onLikeClick($event)"
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
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      /* Light theme support */
      :host-context([data-theme='light']) {
        background: var(--nxt1-color-bg-primary, #ffffff);
      }
      :host-context([data-theme='light']) ion-content {
        --background: var(--nxt1-color-bg-primary, #ffffff);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly authFlow = inject(AuthFlowService);
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('HomeComponent');
  protected readonly feedService = inject(FeedService);

  // ⭐ Use both AuthUser (for immediate display on app resume) and Profile (for full data)
  // AuthUser is persisted in storage, Profile needs to be fetched
  private readonly authUser = this.authFlow.user;
  readonly profile = this.authFlow.profile;

  // Hybrid approach: use Profile if available, fallback to AuthUser
  readonly user = computed(() => this.profile() ?? this.authUser());

  readonly displayName = computed(() => {
    const profile = this.profile();
    if (profile) {
      // Use Profile (full User data)
      return `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
    }
    // Fallback to AuthUser
    return this.authUser()?.displayName ?? 'User';
  });

  // Map User model fields to template-friendly names
  readonly profileImg = computed(() => {
    const profile = this.profile();
    if (profile) return profile.profileImgs?.[0];
    return this.authUser()?.profileImg;
  });

  readonly isPremium = computed(() => {
    const profile = this.profile();
    if (profile) {
      const tier = profile.planTier;
      return !!tier && tier !== 'free';
    }
    return this.authUser()?.isPremium ?? false;
  });

  readonly email = computed(() => {
    const profile = this.profile();
    if (profile) return profile.email;
    return this.authUser()?.email ?? '';
  });

  readonly role = computed(() => {
    const profile = this.profile();
    if (profile) return profile.role;
    return this.authUser()?.role ?? null;
  });

  readonly emailVerified = computed(() => {
    const profile = this.profile();
    if (profile) return !!profile.emailVerified;
    return this.authUser()?.emailVerified ?? false;
  });

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

  /** Required for Ionic page transitions - marks this as an ion-page */
  @HostBinding('class.ion-page') readonly ionPage = true;

  ngOnInit(): void {
    // Load initial feed
    this.feedService.loadFeed();
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern)
   */
  onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle feed tab change - swaps inline content (no navigation)
   */
  async onFeedChange(event: OptionScrollerChangeEvent): Promise<void> {
    this.selectedFeed.set(event.option.id);
    await this.haptics.impact('light');
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
   * Handle pull-to-refresh
   */
  async onRefresh(event: RefreshEvent): Promise<void> {
    this.logger.debug('Pull-to-refresh triggered');
    await this.haptics.impact('light');

    try {
      await this.feedService.refresh();
      event.complete();
    } catch (error) {
      this.logger.error('Failed to refresh feed', { error });
      event.cancel();
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
  async onXpBadgeClick(): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('XP badge clicked');
    // TODO: Show XP breakdown modal or navigate to XP page
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
    void this.navController.navigateForward(['/profile', author.profileCode]);
  }

  /**
   * Handle like click
   */
  async onLikeClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
    await this.feedService.toggleLike(post);
  }

  /**
   * Handle comment click
   */
  async onCommentClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('Comment clicked', { postId: post.id });
    // TODO: Open comment modal or navigate to post detail
  }

  /**
   * Handle share click
   */
  async onShareClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('medium');
    await this.feedService.sharePost(post);
  }

  /**
   * Handle bookmark click
   */
  async onBookmarkClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
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
  async onHeaderAction(action: PageHeaderAction): Promise<void> {
    this.logger.debug('Action clicked', { actionId: action.id });

    switch (action.id) {
      case 'create-post':
        await this.haptics.impact('light');
        await this.navController.navigateForward('/post/create');
        break;
    }
  }

  async onSignOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.navController.navigateRoot(AUTH_ROUTES.ROOT);
    } catch (error) {
      this.logger.error('Sign out failed', error);
    }
  }
}
