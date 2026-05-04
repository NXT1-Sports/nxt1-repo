/**
 * @fileoverview Post Detail Overlay Service
 * @module @nxt1/ui/post-cards
 * @version 1.0.0
 *
 * Encapsulates opening a PostDetailOverlayComponent via NxtOverlayService.
 * SSR-safe — no-ops on server.
 *
 * Usage:
 * ```typescript
 * const postDetail = inject(PostDetailOverlayService);
 * await postDetail.open({ post, author: { name: 'John Smith' }, userUnicode: '123456' });
 * ```
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtOverlayService } from '../components/overlay/overlay.service';
import {
  PostDetailOverlayComponent,
  type PostDetailInput,
  type PostAuthorInfo,
} from './post-detail-overlay.component';

export interface OpenPostDetailOptions {
  /** Normalized post data to display */
  readonly post: PostDetailInput;
  /** Author info shown in the overlay header */
  readonly author?: PostAuthorInfo;
  /**
   * User or team unicode for URL state reflection.
   * When provided the browser URL is updated to `/post/{userUnicode}/{postId}`
   * via History API (no Angular navigation) while the overlay is open.
   */
  readonly userUnicode?: string;
}

@Injectable({ providedIn: 'root' })
export class PostDetailOverlayService {
  private readonly overlay = inject(NxtOverlayService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('PostDetailOverlayService');

  /**
   * Open the post detail overlay.
   *
   * On browser:
   * 1. Reflects a canonical `/post/{unicode}/{id}` URL in the current history entry
   * 2. Opens the overlay with post data
   * 3. On close, restores the previous URL/state in-place
   *
   * On server: no-op.
   */
  async open(options: OpenPostDetailOptions): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const { post, author = { name: 'Athlete' }, userUnicode } = options;

    // Build canonical post URL for URL reflection + deep-link sharing
    const canonicalPath = userUnicode
      ? `/post/${encodeURIComponent(userUnicode)}/${encodeURIComponent(post.id)}`
      : `/post/_/${encodeURIComponent(post.id)}`;

    const previousState = window.history.state;
    const previousUrl = window.location.pathname + window.location.search;
    const overlayStateId = `${Date.now()}-${post.id}`;

    this.logger.info('Opening post detail overlay', {
      postId: post.id,
      postType: post.type,
      userUnicode,
    });

    // Reflect the canonical post URL without adding a new browser history entry.
    // This keeps copy/share URLs correct while the overlay is open, but closing
    // the overlay should leave the user on the exact same page stack position.
    window.history.replaceState(
      { nxt1PostOverlay: true, previousUrl, overlayStateId },
      '',
      canonicalPath
    );

    try {
      const ref = this.overlay.open<PostDetailOverlayComponent, void>({
        component: PostDetailOverlayComponent,
        inputs: {
          post,
          author,
        },
        size: 'xl',
        backdropDismiss: true,
        escDismiss: true,
        ariaLabel: post.title ? `Post: ${post.title}` : 'Post detail',
      });

      await ref.closed;
      this.logger.info('Post detail overlay closed', { postId: post.id });
    } finally {
      // Restore the original route in-place so closing the overlay does not
      // trigger a same-page route navigation or add an extra Back step.
      const currentState = window.history.state as {
        nxt1PostOverlay?: boolean;
        overlayStateId?: string;
      } | null;

      if (currentState?.nxt1PostOverlay && currentState.overlayStateId === overlayStateId) {
        window.history.replaceState(previousState ?? null, '', previousUrl);
      } else if (window.location.pathname + window.location.search !== previousUrl) {
        // Fallback for unexpected history mutations while the overlay was open.
        window.history.replaceState(previousState ?? null, '', previousUrl);
      }
    }
  }
}
