/**
 * @fileoverview Mock Scout Reports Data for Development
 * @module @nxt1/ui/scout-reports/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Scout Reports feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type { ScoutReport, ScoutReportCategoryId, ScoutReportSummary } from '@nxt1/core';

const now = Date.now();

// ============================================
// MOCK ATHLETE PHOTOS (Using placeholder service)
// ============================================

const ATHLETE_PHOTOS = [
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=533&fit=crop', // Football player
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=533&fit=crop', // Basketball player
  'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=400&h=533&fit=crop', // Baseball player
  'https://images.unsplash.com/photo-1461896836934- voices8db8c47?w=400&h=533&fit=crop', // Soccer player
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=533&fit=crop', // Action shot
  'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=400&h=533&fit=crop', // Basketball
];

const SCOUT_AVATARS = [
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=33',
  'https://i.pravatar.cc/150?img=45',
  'https://i.pravatar.cc/150?img=52',
  'https://i.pravatar.cc/150?img=68',
];

// ============================================
// MOCK SCOUT REPORTS DATA
// ============================================

export const MOCK_SCOUT_REPORTS: ScoutReport[] = [
  {
    id: 'sr-001',
    athlete: {
      id: 'ath-001',
      name: 'Marcus Thompson',
      position: 'QB',
      sport: 'football',
      gradYear: 2026,
      photoUrl: ATHLETE_PHOTOS[0],
      school: 'Riverside High School',
      location: 'Austin, TX',
      state: 'TX',
      stats: {
        height: '6\'2"',
        weight: '195 lbs',
        fortyYard: '4.6s',
        vertical: '34"',
        gpa: '3.8',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.7,
      physical: 4.5,
      technical: 4.8,
      mental: 4.9,
      potential: 4.6,
    },
    comparison: {
      classAverage: 3.8,
      percentile: 94,
      positionRank: 12,
      positionTotal: 847,
    },
    summary:
      'Elite arm talent with exceptional field vision and leadership qualities. Marcus demonstrates pro-level decision making under pressure and has the accuracy to make every throw on the field.',
    highlights: [
      'Elite arm strength with 60+ yard throws',
      'Outstanding football IQ',
      'Natural leadership ability',
      'Excellent pocket presence',
    ],
    concerns: ['Could improve footwork consistency', 'Needs to develop more check-down patience'],
    scout: {
      id: 'scout-001',
      name: 'Coach Mike Johnson',
      avatarUrl: SCOUT_AVATARS[0],
      title: 'Head Scout',
      organization: 'Texas Elite Recruiting',
      isVerified: true,
      tier: 'verified',
    },
    isVerified: true,
    isPremium: false,
    isBookmarked: false,
    viewCount: 2453,
    bookmarkCount: 187,
    publishedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    xpReward: 10,
    hasViewed: false,
    tags: ['top-prospect', 'dual-threat', 'leader'],
    source: 'nxt1',
  },
  {
    id: 'sr-002',
    athlete: {
      id: 'ath-002',
      name: 'Jordan Williams',
      position: 'PG',
      sport: 'basketball',
      gradYear: 2026,
      photoUrl: ATHLETE_PHOTOS[1],
      school: 'Lincoln Academy',
      location: 'Chicago, IL',
      state: 'IL',
      stats: {
        height: '6\'1"',
        weight: '175 lbs',
        vertical: '38"',
        gpa: '3.6',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.8,
      physical: 4.6,
      technical: 4.9,
      mental: 4.8,
      potential: 4.9,
    },
    comparison: {
      classAverage: 3.7,
      percentile: 97,
      positionRank: 5,
      positionTotal: 623,
    },
    summary:
      'One of the most dynamic point guards in the 2026 class. Jordan has elite ball-handling skills and an exceptional ability to create for teammates while scoring at will.',
    highlights: [
      'Elite ball-handling and court vision',
      'Explosive first step',
      'Clutch performer in big games',
      'Strong defensive instincts',
    ],
    concerns: ['Three-point consistency needs work', 'Can be turnover prone when aggressive'],
    scout: {
      id: 'scout-002',
      name: 'Sarah Mitchell',
      avatarUrl: SCOUT_AVATARS[1],
      title: 'Director of Scouting',
      organization: 'Midwest Basketball Academy',
      isVerified: true,
      tier: 'official',
    },
    isVerified: true,
    isPremium: true,
    isBookmarked: true,
    viewCount: 4521,
    bookmarkCount: 342,
    publishedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    xpReward: 15,
    hasViewed: true,
    tags: ['5-star', 'floor-general', 'playmaker'],
    source: 'nxt1',
  },
  {
    id: 'sr-003',
    athlete: {
      id: 'ath-003',
      name: 'Tyler Rodriguez',
      position: 'P',
      secondaryPosition: 'SS',
      sport: 'baseball',
      gradYear: 2027,
      photoUrl: ATHLETE_PHOTOS[2],
      school: 'Palm Beach Prep',
      location: 'Miami, FL',
      state: 'FL',
      stats: {
        height: '6\'3"',
        weight: '185 lbs',
        gpa: '3.9',
        sportSpecific: {
          fastball: '94 mph',
          era: '1.23',
          strikeouts: '127',
        },
      },
      isVerified: true,
    },
    rating: {
      overall: 4.5,
      physical: 4.7,
      technical: 4.4,
      mental: 4.3,
      potential: 4.6,
    },
    summary:
      'Power arm with electric stuff and a mature approach on the mound. Tyler projects as a future Friday night starter with his combination of velocity and command.',
    highlights: [
      'Elite velocity (touching 94 mph)',
      'Developing plus slider',
      'Calm demeanor under pressure',
      'Good fielding ability as SS',
    ],
    concerns: ['Changeup needs development', 'Occasional command lapses'],
    scout: {
      id: 'scout-003',
      name: 'Coach David Chen',
      avatarUrl: SCOUT_AVATARS[2],
      title: 'Southeast Regional Scout',
      organization: 'Perfect Game',
      isVerified: true,
      tier: 'official',
    },
    isVerified: true,
    isPremium: false,
    isBookmarked: false,
    viewCount: 1876,
    bookmarkCount: 145,
    publishedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
    xpReward: 10,
    hasViewed: false,
    tags: ['power-arm', 'two-way', 'projectable'],
    source: 'partner',
  },
  {
    id: 'sr-004',
    athlete: {
      id: 'ath-004',
      name: 'Aaliyah Jackson',
      position: 'OH',
      sport: 'volleyball',
      gradYear: 2026,
      photoUrl: ATHLETE_PHOTOS[4],
      school: 'Westwood High',
      location: 'Los Angeles, CA',
      state: 'CA',
      stats: {
        height: '6\'0"',
        weight: '155 lbs',
        vertical: '32"',
        gpa: '4.0',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.6,
      physical: 4.8,
      technical: 4.5,
      mental: 4.5,
      potential: 4.6,
    },
    summary:
      'Dynamic outside hitter with exceptional vertical and powerful arm swing. Aaliyah is a game-changer who can take over matches with her attacking prowess.',
    highlights: [
      'Outstanding vertical leap',
      'Powerful and consistent hitting',
      'Strong serve receive',
      'Team leader and motivator',
    ],
    concerns: ['Block timing can improve', 'Shot selection in clutch moments'],
    scout: {
      id: 'scout-004',
      name: 'Lisa Martinez',
      avatarUrl: SCOUT_AVATARS[3],
      title: 'National Recruiting Coordinator',
      organization: 'PrepVolleyball',
      isVerified: true,
      tier: 'verified',
    },
    isVerified: true,
    isPremium: false,
    isBookmarked: false,
    viewCount: 987,
    bookmarkCount: 78,
    publishedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    xpReward: 10,
    hasViewed: false,
    tags: ['power-hitter', 'athletic', 'high-academic'],
    source: 'nxt1',
  },
  {
    id: 'sr-005',
    athlete: {
      id: 'ath-005',
      name: 'Brandon Davis',
      position: 'WR',
      sport: 'football',
      gradYear: 2027,
      photoUrl: ATHLETE_PHOTOS[5],
      school: 'Central High School',
      location: 'Atlanta, GA',
      state: 'GA',
      stats: {
        height: '6\'1"',
        weight: '180 lbs',
        fortyYard: '4.4s',
        vertical: '40"',
        gpa: '3.5',
      },
      isVerified: false,
    },
    rating: {
      overall: 4.4,
      physical: 4.8,
      technical: 4.2,
      mental: 4.1,
      potential: 4.5,
    },
    summary:
      'Explosive playmaker with track speed and exceptional body control. Brandon is a home-run threat every time he touches the ball.',
    highlights: [
      'Elite speed (4.4 forty)',
      'Great hands in traffic',
      'Excellent RAC ability',
      'Dangerous return specialist',
    ],
    concerns: [
      'Route running precision',
      'Needs to add strength',
      'Consistency on contested catches',
    ],
    scout: {
      id: 'scout-005',
      name: 'Marcus Williams',
      avatarUrl: SCOUT_AVATARS[4],
      title: 'Area Scout',
      organization: 'Rivals',
      isVerified: true,
      tier: 'scout',
    },
    isVerified: false,
    isPremium: true,
    isBookmarked: true,
    viewCount: 3245,
    bookmarkCount: 267,
    publishedAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(), // 1.5 days ago
    xpReward: 15,
    hasViewed: true,
    tags: ['burner', 'playmaker', 'track-star'],
    source: 'nxt1',
  },
  {
    id: 'sr-006',
    athlete: {
      id: 'ath-006',
      name: 'Ethan Park',
      position: 'SF',
      sport: 'basketball',
      gradYear: 2028,
      photoUrl: ATHLETE_PHOTOS[1],
      school: 'Oak Grove Academy',
      location: 'Seattle, WA',
      state: 'WA',
      stats: {
        height: '6\'6"',
        weight: '195 lbs',
        vertical: '36"',
        gpa: '3.7',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.2,
      physical: 4.4,
      technical: 4.1,
      mental: 4.0,
      potential: 4.3,
    },
    summary:
      'Highly skilled wing with a versatile offensive game. Ethan can score from all three levels and has the size to guard multiple positions.',
    highlights: [
      'Smooth shooting stroke',
      'Good court vision',
      'Length and versatility',
      'Coachable attitude',
    ],
    concerns: ['Needs to add muscle', 'Defensive intensity varies', 'Turnover prone in traffic'],
    scout: {
      id: 'scout-002',
      name: 'Sarah Mitchell',
      avatarUrl: SCOUT_AVATARS[1],
      title: 'Director of Scouting',
      organization: 'Midwest Basketball Academy',
      isVerified: true,
      tier: 'official',
    },
    isVerified: true,
    isPremium: false,
    isBookmarked: false,
    viewCount: 756,
    bookmarkCount: 54,
    publishedAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    xpReward: 10,
    hasViewed: false,
    tags: ['skilled', 'versatile', 'young-prospect'],
    source: 'nxt1',
  },
  {
    id: 'sr-007',
    athlete: {
      id: 'ath-007',
      name: 'Carlos Mendez',
      position: 'MID',
      sport: 'soccer',
      gradYear: 2026,
      photoUrl: ATHLETE_PHOTOS[3],
      school: "St. John's Prep",
      location: 'Dallas, TX',
      state: 'TX',
      stats: {
        height: '5\'10"',
        weight: '160 lbs',
        gpa: '3.9',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.3,
      physical: 4.1,
      technical: 4.6,
      mental: 4.4,
      potential: 4.1,
    },
    summary:
      'Creative midfielder with exceptional technical ability and vision. Carlos orchestrates the attack with precise passing and intelligent movement.',
    highlights: [
      'Elite passing range',
      'Exceptional first touch',
      'High soccer IQ',
      'Set piece specialist',
    ],
    concerns: ['Physical battles', 'Defensive work rate'],
    scout: {
      id: 'scout-006',
      name: 'Roberto Silva',
      avatarUrl: SCOUT_AVATARS[0],
      title: 'Technical Director',
      organization: 'TopDrawer Soccer',
      isVerified: true,
      tier: 'verified',
    },
    isVerified: true,
    isPremium: false,
    isBookmarked: false,
    viewCount: 1234,
    bookmarkCount: 89,
    publishedAt: new Date(now - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
    xpReward: 10,
    hasViewed: false,
    tags: ['technical', 'playmaker', 'creative'],
    source: 'nxt1',
  },
  {
    id: 'sr-008',
    athlete: {
      id: 'ath-008',
      name: "Ryan O'Connor",
      position: 'LB',
      sport: 'football',
      gradYear: 2026,
      photoUrl: ATHLETE_PHOTOS[0],
      school: 'Bishop McNamara',
      location: 'Philadelphia, PA',
      state: 'PA',
      stats: {
        height: '6\'2"',
        weight: '220 lbs',
        fortyYard: '4.55s',
        vertical: '35"',
        gpa: '3.4',
      },
      isVerified: true,
    },
    rating: {
      overall: 4.5,
      physical: 4.7,
      technical: 4.4,
      mental: 4.5,
      potential: 4.4,
    },
    summary:
      'Physical downhill linebacker with sideline-to-sideline range. Ryan is a true defensive quarterback who makes all the calls and is a sure tackler.',
    highlights: [
      'Excellent tackling technique',
      'Great instincts against the run',
      'Defensive signal caller',
      'Motor never stops',
    ],
    concerns: ['Coverage skills in space', 'Hip fluidity in man coverage'],
    scout: {
      id: 'scout-005',
      name: 'Marcus Williams',
      avatarUrl: SCOUT_AVATARS[4],
      title: 'Area Scout',
      organization: 'Rivals',
      isVerified: true,
      tier: 'scout',
    },
    isVerified: true,
    isPremium: true,
    isBookmarked: false,
    viewCount: 2876,
    bookmarkCount: 198,
    publishedAt: new Date(now - 1000 * 60 * 60 * 96).toISOString(), // 4 days ago
    xpReward: 15,
    hasViewed: false,
    tags: ['thumper', 'leader', 'sure-tackler'],
    source: 'nxt1',
  },
];

// ============================================
// MOCK BADGE COUNTS
// ============================================

export const MOCK_CATEGORY_BADGES: Record<ScoutReportCategoryId, number> = {
  all: 0,
  trending: 3,
  'top-rated': 0,
  recent: 5,
  'by-sport': 0,
  'class-2026': 2,
  'class-2027': 1,
  'class-2028': 0,
  saved: 0,
  premium: 1,
};

// ============================================
// MOCK SUMMARY DATA
// ============================================

export const MOCK_SUMMARY: ScoutReportSummary = {
  totalReports: 847,
  bySport: {
    football: 312,
    basketball: 256,
    baseball: 142,
    softball: 45,
    soccer: 52,
    volleyball: 23,
    track: 8,
    swimming: 4,
    wrestling: 2,
    lacrosse: 1,
    hockey: 1,
    tennis: 0,
    golf: 0,
    gymnastics: 1,
    other: 0,
  },
  byGradYear: {
    2025: 45,
    2026: 312,
    2027: 287,
    2028: 156,
    2029: 42,
    2030: 5,
  },
  savedCount: 24,
  premiumCount: 156,
  newToday: 12,
};

// ============================================
// HELPER FUNCTIONS FOR MOCK DATA
// ============================================

/**
 * Get mock reports by category.
 */
