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
import type {
  FeedItem,
  FeedItemPost,
  FeedItemEvent,
  FeedItemStat,
  FeedItemOffer,
  FeedItemVisit,
  FeedItemCamp,
  FeedItemBase,
  FeedEngagement,
  FeedUserEngagement,
  FeedScheduleData,
} from './feed.types';
import type { ProfilePost, ProfilePostType } from '../profile/profile.types';
import type { ProfileUser, ProfileOffer, ProfileEvent } from '../profile/profile.types';
import type { TeamProfilePost, TeamProfilePostType } from '../team-profile/team-profile.types';
import type { TeamProfileTeam } from '../team-profile/team-profile.types';

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
    avatarUrl: user.profileImg ?? undefined,
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
 * Converts a ProfileRecruitingActivity (offer/interest/commitment) to a FeedPost
 * for unified timeline rendering. Creates a rich card with college branding.
 */
export function profileOfferToFeedPost(offer: ProfileOffer, author: FeedAuthor): FeedPost {
  const categoryLabels: Record<string, string> = {
    offer: 'Scholarship Offer',
    interest: 'Interest',
    commitment: 'Commitment',
    visit: 'Visit',
    camp: 'Camp',
  };

  const scholarshipLabels: Record<string, string> = {
    full: 'Full Scholarship',
    partial: 'Partial Scholarship',
    preferred_walk_on: 'Preferred Walk-On',
    walk_on: 'Walk-On',
  };

  // Build display label from category + scholarshipType
  const label =
    offer.category === 'offer' && offer.scholarshipType
      ? (scholarshipLabels[offer.scholarshipType] ?? 'Offer')
      : (categoryLabels[offer.category] ?? 'Offer');

  const title = `${label} from ${offer.collegeName}`;
  const content = offer.coachName
    ? `Received ${label.toLowerCase()} from ${offer.collegeName}${offer.conference ? ` (${offer.conference})` : ''}. Coach ${offer.coachName}`
    : `Received ${label.toLowerCase()} from ${offer.collegeName}${offer.conference ? ` (${offer.conference})` : ''}`;

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
        offer.scholarshipType === 'preferred_walk_on'
          ? 'preferred-walk-on'
          : offer.category === 'offer'
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
    createdAt: offer.date,
    updatedAt: offer.date,
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

// ============================================
// TEAM PROFILE → FEED POST
// ============================================

/**
 * Maps TeamProfilePostType → FeedPostType.
 * Team posts have types like 'announcement' that don't exist in FeedPostType.
 */
const TEAM_TO_FEED_TYPE: Readonly<Record<TeamProfilePostType, FeedPostType>> = {
  video: 'video',
  image: 'image',
  text: 'text',
  highlight: 'highlight',
  news: 'article',
  announcement: 'text',
};

/**
 * Converts a TeamProfileTeam to a FeedAuthor for post rendering.
 * Teams use 'team' role so the card can display the team logo + name.
 *
 * @param team - The team profile data
 * @returns A FeedAuthor compatible with FeedPostCardComponent
 *
 * @example
 * ```typescript
 * const author = teamToFeedAuthor(team);
 * const feedPost = teamPostToFeedPost(post, author);
 * ```
 */
export function teamToFeedAuthor(team: TeamProfileTeam): FeedAuthor {
  return {
    uid: team.id,
    profileCode: team.slug,
    displayName: team.teamName,
    firstName: team.teamName,
    lastName: '',
    avatarUrl: team.logoUrl,
    role: 'team' as FeedAuthor['role'],
    verificationStatus: team.verificationStatus,
    isVerified: team.verificationStatus === 'verified' || team.verificationStatus === 'premium',
    sport: team.sport,
    schoolName: team.teamName,
    schoolLogoUrl: team.logoUrl,
  };
}

/**
 * Builds a FeedMedia array from a TeamProfilePost's single media fields.
 * TeamProfilePost has flat thumbnailUrl/mediaUrl while FeedPost has a media array.
 */
function buildMediaFromTeamPost(post: TeamProfilePost): readonly FeedMedia[] {
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
      altText: post.title ?? 'Team post media',
    },
  ];
}

/**
 * Converts a TeamProfilePost to a FeedPost for unified rendering.
 *
 * This enables the shared FeedPostCardComponent to render team posts
 * with identical styles to posts on the athlete profile and home feed.
 *
 * @param post - The team post to convert
 * @param author - The team as a FeedAuthor (from teamToFeedAuthor)
 * @returns A FeedPost compatible with FeedPostCardComponent
 *
 * @example
 * ```typescript
 * import { teamPostToFeedPost, teamToFeedAuthor } from '@nxt1/core';
 *
 * const author = teamToFeedAuthor(team);
 * const feedPosts = teamPosts.map(p => teamPostToFeedPost(p, author));
 * ```
 */
