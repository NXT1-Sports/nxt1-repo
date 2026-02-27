/**
 * @fileoverview Team Profile Mock Data
 * @module @nxt1/ui/team-profile
 * @version 1.0.0
 *
 * Comprehensive mock data for Team Profile development and testing.
 * Mirrors the profile mock data pattern with team-specific shapes.
 *
 * ⭐ DEVELOPMENT ONLY — Will be replaced by actual API calls ⭐
 */

import type {
  TeamProfileTeam,
  TeamProfileFollowStats,
  TeamProfileQuickStats,
  TeamProfileRosterMember,
  TeamProfileScheduleEvent,
  TeamProfileStatsCategory,
  TeamProfileStaffMember,
  TeamProfileRecruitingActivity,
  TeamProfilePost,
  TeamProfilePageData,
} from '@nxt1/core';

// ============================================
// CORE TEAM DATA
// ============================================

export const MOCK_TEAM: TeamProfileTeam = {
  id: 'team_lincoln_fb_01',
  slug: 'lincoln-football',
  unicode: 'LNKFB',
  teamName: 'Lincoln High School Football',
  teamType: 'high-school',
  sport: 'Football',
  city: 'Lincoln',
  state: 'NE',
  location: 'Lincoln, NE',
  logoUrl: '/assets/images/teams/lincoln-hs-logo.png',
  bannerImg: '/assets/images/teams/lincoln-hs-cover.jpg',
  galleryImages: [
    '/assets/images/teams/lincoln-hs-gallery-1.jpg',
    '/assets/images/teams/lincoln-hs-gallery-2.jpg',
    '/assets/images/teams/lincoln-hs-gallery-3.jpg',
  ],
  description:
    'Lincoln High School Football — a storied program with a rich tradition of excellence. Multiple state championships and a commitment to developing student-athletes on and off the field. Our mission is to build championship-caliber teams and championship-caliber young men.',
  record: {
    wins: 10,
    losses: 2,
    ties: 0,
    season: '2025',
    formatted: '10-2 (2025)',
  },
  branding: {
    primaryColor: '#C41E3A',
    secondaryColor: '#1C1C1C',
    mascot: 'Lions',
  },
  contact: {
    email: 'football@lincolnhs.edu',
    phone: '(402) 555-0100',
    website: 'https://lincolnhs.edu/football',
    address: '2229 J Street, Lincoln, NE 68510',
    preferredMethod: 'email',
  },
  social: [
    {
      platform: 'twitter',
      url: 'https://twitter.com/LincolnHSFB',
      username: '@LincolnHSFB',
      verified: true,
    },
    { platform: 'instagram', url: 'https://instagram.com/lincolnhsfb', username: '@lincolnhsfb' },
    { platform: 'hudl', url: 'https://hudl.com/team/lincoln-football' },
  ],
  links: {
    newsPageUrl: 'https://lincolnhs.edu/football/news',
    schedulePageUrl: 'https://lincolnhs.edu/football/schedule',
    registrationUrl: 'https://lincolnhs.edu/football/tryouts',
  },
  division: undefined,
  conference: 'Metro Conference',
  foundedYear: 1965,
  homeVenue: 'Seacrest Field',
  verificationStatus: 'verified',
  verifications: [],
  isActive: true,
  packageId: 'team_premium',
  createdAt: '2024-01-15T00:00:00.000Z',
  updatedAt: '2025-03-01T00:00:00.000Z',
};

// ============================================
// FOLLOW STATS
// ============================================

export const MOCK_TEAM_FOLLOW_STATS: TeamProfileFollowStats = {
  followersCount: 1247,
  isFollowing: false,
};

// ============================================
// QUICK STATS
// ============================================

export const MOCK_TEAM_QUICK_STATS: TeamProfileQuickStats = {
  pageViews: 8432,
  rosterCount: 45,
  totalPosts: 67,
  highlightCount: 23,
  eventCount: 18,
  shareCount: 312,
};

// ============================================
// ROSTER
// ============================================

