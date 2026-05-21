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
  /**
   * Lowercase sport key (e.g. "football", "basketball") that filters this
   * post onto the corresponding sport profile timeline. Required for the
   * post to be visible under any per-sport profile view.
   */
  sportId?: string;
  /** Backward-compatible alias of {@link sportId} read by older surfaces. */
  sport?: string;
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
  /** Optional playlist/group identifier for video library filtering */
  playlistId?: string;
  /** Optional playlist/group display name for video library filtering */
  playlistName?: string;
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
export function timestampToISO(timestamp: Timestamp | unknown | undefined): string {
  if (!timestamp) {
    return new Date().toISOString();
  }
  // Native Firestore Timestamp
  if (typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate().toISOString();
  }
  // Plain serialized Timestamp object: { _seconds, _nanoseconds } or { seconds, nanoseconds }
  const ts = timestamp as Record<string, unknown>;
  const seconds = (ts['_seconds'] ?? ts['seconds']) as number | undefined;
  if (typeof seconds === 'number') {
    return new Date(seconds * 1000).toISOString();
  }
  // Already an ISO string or Date
  const d = new Date(timestamp as string | number);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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

function buildCloudflareThumbnailUrl(cloudflareVideoId?: string): string | undefined {
  if (!cloudflareVideoId) return undefined;
  return `https://videodelivery.net/${cloudflareVideoId}/thumbnails/thumbnail.jpg`;
}

function isTemporaryStagingMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    return (path.includes('/threads/') && path.includes('/tmp/')) || path.includes('/uploads/tmp/');
  } catch {
    const normalized = url.toLowerCase();
    return normalized.includes('/threads/') && normalized.includes('/tmp/');
  }
}

/**
 * Convert Firestore post document to FeedPost
 */
export function firestorePostToFeedPost(
  id: string,
  doc: FirestorePostDoc,
  author: FeedAuthor
): FeedPost {
  const stableImages = (doc.images || []).filter((url) => !isTemporaryStagingMediaUrl(url));
  const isVideoPostType = doc.type === 'video' || doc.type === 'highlight';
  const fallbackImageUrl =
    !isVideoPostType &&
    typeof doc.mediaUrl === 'string' &&
    !isTemporaryStagingMediaUrl(doc.mediaUrl)
      ? doc.mediaUrl
      : null;
  const imageUrls =
    stableImages.length > 0 ? stableImages : fallbackImageUrl ? [fallbackImageUrl] : [];

  const media: FeedMedia[] = imageUrls.map((url, index) => ({
    id: `${id}-image-${index}`,
    type: 'image' as const,
    url,
  }));

  const iframeUrl = isVideoPostType ? (doc.playback?.iframeUrl ?? doc.mediaUrl ?? null) : null;
  const hlsUrl = isVideoPostType ? (doc.playback?.hlsUrl ?? doc.videoUrl ?? null) : null;
  const dashUrl = doc.playback?.dashUrl ?? null;
  const thumbnailUrl =
    doc.thumbnailUrl ?? doc.poster ?? buildCloudflareThumbnailUrl(doc.cloudflareVideoId);
  // Feed cards render video through an iframe player. A raw signed Firebase
  // source URL in `videoUrl` is not iframe-playable and can render XML errors.
  // Treat only Cloudflare-backed video (cloudflareVideoId) or iframe URLs as
  // renderable in cards.
  const hasRenderableVideo = isVideoPostType && !!(iframeUrl || doc.cloudflareVideoId);

  // Determine Cloudflare processing status
  const cfStatus = doc.cloudflareStatus as FeedMedia['processingStatus'] | undefined;
  const processingStatus: FeedMedia['processingStatus'] = cfStatus
    ? cfStatus
    : doc.readyToStream === true
      ? 'ready'
      : doc.cloudflareVideoId
        ? 'inprogress'
        : hasRenderableVideo
          ? 'ready'
          : undefined;

  if (hasRenderableVideo) {
    // Use iframeUrl as the primary `url` (Cloudflare Stream iframe player);
    // do not fall back to raw signed source URLs in iframe cards.
    const primaryUrl = iframeUrl ?? '';
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
      ...(doc.playlistId ? { playlistId: doc.playlistId } : {}),
      ...(doc.playlistName ? { playlistName: doc.playlistName } : {}),
    });
  }

  return {
    id,
    type: mapPostTypeToFeedType(doc.type),
    author,
    content: doc.content,
    media,
    engagement: {
      shareCount: 0,
      viewCount: 0,
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
