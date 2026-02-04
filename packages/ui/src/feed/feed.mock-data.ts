/**
 * @fileoverview Mock Feed Data for Development
 * @module @nxt1/ui/feed/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Feed feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type { FeedPost, FeedAuthor, FeedMedia, FeedFilterType, FeedPagination } from '@nxt1/core';

const now = Date.now();

// ============================================
// MOCK AUTHORS
// ============================================

const MOCK_ATHLETE_AUTHOR: FeedAuthor = {
  uid: 'athlete-001',
  profileCode: 'marcus-thompson-26',
  displayName: 'Marcus Thompson',
  firstName: 'Marcus',
  lastName: 'Thompson',
  avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'Football',
  position: 'QB',
  schoolName: 'Mater Dei High School',
  schoolLogoUrl:
    'https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/Mater_Dei_High_School.png/150px-Mater_Dei_High_School.png',
  classYear: '2026',
};

const MOCK_ATHLETE_AUTHOR_2: FeedAuthor = {
  uid: 'athlete-002',
  profileCode: 'jaylen-davis-27',
  displayName: 'Jaylen Davis',
  firstName: 'Jaylen',
  lastName: 'Davis',
  avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'Basketball',
  position: 'PG',
  schoolName: 'Oak Hill Academy',
  classYear: '2027',
};

const MOCK_ATHLETE_AUTHOR_3: FeedAuthor = {
  uid: 'athlete-003',
  profileCode: 'sophia-martinez-26',
  displayName: 'Sophia Martinez',
  firstName: 'Sophia',
  lastName: 'Martinez',
  avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'premium',
  isVerified: true,
  sport: 'Volleyball',
  position: 'OH',
  schoolName: 'Assumption High School',
  classYear: '2026',
};

const MOCK_COACH_AUTHOR: FeedAuthor = {
  uid: 'coach-001',
  profileCode: 'coach-williams',
  displayName: 'Coach Mike Williams',
  firstName: 'Mike',
  lastName: 'Williams',
  avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop',
  role: 'coach',
  verificationStatus: 'verified',
  isVerified: true,
  schoolName: 'Lincoln High School',
};

const MOCK_TEAM_AUTHOR: FeedAuthor = {
  uid: 'team-001',
  profileCode: 'lincoln-tigers-fb',
  displayName: 'Lincoln Tigers Football',
  firstName: 'Lincoln',
  lastName: 'Tigers',
  avatarUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=150&h=150&fit=crop',
  role: 'team',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'Football',
  schoolName: 'Lincoln High School',
};

const MOCK_UNVERIFIED_AUTHOR: FeedAuthor = {
  uid: 'athlete-004',
  profileCode: 'tyler-johnson-27',
  displayName: 'Tyler Johnson',
  firstName: 'Tyler',
  lastName: 'Johnson',
  avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'unverified',
  isVerified: false,
  sport: 'Football',
  position: 'WR',
  schoolName: 'Central High School',
  classYear: '2027',
};

// ============================================
// MOCK MEDIA
// ============================================

const MOCK_VIDEO_MEDIA: FeedMedia = {
  id: 'media-video-001',
  type: 'video',
  url: 'https://sample-videos.com/video/mp4/720/big_buck_bunny_720p_1mb.mp4',
  thumbnailUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=600&h=400&fit=crop',
  width: 1280,
  height: 720,
  duration: 45,
  altText: 'Highlight reel - Marcus Thompson',
};

const MOCK_IMAGE_MEDIA_1: FeedMedia = {
  id: 'media-img-001',
  type: 'image',
  url: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&h=600&fit=crop',
  thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=300&fit=crop',
  width: 800,
  height: 600,
  altText: 'Team practice photo',
};

const MOCK_IMAGE_MEDIA_2: FeedMedia = {
  id: 'media-img-002',
  type: 'image',
  url: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&h=600&fit=crop',
  thumbnailUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400&h=300&fit=crop',
  width: 800,
  height: 600,
  altText: 'Game action shot',
};

const MOCK_IMAGE_MEDIA_3: FeedMedia = {
  id: 'media-img-003',
  type: 'image',
  url: 'https://images.unsplash.com/photo-1461896836934- voices-from-the-past?w=800&h=600&fit=crop',
  thumbnailUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=300&fit=crop',
  width: 800,
  height: 600,
  altText: 'Award ceremony',
};

// ============================================
// MOCK POSTS
// ============================================

export const MOCK_FEED_POSTS: FeedPost[] = [
  // Featured commitment post
  {
    id: 'post-001',
    type: 'commitment',
    visibility: 'public',
    author: MOCK_ATHLETE_AUTHOR,
    content:
      "1000% COMMITTED! 🐘🔴 After a long process, I'm blessed to announce my commitment to the University of Alabama! Thank you to everyone who believed in me. Roll Tide! #RollTide #Committed",
    media: [MOCK_IMAGE_MEDIA_1],
    commitmentData: {
      collegeName: 'University of Alabama',
      collegeLogoUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Alabama_Crimson_Tide_logo.svg/200px-Alabama_Crimson_Tide_logo.svg.png',
      sport: 'Football',
      division: 'D1',
      commitDate: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
      isSigned: false,
    },
    engagement: {
      likeCount: 2847,
      commentCount: 156,
      shareCount: 89,
      viewCount: 15420,
      bookmarkCount: 234,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: true,
    },
    tags: ['@AlabamaFTBL', '@CoachDeBoer'],
    hashtags: ['#RollTide', '#Committed', '#ClassOf2026'],
    isPinned: false,
    isFeatured: true,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
  },

  // Video highlight post
  {
    id: 'post-002',
    type: 'highlight',
    visibility: 'public',
    author: MOCK_ATHLETE_AUTHOR_2,
    content:
      "New highlights from last night's game! 32 points, 8 assists 🔥 Let's keep building! #HoopDreams",
    media: [MOCK_VIDEO_MEDIA],
    engagement: {
      likeCount: 1523,
      commentCount: 87,
      shareCount: 45,
      viewCount: 8934,
    },
    userEngagement: {
      isLiked: true,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
    },
    hashtags: ['#HoopDreams', '#Basketball', '#Highlights'],
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
  },

  // Offer announcement
  {
    id: 'post-003',
    type: 'offer',
    visibility: 'public',
    author: MOCK_ATHLETE_AUTHOR_3,
    content:
      'Beyond blessed to receive an offer from Stanford University! 🌲 Thank you Coach Dunning for believing in me! #GoCardinal',
    media: [],
    offerData: {
      collegeName: 'Stanford University',
      collegeLogoUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Stanford_Cardinal_logo.svg/200px-Stanford_Cardinal_logo.svg.png',
      offerType: 'scholarship',
      sport: 'Volleyball',
      division: 'D1',
      conference: 'Pac-12',
    },
    engagement: {
      likeCount: 892,
      commentCount: 65,
      shareCount: 23,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: true,
      isReposted: false,
      isFollowingAuthor: true,
    },
    hashtags: ['#GoCardinal', '#Volleyball', '#D1Offer'],
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
  },

  // Text post with image
  {
    id: 'post-004',
    type: 'image',
    visibility: 'public',
    author: MOCK_COACH_AUTHOR,
    content:
      "Proud of these young men! Another week of hard work in the books. Championship mindset starts with daily habits. Let's keep grinding! 💪 #TeamFirst #WorkEthic",
    media: [MOCK_IMAGE_MEDIA_2],
    engagement: {
      likeCount: 456,
      commentCount: 34,
      shareCount: 12,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
    },
    hashtags: ['#TeamFirst', '#WorkEthic', '#HighSchoolFootball'],
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
  },

  // Team post
  {
    id: 'post-005',
    type: 'text',
    visibility: 'public',
    author: MOCK_TEAM_AUTHOR,
    content:
      '🏈 GAME DAY! Tigers vs. Eagles tonight at 7pm. Come out and support your team! Student section opens at 6pm. #TigerPride #FridayNightLights',
    media: [],
    engagement: {
      likeCount: 234,
      commentCount: 45,
      shareCount: 67,
    },
    userEngagement: {
      isLiked: true,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: true,
    },
    hashtags: ['#TigerPride', '#FridayNightLights', '#GameDay'],
    location: 'Lincoln Stadium',
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
  },

  // Milestone post
  {
    id: 'post-006',
    type: 'milestone',
    visibility: 'public',
    author: MOCK_ATHLETE_AUTHOR,
    content:
      '10K followers! 🎉 Thank you all for the support on this journey. This is just the beginning! #Blessed #RecruitingJourney',
    media: [],
    milestoneData: {
      type: 'followers',
      value: 10000,
      label: '10K Followers',
      icon: 'people',
    },
    engagement: {
      likeCount: 567,
      commentCount: 89,
      shareCount: 12,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: true,
    },
    hashtags: ['#Blessed', '#RecruitingJourney', '#Milestone'],
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
  },

  // Multi-image post
  {
    id: 'post-007',
    type: 'image',
    visibility: 'public',
    author: MOCK_UNVERIFIED_AUTHOR,
    content:
      'Amazing visit to Ohio State this weekend! The facilities are incredible and the coaches made me feel at home. Definitely one to watch! 🌰 #GoBucks',
    media: [MOCK_IMAGE_MEDIA_1, MOCK_IMAGE_MEDIA_2, MOCK_IMAGE_MEDIA_3],
    engagement: {
      likeCount: 178,
      commentCount: 23,
      shareCount: 5,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
    },
    hashtags: ['#GoBucks', '#OhioState', '#CollegeVisit'],
    location: 'Columbus, OH',
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
  },

  // Simple text post
  {
    id: 'post-008',
    type: 'text',
    visibility: 'public',
    author: MOCK_ATHLETE_AUTHOR_2,
    content:
      "Rise and grind! 5am workouts hit different when you're chasing dreams. Who else is up putting in work? 💪☀️",
    media: [],
    engagement: {
      likeCount: 423,
      commentCount: 56,
      shareCount: 8,
    },
    userEngagement: {
      isLiked: true,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
    },
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
  },
];

// ============================================
// MOCK FUNCTIONS
// ============================================

/**
 * Get mock posts with pagination.
 */
