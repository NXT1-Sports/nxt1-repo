/**
 * @fileoverview Mock Profile Data for Development
 * @module @nxt1/ui/profile/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains comprehensive dummy data for Profile feature during development.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  ProfileUser,
  ProfileFollowStats,
  ProfileQuickStats,
  ProfilePinnedVideo,
  ProfilePost,
  ProfileOffer,
  ProfileEvent,
  AthleticStatsCategory,
  ProfilePageData,
} from '@nxt1/core';

const now = Date.now();

// ============================================
// MOCK USER DATA
// ============================================

export const MOCK_PROFILE_USER: ProfileUser = {
  uid: 'user-001',
  profileCode: 'marcus-johnson-2026',
  firstName: 'Marcus',
  lastName: 'Johnson',
  displayName: 'Marcus Johnson',
  profileImg: 'https://i.pravatar.cc/300?img=68',
  bannerImg: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=400&fit=crop',
  role: 'athlete',
  isRecruit: true,
  verificationStatus: 'verified',
  aboutMe:
    'Dedicated student-athlete with a passion for football. Team captain and honor roll student. Working hard every day to achieve my dreams of playing at the next level. 🏈 #GrindNeverStops',
  primarySport: {
    name: 'Football',
    icon: 'american-football',
    position: 'Quarterback',
    secondaryPositions: ['Wide Receiver'],
    jerseyNumber: '12',
  },
  school: {
    name: 'Riverside High School',
    logoUrl: 'https://i.pravatar.cc/100?img=45',
    teamCode: 'RHS-2024',
    location: 'Austin, TX',
  },
  classYear: '2026',
  height: '6\'2"',
  weight: '195',
  gpa: '3.8',
  sat: '1280',
  act: '28',
  location: 'Austin, TX',
  social: {
    twitter: 'marcusj12',
    instagram: 'marcus.johnson12',
    hudl: 'marcus-johnson',
    youtube: '@marcusjohnson',
  },
  contact: {
    email: 'marcus.johnson@email.com',
    phone: '(555) 123-4567',
    preferredMethod: 'email',
    availableForContact: true,
  },
  createdAt: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

// ============================================
// MOCK FOLLOW STATS
// ============================================

export const MOCK_FOLLOW_STATS: ProfileFollowStats = {
  followersCount: 2847,
  followingCount: 156,
  isFollowing: false,
  isFollowedBy: false,
};

// ============================================
// MOCK QUICK STATS
// ============================================

export const MOCK_QUICK_STATS: ProfileQuickStats = {
  profileViews: 15420,
  videoViews: 89650,
  totalPosts: 47,
  highlightCount: 12,
  offerCount: 8,
  eventCount: 6,
  collegeInterestCount: 23,
  shareCount: 342,
};

// ============================================
// MOCK ATHLETIC STATS
// ============================================

export const MOCK_ATHLETIC_STATS: AthleticStatsCategory[] = [
  {
    name: 'Passing Stats (2024)',
    stats: [
      { label: 'Completion %', value: '68.5', unit: '%', verified: true },
      { label: 'Passing Yards', value: '2,847', verified: true },
      { label: 'Touchdowns', value: '28', verified: true },
      { label: 'Interceptions', value: '6', verified: true },
      { label: 'QBR', value: '87.2', verified: false },
    ],
  },
  {
    name: 'Rushing Stats (2024)',
    stats: [
      { label: 'Rushing Yards', value: '456', verified: true },
      { label: 'Rushing TDs', value: '5', verified: true },
      { label: 'Yards/Carry', value: '5.2', verified: false },
    ],
  },
  {
    name: 'Combine Results',
    stats: [
      { label: '40-Yard Dash', value: '4.58', unit: 's', verified: true },
      { label: 'Vertical Jump', value: '34.5', unit: '"', verified: true },
      { label: 'Broad Jump', value: '9\'8"', verified: true },
      { label: 'Pro Agility', value: '4.21', unit: 's', verified: true },
      { label: 'Bench Press', value: '225x12', verified: false },
    ],
  },
];

// ============================================
// MOCK PINNED VIDEO
// ============================================

export const MOCK_PINNED_VIDEO: ProfilePinnedVideo = {
  id: 'vid-001',
  name: 'Junior Season Highlights 2024',
  previewImage: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&h=450&fit=crop',
  videoUrl: 'https://example.com/video/highlights-2024',
  duration: 245,
  viewCount: 12450,
};

// ============================================
// MOCK POSTS
// ============================================

export const MOCK_POSTS: ProfilePost[] = [
  {
    id: 'post-001',
    type: 'video',
    title: 'Game-winning touchdown pass! 🏈🔥',
    body: 'Incredible final drive against Central High. 47 yards in 32 seconds. This team never gives up!',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508098682722-e99c643e0edc?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/game-winner',
    likeCount: 847,
    commentCount: 156,
    shareCount: 89,
    viewCount: 15600,
    duration: 45,
    isLiked: false,
    isPinned: true,
    createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-002',
    type: 'offer',
    title: 'Blessed to receive an offer from Texas State! 🙏',
    body: 'Extremely grateful for this opportunity. Thank you Coach Williams for believing in me. Hard work pays off! #GoJackets',
    thumbnailUrl: 'https://i.pravatar.cc/200?img=70',
    likeCount: 1234,
    commentCount: 287,
    shareCount: 156,
    isLiked: true,
    isPinned: false,
    createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-003',
    type: 'image',
    title: 'Camp MVP at Elite 11 Regional! 💪',
    body: 'Competed against the best quarterbacks in the state. Earned MVP honors. The grind never stops.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&h=300&fit=crop',
    mediaUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200',
    likeCount: 567,
    commentCount: 98,
    shareCount: 45,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-004',
    type: 'video',
    title: 'Spring Practice Film - Route Running',
    body: 'Working on my footwork and release. Getting better every day.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/spring-practice',
    likeCount: 234,
    commentCount: 45,
    shareCount: 23,
    viewCount: 4500,
    duration: 120,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-005',
    type: 'text',
    title: 'Grateful for my team',
    body: "None of this would be possible without my teammates, coaches, and family. We're building something special at Riverside. Championship mindset every single day. Let's get it! 🏆",
    likeCount: 456,
    commentCount: 78,
    shareCount: 34,
    isLiked: true,
    isPinned: false,
    createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-006',
    type: 'highlight',
    title: 'Full Junior Season Highlights',
    body: '2024 Season: 2,847 passing yards, 28 TDs, 68.5% completion rate. Ready for senior year!',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/junior-highlights',
    likeCount: 2156,
    commentCount: 456,
    shareCount: 234,
    viewCount: 45600,
    duration: 245,
    isLiked: true,
    isPinned: true,
    createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-007',
    type: 'video',
    title: 'Workout Wednesday 💪',
    body: 'Putting in the work in the weight room. Speed, strength, and agility training.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/workout',
    likeCount: 178,
    commentCount: 34,
    shareCount: 12,
    viewCount: 2300,
    duration: 60,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-008',
    type: 'stat',
    title: 'Week 8 Stats Update',
    body: '21/28 passing, 312 yards, 4 TDs, 0 INTs. Team W 42-14! 🔥',
    likeCount: 389,
    commentCount: 67,
    shareCount: 45,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================
// MOCK OFFERS
// ============================================

export const MOCK_OFFERS: ProfileOffer[] = [
  {
    id: 'offer-001',
    type: 'scholarship',
    collegeName: 'Texas State University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=70',
    division: 'FBS',
    conference: 'Sun Belt',
    sport: 'Football',
    coachName: 'Coach Williams',
    offeredAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-002',
    type: 'scholarship',
    collegeName: 'UTSA',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=71',
    division: 'FBS',
    conference: 'American',
    sport: 'Football',
    coachName: 'Coach Thompson',
    offeredAt: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-003',
    type: 'scholarship',
    collegeName: 'Texas Tech University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=72',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Davis',
    offeredAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-004',
    type: 'camp_invite',
    collegeName: 'University of Texas',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=73',
    division: 'FBS',
    conference: 'SEC',
    sport: 'Football',
    coachName: 'Coach Martinez',
    offeredAt: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
    notes: 'Elite QB Camp - June 15-17',
  },
  {
    id: 'offer-005',
    type: 'preferred_walk_on',
    collegeName: 'Baylor University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=74',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Anderson',
    offeredAt: new Date(now - 75 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-006',
    type: 'visit',
    collegeName: 'TCU',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=75',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Brown',
    offeredAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
    notes: 'Official Visit - March 8-10',
  },
  {
    id: 'offer-007',
    type: 'interest',
    collegeName: 'Oklahoma State',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=76',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Wilson',
    offeredAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-008',
    type: 'scholarship',
    collegeName: 'SMU',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=77',
    division: 'FBS',
    conference: 'ACC',
    sport: 'Football',
    coachName: 'Coach Roberts',
    offeredAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
];

// ============================================
// MOCK EVENTS
// ============================================

export const MOCK_EVENTS: ProfileEvent[] = [
  {
    id: 'event-001',
    type: 'game',
    name: 'District Championship',
    description: 'District 5A Championship Game vs Central High',
    location: 'Memorial Stadium, Austin, TX',
    startDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: false,
    opponent: 'Central High School',
  },
  {
    id: 'event-002',
    type: 'visit',
    name: 'TCU Official Visit',
    description: 'Official campus visit and meeting with coaching staff',
    location: 'Fort Worth, TX',
    startDate: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 16 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
    url: 'https://tcu.edu/football',
  },
  {
    id: 'event-003',
    type: 'camp',
    name: 'Elite 11 Regional',
    description: 'Elite 11 quarterback competition regional finals',
    location: 'Dallas, TX',
    startDate: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
  {
    id: 'event-004',
    type: 'combine',
    name: 'Texas Showcase Combine',
    description: '40-yard dash, vertical jump, agility drills, position drills',
    location: 'Houston, TX',
    startDate: new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
  {
    id: 'event-005',
    type: 'game',
    name: 'Season Opener vs West High',
    description: 'First game of senior season',
    location: 'Home - Riverside Stadium',
    startDate: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: false,
    opponent: 'West High School',
    result: 'W 35-14',
  },
  {
    id: 'event-006',
    type: 'showcase',
    name: 'Under Armour All-America Camp',
    description: 'Invitation-only showcase for top prospects',
    location: 'Atlanta, GA',
    startDate: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 92 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
];

// ============================================
// COMBINED MOCK PAGE DATA
// ============================================

export const MOCK_PROFILE_PAGE_DATA: ProfilePageData = {
  user: MOCK_PROFILE_USER,
  followStats: MOCK_FOLLOW_STATS,
  quickStats: MOCK_QUICK_STATS,
  athleticStats: MOCK_ATHLETIC_STATS,
  pinnedVideo: MOCK_PINNED_VIDEO,
  recentPosts: MOCK_POSTS,
  offers: MOCK_OFFERS,
  events: MOCK_EVENTS,
  isOwnProfile: false,
  canEdit: false,
};

/**
 * Get mock data for own profile view (editable).
 */