export const MOCK_TEAM_ROSTER: readonly TeamProfileRosterMember[] = [
  {
    id: 'r1',
    firstName: 'Marcus',
    lastName: 'Johnson',
    displayName: 'Marcus Johnson',
    profileCode: 'MJ2026',
    role: 'athlete',
    position: 'QB',
    jerseyNumber: '7',
    classYear: '2026',
    height: '6\'2"',
    weight: '195 lbs',
    isVerified: true,
    joinedAt: '2024-08-01T00:00:00.000Z',
  },
  {
    id: 'r2',
    firstName: 'DeAndre',
    lastName: 'Williams',
    displayName: 'DeAndre Williams',
    profileCode: 'DW2026',
    role: 'athlete',
    position: 'WR',
    jerseyNumber: '1',
    classYear: '2026',
    height: '6\'0"',
    weight: '180 lbs',
    isVerified: true,
    joinedAt: '2024-08-01T00:00:00.000Z',
  },
  {
    id: 'r3',
    firstName: 'Carlos',
    lastName: 'Martinez',
    displayName: 'Carlos Martinez',
    profileCode: 'CM2027',
    role: 'athlete',
    position: 'RB',
    jerseyNumber: '22',
    classYear: '2027',
    height: '5\'10"',
    weight: '200 lbs',
    isVerified: false,
    joinedAt: '2024-08-15T00:00:00.000Z',
  },
  {
    id: 'r4',
    firstName: 'Jaylen',
    lastName: 'Thompson',
    displayName: 'Jaylen Thompson',
    profileCode: 'JT2026',
    role: 'athlete',
    position: 'LB',
    jerseyNumber: '55',
    classYear: '2026',
    height: '6\'1"',
    weight: '220 lbs',
    isVerified: true,
    joinedAt: '2024-08-01T00:00:00.000Z',
  },
  {
    id: 'r5',
    firstName: 'Tyler',
    lastName: 'Anderson',
    displayName: 'Tyler Anderson',
    profileCode: 'TA2027',
    role: 'athlete',
    position: 'OL',
    jerseyNumber: '72',
    classYear: '2027',
    height: '6\'4"',
    weight: '280 lbs',
    isVerified: false,
    joinedAt: '2024-09-01T00:00:00.000Z',
  },
  {
    id: 'r6',
    firstName: 'Malik',
    lastName: 'Davis',
    displayName: 'Malik Davis',
    profileCode: 'MD2026',
    role: 'athlete',
    position: 'CB',
    jerseyNumber: '4',
    classYear: '2026',
    height: '5\'11"',
    weight: '175 lbs',
    isVerified: true,
    joinedAt: '2024-08-01T00:00:00.000Z',
  },
  {
    id: 'r7',
    firstName: 'Ethan',
    lastName: 'Brown',
    displayName: 'Ethan Brown',
    profileCode: 'EB2028',
    role: 'athlete',
    position: 'DL',
    jerseyNumber: '90',
    classYear: '2028',
    height: '6\'3"',
    weight: '250 lbs',
    isVerified: false,
    joinedAt: '2025-01-10T00:00:00.000Z',
  },
  {
    id: 'r8',
    firstName: 'Jordan',
    lastName: 'White',
    displayName: 'Jordan White',
    profileCode: 'JW2026',
    role: 'athlete',
    position: 'S',
    jerseyNumber: '21',
    classYear: '2026',
    height: '6\'0"',
    weight: '190 lbs',
    isVerified: true,
    joinedAt: '2024-08-01T00:00:00.000Z',
  },
] as const;

// ============================================
// SCHEDULE
// ============================================

export const MOCK_TEAM_SCHEDULE: readonly TeamProfileScheduleEvent[] = [
  {
    id: 's1',
    type: 'game',
    opponent: 'Westside High School',
    opponentLogoUrl: '/assets/images/teams/westside-logo.png',
    date: '2025-08-29T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Seacrest Field',
    isHome: true,
    result: { teamScore: 28, opponentScore: 14, outcome: 'win' },
    status: 'final',
  },
  {
    id: 's2',
    type: 'game',
    opponent: 'Central High School',
    date: '2025-09-05T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Memorial Stadium',
    isHome: false,
    result: { teamScore: 35, opponentScore: 7, outcome: 'win' },
    status: 'final',
  },
  {
    id: 's3',
    type: 'game',
    opponent: 'North Star High School',
    date: '2025-09-12T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Seacrest Field',
    isHome: true,
    result: { teamScore: 21, opponentScore: 24, outcome: 'loss' },
    status: 'final',
  },
  {
    id: 's4',
    type: 'game',
    opponent: 'Southeast High School',
    date: '2025-09-19T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Seacrest Field',
    isHome: true,
    result: { teamScore: 42, opponentScore: 10, outcome: 'win' },
    status: 'final',
  },
  {
    id: 's5',
    type: 'game',
    opponent: 'Omaha Creighton Prep',
    date: '2025-10-10T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Seacrest Field',
    isHome: true,
    status: 'upcoming',
  },
  {
    id: 's6',
    type: 'game',
    opponent: 'Millard South',
    date: '2025-10-17T19:00:00.000Z',
    time: '7:00 PM',
    location: 'Buell Stadium',
    isHome: false,
    status: 'upcoming',
  },
] as const;

