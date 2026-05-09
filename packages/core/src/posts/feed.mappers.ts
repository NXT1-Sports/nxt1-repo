/**
 * @fileoverview Feed Data Mappers
 * @module @nxt1/core/posts
 * @version 1.0.0
 *
 * Pure TypeScript mapper functions for converting between different
 * post data models. Enables unified rendering across feed and profile.
 *
 * 100% Portable — NO platform dependencies.
 */

import type {
  FeedPost,
  FeedPostType,
  FeedAuthor,
  FeedMedia,
  FeedVideoProcessingStatus,
} from './feed.types';
import type {
  FeedItem,
  FeedItemPost,
  FeedItemEvent,
  FeedItemSchedule,
  FeedItemStat,
  FeedItemMetric,
  FeedItemOffer,
  FeedItemCommitment,
  FeedItemVisit,
  FeedItemCamp,
  FeedItemAward,
  FeedItemNews,
  FeedItemBase,
  FeedEngagement,
  FeedScheduleData,
  FeedExternalSource,
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

  const mediaType: FeedMedia['type'] = post.type === 'video' ? 'video' : 'image';

  const isVideo = mediaType === 'video';
  const cfStatus = post.cloudflareStatus as FeedMedia['processingStatus'] | undefined;

  return [
    {
      id: `${post.id}-media-0`,
      type: mediaType,
      // For CF videos prefer iframeUrl; fall back to mediaUrl (which backend already set to iframeUrl)
      url: (isVideo ? (post.iframeUrl ?? post.mediaUrl) : post.mediaUrl) ?? post.thumbnailUrl!,
      thumbnailUrl: post.thumbnailUrl,
      duration: post.duration,
      altText: post.title ?? 'Post media',
      ...(isVideo && post.cloudflareVideoId ? { cloudflareVideoId: post.cloudflareVideoId } : {}),
      ...(isVideo && post.iframeUrl ? { iframeUrl: post.iframeUrl } : {}),
      ...(isVideo && post.hlsUrl ? { hlsUrl: post.hlsUrl } : {}),
      ...(isVideo && post.dashUrl ? { dashUrl: post.dashUrl } : {}),
      ...(isVideo && cfStatus ? { processingStatus: cfStatus } : {}),
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
    author,
    content: post.body,
    media: buildMediaFromProfilePost(post),
    title: post.title,
    engagement: {
      shareCount: post.shareCount,
      viewCount: post.viewCount ?? 0,
    },
    isPinned: post.isPinned ?? false,
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
      shareCount: 0,
      viewCount: 0,
    },
    isPinned: false,
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
    author,
    title: event.name,
    content: event.description,
    media,
    visitData,
    campData,
    location: event.location,
    engagement: {
      shareCount: 0,
      viewCount: 0,
    },
    isPinned: false,
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
  };
}

/**
 * Builds a FeedMedia array from a TeamProfilePost's single media fields.
 * TeamProfilePost has flat thumbnailUrl/mediaUrl while FeedPost has a media array.
 */
/** Normalizes raw processingStatus strings to the canonical FeedVideoProcessingStatus union. */
function normalizeProcessingStatus(raw: string | undefined): FeedVideoProcessingStatus | undefined {
  switch (raw) {
    case 'ready':
    case 'error':
    case 'queued':
    case 'pendingupload':
      return raw;
    case 'inprogress':
    case 'processing': // legacy alias
      return 'inprogress';
    default:
      return undefined;
  }
}

