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
import type { ProfileUser, ProfileOffer, ProfileEvent } from '../profile/profile.types';

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

// ============================================
// PROFILE OFFER → FEED POST
// ============================================

/**
 * Converts a ProfileOffer to a FeedPost for unified timeline rendering.
 * Creates a rich offer card with college branding.
 */
export function profileOfferToFeedPost(offer: ProfileOffer, author: FeedAuthor): FeedPost {
  const offerLabels: Record<string, string> = {
    scholarship: 'Scholarship Offer',
    preferred_walk_on: 'Preferred Walk-On',
    interest: 'Interest',
  };

  const title = `${offerLabels[offer.type] ?? 'Offer'} from ${offer.collegeName}`;
  const content = offer.coachName
    ? `Received ${(offerLabels[offer.type] ?? 'an offer').toLowerCase()} from ${offer.collegeName}${offer.conference ? ` (${offer.conference})` : ''}. ${offer.coachName ? `Coach ${offer.coachName}` : ''}`
    : `Received ${(offerLabels[offer.type] ?? 'an offer').toLowerCase()} from ${offer.collegeName}${offer.conference ? ` (${offer.conference})` : ''}`;

  const media: readonly FeedMedia[] = offer.graphicUrl
    ? [
        {
          id: `${offer.id}-graphic`,
          type: 'image' as const,
          url: offer.graphicUrl,
          thumbnailUrl: offer.graphicUrl,
          altText: `${offer.collegeName} offer graphic`,
        },
      ]
    : [];

  return {
    id: `activity-offer-${offer.id}`,
    type: 'offer',
    visibility: 'public',
    author,
    title,
    content,
    media,
    offerData: {
      collegeName: offer.collegeName,
      collegeLogoUrl: offer.collegeLogoUrl,
      offerType:
        offer.type === 'preferred_walk_on'
          ? 'preferred-walk-on'
          : offer.type === 'scholarship'
            ? 'scholarship'
            : 'interest',
      sport: offer.sport,
      division: offer.division,
      conference: offer.conference,
    },
    engagement: {
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      reactionCount: 0,
      repostCount: 0,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
      isReacted: false,
      reactionType: null,
    },
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: offer.offeredAt,
    updatedAt: offer.offeredAt,
  };
}

// ============================================
// PROFILE EVENT → FEED POST
// ============================================

/**
 * Converts a ProfileEvent to a FeedPost for unified timeline rendering.
 * Maps event types (visit, camp, combine, showcase) to FeedPost types.
 */
export function profileEventToFeedPost(event: ProfileEvent, author: FeedAuthor): FeedPost {
  const typeMap: Record<string, FeedPostType> = {
    visit: 'visit',
    camp: 'camp',
    combine: 'camp',
    showcase: 'camp',
    game: 'game',
    practice: 'schedule',
    other: 'schedule',
  };

  const feedPostType: FeedPostType = typeMap[event.type] ?? 'schedule';

  const media: readonly FeedMedia[] = event.graphicUrl
    ? [
        {
          id: `${event.id}-graphic`,
          type: 'image' as const,
          url: event.graphicUrl,
          thumbnailUrl: event.graphicUrl,
          altText: `${event.name} graphic`,
        },
      ]
    : [];

  // Build type-specific data
  const visitData =
    event.type === 'visit'
      ? {
          collegeName:
            event.name.replace(/\s*(Official|Unofficial)\s*Visit/i, '').trim() || event.name,
          collegeLogoUrl: event.logoUrl,
          visitType: event.name.toLowerCase().includes('official')
            ? ('official' as const)
            : ('unofficial' as const),
          location: event.location,
          visitDate: event.startDate,
          endDate: event.endDate,
          graphicUrl: event.graphicUrl,
        }
      : undefined;

  const campData =
    event.type === 'camp' || event.type === 'combine' || event.type === 'showcase'
      ? {
          campName: event.name,
          campType: event.type as 'camp' | 'combine' | 'showcase',
          location: event.location,
          eventDate: event.startDate,
          logoUrl: event.logoUrl,
          graphicUrl: event.graphicUrl,
        }
      : undefined;

  return {
    id: `activity-event-${event.id}`,
    type: feedPostType,
    visibility: 'public',
    author,
    title: event.name,
    content: event.description,
    media,
    visitData,
    campData,
    location: event.location,
    engagement: {
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      reactionCount: 0,
      repostCount: 0,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
      isReacted: false,
      reactionType: null,
    },
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: event.startDate,
    updatedAt: event.startDate,
  };
}

// ============================================
// UNIFIED ACTIVITY FEED BUILDER
// ============================================

/**
 * Builds a unified activity feed by merging all profile sections into
 * a chronologically sorted array of FeedPosts.
 *
 * This is the core function for the unified timeline — every profile
 * section (posts, offers, events, etc.) gets converted to FeedPost
 * and sorted newest-first.
 *
 * @param posts - User's timeline posts
 * @param offers - Recruiting offers
 * @param events - Visits, camps, combines, showcases
 * @param author - Profile owner as FeedAuthor
 * @returns Chronologically sorted (newest first) unified FeedPost array
 */
export function buildUnifiedActivityFeed(
  posts: readonly ProfilePost[],
  offers: readonly ProfileOffer[],
  events: readonly ProfileEvent[],
  author: FeedAuthor
): readonly FeedPost[] {
  const feedPosts: FeedPost[] = [];

  // Convert posts
  for (const post of posts) {
    feedPosts.push(profilePostToFeedPost(post, author));
  }

  // Convert offers
  for (const offer of offers) {
    feedPosts.push(profileOfferToFeedPost(offer, author));
  }

  // Convert events
  for (const event of events) {
    feedPosts.push(profileEventToFeedPost(event, author));
  }

  // Sort newest first
  feedPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return feedPosts;
}