export function getMockFeedPosts(
  page: number = 1,
  limit: number = 20,
  filterType?: FeedFilterType
): { posts: FeedPost[]; pagination: FeedPagination } {
  let filteredPosts = [...MOCK_FEED_POSTS];

  // Apply filter
  if (filterType === 'offers') {
    filteredPosts = filteredPosts.filter((p) => p.type === 'offer' || p.type === 'commitment');
  } else if (filterType === 'highlights') {
    filteredPosts = filteredPosts.filter((p) => p.type === 'video' || p.type === 'highlight');
  } else if (filterType === 'following') {
    filteredPosts = filteredPosts.filter((p) => p.userEngagement.isFollowingAuthor);
  }

  const total = filteredPosts.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const posts = filteredPosts.slice(start, end);

  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      hasMore: end < total,
    },
  };
}

/**
 * Get a single mock post by ID.
 */
export function getMockPost(postId: string): FeedPost | undefined {
  return MOCK_FEED_POSTS.find((p) => p.id === postId);
}

/**
 * Simulate liking a post.
 */
export function mockToggleLike(post: FeedPost): FeedPost {
  const isLiked = !post.userEngagement.isLiked;
  return {
    ...post,
    engagement: {
      ...post.engagement,
      likeCount: isLiked ? post.engagement.likeCount + 1 : post.engagement.likeCount - 1,
    },
    userEngagement: {
      ...post.userEngagement,
      isLiked,
    },
  };
}

/**
 * Simulate bookmarking a post.
 */
export function mockToggleBookmark(post: FeedPost): FeedPost {
  const isBookmarked = !post.userEngagement.isBookmarked;
  return {
    ...post,
    engagement: {
      ...post.engagement,
      bookmarkCount: isBookmarked
        ? (post.engagement.bookmarkCount ?? 0) + 1
        : (post.engagement.bookmarkCount ?? 1) - 1,
    },
    userEngagement: {
      ...post.userEngagement,
      isBookmarked,
    },
  };
}
