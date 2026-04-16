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
export { FeedSkeletonComponent, type FeedSkeletonVariant } from './feed-skeleton.component';
export { FeedEmptyStateComponent } from './feed-empty-state.component';

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
// INJECTION TOKENS
// ============================================
export { FEED_API } from './feed-api.token';

// ============================================
