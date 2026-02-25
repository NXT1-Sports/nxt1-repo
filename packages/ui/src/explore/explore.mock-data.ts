/**
 * @fileoverview Mock Explore Data for Development
 * @module @nxt1/ui/explore/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Explore feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  ExploreCollegeItem,
  ExploreVideoItem,
  ExploreAthleteItem,
  ExploreTeamItem,
  ExploreItem,
  ExploreTabId,
  ExploreTabCounts,
} from '@nxt1/core';

const now = Date.now();

// ============================================
// MOCK COLLEGES
// ============================================

export const MOCK_COLLEGES: ExploreCollegeItem[] = [
  {
    id: 'college-1',
    type: 'colleges',
    name: 'UCLA',
    subtitle: 'University of California, Los Angeles',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/UCLA_Bruins_script.svg/200px-UCLA_Bruins_script.svg.png',
    isVerified: true,
    route: '/college/ucla',
    location: 'Los Angeles, CA',
    division: 'Division I',
    conference: 'Big Ten',
    sports: ['Basketball', 'Football', 'Baseball', 'Soccer', 'Volleyball'],
    colors: ['#2774AE', '#FFD100'],
    ranking: 5,
  },
  {
    id: 'college-2',
    type: 'colleges',
    name: 'Duke University',
    subtitle: 'Durham, North Carolina',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Duke_Athletics_logo.svg/200px-Duke_Athletics_logo.svg.png',
    isVerified: true,
    route: '/college/duke',
    location: 'Durham, NC',
    division: 'Division I',
    conference: 'ACC',
    sports: ['Basketball', 'Football', 'Lacrosse', 'Soccer'],
    colors: ['#012169', '#FFFFFF'],
    ranking: 3,
  },
  {
    id: 'college-3',
    type: 'colleges',
    name: 'University of Texas',
    subtitle: 'Austin, Texas',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Texas_Longhorns_logo.svg/200px-Texas_Longhorns_logo.svg.png',
    isVerified: true,
    route: '/college/texas',
    location: 'Austin, TX',
    division: 'Division I',
    conference: 'SEC',
    sports: ['Football', 'Basketball', 'Baseball', 'Swimming', 'Track'],
    colors: ['#BF5700', '#FFFFFF'],
    ranking: 8,
  },
  {
    id: 'college-4',
    type: 'colleges',
    name: 'Stanford University',
    subtitle: 'Stanford, California',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Stanford_Cardinal_logo.svg/200px-Stanford_Cardinal_logo.svg.png',
    isVerified: true,
    route: '/college/stanford',
    location: 'Stanford, CA',
    division: 'Division I',
    conference: 'ACC',
    sports: ['Football', 'Basketball', 'Swimming', 'Tennis', 'Golf'],
    colors: ['#8C1515', '#FFFFFF'],
    ranking: 12,
  },
  {
    id: 'college-5',
    type: 'colleges',
    name: 'Ohio State University',
    subtitle: 'Columbus, Ohio',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Ohio_State_Buckeyes_logo.svg/200px-Ohio_State_Buckeyes_logo.svg.png',
    isVerified: true,
    route: '/college/ohio-state',
    location: 'Columbus, OH',
    division: 'Division I',
    conference: 'Big Ten',
    sports: ['Football', 'Basketball', 'Wrestling', 'Baseball'],
    colors: ['#BB0000', '#666666'],
    ranking: 6,
  },
  {
    id: 'college-6',
    type: 'colleges',
    name: 'University of Michigan',
    subtitle: 'Ann Arbor, Michigan',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Michigan_Wolverines_logo.svg/200px-Michigan_Wolverines_logo.svg.png',
    isVerified: true,
    route: '/college/michigan',
    location: 'Ann Arbor, MI',
    division: 'Division I',
    conference: 'Big Ten',
    sports: ['Football', 'Basketball', 'Hockey', 'Swimming'],
    colors: ['#00274C', '#FFCB05'],
    ranking: 4,
  },
];

// ============================================
// MOCK VIDEOS
// ============================================

export const MOCK_VIDEOS: ExploreVideoItem[] = [
  {
    id: 'video-1',
    type: 'videos',
    name: 'Championship Game Highlights',
    subtitle: '2025 State Championship - Final Four',
    imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400',
    isVerified: false,
    route: '/video/video-1',
    duration: 245,
    views: 125000,
    likes: 8500,
    creator: {
      id: 'athlete-1',
      name: 'Marcus Johnson',
      avatarUrl: 'https://i.pravatar.cc/150?img=12',
    },
    sport: 'Basketball',
    uploadedAt: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'video-2',
    type: 'videos',
    name: 'Training Session - Speed Work',
    subtitle: 'Off-season conditioning drills',
    imageUrl: 'https://images.unsplash.com/photo-1461896836934- voices-46b7bf?w=400',
    thumbnailUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
    isVerified: false,
    route: '/video/video-2',
    duration: 180,
    views: 45000,
    likes: 3200,
    creator: {
      id: 'athlete-2',
      name: 'Sarah Williams',
      avatarUrl: 'https://i.pravatar.cc/150?img=25',
    },
    sport: 'Track & Field',
    uploadedAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'video-3',
    type: 'videos',
    name: 'Game Winning Goal',
    subtitle: 'Overtime thriller vs. Rivals',
    imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400',
    thumbnailUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400',
    isVerified: false,
    route: '/video/video-3',
    duration: 62,
    views: 89000,
    likes: 6100,
    creator: {
      id: 'athlete-3',
      name: 'Carlos Rodriguez',
      avatarUrl: 'https://i.pravatar.cc/150?img=33',
    },
    sport: 'Soccer',
    uploadedAt: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: 'video-4',
    type: 'videos',
    name: 'Full Game Film - Regional Finals',
    subtitle: 'Complete breakdown with commentary',
    imageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400',
    isVerified: false,
    route: '/video/video-4',
    duration: 3600,
    views: 28000,
    likes: 1800,
    creator: {
      id: 'athlete-4',
      name: 'James Thompson',
      avatarUrl: 'https://i.pravatar.cc/150?img=45',
    },
    sport: 'Football',
    uploadedAt: new Date(now - 1000 * 60 * 60 * 24 * 10).toISOString(),
  },
  {
    id: 'video-5',
    type: 'videos',
    name: 'Skills Showcase 2025',
    subtitle: 'Best plays from this season',
    imageUrl: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=400',
    thumbnailUrl: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=400',
    isVerified: false,
    route: '/video/video-5',
    duration: 420,
    views: 156000,
    likes: 12400,
    creator: {
      id: 'athlete-5',
      name: 'Emily Chen',
      avatarUrl: 'https://i.pravatar.cc/150?img=52',
    },
    sport: 'Volleyball',
    uploadedAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

// ============================================
// MOCK ATHLETES
// ============================================

export const MOCK_ATHLETES: ExploreAthleteItem[] = [
  {
    id: 'athlete-1',
    type: 'athletes',
    name: 'Marcus Johnson',
    subtitle: 'Point Guard • Class of 2026',
    imageUrl: 'https://i.pravatar.cc/150?img=12',
    isVerified: true,
    route: '/profile/marcus-johnson',
    sport: 'Basketball',
    position: 'Point Guard',
    classYear: 2026,
    location: 'Los Angeles, CA',
    team: 'Mater Dei High School',
    commitment: {
      collegeName: 'UCLA',
      collegeLogoUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/UCLA_Bruins_script.svg/100px-UCLA_Bruins_script.svg.png',
    },
    followers: 45000,
    videoCount: 28,
  },
  {
    id: 'athlete-2',
    type: 'athletes',
    name: 'Sarah Williams',
    subtitle: 'Sprinter • Class of 2025',
    imageUrl: 'https://i.pravatar.cc/150?img=25',
    isVerified: true,
    route: '/profile/sarah-williams',
    sport: 'Track & Field',
    position: '100m/200m',
    classYear: 2025,
    location: 'Houston, TX',
    team: 'The Woodlands High School',
    followers: 32000,
    videoCount: 15,
  },
  {
    id: 'athlete-3',
    type: 'athletes',
    name: 'Carlos Rodriguez',
    subtitle: 'Forward • Class of 2026',
    imageUrl: 'https://i.pravatar.cc/150?img=33',
    isVerified: false,
    route: '/profile/carlos-rodriguez',
    sport: 'Soccer',
    position: 'Forward',
    classYear: 2026,
    location: 'Miami, FL',
    team: 'Miami FC Academy',
    followers: 18500,
    videoCount: 22,
  },
  {
    id: 'athlete-4',
    type: 'athletes',
    name: 'James Thompson',
    subtitle: 'Quarterback • Class of 2025',
    imageUrl: 'https://i.pravatar.cc/150?img=45',
    isVerified: true,
    route: '/profile/james-thompson',
    sport: 'Football',
    position: 'Quarterback',
    classYear: 2025,
    location: 'Dallas, TX',
    team: 'Highland Park High School',
    commitment: {
      collegeName: 'Texas',
      collegeLogoUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Texas_Longhorns_logo.svg/100px-Texas_Longhorns_logo.svg.png',
    },
    followers: 78000,
    videoCount: 45,
  },
  {
    id: 'athlete-5',
    type: 'athletes',
    name: 'Emily Chen',
    subtitle: 'Outside Hitter • Class of 2026',
    imageUrl: 'https://i.pravatar.cc/150?img=52',
    isVerified: true,
    route: '/profile/emily-chen',
    sport: 'Volleyball',
    position: 'Outside Hitter',
    classYear: 2026,
    location: 'San Diego, CA',
    team: 'Torrey Pines High School',
    followers: 28000,
    videoCount: 19,
  },
  {
    id: 'athlete-6',
    type: 'athletes',
    name: 'David Miller',
    subtitle: 'Pitcher • Class of 2025',
    imageUrl: 'https://i.pravatar.cc/150?img=58',
    isVerified: false,
    route: '/profile/david-miller',
    sport: 'Baseball',
    position: 'Pitcher',
    classYear: 2025,
    location: 'Atlanta, GA',
    team: 'Parkview High School',
    followers: 15000,
    videoCount: 31,
  },
];

// ============================================
// MOCK TEAMS
// ============================================

export const MOCK_TEAMS: ExploreTeamItem[] = [
  {
    id: 'team-1',
    type: 'teams',
    name: 'Mater Dei Monarchs',
    subtitle: 'High School Basketball',
    imageUrl: 'https://i.pravatar.cc/150?img=60',
    isVerified: true,
    route: '/team/mater-dei-basketball',
    location: 'Santa Ana, CA',
    sport: 'Basketball',
    memberCount: 15,
    record: '28-2',
    colors: ['#CC0000', '#FFFFFF'],
    teamType: 'High School',
  },
  {
    id: 'team-2',
    type: 'teams',
    name: 'Houston Elite AAU',
    subtitle: 'AAU Basketball',
    imageUrl: 'https://i.pravatar.cc/150?img=61',
    isVerified: true,
    route: '/team/houston-elite',
    location: 'Houston, TX',
    sport: 'Basketball',
    memberCount: 12,
    record: '45-8',
    colors: ['#003366', '#FFD700'],
    teamType: 'AAU/Club',
  },
  {
    id: 'team-3',
    type: 'teams',
    name: 'IMG Academy Football',
    subtitle: 'Prep School Football',
    imageUrl: 'https://i.pravatar.cc/150?img=62',
    isVerified: true,
    route: '/team/img-football',
    location: 'Bradenton, FL',
    sport: 'Football',
    memberCount: 85,
    record: '11-1',
    colors: ['#1C2841', '#C4A000'],
    teamType: 'Prep School',
  },
  {
    id: 'team-4',
    type: 'teams',
    name: 'SoCal Eclipse',
    subtitle: 'Club Volleyball',
    imageUrl: 'https://i.pravatar.cc/150?img=63',
    isVerified: false,
    route: '/team/socal-eclipse',
    location: 'Irvine, CA',
    sport: 'Volleyball',
    memberCount: 14,
    record: '32-6',
    colors: ['#4B0082', '#FFD700'],
    teamType: 'Club',
  },
  {
    id: 'team-5',
    type: 'teams',
    name: 'FC Dallas Academy',
    subtitle: 'MLS Next Academy',
    imageUrl: 'https://i.pravatar.cc/150?img=64',
    isVerified: true,
    route: '/team/fc-dallas-academy',
    location: 'Frisco, TX',
    sport: 'Soccer',
    memberCount: 22,
    record: '18-4-3',
    colors: ['#E81F3E', '#00529B'],
    teamType: 'Academy',
  },
];

// ============================================
// MOCK TRENDING SEARCHES
// ============================================

export const MOCK_TRENDING_SEARCHES: string[] = [
  'basketball highlights',
  'UCLA recruiting',
  'football 2026',
  'track and field',
  'volleyball club',
  'Texas football',
  'Duke basketball',
  'soccer academy',
];

// ============================================
// MOCK RECENT SEARCHES
// ============================================

export const MOCK_RECENT_SEARCHES: string[] = [
  'marcus johnson',
  'UCLA',
  'basketball',
  'texas football',
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get mock items for a specific tab.
 */
