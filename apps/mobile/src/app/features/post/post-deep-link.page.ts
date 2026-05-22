/**
 * @fileoverview Post Deep Link Page
 * @module @nxt1/mobile/features/post
 *
 * Handles the `/post/:postId` deep link by resolving the post author's profile
 * code via the API, then navigating to `/profile/:unicode?postId=:postId` so
 * ProfileComponent can auto-open the post detail overlay.
 *
 * Flow:
 *   1. App opens via Universal Link / App Link: https://nxt1sports.com/post/:id
 *   2. DeepLinkService routes to `/post/:postId`
 *   3. This page fetches the post to get the author unicode
 *   4. Navigates to `/profile/:unicode?postId=:id`
 *   5. ProfileComponent auto-opens the PostDetailOverlay
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular/standalone';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { CapacitorHttpAdapter } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

interface PostApiResponse {
  readonly success: boolean;
  readonly data?: {
    readonly id: string;
    readonly author?: {
      /** Author's profileCode (unicode) — used for profile navigation */
      readonly username?: string;
      readonly displayName?: string;
    };
  };
}

@Component({
  selector: 'app-post-deep-link',
  standalone: true,
  imports: [IonContent],
  template: `
    <ion-content>
      @if (error()) {
        <div class="pdl-error">Unable to open post</div>
      } @else {
        <div class="pdl-loading">
          <div class="pdl-spinner"></div>
        </div>
      }
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }
    .pdl-loading,
    .pdl-error {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 60vh;
    }
    .pdl-spinner {
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
    .pdl-error {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
      font-family: var(--nxt1-fontFamily-body, sans-serif);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostDeepLinkPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly logger = inject(NxtLoggingService).child('PostDeepLinkPage');
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  protected readonly error = signal(false);

  ngOnInit(): void {
    const postId = this.route.snapshot.paramMap.get('postId') ?? '';
    this.breadcrumb.trackStateChange('post-deep-link:init', { postId });
    void this.resolveAndNavigate(postId);
  }

  /**
   * Fetch the post from the API to resolve the author's profile code,
   * then navigate to the author's profile with the postId as a query param
   * so ProfileComponent can auto-open the post overlay.
   */
  private async resolveAndNavigate(postId: string): Promise<void> {
    if (!postId) {
      this.logger.warn('PostDeepLinkPage: no postId in route params');
      void this.navController.navigateRoot('/agent-x', { animated: false });
      return;
    }

    this.logger.info('Resolving post deep link', { postId });

    try {
      const response = await this.http.get<PostApiResponse>(
        `${environment.apiUrl}/feed/posts/${encodeURIComponent(postId)}`
      );

      // `author.username` is the author's profileCode (numeric unicode string).
      const unicode = response?.data?.author?.username;

      if (response?.success && unicode) {
        this.logger.info('Post deep link resolved, navigating to author profile', {
          postId,
          unicode,
        });
        void this.navController.navigateForward(
          `/profile/${encodeURIComponent(unicode)}?postId=${encodeURIComponent(postId)}`,
          { animated: false }
        );
      } else {
        this.logger.warn(
          'Post deep link: could not resolve author unicode, falling back to agent-x',
          {
            postId,
            success: response?.success,
          }
        );
        void this.navController.navigateRoot('/agent-x', { animated: false });
      }
    } catch (err) {
      this.logger.error('Post deep link resolution failed, falling back to agent-x', err, {
        postId,
      });
      this.error.set(true);
      // Brief pause so the user sees the error state before the redirect.
      setTimeout(() => {
        void this.navController.navigateRoot('/agent-x', { animated: false });
      }, 1500);
    }
  }
}
