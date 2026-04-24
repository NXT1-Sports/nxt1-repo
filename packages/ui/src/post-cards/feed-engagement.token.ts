/**
 * @fileoverview Feed Engagement Injection Token
 * @module @nxt1/ui/feed
 *
 * Defines a cross-platform interface for recording post engagement (share + view).
 * The shell component injects this token optionally — every platform (web, mobile)
 * provides its own implementation at the app or route level.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { InjectionToken } from '@angular/core';
import type { FeedItem } from '@nxt1/core';

// ============================================
// INTERFACE
// ============================================

/**
 * Platform-agnostic contract for feed post engagement actions.
 * Implementations live in each app (web: FeedEngagementWebService).
 */
export interface FeedEngagementAdapter {
  /**
   * Trigger the native share sheet and increment the backend shareCount.
   * @param item - The full FeedItem being shared
   */
  sharePost(item: FeedItem): Promise<void>;

  /**
   * Record a view impression. Fire-and-forget.
   * Only called for items with real Firestore Post IDs (feedType === 'POST').
   * @param postId - Firestore Post document ID
   */
  viewPost(postId: string): void;
}

// ============================================
// TOKEN
// ============================================

export const FEED_ENGAGEMENT = new InjectionToken<FeedEngagementAdapter>('FEED_ENGAGEMENT');