export function getMockOwnProfileData(): ProfilePageData {
  return {
    ...MOCK_PROFILE_PAGE_DATA,
    isOwnProfile: true,
    canEdit: true,
  };
}

/**
 * Get mock data with different user for variety.
 */
export function getMockOtherProfileData(): ProfilePageData {
  return {
    ...MOCK_PROFILE_PAGE_DATA,
    user: {
      ...MOCK_PROFILE_USER,
      uid: 'user-002',
      profileCode: 'sarah-williams-2025',
      firstName: 'Sarah',
      lastName: 'Williams',
      profileImg: 'https://i.pravatar.cc/300?img=47',
      bannerImg: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=400&fit=crop',
      primarySport: {
        name: 'Basketball',
        icon: 'basketball',
        position: 'Point Guard',
        jerseyNumber: '23',
      },
      classYear: '2025',
      height: '5\'9"',
      weight: '145',
      aboutMe:
        'Team captain and two-time All-District selection. Averaging 18.5 PPG this season. Committed to excellence on and off the court. 🏀',
    },
    followStats: {
      ...MOCK_FOLLOW_STATS,
      followersCount: 1523,
      isFollowing: true,
    },
    isOwnProfile: false,
    canEdit: false,
  };
}

// ============================================
// EMPTY PROFILE DATA (for testing empty states)
// ============================================

export const MOCK_EMPTY_PROFILE_DATA: ProfilePageData = {
  user: {
    ...MOCK_PROFILE_USER,
    uid: 'user-new',
    aboutMe: undefined,
    bannerImg: undefined,
  },
  followStats: {
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
    isFollowedBy: false,
  },
  quickStats: {
    profileViews: 0,
    videoViews: 0,
    totalPosts: 0,
    highlightCount: 0,
    offerCount: 0,
    eventCount: 0,
    collegeInterestCount: 0,
    shareCount: 0,
  },
  athleticStats: [],
  pinnedVideo: undefined,
  recentPosts: [],
  offers: [],
  events: [],
  isOwnProfile: true,
  canEdit: true,
};
