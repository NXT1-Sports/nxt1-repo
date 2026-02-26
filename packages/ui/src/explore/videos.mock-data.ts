/**
 * @fileoverview Mock Video Data for Videos Dashboard
 * @module @nxt1/ui/explore/videos
 *
 * ⚠️ TEMPORARY FILE - Replace with backend API when ready
 *
 * Provides typed mock data for the ExploreVideos 7-section dashboard.
 */

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface VideoAthlete {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
  readonly sport: string;
  readonly position: string;
  readonly school: string;
}

export interface VideoItem {
  readonly id: string;
  readonly title: string;
  readonly thumbnailUrl: string;
  readonly videoUrl: string;
  readonly duration: string; // e.g. "2:34"
  readonly viewCount: number;
  readonly athlete: VideoAthlete;
  readonly sport: string;
  readonly position: string;
  /** Trending momentum score 0–100 */
  readonly momentum?: number;
}

export interface DrillVideoItem extends VideoItem {
  readonly drillType: string; // e.g. "40-Yard Dash"
  readonly metric: string; // e.g. "4.38s"
  readonly isVerified: boolean;
}

export interface AgentXVideoItem extends VideoItem {
  readonly agentInsights: readonly string[];
}

export interface WatchlistVideoItem extends VideoItem {
  /** 0–100, undefined if not started */
  readonly watchProgress?: number;
}

// ── Hero ──────────────────────────────────────────────────────────────────────

export const MOCK_HERO_VIDEO: VideoItem = {
  id: 'hero-1',
  title: 'Jordan Matthews — Elite QB Showcase 2026',
  thumbnailUrl:
    'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=1280&q=80',
  videoUrl: '',
  duration: '3:42',
  viewCount: 142_500,
  sport: 'Football',
  position: 'Quarterback',
  athlete: {
    id: 'athlete-1',
    name: 'Jordan Matthews',
    avatarUrl: 'https://i.pravatar.cc/80?img=11',
    sport: 'Football',
    position: 'Quarterback',
    school: 'Westlake HS',
  },
  momentum: 98,
};

// ── Highlight Reel ────────────────────────────────────────────────────────────

export const MOCK_HIGHLIGHT_VIDEOS: readonly VideoItem[] = [
  {
    id: 'hl-1',
    title: 'Marcus Allen — Top 10 Basketball Plays',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638405-a9f9b5f5d1a8?w=400&q=80',
    videoUrl: '',
    duration: '1:28',
    viewCount: 89_200,
    sport: 'Basketball',
    position: 'Point Guard',
    momentum: 95,
    athlete: {
      id: 'athlete-2',
      name: 'Marcus Allen',
      avatarUrl: 'https://i.pravatar.cc/80?img=12',
      sport: 'Basketball',
      position: 'Point Guard',
      school: 'Oak Hill Academy',
    },
  },
  {
    id: 'hl-2',
    title: 'Tyler Reeves — Wide Receiver Highlights',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80',
    videoUrl: '',
    duration: '2:05',
    viewCount: 65_400,
    sport: 'Football',
    position: 'Wide Receiver',
    momentum: 88,
    athlete: {
      id: 'athlete-3',
      name: 'Tyler Reeves',
      avatarUrl: 'https://i.pravatar.cc/80?img=13',
      sport: 'Football',
      position: 'Wide Receiver',
      school: 'IMG Academy',
    },
  },
  {
    id: 'hl-3',
    title: 'Sofia Chen — Soccer Skill Reel 2026',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=400&q=80',
    videoUrl: '',
    duration: '1:55',
    viewCount: 52_100,
    sport: 'Soccer',
    position: 'Midfielder',
    momentum: 82,
    athlete: {
      id: 'athlete-4',
      name: 'Sofia Chen',
      avatarUrl: 'https://i.pravatar.cc/80?img=20',
      sport: 'Soccer',
      position: 'Midfielder',
      school: 'Bishop O\'Dowd HS',
    },
  },
  {
    id: 'hl-4',
    title: 'Deon Harper — Defensive Back Tape',
    thumbnailUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&q=80',
    videoUrl: '',
    duration: '1:44',
    viewCount: 41_800,
    sport: 'Football',
    position: 'Cornerback',
    momentum: 76,
    athlete: {
      id: 'athlete-5',
      name: 'Deon Harper',
      avatarUrl: 'https://i.pravatar.cc/80?img=14',
      sport: 'Football',
      position: 'Cornerback',
      school: 'St. Thomas More',
    },
  },
  {
    id: 'hl-5',
    title: 'Amir Jackson — Pitcher Mechanics Breakdown',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638405-a9f9b5f5d1a8?w=400&q=80',
    videoUrl: '',
    duration: '2:18',
    viewCount: 38_600,
    sport: 'Baseball',
    position: 'Pitcher',
    momentum: 71,
    athlete: {
      id: 'athlete-6',
      name: 'Amir Jackson',
      avatarUrl: 'https://i.pravatar.cc/80?img=15',
      sport: 'Baseball',
      position: 'Pitcher',
      school: 'Jesuit HS',
    },
  },
];

