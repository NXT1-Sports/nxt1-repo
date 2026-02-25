/**
 * @fileoverview Feed Data Mappers
 * @module @nxt1/core/feed
 * @version 1.0.0
 *
 * Pure TypeScript mapper functions for converting between different
 * post data models. Enables unified rendering across feed and profile.
 *
 * 100% Portable — NO platform dependencies.
 */

import type { FeedPost, FeedPostType, FeedAuthor, FeedMedia } from './feed.types';
import type { ProfilePost, ProfilePostType } from '../profile/profile.types';
import type { ProfileUser } from '../profile/profile.types';

// ============================================
// TYPE MAPPINGS
// ============================================

/**
 * Maps ProfilePostType → FeedPostType.
 * Profile has types like 'news' and 'stat' that don't exist in FeedPostType.
 */
const PROFILE_TO_FEED_TYPE: Readonly<Record<ProfilePostType, FeedPostType>> = {
  video: 'video',
  image: 'image',
  text: 'text',
  highlight: 'highlight',
  news: 'article',
  stat: 'text',
  offer: 'offer',
};

// ============================================
// PROFILE USER → FEED AUTHOR
// ============================================

/**
 * Converts a ProfileUser to a FeedAuthor for post rendering.
 *
 * @param user - The profile user data
 * @returns A FeedAuthor compatible with FeedPostCardComponent
 *
 * @example
 * ```typescript
 * const author = profileUserToFeedAuthor(profileUser);
 * const feedPost = profilePostToFeedPost(post, author);
 * ```
 */
export function profileUserToFeedAuthor(user: ProfileUser): FeedAuthor {
  return {
    uid: user.uid,
    profileCode: user.profileCode,
    displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.profileImg,
    role: user.role as FeedAuthor['role'],
    verificationStatus: user.verificationStatus,
    isVerified: user.verificationStatus === 'verified' || user.verificationStatus === 'premium',
    sport: user.primarySport?.name,
    position: user.primarySport?.position,
    schoolName: user.school?.name,
    schoolLogoUrl: user.school?.logoUrl,
    classYear: user.classYear,
  };
}

// ============================================
// PROFILE POST → FEED POST
// ============================================

/**
 * Builds a FeedMedia array from a ProfilePost's single media fields.
 * ProfilePost has flat thumbnailUrl/mediaUrl while FeedPost has a media array.
 */
function buildMediaFromProfilePost(post: ProfilePost): readonly FeedMedia[] {
  if (!post.thumbnailUrl && !post.mediaUrl) return [];

  const mediaType: FeedMedia['type'] =
    post.type === 'video' || post.type === 'highlight' ? 'video' : 'image';

  return [
    {
      id: `${post.id}-media-0`,
      type: mediaType,
      url: post.mediaUrl ?? post.thumbnailUrl!,
      thumbnailUrl: post.thumbnailUrl,
      duration: post.duration,
      altText: post.title ?? 'Post media',
    },
  ];
}

/**
 * Converts a ProfilePost to a FeedPost for unified rendering.
 *
 * This enables the shared FeedPostCardComponent to render posts
 * from profile pages with identical styles to the home feed.
 *
 * @param post - The profile post to convert
 * @param author - The profile owner as a FeedAuthor
 * @returns A FeedPost compatible with FeedPostCardComponent
 *
 * @example
 * ```typescript
 * import { profilePostToFeedPost, profileUserToFeedAuthor } from '@nxt1/core';
 *
 * const author = profileUserToFeedAuthor(profileUser);
 * const feedPosts = profilePosts.map(p => profilePostToFeedPost(p, author));
 * ```
 */
export function profilePostToFeedPost(post: ProfilePost, author: FeedAuthor): FeedPost {
  return {
    id: post.id,
    type: PROFILE_TO_FEED_TYPE[post.type] ?? 'text',
    visibility: 'public',
    author,
    content: post.body,
    media: buildMediaFromProfilePost(post),
    title: post.title,
    engagement: {
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      viewCount: post.viewCount ?? 0,
      reactionCount: post.likeCount,
      repostCount: 0,
    },
    userEngagement: {
      isLiked: post.isLiked ?? false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
      isReacted: post.isLiked ?? false,
      reactionType: post.isLiked ? 'like' : null,
    },
    isPinned: post.isPinned ?? false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: post.createdAt,
    updatedAt: post.createdAt,
  };
}

/**
 * Batch-converts an array of ProfilePosts to FeedPosts.
 * Optimized for use in computed signals — same author reference shared.
 *
 * @param posts - Array of profile posts
 * @param author - The profile owner as a FeedAuthor
 * @returns Array of FeedPosts
 */
export function profilePostsToFeedPosts(
  posts: readonly ProfilePost[],
  author: FeedAuthor
): readonly FeedPost[] {
  return posts.map((post) => profilePostToFeedPost(post, author));
}
