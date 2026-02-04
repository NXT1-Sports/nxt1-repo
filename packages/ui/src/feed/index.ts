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
export { FeedPostCardComponent } from './feed-post-card.component';
export { FeedSkeletonComponent, type FeedSkeletonVariant } from './feed-skeleton.component';
export { FeedEmptyStateComponent } from './feed-empty-state.component';
export { FeedListComponent } from './feed-list.component';
export { FeedShellComponent } from './feed-shell.component';

// ============================================
// SERVICES
// ============================================
export { FeedService } from './feed.service';

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
