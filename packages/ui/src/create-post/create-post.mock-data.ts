/**
 * @fileoverview Mock Create Post Data for Development
 * @module @nxt1/ui/create-post/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Create Post feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  PostDraft,
  PostMedia,
  TaggableUser,
  PostLocation,
  PostXpBreakdown,
  CreatePostState,
} from '@nxt1/core';

// ============================================
// CURRENT USER (for preview)
// ============================================

export const MOCK_CURRENT_USER = {
  id: 'user-123',
  displayName: 'Marcus Johnson',
  username: '@marcusjohnson',
  photoUrl: 'https://i.pravatar.cc/150?img=12',
  verified: true,
  type: 'athlete' as const,
};

// ============================================
// TAGGABLE USERS
// ============================================

export const MOCK_TAGGABLE_USERS: TaggableUser[] = [
  {
    id: 'user-1',
    displayName: 'Coach Thompson',
    username: '@coachthompson',
    photoUrl: 'https://i.pravatar.cc/150?img=15',
    verified: true,
    type: 'coach',
  },
  {
    id: 'user-2',
    displayName: 'Sarah Williams',
    username: '@sarahwilliams',
    photoUrl: 'https://i.pravatar.cc/150?img=25',
    verified: false,
    type: 'athlete',
  },
  {
    id: 'user-3',
    displayName: 'Riverside High Basketball',
    username: '@riversidebball',
    photoUrl: 'https://i.pravatar.cc/150?img=68',
    verified: true,
    type: 'team',
  },
  {
    id: 'user-4',
    displayName: 'UCLA Athletics',
    username: '@uclaathletics',
    photoUrl: 'https://i.pravatar.cc/150?img=45',
    verified: true,
    type: 'college',
  },
  {
    id: 'user-5',
    displayName: 'James Carter',
    username: '@jamescarter',
    photoUrl: 'https://i.pravatar.cc/150?img=33',
    verified: false,
    type: 'athlete',
  },
];

// ============================================
// LOCATIONS
// ============================================

export const MOCK_LOCATIONS: PostLocation[] = [
  {
    id: 'loc-1',
    name: 'Riverside High School',
    address: '1234 Main St',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    latitude: 34.0522,
    longitude: -118.2437,
    placeType: 'school',
  },
  {
    id: 'loc-2',
    name: 'Staples Center',
    address: '1111 S Figueroa St',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    placeType: 'stadium',
  },
  {
    id: 'loc-3',
    name: 'UCLA Pauley Pavilion',
    address: 'Westwood Plaza',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    placeType: 'stadium',
  },
  {
    id: 'loc-4',
    name: "Gold's Gym",
    address: '360 Hampton Dr',
    city: 'Venice',
    state: 'CA',
    country: 'USA',
    placeType: 'gym',
  },
];

// ============================================
// SAMPLE MEDIA
// ============================================

export const MOCK_MEDIA_ITEMS: PostMedia[] = [
  {
    id: 'media-1',
    type: 'image',
    localUri: 'https://picsum.photos/800/600?random=1',
    url: 'https://picsum.photos/800/600?random=1',
    fileName: 'game-highlight.jpg',
    fileSize: 2.5 * 1024 * 1024,
    mimeType: 'image/jpeg',
    width: 800,
    height: 600,
    progress: 100,
    status: 'complete',
    order: 0,
  },
  {
    id: 'media-2',
    type: 'video',
    localUri: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://picsum.photos/800/450?random=2',
    fileName: 'dunk-clip.mp4',
    fileSize: 15 * 1024 * 1024,
    mimeType: 'video/mp4',
    width: 1920,
    height: 1080,
    duration: 30,
    progress: 100,
    status: 'complete',
    order: 1,
  },
  {
    id: 'media-3',
    type: 'image',
    localUri: 'https://picsum.photos/600/800?random=3',
    fileName: 'team-photo.jpg',
    fileSize: 1.8 * 1024 * 1024,
    mimeType: 'image/jpeg',
    width: 600,
    height: 800,
    progress: 65,
    status: 'uploading',
    order: 2,
  },
];

// ============================================
// XP BREAKDOWN SAMPLES
// ============================================

export const MOCK_XP_PREVIEW: PostXpBreakdown = {
  baseXp: 50,
  mediaBonus: 15,
  tagBonus: 4,
  dailyBonus: 15,
  streakBonus: 10,
  totalXp: 94,
  streakCount: 5,
  isFirstPost: false,
};

export const MOCK_FIRST_POST_XP: PostXpBreakdown = {
  baseXp: 50,
  mediaBonus: 25,
  tagBonus: 0,
  dailyBonus: 15,
  streakBonus: 0,
  totalXp: 140,
  streakCount: 1,
  isFirstPost: true,
};

export const MOCK_HIGHLIGHT_XP: PostXpBreakdown = {
  baseXp: 75,
  mediaBonus: 25,
  tagBonus: 8,
  dailyBonus: 15,
  streakBonus: 20,
  totalXp: 143,
  streakCount: 7,
  isFirstPost: false,
};

// ============================================
// DRAFT SAMPLES
// ============================================

export const MOCK_EMPTY_DRAFT: PostDraft = {
  id: 'draft-new',
  content: '',
  type: 'text',
  privacy: 'public',
  media: [],
  taggedUsers: [],
  savedAt: new Date().toISOString(),
  characterCount: 0,
};

export const MOCK_TEXT_DRAFT: PostDraft = {
  id: 'draft-1',
  content:
    'Just finished an intense training session! 💪 Working on my three-point shot. Consistency is key.',
  type: 'text',
  privacy: 'public',
  media: [],
  taggedUsers: [],
  savedAt: new Date().toISOString(),
  characterCount: 95,
};

export const MOCK_PHOTO_DRAFT: PostDraft = {
  id: 'draft-2',
  content: "Championship game tonight! Let's get it 🏀🔥 #GameDay",
  type: 'photo',
  privacy: 'public',
  media: [MOCK_MEDIA_ITEMS[0]],
  taggedUsers: [MOCK_TAGGABLE_USERS[0], MOCK_TAGGABLE_USERS[2]],
  location: MOCK_LOCATIONS[0],
  savedAt: new Date().toISOString(),
  characterCount: 54,
};

export const MOCK_VIDEO_DRAFT: PostDraft = {
  id: 'draft-3',
  content: "Check out this dunk from last night's game! 🔥",
  type: 'highlight',
  privacy: 'public',
  media: [MOCK_MEDIA_ITEMS[1]],
  taggedUsers: [MOCK_TAGGABLE_USERS[1]],
  location: MOCK_LOCATIONS[1],
  savedAt: new Date().toISOString(),
  characterCount: 48,
};

export const MOCK_POLL_DRAFT: PostDraft = {
  id: 'draft-4',
  content: '',
  type: 'poll',
  privacy: 'public',
  media: [],
  taggedUsers: [],
  poll: {
    question: 'Which game should I post highlights from?',
    options: [
      { id: 'opt-1', text: 'State Championship', voteCount: 0, percentage: 0 },
      { id: 'opt-2', text: 'Rivalry Game', voteCount: 0, percentage: 0 },
      { id: 'opt-3', text: 'Season Opener', voteCount: 0, percentage: 0 },
    ],
    durationHours: 24,
    isEnded: false,
    totalVotes: 0,
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  },
  savedAt: new Date().toISOString(),
  characterCount: 0,
};

// ============================================
// UI STATE SAMPLES
// ============================================

export const MOCK_INITIAL_STATE: CreatePostState = {
  status: 'idle',
  draft: MOCK_EMPTY_DRAFT,
  xpPreview: null,
  showXpCelebration: false,
  earnedXp: null,
  validation: null,
  error: null,
  isDirty: false,
  isAutoSaving: false,
  isUploadingMedia: false,
  uploadProgress: 0,
};

export const MOCK_COMPOSING_STATE: CreatePostState = {
  status: 'composing',
  draft: MOCK_TEXT_DRAFT,
  xpPreview: MOCK_XP_PREVIEW,
  showXpCelebration: false,
  earnedXp: null,
  validation: { isValid: true, errors: [], warnings: [] },
  error: null,
  isDirty: true,
  isAutoSaving: false,
  isUploadingMedia: false,
  uploadProgress: 0,
};

export const MOCK_UPLOADING_STATE: CreatePostState = {
  status: 'uploading',
  draft: {
    ...MOCK_PHOTO_DRAFT,
    media: [MOCK_MEDIA_ITEMS[2]], // Uploading media
  },
  xpPreview: MOCK_XP_PREVIEW,
  showXpCelebration: false,
  earnedXp: null,
  validation: { isValid: true, errors: [], warnings: [] },
  error: null,
  isDirty: true,
  isAutoSaving: false,
  isUploadingMedia: true,
  uploadProgress: 65,
};

export const MOCK_SUCCESS_STATE: CreatePostState = {
  status: 'success',
  draft: MOCK_VIDEO_DRAFT,
  xpPreview: null,
  showXpCelebration: true,
  earnedXp: MOCK_HIGHLIGHT_XP,
  validation: { isValid: true, errors: [], warnings: [] },
  error: null,
  isDirty: false,
  isAutoSaving: false,
  isUploadingMedia: false,
  uploadProgress: 100,
};

export const MOCK_ERROR_STATE: CreatePostState = {
  status: 'error',
  draft: MOCK_TEXT_DRAFT,
  xpPreview: MOCK_XP_PREVIEW,
  showXpCelebration: false,
  earnedXp: null,
  validation: {
    isValid: false,
    errors: [{ field: 'content', code: 'CONTENT_TOO_LONG', message: 'Post is too long' }],
    warnings: [],
  },
  error: 'Failed to create post. Please try again.',
  isDirty: true,
  isAutoSaving: false,
  isUploadingMedia: false,
  uploadProgress: 0,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Simulate user search with mock data.
 */
