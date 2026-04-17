/**
 * @fileoverview Firestore Posts Adapter
 * @module @nxt1/backend/adapters/firestore-posts
 *
 * Converts Firestore documents (with Timestamp) to Core types (with ISO strings).
 * Handles the boundary between Firebase-specific types and portable core types.
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type { FeedPost, FeedMedia, FeedAuthor, FeedPostType } from '@nxt1/core/posts';
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
  /** Cloudflare Stream video UID (set by upload route) */
  cloudflareVideoId?: string;
  /** Cloudflare processing state (set/updated by webhook) */
  cloudflareStatus?: string;
  /** True once Cloudflare has finished transcoding */
  readyToStream?: boolean;
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
  return {
    uid: profile.uid,
    profileCode: profile.profileCode || profile.uid,
    displayName: profile.displayName,
    firstName: profile.firstName || profile.displayName.split(' ')[0] || '',
    lastName: profile.lastName || profile.displayName.split(' ').slice(1).join(' ') || '',
    avatarUrl: profile.photoURL,
  };
}

/**
 * Convert Firestore post document to FeedPost
 */
export function firestorePostToFeedPost(
  id: string,
  doc: FirestorePostDoc,
  author: FeedAuthor
): FeedPost {
  const media: FeedMedia[] = (doc.images || []).map((url, index) => ({
    id: `${id}-image-${index}`,
    type: 'image' as const,
    url,
  }));

  const iframeUrl = doc.playback?.iframeUrl ?? doc.mediaUrl ?? null;
  const hlsUrl = doc.playback?.hlsUrl ?? doc.videoUrl ?? null;
  const dashUrl = doc.playback?.dashUrl ?? null;
  const thumbnailUrl = doc.thumbnailUrl ?? doc.poster;
  const hasVideo = !!(iframeUrl || hlsUrl);

  // Determine Cloudflare processing status
  const cfStatus = doc.cloudflareStatus as FeedMedia['processingStatus'] | undefined;
  const processingStatus: FeedMedia['processingStatus'] =
    cfStatus ?? (doc.readyToStream === true ? 'ready' : hasVideo ? 'ready' : undefined);

  if (hasVideo || doc.cloudflareVideoId) {
    // Use iframeUrl as the primary `url` (Cloudflare Stream iframe player);
    // fall back to hlsUrl for legacy non-CF video posts.
    const primaryUrl = iframeUrl ?? hlsUrl ?? '';
    media.push({
      id: `${id}-video-0`,
      type: 'video' as const,
      url: primaryUrl,
      thumbnailUrl,
      duration: doc.duration,
      altText: doc.content || 'Highlight video',
      ...(doc.cloudflareVideoId ? { cloudflareVideoId: doc.cloudflareVideoId } : {}),
      ...(iframeUrl ? { iframeUrl } : {}),
      ...(hlsUrl ? { hlsUrl } : {}),
      ...(dashUrl ? { dashUrl } : {}),
      ...(processingStatus ? { processingStatus } : {}),
    });
  }

  return {
    id,
    type: mapPostTypeToFeedType(doc.type),
    author,
    content: doc.content,
    media,
    engagement: {
      shareCount: doc.stats?.shares || 0,
      viewCount: doc.stats?.views || 0,
    },
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
    highlight: 'video', // backward compat — old docs stored as 'highlight', now treated as 'video'
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