// ============================================
// STATS
// ============================================

export const MOCK_TEAM_STATS: readonly TeamProfileStatsCategory[] = [
  {
    name: 'Offense',
    season: '2025',
    stats: [
      { key: 'ppg', label: 'Points Per Game', value: 31.5, icon: 'football' },
      { key: 'ypg', label: 'Yards Per Game', value: 384.2, icon: 'trending-up' },
      { key: 'pass_ypg', label: 'Pass YPG', value: 215.8, icon: 'arrow-forward' },
      { key: 'rush_ypg', label: 'Rush YPG', value: 168.4, icon: 'walk' },
      { key: 'top', label: 'Time of Possession', value: '32:15', icon: 'time' },
    ],
  },
  {
    name: 'Defense',
    season: '2025',
    stats: [
      { key: 'ppg_allowed', label: 'Points Allowed/Game', value: 14.2, icon: 'shield' },
      { key: 'sacks', label: 'Sacks', value: 28, icon: 'flash' },
      { key: 'interceptions', label: 'Interceptions', value: 12, icon: 'hand-left' },
      { key: 'forced_fumbles', label: 'Forced Fumbles', value: 8, icon: 'football' },
    ],
  },
  {
    name: 'Special Teams',
    season: '2025',
    stats: [
      { key: 'fg_pct', label: 'FG Percentage', value: '85%', icon: 'flag' },
      { key: 'punt_avg', label: 'Punt Average', value: 38.5, icon: 'arrow-up' },
      { key: 'kick_return_avg', label: 'Kick Return Avg', value: 22.3, icon: 'flash' },
    ],
  },
] as const;

// ============================================
// STAFF
// ============================================

export const MOCK_TEAM_STAFF: readonly TeamProfileStaffMember[] = [
  {
    id: 'st1',
    firstName: 'John',
    lastName: 'Smith',
    title: 'Head Football Coach',
    role: 'head-coach',
    email: 'jsmith@lincolnhs.edu',
    bio: '15 years of coaching experience. Former Division I player at the University of Nebraska. Led the program to 3 state championships.',
    yearsWithTeam: 8,
  },
  {
    id: 'st2',
    firstName: 'Mike',
    lastName: 'Rodriguez',
    title: 'Offensive Coordinator',
    role: 'coordinator',
    email: 'mrodriguez@lincolnhs.edu',
    bio: 'Specialist in spread offense systems. Previously coached at Millard South for 5 years.',
    yearsWithTeam: 3,
  },
  {
    id: 'st3',
    firstName: 'David',
    lastName: 'Chen',
    title: 'Defensive Coordinator',
    role: 'coordinator',
    email: 'dchen@lincolnhs.edu',
    yearsWithTeam: 5,
  },
  {
    id: 'st4',
    firstName: 'Sarah',
    lastName: 'Johnson',
    title: 'Athletic Trainer',
    role: 'trainer',
    email: 'sjohnson@lincolnhs.edu',
    yearsWithTeam: 4,
  },
] as const;

// ============================================
// RECRUITING ACTIVITY
// ============================================

