/**
 * @fileoverview Post Detail Route Component
 * @module @nxt1/web/features/post
 * @version 1.1.0
 *
 * SSR host route for `/post/:postId`.
 * - Server: emits canonical + OG/Twitter + structured data for share crawlers.
 * - Browser: opens shared post overlay and returns to previous route on close.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  PLATFORM_ID,
  OnInit,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { PostDetailOverlayComponent, type PostDetailInput } from '@nxt1/ui/post-cards';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { buildPostSeoConfig } from '@nxt1/core/seo';
import { SeoService } from '../../core/services';
import { environment } from '../../../environments/environment';

interface PostRouteState {
  readonly post?: PostDetailInput;
  readonly author?: {
    readonly name?: string;
    readonly avatarUrl?: string;
  };
}

interface FetchedPostAuthor {
  readonly displayName?: string;
  readonly username?: string;
  readonly profileImg?: string;
}

interface FetchedPostData extends PostDetailInput {
  readonly author?: FetchedPostAuthor;
}

const DEFAULT_SITE_URL = 'https://nxt1sports.com';

@Component({
  selector: 'app-post',
  standalone: true,
  imports: [],
  template: `
    <div class="post-route-host" role="status" [attr.aria-busy]="isLoading()">
      @if (isLoading()) {
        <div class="post-route-loading" aria-label="Loading post...">
          <div class="post-route-loading__spinner" aria-hidden="true"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        width: 100%;
      }

      .post-route-host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 200px;
      }

      .post-route-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }

      .post-route-loading__spinner {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: var(--nxt1-color-primary, #d4ff00);
        animation: spin 0.75s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly http = inject(HttpClient);
  private readonly seo = inject(SeoService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('PostComponent');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  protected readonly isLoading = signal(true);

  constructor() {
    afterNextRender(() => {
      void this.initPostOverlay();
    });
  }

  ngOnInit(): void {
    const postId = this.route.snapshot.paramMap.get('postId') ?? '';

    this.breadcrumb.trackStateChange('post:route-init', { postId });

    this.applyFallbackSeo(postId);

    // Server-side enrichment for crawlers and social unfurling.
    if (!isPlatformBrowser(this.platformId)) {
      void this.fetchAndApplySeo(postId);
    }
  }

  private async fetchAndApplySeo(postId: string): Promise<void> {
    if (!postId) return;

    try {
      const response = await this.fetchPostById(postId);
      if (!response?.success || !response.data) {
        this.logger.warn('SSR post SEO fetch returned no data', { postId });
        this.applyFallbackSeo(postId);
        return;
      }

      const post = response.data;
      const authorName = post.author?.displayName ?? post.author?.username ?? 'Athlete';
      const postTitle = post.title?.trim() || post.body?.trim().slice(0, 80) || 'Post';
      const description =
        post.body?.trim().slice(0, 160) ||
        `${authorName} shared a ${post.type || 'post'} on NXT1 Sports.`;

      this.applyPostSeo({
        postId,
        title: postTitle,
        description,
        imageUrl: post.thumbnailUrl ?? post.mediaUrl,
        authorName,
        type: post.type,
        createdAt: post.createdAt,
      });

      this.logger.info('SSR post SEO enriched', { postId, title: postTitle });
    } catch (err) {
      this.logger.warn('SSR post SEO fetch failed, using fallback', {
        postId,
        reason: String(err),
      });
      this.applyFallbackSeo(postId);
    }
  }

  private applyFallbackSeo(postId: string): void {
    const shortId = postId ? postId.slice(0, 8) : 'post';

    this.applyPostSeo({
      postId,
      title: `Post ${shortId}`,
      description:
        'View this post on NXT1 Sports, the AI-powered sports intelligence platform for athletes, coaches, scouts, and teams.',
      type: 'post',
    });
  }

  private applyPostSeo(input: {
    postId: string;
    title: string;
    description: string;
    imageUrl?: string;
    authorName?: string;
    type?: string;
    createdAt?: string;
  }): void {
    const config = buildPostSeoConfig(
      {
        type: 'post',
        id: input.postId,
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        authorName: input.authorName ?? 'Athlete',
        authorAvatar: undefined,
        createdAt: input.createdAt ?? new Date().toISOString(),
        postType: input.type,
      },
      environment.webUrl || DEFAULT_SITE_URL
    );

    this.seo.applySeoConfig(config);
  }

  private async initPostOverlay(): Promise<void> {
    const postId = this.route.snapshot.paramMap.get('postId') ?? '';
    const routeState = this.readRouteState();

    if (!postId) {
      this.logger.warn('Post route loaded without postId — redirecting home');
      void this.router.navigate(['/']);
      return;
    }

    this.isLoading.set(true);
    this.breadcrumb.trackStateChange('post:loading', { postId });

    try {
      let post: PostDetailInput | null = null;
      let authorName = routeState.author?.name ?? 'Athlete';
      let authorAvatar = routeState.author?.avatarUrl;

      if (routeState.post && routeState.post.id === postId) {
        post = routeState.post;
      }

      if (!post) {
        const response = await this.fetchPostById(postId);
        if (!response?.success || !response.data) {
          throw new Error(`Post ${postId} not found`);
        }

        const apiPost = response.data;
        post = apiPost;
        authorName = apiPost.author?.displayName ?? apiPost.author?.username ?? authorName;
        authorAvatar = apiPost.author?.profileImg ?? authorAvatar;
      }

      this.breadcrumb.trackStateChange('post:loaded', { postId, postType: post.type });
      this.analytics?.trackEvent(APP_EVENTS.POST_VIEWED, {
        post_id: postId,
        post_type: post.type,
      });

      this.isLoading.set(false);

      const ref = this.overlay.open<PostDetailOverlayComponent, void>({
        component: PostDetailOverlayComponent,
        inputs: {
          post,
          author: {
            name: authorName,
            avatarUrl: authorAvatar,
          },
        },
        size: 'xl',
        backdropDismiss: true,
        escDismiss: true,
        ariaLabel: post.title ? `Post: ${post.title}` : 'Post detail',
      });

      await ref.closed;
    } catch (err) {
      this.logger.error('Failed to load post for overlay', err, { postId });
      this.isLoading.set(false);
    }

    this.navigateBack();
  }

  private navigateBack(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Angular sets `navigationId` on window.history.state for every router
    // navigation. A value > 1 means the router navigated here from within
    // the app (safe to go back in history). A value of 1 (or missing) means
    // this was the very first Angular navigation — i.e. a direct link opened
    // in a new tab or from an external share — so we push the user to Agent X
    // instead of calling location.back() which would exit the site.
    const historyState = window.history.state as { navigationId?: number } | null;
    if (historyState?.navigationId && historyState.navigationId > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/agent-x']);
    }
  }

  private readRouteState(): PostRouteState {
    const navState = this.router.getCurrentNavigation()?.extras.state as PostRouteState | undefined;
    if (navState?.post) return navState;

    const locationState = this.location.getState() as PostRouteState | undefined;
    return locationState ?? {};
  }

  private fetchPostById(postId: string): Promise<{ success: boolean; data?: FetchedPostData }> {
    const url = `${environment.apiURL}/feed/posts/${encodeURIComponent(postId)}`;
    return firstValueFrom(this.http.get<{ success: boolean; data?: FetchedPostData }>(url));
  }
}