// ── The Combine ───────────────────────────────────────────────────────────────

export const MOCK_DRILL_VIDEOS: readonly DrillVideoItem[] = [
  {
    id: 'drill-1',
    title: 'Jordan Matthews — 40-Yard Dash',
    thumbnailUrl: 'https://images.unsplash.com/photo-1538473959866-7f52f3a5b4ec?w=600&q=80',
    videoUrl: '',
    duration: '0:05',
    viewCount: 32_100,
    sport: 'Football',
    position: 'Quarterback',
    drillType: '40-Yard Dash',
    metric: '4.38s',
    isVerified: true,
    athlete: {
      id: 'athlete-1',
      name: 'Jordan Matthews',
      avatarUrl: 'https://i.pravatar.cc/80?img=11',
      sport: 'Football',
      position: 'Quarterback',
      school: 'Westlake HS',
    },
  },
  {
    id: 'drill-2',
    title: 'Marcus Allen — Vertical Jump',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638405-a9f9b5f5d1a8?w=600&q=80',
    videoUrl: '',
    duration: '0:08',
    viewCount: 28_700,
    sport: 'Basketball',
    position: 'Point Guard',
    drillType: 'Vertical Jump',
    metric: '42.5″',
    isVerified: true,
    athlete: {
      id: 'athlete-2',
      name: 'Marcus Allen',
      avatarUrl: 'https://i.pravatar.cc/80?img=12',
      sport: 'Basketball',
      position: 'Point Guard',
      school: 'Oak Hill Academy',
    },
  },
  {
    id: 'drill-3',
    title: 'Amir Jackson — Pitching Velocity',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&q=80',
    videoUrl: '',
    duration: '0:12',
    viewCount: 24_300,
    sport: 'Baseball',
    position: 'Pitcher',
    drillType: 'Pitching Velocity',
    metric: '94 mph',
    isVerified: true,
    athlete: {
      id: 'athlete-6',
      name: 'Amir Jackson',
      avatarUrl: 'https://i.pravatar.cc/80?img=15',
      sport: 'Baseball',
      position: 'Pitcher',
      school: 'Jesuit HS',
    },
  },
  {
    id: 'drill-4',
    title: 'Sofia Chen — Pro Agility Shuttle',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=600&q=80',
    videoUrl: '',
    duration: '0:06',
    viewCount: 19_800,
    sport: 'Soccer',
    position: 'Midfielder',
    drillType: 'Pro Agility Shuttle',
    metric: '4.12s',
    isVerified: true,
    athlete: {
      id: 'athlete-4',
      name: 'Sofia Chen',
      avatarUrl: 'https://i.pravatar.cc/80?img=20',
      sport: 'Soccer',
      position: 'Midfielder',
      school: 'Bishop O\'Dowd HS',
    },
  },
];

// ── Agent X Film Study ────────────────────────────────────────────────────────

export const MOCK_AGENT_X_VIDEOS: readonly AgentXVideoItem[] = [
  {
    id: 'ax-1',
    title: 'Tyler Reeves — Route Running Analysis',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&q=80',
    videoUrl: '',
    duration: '4:22',
    viewCount: 18_400,
    sport: 'Football',
    position: 'Wide Receiver',
    athlete: {
      id: 'athlete-3',
      name: 'Tyler Reeves',
      avatarUrl: 'https://i.pravatar.cc/80?img=13',
      sport: 'Football',
      position: 'Wide Receiver',
      school: 'IMG Academy',
    },
    agentInsights: [
      '⚡ Elite release time: 0.3s off the line',
      '🎯 High accuracy on deep routes (87% catch rate)',
      '📐 Precise route depth on 10-yard hooks',
      '💨 Separation index: 1.8ft avg vs man coverage',
    ],
  },
  {
    id: 'ax-2',
    title: 'Jordan Matthews — 3rd Down Decision-Making',
    thumbnailUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=600&q=80',
    videoUrl: '',
    duration: '6:15',
    viewCount: 14_900,
    sport: 'Football',
    position: 'Quarterback',
    athlete: {
      id: 'athlete-1',
      name: 'Jordan Matthews',
      avatarUrl: 'https://i.pravatar.cc/80?img=11',
      sport: 'Football',
      position: 'Quarterback',
      school: 'Westlake HS',
    },
    agentInsights: [
      '🧠 Pre-snap reads: identifies blitz 92% of the time',
      '⏱️ Avg release: 2.1s under pressure',
      '📊 Completion rate on 3rd & medium: 74%',
      '🎯 Touchdown-to-turnover ratio: 4:1',
    ],
  },
  {
    id: 'ax-3',
    title: 'Marcus Allen — Ball Handling Under Pressure',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638405-a9f9b5f5d1a8?w=600&q=80',
    videoUrl: '',
    duration: '3:48',
    viewCount: 11_200,
    sport: 'Basketball',
    position: 'Point Guard',
    athlete: {
      id: 'athlete-2',
      name: 'Marcus Allen',
      avatarUrl: 'https://i.pravatar.cc/80?img=12',
      sport: 'Basketball',
      position: 'Point Guard',
      school: 'Oak Hill Academy',
    },
    agentInsights: [
      '🔁 Crossover speed: top 2% nationally',
      '📈 Pick-and-roll efficiency: 1.14 pts/possession',
      '🎯 Pull-up jumper accuracy: 48% from mid-range',
      '⚡ First step acceleration: 0.22s to full speed',
    ],
  },
];

