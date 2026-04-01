/**
 * @fileoverview Feed Shell Component
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Main container for the Home Feed experience.
 * Orchestrates post list and pull-to-refresh.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Pull-to-refresh with haptic feedback
 * - Post feed with all states
 * - New posts banner
 *
 * @example
 * ```html
 * <nxt1-feed-shell
 *   (postSelect)="onPostSelect($event)"
 *   (authorSelect)="onAuthorSelect($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  OnInit,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../components/icon';
import { type FeedPost, type FeedAuthor } from '@nxt1/core';
import { FeedService } from './feed.service';
import { FeedListComponent } from './feed-list.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
@Component({
  selector: 'nxt1-feed-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    NxtIconComponent,
    FeedListComponent,
  ],
  template: `
    <div class="feed-shell">
      <!-- New Posts Banner -->
      @if (feedService.hasNewPosts()) {
        <button type="button" class="feed-shell__new-posts" (click)="onLoadNewPosts()">
          <nxt1-icon name="arrowUp" [size]="16" />
          <span>{{ feedService.newPostsCount() }} new posts</span>
        </button>
      }

      <!-- Main Content -->
      <ion-content class="feed-shell__content" [scrollEvents]="true">
        <!-- Pull to Refresh -->
        <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
          <ion-refresher-content
            pullingIcon="chevron-down"
            pullingText="Pull to refresh"
            refreshingSpinner="crescent"
            refreshingText="Refreshing..."
          ></ion-refresher-content>
        </ion-refresher>

        <!-- Feed List -->
        <nxt1-feed-list
          [polymorphicFeed]="feedService.polymorphicFeed()"
          [posts]="feedService.posts()"
          [isLoading]="feedService.isLoading()"
          [isLoadingMore]="feedService.isLoadingMore()"
          [isEmpty]="feedService.isEmpty()"
          [error]="feedService.error()"
          [hasMore]="feedService.hasMore()"
          (postClick)="onPostClick($event)"
          (authorClick)="onAuthorClick($event)"
          (reactClick)="onLikeClick($event)"
          (repostClick)="onRepostClick($event)"
          (shareClick)="onShareClick($event)"
          (menuClick)="onMenuClick($event)"
          (loadMore)="onLoadMore()"
          (retry)="onRetry()"
          (emptyCta)="onEmptyCta()"
        />
      </ion-content>
    </div>
  `,
  styles: [
    `
      /* ============================================
         FEED SHELL - Main Container
         2026 Professional Native-Style Design
         ============================================ */

      :host {
        display: block;
        height: 100%;

        --shell-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --shell-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --shell-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --shell-primary: var(--nxt1-color-primary, #d4ff00);
        --shell-text-primary: var(--nxt1-color-text-primary, #ffffff);
      }

      .feed-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--shell-bg);
      }

      /* ============================================
         NEW POSTS BANNER
         ============================================ */

      .feed-shell__new-posts {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 20px;
        margin: 12px 16px;
        background: var(--shell-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        animation: new-posts-in 0.3s ease-out;
        box-shadow: 0 4px 16px rgba(212, 255, 0, 0.3);

        ion-icon {
          font-size: 18px;
        }

        &:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      @keyframes new-posts-in {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .feed-shell__content {
        flex: 1;
        --background: var(--shell-bg);
      }

      /* ============================================
         FLOATING ACTION BUTTON
         ============================================ */

      ion-fab {
        margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
        margin-right: 16px;
      }

      ion-fab-button {
        --background: var(--shell-primary);
        --background-activated: var(--shell-primary);
        --background-hover: var(--shell-primary);
        --color: #000;
        --box-shadow: 0 4px 16px rgba(212, 255, 0, 0.4);

        &::part(native) {
          transition: transform 0.2s ease;
        }

        &:hover::part(native) {
          transform: scale(1.05);
        }

        ion-icon {
          font-size: 28px;
        }
      }

      /* ============================================
         PULL TO REFRESH
         ============================================ */

      ion-refresher-content {
        --color: var(--shell-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedShellComponent implements OnInit {
  protected readonly feedService = inject(FeedService);
  private readonly haptics = inject(HapticsService);
  private readonly elementRef = inject(ElementRef);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postSelect = output<FeedPost>();
  readonly authorSelect = output<FeedAuthor>();
  readonly commentOpen = output<FeedPost>();
  readonly menuOpen = output<FeedPost>();
  readonly explorePeople = output<void>();

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load initial feed
    this.feedService.loadFeed();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onRefresh(event: CustomEvent): Promise<void> {
    await this.feedService.refresh();

    // Complete the refresher
    const refresher = event.target as HTMLIonRefresherElement;
    refresher?.complete();
  }

  protected async onLoadNewPosts(): Promise<void> {
    await this.haptics.impact('medium');
    await this.feedService.refresh();

    // Scroll to top (SSR-safe: query within component host)
    const content = this.elementRef.nativeElement.querySelector(
      'ion-content'
    ) as HTMLIonContentElement | null;
    content?.scrollToTop(300);
  }

  protected onPostClick(post: FeedPost): void {
    this.feedService.selectPost(post);
    this.postSelect.emit(post);
  }

  protected onAuthorClick(author: FeedAuthor): void {
    this.authorSelect.emit(author);
  }

  protected async onLikeClick(post: FeedPost): Promise<void> {
    await this.feedService.toggleLike(post);
  }

  protected onCommentClick(post: FeedPost): void {
    this.commentOpen.emit(post);
  }

  protected async onRepostClick(_post: FeedPost): Promise<void> {
    // Repost functionality — to be implemented
  }

  protected async onShareClick(post: FeedPost): Promise<void> {
    await this.feedService.sharePost(post);
  }

  protected onMenuClick(post: FeedPost): void {
    this.menuOpen.emit(post);
  }

  protected async onLoadMore(): Promise<void> {
    await this.feedService.loadMore();
  }

  protected async onRetry(): Promise<void> {
    await this.feedService.loadFeed();
  }

  protected onEmptyCta(): void {
    // Feed empty state — redirect to explore or agent-x in future
  }
}