function buildMediaFromTeamPost(post: TeamProfilePost): readonly FeedMedia[] {
  const hasMedia = post.thumbnailUrl || post.mediaUrl || post.iframeUrl || post.cloudflareVideoId;
  if (!hasMedia) return [];

  const mediaType: FeedMedia['type'] = post.type === 'video' ? 'video' : 'image';
  const processingStatus = normalizeProcessingStatus(post.processingStatus);

  return [
    {
      id: `${post.id}-media-0`,
      type: mediaType,
      url: post.iframeUrl ?? post.mediaUrl ?? post.thumbnailUrl!,
      thumbnailUrl: post.thumbnailUrl,
      iframeUrl: post.iframeUrl ?? post.mediaUrl,
      hlsUrl: post.hlsUrl,
      cloudflareVideoId: post.cloudflareVideoId,
      processingStatus,
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
    author,
    content: post.body,
    media: buildMediaFromTeamPost(post),
    title: post.title,
    engagement: {
      shareCount: post.shareCount,
      viewCount: post.viewCount ?? 0,
    },
    isPinned: post.isPinned ?? false,
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
  shareCount: 0,
  viewCount: 0,
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
    isPinned?: boolean;
  }
): Omit<FeedItemBase, 'feedType'> {
  return {
    id,
    author,
    engagement: { ...EMPTY_ENGAGEMENT, ...overrides?.engagement },
    isPinned: overrides?.isPinned ?? false,
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
      isPinned: post.isPinned,
    }),
    feedType: 'POST',
    postType: post.type,
    title: post.title,
    content: post.content,
    media: post.media,
    location: post.location,
    externalSource: post.externalSource,
    postTags: post.postTags,
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
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemEvent {
  const resultStr =
    data.result && data.status === 'final'
      ? `${data.result.outcome === 'win' ? 'W' : data.result.outcome === 'loss' ? 'L' : 'T'} ${data.result.teamScore ?? 0}-${data.result.opponentScore ?? 0}`
      : undefined;

  return {
    ...buildFeedItemBase(`event-${docId}`, author, data.date, { isPinned }),
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
 * Convert a Firestore Schedule document into a FeedItemSchedule.
 * Used for competitive events: games, scrimmages, practices, playoffs.
 * Produces feedType: 'SCHEDULE' — distinct from exposure Events (feedType: 'EVENT').
 * Called by the backend timeline assembler.
 */
export function scheduleDocToFeedItemSchedule(
  docId: string,
  data: {
    date: string;
    opponent?: string;
    opponentLogoUrl?: string;
    location?: string;
    isHome?: boolean;
    status?: string;
    scheduleType?: string;
    result?: { teamScore?: number; opponentScore?: number; outcome?: string; overtime?: boolean };
    sport?: string;
    teamId?: string;
  },
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemSchedule {
  const resultStr =
    data.result && data.status === 'final'
      ? `${data.result.outcome === 'win' ? 'W' : data.result.outcome === 'loss' ? 'L' : 'T'} ${data.result.teamScore ?? 0}-${data.result.opponentScore ?? 0}`
      : undefined;

  return {
    ...buildFeedItemBase(`schedule-${docId}`, author, data.date, { isPinned }),
    feedType: 'SCHEDULE',
    referenceId: docId,
    scheduleType: data.scheduleType ?? 'game',
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
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemStat {
  return {
    ...buildFeedItemBase(`stat-${docId}`, author, data.createdAt, { isPinned }),
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

function normalizeRecruitingVisitType(
  value: string | undefined
): 'official' | 'unofficial' | 'junior-day' | 'game-day' {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-') ?? '';

  if (normalized === 'official') return 'official';
  if (normalized === 'junior-day') return 'junior-day';
  if (normalized === 'game-day' || normalized === 'gameday') return 'game-day';
  return 'unofficial';
}

function normalizeOfferType(
  category: string,
  scholarshipType?: string
): 'scholarship' | 'preferred-walk-on' | 'walk-on' | 'interest' {
  if (category === 'interest') return 'interest';

  const normalizedScholarship = scholarshipType
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (normalizedScholarship === 'preferred-walk-on') return 'preferred-walk-on';
  if (normalizedScholarship === 'walk-on') return 'walk-on';

  return 'scholarship';
}

/**
 * Convert a Recruiting document into the correct FeedItem variant.
 */
export function recruitingDocToFeedItemVariant(
  docId: string,
  data: {
    category: string;
    collegeName: string;
    collegeLogoUrl?: string;
    division?: string;
    conference?: string;
    sport?: string;
    date: string;
    endDate?: string;
    scholarshipType?: string;
    visitType?: string;
    commitmentStatus?: string;
    announcedAt?: string;
    coachName?: string;
    notes?: string;
    graphicUrl?: string;
  },
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemOffer | FeedItemCommitment | FeedItemVisit | FeedItemCamp | FeedItemAward {
  const category = data.category.trim().toLowerCase();
  const media: readonly FeedMedia[] = data.graphicUrl
    ? [
        {
          id: `${docId}-graphic`,
          type: 'image',
          url: data.graphicUrl,
          thumbnailUrl: data.graphicUrl,
          altText: `${data.collegeName} recruiting graphic`,
        },
      ]
    : [];

  if (category === 'offer' || category === 'interest') {
    return {
      ...buildFeedItemBase(`recruiting-${docId}`, author, data.date, { isPinned }),
      feedType: 'OFFER',
      referenceId: docId,
      offerData: {
        collegeName: data.collegeName,
        collegeLogoUrl: data.collegeLogoUrl,
        offerType: normalizeOfferType(category, data.scholarshipType),
        sport: data.sport ?? '',
        division: data.division,
        conference: data.conference,
      },
      media,
    };
  }

  if (category === 'commitment') {
    const commitmentStatus = data.commitmentStatus?.trim().toLowerCase();
    return {
      ...buildFeedItemBase(`commitment-${docId}`, author, data.announcedAt ?? data.date, {
        isPinned,
      }),
      feedType: 'COMMITMENT',
      referenceId: docId,
      commitmentData: {
        collegeName: data.collegeName,
        collegeLogoUrl: data.collegeLogoUrl,
        sport: data.sport ?? '',
        division: data.division,
        commitDate: data.announcedAt ?? data.date,
        isSigned: commitmentStatus === 'signed' || commitmentStatus === 'enrolled',
      },
      media,
    };
  }

  if (category === 'visit') {
    return {
      ...buildFeedItemBase(`visit-${docId}`, author, data.date, { isPinned }),
      feedType: 'VISIT',
      referenceId: docId,
      visitData: {
        collegeName: data.collegeName,
        collegeLogoUrl: data.collegeLogoUrl,
        visitType: normalizeRecruitingVisitType(data.visitType),
        location: [data.conference, data.division].filter(Boolean).join(' • ') || undefined,
        visitDate: data.date,
        endDate: data.endDate,
        sport: data.sport,
        graphicUrl: data.graphicUrl,
      },
      media,
    };
  }

  if (category === 'camp') {
    return {
      ...buildFeedItemBase(`camp-${docId}`, author, data.date, { isPinned }),
      feedType: 'CAMP',
      referenceId: docId,
      campData: {
        campName: `${data.collegeName} Camp`,
        campType: 'camp',
        location: [data.conference, data.division].filter(Boolean).join(' • ') || undefined,
        eventDate: data.date,
        logoUrl: data.collegeLogoUrl,
        graphicUrl: data.graphicUrl,
      },
      media,
    };
  }

  return {
    ...buildFeedItemBase(`recruiting-${docId}`, author, data.date, { isPinned }),
    feedType: 'AWARD',
    referenceId: docId,
    awardData: {
      awardName:
        category === 'questionnaire'
          ? 'Recruiting Questionnaire Submitted'
          : data.coachName
            ? `Coach Contact: ${data.coachName}`
            : 'Recruiting Activity',
      organization: data.collegeName,
      category: 'Recruiting',
      season: data.sport,
      icon: 'graduation-cap',
    },
  };
}

/**
 * Convert a grouped PlayerMetrics payload into a FeedItemMetric.
 */
export function metricGroupToFeedItemMetric(
  docId: string,
  data: {
    measuredAt: string;
    source: string;
    category?: string;
    metrics: readonly {
      label: string;
      value: string | number;
      unit?: string;
      verified?: boolean;
      previousValue?: string | number;
    }[];
  },
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemMetric {
  return {
    ...buildFeedItemBase(`metric-${docId}`, author, data.measuredAt, { isPinned }),
    feedType: 'METRIC',
    referenceId: docId,
    metricsData: {
      source: data.source,
      measuredAt: data.measuredAt,
      category: data.category,
      metrics: data.metrics,
    },
  };
}

/**
 * Convert a Rankings document into a FeedItemAward.
 */
export function rankingDocToFeedItemAward(
  docId: string,
  data: {
    createdAt: string;
    name: string;
    sport?: string;
    classOf?: number;
    nationalRank?: number | null;
    stateRank?: number | null;
    positionRank?: number | null;
    stars?: number | null;
  },
  author: FeedAuthor,
  isPinned?: boolean
): FeedItemAward {
  const rankingSummary = [
    data.nationalRank != null ? `Nat #${data.nationalRank}` : null,
    data.stateRank != null ? `State #${data.stateRank}` : null,
    data.positionRank != null ? `Pos #${data.positionRank}` : null,
    data.stars != null ? `${data.stars}-Star` : null,
    data.classOf != null ? `Class ${data.classOf}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' • ');

  return {
    ...buildFeedItemBase(`ranking-${docId}`, author, data.createdAt, { isPinned }),
    feedType: 'AWARD',
    referenceId: docId,
    awardData: {
      awardName: rankingSummary || 'Ranking Update',
      organization: data.name,
      category: data.sport ? `${data.sport} rankings` : 'Rankings',
      season: data.sport,
      icon: 'podium',
    },
  };
}

/**
 * Convert a Firestore Videos collection document into a FeedItemPost.
 * Called by the backend timeline assembler to inject scraped highlight
 * videos (Hudl, YouTube, Vimeo, etc.) into the polymorphic timeline.
 */
export function videoDocToFeedItemPost(
  docId: string,
  data: {
    url: string;
    thumbnailUrl?: string;
    title?: string;
    platform?: string;
    source?: string;
    createdAt: string;
  },
  author: FeedAuthor
): FeedItemPost {
  const media: readonly FeedMedia[] = [
    {
      id: `${docId}-video`,
      type: 'video',
      url: data.url,
      thumbnailUrl: data.thumbnailUrl,
    },
  ];

  // Engagement is zero here — the timeline service enriches from the
  // Engagement collection after assembly.

  const externalSource: FeedExternalSource | undefined = data.platform
    ? {
        platform: data.platform,
        label: `Synced from ${data.platform.charAt(0).toUpperCase() + data.platform.slice(1)}`,
        originalUrl: data.url,
      }
    : undefined;

  return {
    ...buildFeedItemBase(`video-${docId}`, author, data.createdAt),
    feedType: 'POST',
    postType: 'video',
    title: data.title,
    content: data.title,
    media,
    externalSource,
    updatedAt: data.createdAt,
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
 * Convert a News collection document into a FeedItemNews.
 *
 * Used by the backend team/profile timeline assemblers to surface
 * AI-generated or syndicated news articles.
 */
export function newsArticleToFeedItemNews(
  docId: string,
  data: {
    headline: string;
    source: string;
    sourceLogoUrl?: string;
    excerpt?: string;
    articleUrl?: string;
    imageUrl?: string;
    publishedAt: string;
    category?: string;
  },
  author: FeedAuthor
): FeedItemNews {
  return {
    ...buildFeedItemBase(`news-${docId}`, author, data.publishedAt),
    feedType: 'NEWS',
    referenceId: docId,
    newsData: {
      headline: data.headline,
      source: data.source,
      sourceLogoUrl: data.sourceLogoUrl,
      excerpt: data.excerpt,
      articleUrl: data.articleUrl,
      imageUrl: data.imageUrl,
      publishedAt: data.publishedAt,
      category: data.category,
    },
  };
}

/**
 * Convert a TeamStats document into a FeedItemStat.
 *
 * TeamStats docs store flat sport-agnostic stat entries:
 *   { field, label, value, unit?, category, trend?, trendValue? }
 *
 * The doc is rendered as a stat-line card in the team timeline.
 */
export function teamStatDocToFeedItemStat(
  docId: string,
  data: {
    createdAt: string;
    season?: string;
    sportId?: string;
    source?: string;
    stats: readonly {
      label: string;
      value: string | number;
      unit?: string;
      category?: string;
      trend?: string;
      trendValue?: number;
      isHighlight?: boolean;
    }[];
  },
  author: FeedAuthor
): FeedItemStat {
  const context = data.season
    ? `${data.season}${data.sportId ? ` ${data.sportId}` : ''} Team Stats`.trim()
    : 'Team Stats';

  return {
    ...buildFeedItemBase(`teamstat-${docId}`, author, data.createdAt),
    feedType: 'STAT',
    referenceId: docId,
    statData: {
      context,
      gameDate: data.createdAt,
      stats: data.stats.map((s) => ({
        label: s.label,
        value: s.value,
        unit: s.unit,
        isHighlight: s.isHighlight,
      })),
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