export function getMockExploreItems(
  tab: ExploreTabId,
  page = 1,
  limit = 20,
  query = ''
): ExploreItem[] {
  let items: ExploreItem[];

  switch (tab) {
    case 'colleges':
      items = [...MOCK_COLLEGES];
      break;
    case 'videos':
      items = [...MOCK_VIDEOS];
      break;
    case 'athletes':
      items = [...MOCK_ATHLETES];
      break;
    case 'teams':
      items = [...MOCK_TEAMS];
      break;
    default:
      items = [];
  }

  // Filter by query if provided
  if (query) {
    const lowerQuery = query.toLowerCase();
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(lowerQuery) ||
        item.subtitle?.toLowerCase().includes(lowerQuery)
    );
  }

  // Paginate
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}

/**
 * Get mock item count for a tab.
 */
export function getMockItemCount(tab: ExploreTabId, query = ''): number {
  return getMockExploreItems(tab, 1, 1000, query).length;
}

/**
 * Get mock tab counts.
 */
export function getMockTabCounts(query = ''): ExploreTabCounts {
  return {
    'for-you': 0,
    feed: 0,
    following: 0,
    news: 0,
    colleges: getMockItemCount('colleges', query),
    athletes: getMockItemCount('athletes', query),
    teams: getMockItemCount('teams', query),
    videos: getMockItemCount('videos', query),
    leaderboards: 0, // No mock data for new tabs yet
    'scout-reports': 0,
    camps: 0,
    events: 0,
  };
}

/**
 * Get mock suggestions based on query.
 */
export function getMockSuggestions(query: string, limit = 8): string[] {
  if (!query || query.length < 2) return [];

  const allSuggestions = [
    ...MOCK_COLLEGES.map((c) => c.name.toLowerCase()),
    ...MOCK_ATHLETES.map((a) => a.name.toLowerCase()),
    ...MOCK_TEAMS.map((t) => t.name.toLowerCase()),
    'basketball recruiting',
    'football highlights',
    'soccer skills',
    'volleyball training',
    'track and field',
  ];

  const lowerQuery = query.toLowerCase();
  return allSuggestions.filter((s) => s.includes(lowerQuery)).slice(0, limit);
}
