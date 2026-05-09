/**
 * @fileoverview Feed Engagement Mobile Service
 * @module @nxt1/mobile/core/services
 *
 * Mobile implementation of FeedEngagementAdapter.
 * Handles share (native share sheet + backend increment) and view impressions.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { FeedItem } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import type { FeedEngagementAdapter } from '@nxt1/ui/feed';
import { ShareService } from '../native/share.service';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FeedEngagementApiService implements FeedEngagementAdapter {
  private readonly http = inject(HttpClient);
  private readonly shareService = inject(ShareService);
  private readonly logger = inject(NxtLoggingService).child('FeedEngagementApiService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  async sharePost(item: FeedItem): Promise<void> {
    this.breadcrumb.trackStateChange(`feed:share:${item.id}`);
    this.logger.info('Sharing post', { postId: item.id, feedType: item.feedType });

    // Increment backend count (non-blocking)
    this.http.post(`${environment.apiUrl}/engagement/${item.id}/share`, {}).subscribe({
      error: (err) =>
        this.logger.warn('Share count increment failed', {
          postId: item.id,
          error: (err as Error)?.message,
        }),
    });

    const rawItem = item as unknown as Record<string, unknown>;
    const postText = item.feedType === 'POST' ? String(rawItem['content'] ?? '') : '';
    const mediaArr = Array.isArray(rawItem['media'])
      ? (rawItem['media'] as Array<{ url?: string }>)
      : [];

    await this.shareService.sharePost(
      {
        id: item.id,
        slug: item.id,
        authorName: item.author.displayName,
        authorAvatar: item.author.avatarUrl ?? '',
        createdAt: item.createdAt,
        likes: item.engagement.shareCount,
        postText,
        imageUrl: mediaArr[0]?.url,
      },
      { trackAnalytics: false }
    );

    this.analytics?.trackEvent(APP_EVENTS.POST_SHARED, {
      post_id: item.id,
      author_uid: item.author.uid,
      feed_type: item.feedType,
    });

    this.logger.info('Post shared successfully', { postId: item.id });
  }

  viewPost(itemId: string): void {
    this.http.post(`${environment.apiUrl}/engagement/${itemId}/view`, {}).subscribe({
      error: (err) =>
        this.logger.warn('View impression failed', {
          itemId,
          error: (err as Error)?.message,
        }),
    });
  }
}