export function teamPostToFeedPost(post: TeamProfilePost, author: FeedAuthor): FeedPost {
  return {
    id: post.id,
    type: TEAM_TO_FEED_TYPE[post.type] ?? 'text',
    visibility: 'public',
    author,
    content: post.body,
    media: buildMediaFromTeamPost(post),
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
 * Batch-converts an array of TeamProfilePosts to FeedPosts.
 * Optimized for use in computed signals — same author reference shared.
 *
 * @param posts - Array of team profile posts
 * @param author - The team as a FeedAuthor
 * @returns Array of FeedPosts
 */
export function teamPostsToFeedPosts(
  posts: readonly TeamProfilePost[],
  author: FeedAuthor
): readonly FeedPost[] {
  return posts.map((post) => teamPostToFeedPost(post, author));
}

// ============================================
// POLYMORPHIC FEED ITEM HELPERS (2026)
// ============================================

/**
 * Default empty engagement counters for newly assembled feed items.
 */
const EMPTY_ENGAGEMENT: FeedEngagement = {
  reactionCount: 0,
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  shareCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
};

/**
 * Default user engagement state (no interactions).
 */
const EMPTY_USER_ENGAGEMENT: FeedUserEngagement = {
  isReacted: false,
  reactionType: null,
  isLiked: false,
  isBookmarked: false,
  isReposted: false,
  isFollowingAuthor: false,
};

/**
 * Construct the shared base fields for a FeedItem.
 */
function buildFeedItemBase(
  id: string,
  author: FeedAuthor,
  createdAt: string,
  overrides?: {
    engagement?: Partial<FeedEngagement>;
    userEngagement?: Partial<FeedUserEngagement>;
    isPinned?: boolean;
    isFeatured?: boolean;
  }
): Omit<FeedItemBase, 'feedType'> {
  return {
    id,
    author,
    engagement: { ...EMPTY_ENGAGEMENT, ...overrides?.engagement },
    userEngagement: { ...EMPTY_USER_ENGAGEMENT, ...overrides?.userEngagement },
    isPinned: overrides?.isPinned ?? false,
    isFeatured: overrides?.isFeatured ?? false,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Convert a legacy FeedPost to the new FeedItemPost variant.
 * Used during migration to bridge old-style data into the union.
 */
export function feedPostToFeedItem(post: FeedPost): FeedItemPost {
  return {
    ...buildFeedItemBase(post.id, post.author, post.createdAt, {
      engagement: post.engagement,
      userEngagement: post.userEngagement,
      isPinned: post.isPinned,
      isFeatured: post.isFeatured,
    }),
    feedType: 'POST',
    postType: post.type,
    visibility: post.visibility,
    title: post.title,
    content: post.content,
    richContent: post.richContent,
    media: post.media,
    hashtags: post.hashtags,
    mentions: post.mentions,
    location: post.location,
    externalSource: post.externalSource,
    commentsDisabled: post.commentsDisabled,
    postTags: post.postTags,
    repostData: post.repostData,
    updatedAt: post.updatedAt,
  };
}

/**
 * Convert a Firestore Events document into a FeedItemEvent.
 * Called by the backend timeline assembler.
 */
export function eventDocToFeedItemEvent(
  docId: string,
  data: {
    date: string;
    opponent?: string;
    opponentLogoUrl?: string;
    location?: string;
    isHome?: boolean;
    status?: string;
    result?: { teamScore?: number; opponentScore?: number; outcome?: string; overtime?: boolean };
    sport?: string;
    teamId?: string;
  },
  author: FeedAuthor
): FeedItemEvent {
  const resultStr =
    data.result && data.status === 'final'
      ? `${data.result.outcome === 'win' ? 'W' : data.result.outcome === 'loss' ? 'L' : 'T'} ${data.result.teamScore ?? 0}-${data.result.opponentScore ?? 0}`
      : undefined;

  return {
    ...buildFeedItemBase(`event-${docId}`, author, data.date),
    feedType: 'EVENT',
    referenceId: docId,
    eventData: {
      eventTitle: data.opponent ? `vs ${data.opponent}` : 'Game',
      opponent: data.opponent,
      opponentLogoUrl: data.opponentLogoUrl,
      venue: data.location,
      dateTime: data.date,
      isHome: data.isHome,
      result: resultStr,
      status: (data.status as FeedScheduleData['status']) ?? 'final',
    },
  };
}

/**
 * Convert a Firestore PlayerStats document into a FeedItemStat.
 * Called by the backend timeline assembler.
 */
export function statDocToFeedItemStat(
  docId: string,
  data: {
    createdAt: string;
    context?: string;
    gameDate?: string;
    gameResult?: string;
    opponent?: string;
    stats: readonly {
      label: string;
      value: string | number;
      unit?: string;
      isHighlight?: boolean;
    }[];
    seasonTotals?: readonly {
      label: string;
      value: string | number;
      unit?: string;
      isHighlight?: boolean;
    }[];
  },
  author: FeedAuthor
): FeedItemStat {
  return {
    ...buildFeedItemBase(`stat-${docId}`, author, data.createdAt),
    feedType: 'STAT',
    referenceId: docId,
    statData: {
      context: data.context ?? 'Stat Update',
      gameDate: data.gameDate,
      gameResult: data.gameResult,
      opponent: data.opponent,
      stats: data.stats,
      seasonTotals: data.seasonTotals,
    },
  };
}

/**
 * Convert a ProfileOffer into a FeedItemOffer.
 */
export function profileOfferToFeedItemOffer(
  offer: ProfileOffer,
  author: FeedAuthor
): FeedItemOffer {
  const media: readonly FeedMedia[] = offer.graphicUrl
    ? [
        {
          id: `${offer.id}-graphic`,
          type: 'image',
          url: offer.graphicUrl,
          thumbnailUrl: offer.graphicUrl,
          altText: `${offer.collegeName} offer graphic`,
        },
      ]
    : [];

  return {
    ...buildFeedItemBase(`offer-${offer.id}`, author, offer.date),
    feedType: 'OFFER',
    referenceId: offer.id,
    offerData: {
      collegeName: offer.collegeName,
      collegeLogoUrl: offer.collegeLogoUrl,
      offerType:
        offer.scholarshipType === 'preferred_walk_on'
          ? 'preferred-walk-on'
          : offer.category === 'offer'
            ? 'scholarship'
            : 'interest',
      sport: offer.sport,
      division: offer.division,
      conference: offer.conference,
    },
    media,
  };
}

/**
 * Convert a ProfileEvent into a FeedItemVisit or FeedItemCamp.
 */
export function profileEventToFeedItemVariant(
  event: ProfileEvent,
  author: FeedAuthor
): FeedItemVisit | FeedItemCamp | FeedItemEvent {
  if (event.type === 'visit') {
    return {
      ...buildFeedItemBase(`visit-${event.id}`, author, event.startDate),
      feedType: 'VISIT',
      referenceId: event.id,
      visitData: {
        collegeName:
          event.name.replace(/\s*(Official|Unofficial)\s*Visit/i, '').trim() || event.name,
        collegeLogoUrl: event.logoUrl,
        visitType: event.name.toLowerCase().includes('official') ? 'official' : 'unofficial',
        location: event.location,
        visitDate: event.startDate,
        endDate: event.endDate,
        graphicUrl: event.graphicUrl,
      },
      media: event.graphicUrl
        ? [
            {
              id: `${event.id}-graphic`,
              type: 'image',
              url: event.graphicUrl,
              thumbnailUrl: event.graphicUrl,
              altText: `${event.name} graphic`,
            },
          ]
        : [],
    };
  }

  if (event.type === 'camp' || event.type === 'combine' || event.type === 'showcase') {
    return {
      ...buildFeedItemBase(`camp-${event.id}`, author, event.startDate),
      feedType: 'CAMP',
      referenceId: event.id,
      campData: {
        campName: event.name,
        campType: event.type as 'camp' | 'combine' | 'showcase',
        location: event.location,
        eventDate: event.startDate,
        logoUrl: event.logoUrl,
        graphicUrl: event.graphicUrl,
      },
      media: event.graphicUrl
        ? [
            {
              id: `${event.id}-graphic`,
              type: 'image',
              url: event.graphicUrl,
              thumbnailUrl: event.graphicUrl,
              altText: `${event.name} graphic`,
            },
          ]
        : [],
    };
  }

  // Default: game or other type → FeedItemEvent
  return {
    ...buildFeedItemBase(`event-${event.id}`, author, event.startDate),
    feedType: 'EVENT',
    referenceId: event.id,
    eventData: {
      eventTitle: event.name,
      venue: event.location,
      dateTime: event.startDate,
      status: 'final',
    },
  };
}

/**
 * Builds a polymorphic unified activity feed from profile data.
 * This is the 2026 replacement for buildUnifiedActivityFeed.
 *
 * @param posts - User's timeline posts (already as FeedPost[])
 * @param offers - Recruiting offers
 * @param events - Visits, camps, combines, showcases
 * @param author - Profile owner as FeedAuthor
 * @returns Chronologically sorted (newest first) FeedItem array
 */
export function buildPolymorphicActivityFeed(
  posts: readonly FeedPost[],
  offers: readonly ProfileOffer[],
  events: readonly ProfileEvent[],
  author: FeedAuthor
): readonly FeedItem[] {
  const items: FeedItem[] = [];

  for (const post of posts) {
    items.push(feedPostToFeedItem(post));
  }

  for (const offer of offers) {
    items.push(profileOfferToFeedItemOffer(offer, author));
  }

  for (const event of events) {
    items.push(profileEventToFeedItemVariant(event, author));
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return items;
}
