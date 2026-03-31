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
  FeedComment,
  FeedAuthor,
  FeedCommentAuthor,
  FeedPostType,
  FeedPostVisibility,
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
  videoUrl?: string;
  externalLinks?: string[];
  mentions?: string[];
  hashtags?: string[];
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
  commentsDisabled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
}

/**
 * Firestore Comment document (raw from Firestore)
 */
export interface FirestoreCommentDoc {
  postId: string;
  userId: string;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
  stats?: {
    likes: number;
    replies: number;
  };
  parentId?: string;
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
    'team',
    'recruiter',
    'parent',
    'official',
  ];

  // Normalize legacy role strings to new FeedAuthorRole values
  let profileRole = profile.role as string;
  const legacyRoleMap: Record<string, FeedAuthorRole> = {
    college_coach: 'recruiter',
    'college-coach': 'recruiter',
    'recruiting-service': 'recruiter',
    scout: 'recruiter',
    media: 'recruiter',
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
 * Convert user profile to FeedCommentAuthor
 */
export function userProfileToCommentAuthor(profile: UserProfile): FeedCommentAuthor {
  return {
    uid: profile.uid,
    profileCode: profile.profileCode || profile.uid,
    displayName: profile.displayName,
    avatarUrl: profile.photoURL,
    isVerified: profile.isVerified || false,
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
  return {
    id,
    type: mapPostTypeToFeedType(doc.type),
    visibility: mapPostVisibilityToFeedVisibility(doc.visibility),
    author,
    content: doc.content,
    media: (doc.images || []).map((url, index) => ({
      id: `${id}-image-${index}`,
      type: 'image' as const,
      url,
    })),
    engagement: {
      reactionCount: doc.stats?.likes || 0,
      likeCount: doc.stats?.likes || 0,
      commentCount: doc.stats?.comments || 0,
      repostCount: 0,
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
    hashtags: doc.hashtags,
    location: doc.location,
    isPinned: doc.isPinned || false,
    isFeatured: false,
    commentsDisabled: doc.commentsDisabled || false,
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Convert Firestore comment document to FeedComment
 */
export function firestoreCommentToFeedComment(
  id: string,
  doc: FirestoreCommentDoc,
  author: FeedCommentAuthor,
  isLiked?: boolean
): FeedComment {
  return {
    id,
    postId: doc.postId,
    author,
    content: doc.content,
    likeCount: doc.stats?.likes || 0,
    isLiked: isLiked || false,
    replyCount: doc.stats?.replies || 0,
    parentId: doc.parentId,
    createdAt: timestampToISO(doc.createdAt),
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
function mapPostVisibilityToFeedVisibility(visibility: PostVisibility): FeedPostVisibility {
  const mapping: Record<string, FeedPostVisibility> = {
    PUBLIC: 'public',
    TEAM: 'team',
    PRIVATE: 'private',
  };
  return mapping[visibility] || 'public';
}

// ============================================
// BATCH CONVERSION UTILITIES
// ============================================

/**
 * Convert multiple Firestore posts to FeedPosts
 */
export async function batchConvertPosts(
  posts: Array<{ id: string; data: FirestorePostDoc }>,
  getUserProfile: (userId: string) => Promise<UserProfile | null>,
  getUserEngagement?: (
    postId: string,
    userId: string
  ) => Promise<
    | {
        isLiked?: boolean;
        isBookmarked?: boolean;
        isReposted?: boolean;
      }
    | undefined
  >
): Promise<FeedPost[]> {
  const feedPosts: FeedPost[] = [];

  for (const post of posts) {
    const author = await getUserProfile(post.data.userId);
    if (!author) continue;

    const feedAuthor = userProfileToFeedAuthor(author);
    const engagement = getUserEngagement ? await getUserEngagement(post.id, author.uid) : undefined;

    feedPosts.push(firestorePostToFeedPost(post.id, post.data, feedAuthor, engagement));
  }

  return feedPosts;
}

/**
 * Convert multiple Firestore comments to FeedComments
 */
export async function batchConvertComments(
  comments: Array<{ id: string; data: FirestoreCommentDoc }>,
  getUserProfile: (userId: string) => Promise<UserProfile | null>,
  getUserLikes?: (commentId: string, userId: string) => Promise<boolean>
): Promise<FeedComment[]> {
  const feedComments: FeedComment[] = [];

  for (const comment of comments) {
    const author = await getUserProfile(comment.data.userId);
    if (!author) continue;

    const feedAuthor = userProfileToCommentAuthor(author);
    const isLiked = getUserLikes ? await getUserLikes(comment.id, author.uid) : false;

    feedComments.push(firestoreCommentToFeedComment(comment.id, comment.data, feedAuthor, isLiked));
  }

  return feedComments;
}
