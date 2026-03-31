/**
 * @fileoverview Feed Module Barrel Export
 * @module @nxt1/ui/feed
 *
 * Home Feed UI components and services.
 * Shared between web and mobile applications.
 *
 * @version 1.0.0
 */

// ============================================
// COMPONENTS
// ============================================
export { FeedSkeletonComponent, type FeedSkeletonVariant } from './feed-skeleton.component';
export { FeedEmptyStateComponent } from './feed-empty-state.component';
export { FeedListComponent } from './feed-list.component';
export { FeedShellComponent } from './feed-shell.component';

// ============================================
// POLYMORPHIC SMART SHELL + ATOMIC CARDS
// ============================================
export { FeedCardShellComponent } from './feed-card-shell.component';
export { FeedPostContentComponent } from './feed-post-content.component';
export { FeedStatCardComponent } from './feed-stat-card.component';
export { FeedEventCardComponent } from './feed-event-card.component';
export { FeedMetricsCardComponent } from './feed-metrics-card.component';
export { FeedAwardCardComponent } from './feed-award-card.component';
export { FeedNewsCardComponent } from './feed-news-card.component';

// ============================================
// SERVICES
// ============================================
export { FeedService } from './feed.service';

// ============================================
// INJECTION TOKENS
// ============================================
export { FEED_API } from './feed-api.token';

// ============================================
// MOCK DATA (Development only)
// ============================================
export {
  MOCK_FEED_POSTS,
  getMockFeedPosts,
  getMockPost,
  mockToggleLike,
  mockToggleBookmark,
} from './feed.mock-data';
