/**
 * @fileoverview Team News Helpers — Pure Mappers
 * @module @nxt1/core/team-profile
 * @version 1.0.0
 *
 * Pure functions that convert `TeamProfilePost` (news / announcement posts)
 * into the display-adapter `NewsBoardItem` shape consumed by the shared
 * NewsBoardComponent.
 *
 * 100% portable — NO platform dependencies.
 */

import type { TeamProfilePost } from './team-profile.types';
import type { NewsBoardCategory, NewsBoardItem } from '../news/news-board.types';

// ============================================
// TeamProfilePost → NewsBoardItem
// ============================================

/**
 * Derive the normalised board category from a `TeamProfilePost.type`.
 *
 * | Post type        | Board category   |
 * |------------------|------------------|
 * | `'announcement'` | `'announcement'` |
 * | `'news'`         | `'news'`         |
 * | (other)          | `'news'`         |
 */
function resolveCategory(postType: string): NewsBoardCategory {
  if (postType === 'announcement') return 'announcement';
  return 'news';
}

/**
 * Map a single `TeamProfilePost` to the display-adapter `NewsBoardItem`.
 */
function mapPostToBoardItem(post: TeamProfilePost): NewsBoardItem {
  return {
    id: post.id,
    title: post.title ?? '',
    excerpt: post.body ?? '',
    imageUrl: post.thumbnailUrl,
    sourceName: undefined,
    sourceAvatarUrl: undefined,
    category: resolveCategory(post.type),
    publishedAt: post.createdAt,
    readingTimeMinutes: undefined,
    likeCount: post.likeCount || undefined,
    commentCount: post.commentCount || undefined,
    ctaLabel: undefined,
  };
}

/**
 * Map an array of `TeamProfilePost[]` (news/announcement posts)
 * to `NewsBoardItem[]`.
 *
 * @example
 * ```typescript
 * import { mapTeamPostsToNewsBoardItems } from '@nxt1/core';
 *
 * const items = mapTeamPostsToNewsBoardItems(teamService.newsPosts());
 * ```
 */
export function mapTeamPostsToNewsBoardItems(
  posts: readonly TeamProfilePost[]
): readonly NewsBoardItem[] {
  return posts.map(mapPostToBoardItem);
}