// ── Game Day ──────────────────────────────────────────────────────────────────

export const MOCK_GAME_VIDEOS: readonly VideoItem[] = [
  {
    id: 'game-1',
    title: 'Westlake HS vs. St. John Bosco — Full Game',
    thumbnailUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=800&q=80',
    videoUrl: '',
    duration: '1:48:32',
    viewCount: 76_400,
    sport: 'Football',
    position: 'Quarterback',
    athlete: {
      id: 'athlete-1',
      name: 'Jordan Matthews',
      avatarUrl: 'https://i.pravatar.cc/80?img=11',
      sport: 'Football',
      position: 'Quarterback',
      school: 'Westlake HS',
    },
  },
  {
    id: 'game-2',
    title: 'Oak Hill Academy vs. La Lumiere — Q3 & Q4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638405-a9f9b5f5d1a8?w=800&q=80',
    videoUrl: '',
    duration: '24:15',
    viewCount: 48_200,
    sport: 'Basketball',
    position: 'Point Guard',
    athlete: {
      id: 'athlete-2',
      name: 'Marcus Allen',
      avatarUrl: 'https://i.pravatar.cc/80?img=12',
      sport: 'Basketball',
      position: 'Point Guard',
      school: 'Oak Hill Academy',
    },
  },
  {
    id: 'game-3',
    title: 'Bishop O\'Dowd HS — CIF State Final Highlights',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=800&q=80',
    videoUrl: '',
    duration: '12:45',
    viewCount: 33_800,
    sport: 'Soccer',
    position: 'Midfielder',
    athlete: {
      id: 'athlete-4',
      name: 'Sofia Chen',
      avatarUrl: 'https://i.pravatar.cc/80?img=20',
      sport: 'Soccer',
      position: 'Midfielder',
      school: 'Bishop O\'Dowd HS',
    },
  },
  {
    id: 'game-4',
    title: 'IMG Academy — Spring Showcase Full Game',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
    videoUrl: '',
    duration: '2:02:18',
    viewCount: 29_600,
    sport: 'Football',
    position: 'Wide Receiver',
    athlete: {
      id: 'athlete-3',
      name: 'Tyler Reeves',
      avatarUrl: 'https://i.pravatar.cc/80?img=13',
      sport: 'Football',
      position: 'Wide Receiver',
      school: 'IMG Academy',
    },
  },
];

// ── Positional Masterclass ────────────────────────────────────────────────────

export const POSITIONS = [
  'All',
  'Quarterbacks',
  'Wide Receivers',
  'Running Backs',
  'Cornerbacks',
  'Point Guards',
  'Pitchers',
  'Midfielders',
] as const;

export type PositionFilter = (typeof POSITIONS)[number];

export const MOCK_POSITIONAL_VIDEOS: readonly VideoItem[] = [
  ...MOCK_HIGHLIGHT_VIDEOS,
  ...MOCK_DRILL_VIDEOS.map((d) => ({ ...d })),
];

// ── Watchlist ─────────────────────────────────────────────────────────────────

export const MOCK_WATCHLIST_VIDEOS: readonly WatchlistVideoItem[] = [
  { ...MOCK_GAME_VIDEOS[0], watchProgress: 65 },
  { ...MOCK_HIGHLIGHT_VIDEOS[0], watchProgress: 100 },
  { ...MOCK_AGENT_X_VIDEOS[0], watchProgress: 30 },
  { ...MOCK_GAME_VIDEOS[1], watchProgress: undefined },
  { ...MOCK_HIGHLIGHT_VIDEOS[2], watchProgress: 80 },
  { ...MOCK_DRILL_VIDEOS[0], watchProgress: 45 },
];