export function getMockReportsByCategory(
  category: ScoutReportCategoryId,
  page = 1,
  limit = 20
): ScoutReport[] {
  let filtered = [...MOCK_SCOUT_REPORTS];

  switch (category) {
    case 'trending':
      filtered = filtered.sort((a, b) => b.viewCount - a.viewCount);
      break;
    case 'top-rated':
      filtered = filtered.sort((a, b) => b.rating.overall - a.rating.overall);
      break;
    case 'recent':
      filtered = filtered.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      break;
    case 'class-2026':
      filtered = filtered.filter((r) => r.athlete.gradYear === 2026);
      break;
    case 'class-2027':
      filtered = filtered.filter((r) => r.athlete.gradYear === 2027);
      break;
    case 'class-2028':
      filtered = filtered.filter((r) => r.athlete.gradYear === 2028);
      break;
    case 'saved':
      filtered = filtered.filter((r) => r.isBookmarked);
      break;
    case 'premium':
      filtered = filtered.filter((r) => r.isPremium);
      break;
    case 'by-sport':
    case 'all':
    default:
      // Return all
      break;
  }

  const start = (page - 1) * limit;
  const end = start + limit;
  return filtered.slice(start, end);
}

/**
 * Get total count for a category.
 */
export function getMockReportCount(category: ScoutReportCategoryId): number {
  switch (category) {
    case 'class-2026':
      return MOCK_SCOUT_REPORTS.filter((r) => r.athlete.gradYear === 2026).length;
    case 'class-2027':
      return MOCK_SCOUT_REPORTS.filter((r) => r.athlete.gradYear === 2027).length;
    case 'class-2028':
      return MOCK_SCOUT_REPORTS.filter((r) => r.athlete.gradYear === 2028).length;
    case 'saved':
      return MOCK_SCOUT_REPORTS.filter((r) => r.isBookmarked).length;
    case 'premium':
      return MOCK_SCOUT_REPORTS.filter((r) => r.isPremium).length;
    default:
      return MOCK_SCOUT_REPORTS.length;
  }
}

/**
 * Get a single mock report by ID.
 */
export function getMockReportById(id: string): ScoutReport | undefined {
  return MOCK_SCOUT_REPORTS.find((r) => r.id === id);
}

/**
 * Search mock reports by query.
 */
export function searchMockReports(query: string): ScoutReport[] {
  const lowerQuery = query.toLowerCase();
  return MOCK_SCOUT_REPORTS.filter(
    (r) =>
      r.athlete.name.toLowerCase().includes(lowerQuery) ||
      r.athlete.position.toLowerCase().includes(lowerQuery) ||
      r.athlete.school?.toLowerCase().includes(lowerQuery) ||
      r.athlete.sport.toLowerCase().includes(lowerQuery)
  );
}
