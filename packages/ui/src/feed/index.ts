/**
 * @fileoverview Post Cards Module Barrel Export
 * @module @nxt1/ui/feed
 *
 * Polymorphic post card components used by profile and team timelines.
 * Shared between web and mobile applications.
 *
 * @version 1.0.0
 */

// ============================================
// COMPONENTS
// ============================================
export {
  FeedSkeletonComponent,
  type FeedSkeletonVariant,
} from '../post-cards/feed-skeleton.component';
export { FeedEmptyStateComponent } from '../post-cards/feed-empty-state.component';

// ============================================
// POLYMORPHIC SMART SHELL + ATOMIC CARDS
// ============================================
export { FeedCardShellComponent } from '../post-cards/feed-card-shell.component';
export { FeedPostContentComponent } from '../post-cards/feed-post-content.component';
export { FeedStatCardComponent } from '../post-cards/feed-stat-card.component';
export { FeedEventCardComponent } from '../post-cards/feed-event-card.component';
export { FeedMetricsCardComponent } from '../post-cards/feed-metrics-card.component';
export { FeedAwardCardComponent } from '../post-cards/feed-award-card.component';
export { FeedNewsCardComponent } from '../post-cards/feed-news-card.component';

// ============================================
// INJECTION TOKENS
// ============================================
export { FEED_ENGAGEMENT, type FeedEngagementAdapter } from '../post-cards/feed-engagement.token';

// ============================================