export const MOCK_TEAM_RECRUITING: readonly TeamProfileRecruitingActivity[] = [
  {
    id: 'rec1',
    category: 'commitment-received',
    athleteName: 'Marcus Johnson',
    athleteProfileCode: 'MJ2026',
    position: 'QB',
    classYear: '2026',
    highSchool: 'Lincoln High School',
    state: 'NE',
    sport: 'Football',
    date: '2025-06-15T00:00:00.000Z',
    verified: true,
  },
  {
    id: 'rec2',
    category: 'offer-sent',
    athleteName: 'DeAndre Williams',
    athleteProfileCode: 'DW2026',
    position: 'WR',
    classYear: '2026',
    highSchool: 'Lincoln High School',
    state: 'NE',
    sport: 'Football',
    date: '2025-05-20T00:00:00.000Z',
    scholarshipType: 'Full Ride',
    verified: true,
  },
  {
    id: 'rec3',
    category: 'visit-hosted',
    athleteName: 'Chris Taylor',
    position: 'LB',
    classYear: '2027',
    highSchool: 'Omaha Central',
    state: 'NE',
    sport: 'Football',
    date: '2025-04-10T00:00:00.000Z',
  },
] as const;

// ============================================
// POSTS
// ============================================

export const MOCK_TEAM_POSTS: readonly TeamProfilePost[] = [
  {
    id: 'tp1',
    type: 'highlight',
    title: 'Season Opener Highlights | Lincoln vs Westside',
    body: 'Check out the top plays from our dominant 28-14 victory over Westside in the season opener.',
    thumbnailUrl: '/assets/images/posts/game-highlight-1.jpg',
    mediaUrl: '/assets/videos/highlights/game-1.mp4',
    likeCount: 234,
    commentCount: 45,
    shareCount: 67,
    viewCount: 3200,
    duration: 180,
    isPinned: true,
    createdAt: '2025-08-30T12:00:00.000Z',
  },
  {
    id: 'tp2',
    type: 'announcement',
    title: '2025 Season Schedule Released',
    body: 'The official 2025 season schedule is now available. Mark your calendars for an exciting year of Lincoln Lions Football!',
    likeCount: 156,
    commentCount: 28,
    shareCount: 89,
    isPinned: false,
    createdAt: '2025-07-15T10:00:00.000Z',
  },
  {
    id: 'tp3',
    type: 'video',
    title: 'Pre-Season Training Camp Recap',
    body: 'A look inside our pre-season training camp. The team is looking sharp heading into the 2025 season.',
    thumbnailUrl: '/assets/images/posts/training-camp.jpg',
    mediaUrl: '/assets/videos/training-camp.mp4',
    likeCount: 98,
    commentCount: 12,
    shareCount: 34,
    viewCount: 1500,
    duration: 240,
    createdAt: '2025-08-10T14:00:00.000Z',
  },
  {
    id: 'tp4',
    type: 'news',
    title: 'Marcus Johnson Named Metro Conference Player of the Week',
    body: 'Junior QB Marcus Johnson threw for 320 yards and 4 touchdowns in the win over Central High.',
    likeCount: 312,
    commentCount: 56,
    shareCount: 124,
    createdAt: '2025-09-07T09:00:00.000Z',
  },
  {
    id: 'tp5',
    type: 'image',
    title: 'Team Photo Day 2025',
    thumbnailUrl: '/assets/images/posts/team-photo.jpg',
    likeCount: 189,
    commentCount: 22,
    shareCount: 45,
    createdAt: '2025-08-05T16:00:00.000Z',
  },
] as const;

// ============================================
// COMPLETE PAGE DATA
// ============================================

export const MOCK_TEAM_PROFILE_PAGE_DATA: TeamProfilePageData = {
  team: MOCK_TEAM,
  followStats: MOCK_TEAM_FOLLOW_STATS,
  quickStats: MOCK_TEAM_QUICK_STATS,
  roster: MOCK_TEAM_ROSTER,
  schedule: MOCK_TEAM_SCHEDULE,
  stats: MOCK_TEAM_STATS,
  staff: MOCK_TEAM_STAFF,
  recentPosts: MOCK_TEAM_POSTS,
  recruitingActivity: MOCK_TEAM_RECRUITING,
  isTeamAdmin: false,
  canEdit: false,
  isMember: false,
};

/**
 * Get mock data configured for team admin view.
 */
export function getMockAdminTeamData(): TeamProfilePageData {
  return {
    ...MOCK_TEAM_PROFILE_PAGE_DATA,
    isTeamAdmin: true,
    canEdit: true,
    isMember: true,
  };
}