export function searchMockUsers(query: string): TaggableUser[] {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  return MOCK_TAGGABLE_USERS.filter(
    (user) =>
      user.displayName.toLowerCase().includes(lowerQuery) ||
      user.username.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Simulate location search with mock data.
 */
export function searchMockLocations(query: string): PostLocation[] {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  return MOCK_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(lowerQuery) || loc.city?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Generate a random XP preview based on post type and content.
 */
export function generateMockXpPreview(
  type: string,
  mediaCount: number,
  tagCount: number,
  isFirst: boolean
): PostXpBreakdown {
  const baseXpMap: Record<string, number> = {
    text: 10,
    photo: 25,
    video: 50,
    highlight: 75,
    stats: 30,
    achievement: 40,
    announcement: 20,
    poll: 15,
  };

  const baseXp = baseXpMap[type] ?? 10;
  const mediaBonus = Math.min(mediaCount * 5, 25);
  const tagBonus = Math.min(tagCount * 2, 10);
  const dailyBonus = 15;
  const streakBonus = isFirst ? 0 : 10;
  const firstPostBonus = isFirst ? 50 : 0;

  const totalXp = baseXp + mediaBonus + tagBonus + dailyBonus + streakBonus + firstPostBonus;

  return {
    baseXp,
    mediaBonus,
    tagBonus,
    dailyBonus,
    streakBonus,
    totalXp,
    streakCount: isFirst ? 1 : 5,
    isFirstPost: isFirst,
  };
}

/**
 * Simulate media upload progress.
 */
export function simulateUploadProgress(
  onProgress: (progress: number) => void,
  duration = 2000
): Promise<void> {
  return new Promise((resolve) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        onProgress(100);
        resolve();
      } else {
        onProgress(Math.round(progress));
      }
    }, duration / 10);
  });
}
