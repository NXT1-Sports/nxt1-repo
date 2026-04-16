/**
 * @fileoverview Firestore Posts Adapter
 * @module @nxt1/backend/adapters/firestore-posts
 *
 * Converts Firestore documents (with Timestamp) to Core types (with ISO strings).
 * Handles the boundary between Firebase-specific types and portable core types.
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type {
  FeedPost,
  FeedMedia,
  FeedAuthor,
  FeedPostType,
  FeedAuthorRole,
  FeedVerificationStatus,
} from '@nxt1/core/feed';
import type { PostVisibility } from '@nxt1/core/constants';

type PostType = string;

// ============================================
// FIRESTORE DOCUMENT TYPES
// ============================================

/**
 * Firestore Post document (raw from Firestore)
 */
export interface FirestorePostDoc {
  userId: string;
  content: string;
  type: PostType;
  visibility: PostVisibility;
  teamId?: string;
  images?: string[];
  mediaUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  poster?: string;
  duration?: number;
  playback?: {
    hlsUrl?: string;
    dashUrl?: string;
    iframeUrl?: string;
  };
  externalLinks?: string[];
  mentions?: string[];
  location?: string;
  poll?: {
    question: string;
    options: string[];
    durationHours: number;
    endAt: Timestamp;
    votes?: Record<string, string>;
  };
  scheduledFor?: Timestamp;
  isPinned?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
  stats: {
    likes: number;
    shares: number;
    views: number;
  };
}

/**
 * User profile data for enrichment
 */
export interface UserProfile {
  uid: string;
  profileCode?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  role?: string;
  verificationStatus?: string;
  isVerified?: boolean;
  sport?: string;
  position?: string;
  schoolName?: string;
  schoolLogoUrl?: string;
  classYear?: string;
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert Firestore Timestamp to ISO string
 */
export function timestampToISO(timestamp: Timestamp | undefined): string {
  if (!timestamp) {
    return new Date().toISOString();
  }
  return timestamp.toDate().toISOString();
}

/**
 * Convert user profile to FeedAuthor
 */
export function userProfileToFeedAuthor(profile: UserProfile): FeedAuthor {
  const validRoles: readonly FeedAuthorRole[] = [
    'athlete',
    'coach',
    'director',
    'team',
    'official',
  ];

  // Normalize legacy role strings to current FeedAuthorRole values
  let profileRole = profile.role as string;
  const legacyRoleMap: Record<string, FeedAuthorRole> = {
    college_coach: 'coach',
    'college-coach': 'coach',
    'recruiting-service': 'coach',
    recruiter: 'coach',
    scout: 'coach',
    media: 'coach',
    parent: 'athlete',
    fan: 'athlete',
  };
  if (legacyRoleMap[profileRole]) {
    profileRole = legacyRoleMap[profileRole];
  }

  const validStatuses: readonly FeedVerificationStatus[] = [
    'unverified',
    'pending',
    'verified',
    'premium',
  ];

  const role: FeedAuthorRole = validRoles.includes(profileRole as FeedAuthorRole)
    ? (profileRole as FeedAuthorRole)
    : 'athlete';
  const verificationStatus: FeedVerificationStatus = validStatuses.includes(
    profile.verificationStatus as FeedVerificationStatus
  )
    ? (profile.verificationStatus as FeedVerificationStatus)
    : 'unverified';

  return {
    uid: profile.uid,
    profileCode: profile.profileCode || profile.uid,
    displayName: profile.displayName,
    firstName: profile.firstName || profile.displayName.split(' ')[0] || '',
    lastName: profile.lastName || profile.displayName.split(' ').slice(1).join(' ') || '',
    avatarUrl: profile.photoURL,
    role,
    verificationStatus,
    isVerified: profile.isVerified || false,
    sport: profile.sport,
    position: profile.position,
    schoolName: profile.schoolName,
    schoolLogoUrl: profile.schoolLogoUrl,
    classYear: profile.classYear,
  };
}

/**
 * Convert Firestore post document to FeedPost
 */
export function firestorePostToFeedPost(
  id: string,
  doc: FirestorePostDoc,
  author: FeedAuthor,
  userEngagement?: {
    isLiked?: boolean;
    isBookmarked?: boolean;
    isReposted?: boolean;
  }
): FeedPost {
  const media: FeedMedia[] = (doc.images || []).map((url, index) => ({
    id: `${id}-image-${index}`,
    type: 'image' as const,
    url,
  }));

  const videoUrl = doc.mediaUrl ?? doc.videoUrl ?? doc.playback?.iframeUrl ?? doc.playback?.hlsUrl;
  const thumbnailUrl = doc.thumbnailUrl ?? doc.poster;

  if (videoUrl) {
    media.push({
      id: `${id}-video-0`,
      type: 'video' as const,
      url: videoUrl,
      thumbnailUrl,
      duration: doc.duration,
      altText: doc.content || 'Highlight video',
    });
  }

  return {
    id,
    type: mapPostTypeToFeedType(doc.type),
    author,
    content: doc.content,
    media,
    engagement: {
      reactionCount: doc.stats?.likes || 0,
      likeCount: doc.stats?.likes || 0,
      shareCount: doc.stats?.shares || 0,
      viewCount: doc.stats?.views || 0,
    },
    userEngagement: {
      isReacted: userEngagement?.isLiked || false,
      reactionType: userEngagement?.isLiked ? 'like' : null,
      isLiked: userEngagement?.isLiked || false,
      isBookmarked: userEngagement?.isBookmarked || false,
      isReposted: userEngagement?.isReposted || false,
    },
    mentions: doc.mentions,
    location: doc.location,
    isPinned: doc.isPinned || false,
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Map backend PostType to FeedPostType
 */
function mapPostTypeToFeedType(type: PostType): FeedPostType {
  const mapping: Record<string, FeedPostType> = {
    text: 'text',
    photo: 'image',
    video: 'video',
    highlight: 'highlight',
    stats: 'text',
    achievement: 'milestone',
    announcement: 'text',
    poll: 'text',
  };
  return mapping[type] || 'text';
}

/**
 * Map backend PostVisibility to FeedPostVisibility
 */

// ============================================
// BATCH CONVERSION UTILITIES
// ============================================
