/**
 * @fileoverview Analytics Dashboard Mock Data for Development
 * @module @nxt1/ui/analytics-dashboard/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Analytics Dashboard feature during development.
 * All data here is fabricated for UI testing purposes only.
 *
 * Mock data follows the exact same structure as production API responses.
 */

import type {
  AthleteAnalyticsReport,
  CoachAnalyticsReport,
  MetricCard,
  MetricTrend,
  VideoAnalytics,
  PostAnalytics,
  AnalyticsInsight,
  AnalyticsRecommendation,
  ViewsBySource,
  GeoDistribution,
  EngagementByTime,
  AnalyticsViewerBreakdown,
  ChartConfig,
  CollegeInterestAnalytics,
  RecruitingMilestone,
  AthleteRosterAnalytics,
  TeamOverviewAnalytics,
  TopPerformer,
} from '@nxt1/core';

// ============================================
// HELPER FUNCTIONS
// ============================================

const now = Date.now();

function daysAgo(days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function createTrend(currentValue: number, percentChange: number): MetricTrend {
  return {
    currentValue,
    previousValue: Math.round(currentValue / (1 + percentChange / 100)),
    percentChange,
    direction: percentChange > 1 ? 'up' : percentChange < -1 ? 'down' : 'stable',
  };
}

// ============================================
// METRIC CARDS
// ============================================

export const MOCK_ATHLETE_OVERVIEW_CARDS: Record<string, MetricCard> = {
  profileViews: {
    id: 'profile-views',
    label: 'Profile Views',
    value: 2847,
    displayValue: '2,847',
    icon: 'eye-outline',
    trend: createTrend(2847, 23.5),
    variant: 'default',
    description: 'Total views on your profile',
  },
  videoViews: {
    id: 'video-views',
    label: 'Video Views',
    value: 8392,
    displayValue: '8.4K',
    icon: 'videocam-outline',
    trend: createTrend(8392, 15.2),
    variant: 'default',
    description: 'Total views across all videos',
  },
  followers: {
    id: 'followers',
    label: 'Followers',
    value: 456,
    displayValue: '456',
    icon: 'people-outline',
    trend: createTrend(456, 8.7),
    variant: 'default',
    description: 'Total followers',
  },
  engagementRate: {
    id: 'engagement-rate',
    label: 'Engagement Rate',
    value: 4.2,
    displayValue: '4.2%',
    suffix: '%',
    icon: 'heart-outline',
    trend: createTrend(4.2, -2.1),
    variant: 'default',
    description: 'Average engagement across content',
  },
  profileScore: {
    id: 'profile-score',
    label: 'Profile Score',
    value: 87,
    displayValue: '87',
    suffix: '/100',
    icon: 'star-outline',
    trend: createTrend(87, 5),
    variant: 'highlight',
    description: 'Profile completeness & quality score',
  },
  collegeCoachViews: {
    id: 'college-coach-views',
    label: 'Coach Views',
    value: 142,
    displayValue: '142',
    icon: 'school-outline',
    trend: createTrend(142, 34.2),
    variant: 'accent',
    description: 'Views from verified college coaches',
  },
};

export const MOCK_COACH_OVERVIEW_CARDS: Record<string, MetricCard> = {
  totalViews: {
    id: 'total-views',
    label: 'Total Views',
    value: 45892,
    displayValue: '45.9K',
    icon: 'eye-outline',
    trend: createTrend(45892, 18.3),
    variant: 'default',
  },
  teamPageViews: {
    id: 'team-page-views',
    label: 'Team Page Views',
    value: 3241,
    displayValue: '3,241',
    icon: 'business-outline',
    trend: createTrend(3241, 12.5),
    variant: 'default',
  },
  activeAthletes: {
    id: 'active-athletes',
    label: 'Active Athletes',
    value: 18,
    displayValue: '18',
    suffix: '/24',
    icon: 'flash-outline',
    trend: createTrend(18, 5.9),
    variant: 'default',
  },
  avgEngagement: {
    id: 'avg-engagement',
    label: 'Avg Engagement',
    value: 1912,
    displayValue: '1,912',
    icon: 'trending-up-outline',
    trend: createTrend(1912, 8.4),
    variant: 'default',
  },
  totalOffers: {
    id: 'total-offers',
    label: 'Total Offers',
    value: 12,
    displayValue: '12',
    icon: 'trophy-outline',
    trend: createTrend(12, 50),
    variant: 'success',
  },
  commitments: {
    id: 'commitments',
    label: 'Commitments',
    value: 3,
    displayValue: '3',
    icon: 'checkmark-circle-outline',
    trend: createTrend(3, 0),
    variant: 'highlight',
  },
};

// ============================================
// ENGAGEMENT DATA
// ============================================

export const MOCK_VIEWS_BY_SOURCE: ViewsBySource[] = [
  { source: 'search', label: 'Search & Explore', views: 1245, percentage: 43.7 },
  { source: 'direct', label: 'Direct Link', views: 892, percentage: 31.3 },
  { source: 'social', label: 'Social Media', views: 412, percentage: 14.5 },
  { source: 'email', label: 'Email Campaigns', views: 186, percentage: 6.5 },
  { source: 'referral', label: 'Referrals', views: 112, percentage: 3.9 },
];

export const MOCK_GEO_DISTRIBUTION: GeoDistribution[] = [
  { location: 'Texas', code: 'TX', views: 524, percentage: 18.4 },
  { location: 'California', code: 'CA', views: 412, percentage: 14.5 },
  { location: 'Florida', code: 'FL', views: 356, percentage: 12.5 },
  { location: 'Georgia', code: 'GA', views: 289, percentage: 10.1 },
  { location: 'Ohio', code: 'OH', views: 234, percentage: 8.2 },
  { location: 'Pennsylvania', code: 'PA', views: 198, percentage: 7.0 },
  { location: 'Other', code: 'OTHER', views: 834, percentage: 29.3 },
];

export const MOCK_VIEWER_TYPES: readonly AnalyticsViewerBreakdown[] = [
  {
    type: 'college-coach' as const,
    label: 'College Coaches',
    count: 142,
    percentage: 5.0,
    trend: createTrend(142, 34.2),
  },
  {
    type: 'athlete' as const,
    label: 'Athletes',
    count: 1456,
    percentage: 51.2,
    trend: createTrend(1456, 12.3),
  },
  {
    type: 'parent' as const,
    label: 'Parents',
    count: 423,
    percentage: 14.9,
    trend: createTrend(423, 8.1),
  },
  {
    type: 'scout' as const,
    label: 'Scouts',
    count: 67,
    percentage: 2.4,
    trend: createTrend(67, 15.5),
  },
  {
    type: 'fan' as const,
    label: 'Fans',
    count: 589,
    percentage: 20.7,
    trend: createTrend(589, -3.2),
  },
  {
    type: 'other' as const,
    label: 'Other',
    count: 170,
    percentage: 6.0,
  },
];

export const MOCK_ENGAGEMENT_BY_TIME: EngagementByTime[] = [
  { period: 0, label: 'Sun', count: 312, intensity: 0.65 },
  { period: 1, label: 'Mon', count: 456, intensity: 0.95 },
  { period: 2, label: 'Tue', count: 423, intensity: 0.88 },
  { period: 3, label: 'Wed', count: 478, intensity: 1.0 },
  { period: 4, label: 'Thu', count: 398, intensity: 0.83 },
  { period: 5, label: 'Fri', count: 289, intensity: 0.6 },
  { period: 6, label: 'Sat', count: 267, intensity: 0.56 },
];

export const MOCK_ENGAGEMENT_BY_HOUR: EngagementByTime[] = Array.from({ length: 24 }, (_, hour) => {
  // Simulate typical viewing patterns (peaks in evening)
  const baseCount = 50;
  const peakMultiplier =
    hour >= 18 && hour <= 22
      ? 3.5
      : hour >= 12 && hour <= 14
        ? 2.0
        : hour >= 6 && hour <= 9
          ? 1.5
          : hour >= 0 && hour <= 5
            ? 0.3
            : 1.0;
  const count = Math.round(baseCount * peakMultiplier + Math.random() * 20);
  const maxCount = 200;
  return {
    period: hour,
    label: `${hour % 12 || 12}${hour < 12 ? 'AM' : 'PM'}`,
    count,
    intensity: count / maxCount,
  };
});

// ============================================
// VIEWS OVER TIME CHART
// ============================================

export const MOCK_VIEWS_CHART: ChartConfig = {
  type: 'area',
  title: 'Profile Views Over Time',
  datasets: [
    {
      id: 'profile-views',
      label: 'Profile Views',
      data: [
        { label: 'Mon', value: 342 },
        { label: 'Tue', value: 456 },
        { label: 'Wed', value: 523 },
        { label: 'Thu', value: 412 },
        { label: 'Fri', value: 389 },
        { label: 'Sat', value: 298 },
        { label: 'Sun', value: 427 },
      ],
      color: 'var(--nxt1-color-primary)',
      fillColor: 'var(--nxt1-color-primary-alpha-10)',
    },
  ],
  showLegend: false,
  showGrid: true,
};

// ============================================
// CONTENT ANALYTICS
// ============================================

export const MOCK_VIDEO_ANALYTICS: VideoAnalytics[] = [
  {
    id: 'v1',
    title: 'Senior Season Highlights 2025',
    thumbnailUrl: 'https://picsum.photos/seed/vid1/320/180',
    views: 4523,
    avgWatchDuration: 145,
    completionRate: 0.72,
    totalWatchTime: 656835,
    shares: 89,
    createdAt: daysAgo(30),
    trend: createTrend(4523, 28.5),
  },
  {
    id: 'v2',
    title: 'Skills & Drills Showcase',
    thumbnailUrl: 'https://picsum.photos/seed/vid2/320/180',
    views: 2341,
    avgWatchDuration: 98,
    completionRate: 0.65,
    totalWatchTime: 229418,
    shares: 45,
    createdAt: daysAgo(60),
    trend: createTrend(2341, 12.3),
  },
  {
    id: 'v3',
    title: 'Championship Game Performance',
    thumbnailUrl: 'https://picsum.photos/seed/vid3/320/180',
    views: 1528,
    avgWatchDuration: 210,
    completionRate: 0.81,
    totalWatchTime: 320880,
    shares: 67,
    createdAt: daysAgo(14),
    trend: createTrend(1528, 45.2),
  },
];

export const MOCK_POST_ANALYTICS: PostAnalytics[] = [
  {
    id: 'p1',
    type: 'graphic',
    previewUrl: 'https://picsum.photos/seed/post1/400/400',
    impressions: 3245,
    likes: 234,
    comments: 45,
    shares: 89,
    engagementRate: 0.113,
    createdAt: daysAgo(3),
  },
  {
    id: 'p2',
    type: 'video',
    previewUrl: 'https://picsum.photos/seed/post2/400/400',
    impressions: 2891,
    likes: 312,
    comments: 67,
    shares: 123,
    engagementRate: 0.174,
    createdAt: daysAgo(7),
  },
];

// ============================================
// RECRUITING DATA (ATHLETE)
// ============================================

export const MOCK_COLLEGE_INTERESTS: CollegeInterestAnalytics[] = [
  {
    collegeId: 'c1',
    collegeName: 'University of Texas',
    logoUrl: 'https://picsum.photos/seed/texas/100/100',
    division: 'D1',
    interestLevel: 'high',
    profileViews: 12,
    lastViewedAt: daysAgo(2),
    contacted: true,
    responded: true,
  },
  {
    collegeId: 'c2',
    collegeName: 'Oklahoma State',
    logoUrl: 'https://picsum.photos/seed/osu/100/100',
    division: 'D1',
    interestLevel: 'high',
    profileViews: 8,
    lastViewedAt: daysAgo(5),
    contacted: true,
    responded: false,
  },
  {
    collegeId: 'c3',
    collegeName: 'TCU',
    logoUrl: 'https://picsum.photos/seed/tcu/100/100',
    division: 'D1',
    interestLevel: 'medium',
    profileViews: 5,
    lastViewedAt: daysAgo(10),
    contacted: false,
    responded: false,
  },
  {
    collegeId: 'c4',
    collegeName: 'Texas Tech',
    logoUrl: 'https://picsum.photos/seed/ttu/100/100',
    division: 'D1',
    interestLevel: 'medium',
    profileViews: 4,
    lastViewedAt: daysAgo(14),
    contacted: true,
    responded: false,
  },
  {
    collegeId: 'c5',
    collegeName: 'Baylor',
    logoUrl: 'https://picsum.photos/seed/baylor/100/100',
    division: 'D1',
    interestLevel: 'low',
    profileViews: 2,
    contacted: false,
    responded: false,
  },
];

export const MOCK_RECRUITING_MILESTONES: RecruitingMilestone[] = [
  {
    type: 'profile-created',
    label: 'Profile Created',
    achieved: true,
    achievedAt: daysAgo(180),
  },
  {
    type: 'first-view',
    label: 'First Profile View',
    achieved: true,
    achievedAt: daysAgo(175),
  },
  {
    type: 'coach-view',
    label: 'First College Coach View',
    achieved: true,
    achievedAt: daysAgo(90),
  },
  {
    type: 'camp',
    label: 'Camp Attendance',
    achieved: true,
    achievedAt: daysAgo(60),
    metadata: { collegeName: 'University of Texas' },
  },
  {
    type: 'visit',
    label: 'Official Visit',
    achieved: true,
    achievedAt: daysAgo(30),
    metadata: { collegeName: 'Oklahoma State' },
  },
  {
    type: 'first-offer',
    label: 'First Offer Received',
    achieved: true,
    achievedAt: daysAgo(14),
    metadata: { collegeName: 'TCU', division: 'D1' },
  },
  {
    type: 'commitment',
    label: 'Commitment',
    achieved: false,
  },
];

// ============================================
// ROSTER DATA (COACH)
// ============================================

export const MOCK_ROSTER_ANALYTICS: AthleteRosterAnalytics[] = [
  {
    athleteId: 'a1',
    name: 'Marcus Johnson',
    profileImg: 'https://i.pravatar.cc/150?img=11',
    sport: 'Football',
    position: 'QB',
    classOf: 2026,
    profileViews: 4523,
    videoViews: 12456,
    totalEngagement: 16979,
    engagementShare: 24.5,
    trend: createTrend(16979, 32.1),
    lastActivity: daysAgo(1),
    profileCompleteness: 95,
    contentCount: 12,
  },
  {
    athleteId: 'a2',
    name: 'Jaylen Williams',
    profileImg: 'https://i.pravatar.cc/150?img=12',
    sport: 'Football',
    position: 'WR',
    classOf: 2026,
    profileViews: 3891,
    videoViews: 9823,
    totalEngagement: 13714,
    engagementShare: 19.8,
    trend: createTrend(13714, 18.5),
    lastActivity: daysAgo(2),
    profileCompleteness: 88,
    contentCount: 8,
  },
  {
    athleteId: 'a3',
    name: 'Chris Martinez',
    profileImg: 'https://i.pravatar.cc/150?img=13',
    sport: 'Football',
    position: 'RB',
    classOf: 2027,
    profileViews: 2456,
    videoViews: 6789,
    totalEngagement: 9245,
    engagementShare: 13.4,
    trend: createTrend(9245, 45.2),
    lastActivity: daysAgo(1),
    profileCompleteness: 92,
    contentCount: 6,
  },
  {
    athleteId: 'a4',
    name: 'David Thompson',
    profileImg: 'https://i.pravatar.cc/150?img=14',
    sport: 'Football',
    position: 'LB',
    classOf: 2026,
    profileViews: 2123,
    videoViews: 5432,
    totalEngagement: 7555,
    engagementShare: 10.9,
    trend: createTrend(7555, 8.3),
    lastActivity: daysAgo(3),
    profileCompleteness: 78,
    contentCount: 5,
  },
  {
    athleteId: 'a5',
    name: 'Tyler Brown',
    profileImg: 'https://i.pravatar.cc/150?img=15',
    sport: 'Football',
    position: 'OL',
    classOf: 2027,
    profileViews: 1567,
    videoViews: 3421,
    totalEngagement: 4988,
    engagementShare: 7.2,
    trend: createTrend(4988, -5.2),
    lastActivity: daysAgo(7),
    profileCompleteness: 65,
    contentCount: 3,
  },
];

export const MOCK_TEAM_OVERVIEW: TeamOverviewAnalytics = {
  totalProfileViews: 45892,
  totalVideoViews: 123456,
  totalEngagement: 169348,
  activeAthletes: 18,
  totalAthletes: 24,
  avgEngagementPerAthlete: 7056,
  teamPageViews: 3241,
  trend: createTrend(169348, 18.3),
};

export const MOCK_TOP_PERFORMER: TopPerformer = {
  athlete: MOCK_ROSTER_ANALYTICS[0],
  highlights: [
    '32% increase in views this week',
    '142 college coach views',
    '3 new scholarship offers',
  ],
  vsTeamAverage: 2.4,
};

// ============================================
// INSIGHTS & RECOMMENDATIONS
// ============================================

export const MOCK_ATHLETE_INSIGHTS: AnalyticsInsight[] = [
  {
    id: 'i1',
    title: 'Coach engagement is up 34%',
    description:
      'College coaches are viewing your profile more frequently this week. Keep uploading fresh highlights!',
    category: 'engagement',
    priority: 'high',
    icon: 'school-outline',
    metricValue: '+34%',
  },
  {
    id: 'i2',
    title: 'Wednesday is your peak day',
    description:
      'You get the most profile views on Wednesdays. Consider posting new content mid-week.',
    category: 'trend',
    priority: 'medium',
    icon: 'analytics-outline',
    metricValue: 'Wednesday',
  },
  {
    id: 'i3',
    title: 'Texas coaches showing interest',
    description: '5 coaches from Texas schools have viewed your profile in the last 7 days.',
    category: 'recruiting',
    priority: 'high',
    icon: 'location-outline',
    metricValue: '5 coaches',
  },
];

export const MOCK_ATHLETE_RECOMMENDATIONS: AnalyticsRecommendation[] = [
  {
    id: 'r1',
    title: 'Add your 40-yard dash time',
    description: 'Profiles with verified athletic stats get 45% more coach views.',
    impact: '+45% coach engagement',
    priority: 'high',
    category: 'optimization',
    actionLabel: 'Add Stats',
    actionRoute: '/edit-profile/athletic-info',
  },
  {
    id: 'r2',
    title: 'Follow up with Oklahoma State',
    description: "They've viewed your profile 8 times but haven't responded to your email.",
    impact: 'Increase response rate',
    priority: 'high',
    category: 'recruiting',
    actionLabel: 'Send Follow-up',
    actionRoute: '/email/compose',
  },
  {
    id: 'r3',
    title: 'Upload a new highlight',
    description: "You haven't added content in 14 days. Fresh highlights boost visibility.",
    impact: '+25% profile views',
    priority: 'medium',
    category: 'content',
    actionLabel: 'Upload Video',
    actionRoute: '/create/highlight',
  },
];

export const MOCK_COACH_INSIGHTS: AnalyticsInsight[] = [
  {
    id: 'ci1',
    title: 'Marcus Johnson trending',
    description: 'Your QB has seen a 32% increase in engagement this week with strong D1 interest.',
    category: 'engagement',
    priority: 'high',
    icon: 'trending-up-outline',
    metricValue: '+32%',
  },
  {
    id: 'ci2',
    title: '6 athletes need profile updates',
    description: 'Some athletes have incomplete profiles which may be limiting their exposure.',
    category: 'optimization',
    priority: 'medium',
    icon: 'alert-circle-outline',
    metricValue: '6 athletes',
  },
  {
    id: 'ci3',
    title: 'Team page views up 12%',
    description: 'More coaches are finding your team through search and social shares.',
    category: 'engagement',
    priority: 'medium',
    icon: 'business-outline',
    metricValue: '+12%',
  },
];

export const MOCK_COACH_RECOMMENDATIONS: AnalyticsRecommendation[] = [
  {
    id: 'cr1',
    title: 'Remind athletes to update profiles',
    description: '6 athletes have profiles below 80% completion. Send a team reminder.',
    impact: 'Improve team visibility',
    priority: 'high',
    category: 'optimization',
    actionLabel: 'Send Reminder',
  },
  {
    id: 'cr2',
    title: 'Share team page on social',
    description: 'Teams that share weekly see 35% more exposure for their athletes.',
    impact: '+35% exposure',
    priority: 'medium',
    category: 'content',
    actionLabel: 'Share Team Page',
  },
];

// ============================================
// COMPLETE REPORT GENERATORS
// ============================================

/**
 * Generate mock athlete analytics report.
 */
export function getMockAthleteReport(): AthleteAnalyticsReport {
  return {
    role: 'athlete',
    generatedAt: new Date().toISOString(),
    period: 'week',
    dateRange: {
      start: daysAgo(7),
      end: new Date().toISOString(),
      label: 'Last 7 Days',
    },
    overview: MOCK_ATHLETE_OVERVIEW_CARDS as any,
    engagement: {
      viewsBySource: MOCK_VIEWS_BY_SOURCE,
      viewsByTime: MOCK_ENGAGEMENT_BY_TIME,
      viewerTypes: MOCK_VIEWER_TYPES,
      geoDistribution: MOCK_GEO_DISTRIBUTION,
      viewsOverTime: MOCK_VIEWS_CHART,
    },
    content: {
      videos: MOCK_VIDEO_ANALYTICS,
      posts: MOCK_POST_ANALYTICS,
      graphics: [],
      topContent: [
        MOCK_ATHLETE_OVERVIEW_CARDS['videoViews'],
        MOCK_ATHLETE_OVERVIEW_CARDS['profileViews'],
      ],
    },
    recruiting: {
      collegeInterests: MOCK_COLLEGE_INTERESTS,
      emailCampaigns: [],
      milestones: MOCK_RECRUITING_MILESTONES,
      offersReceived: 3,
      campAttendance: 2,
      collegeVisits: 4,
    },
    insights: MOCK_ATHLETE_INSIGHTS,
    recommendations: MOCK_ATHLETE_RECOMMENDATIONS,
  };
}

/**
 * Generate mock coach analytics report.
 */
export function getMockCoachReport(): CoachAnalyticsReport {
  return {
    role: 'coach',
    generatedAt: new Date().toISOString(),
    period: 'week',
    dateRange: {
      start: daysAgo(7),
      end: new Date().toISOString(),
      label: 'Last 7 Days',
    },
    overview: MOCK_TEAM_OVERVIEW,
    overviewCards: MOCK_COACH_OVERVIEW_CARDS as any,
    topPerformer: MOCK_TOP_PERFORMER,
    roster: MOCK_ROSTER_ANALYTICS,
    patterns: {
      viewsByTime: MOCK_ENGAGEMENT_BY_HOUR,
      viewsByDay: MOCK_ENGAGEMENT_BY_TIME,
      viewsOverTime: {
        ...MOCK_VIEWS_CHART,
        title: 'Team Views Over Time',
        datasets: [
          {
            ...MOCK_VIEWS_CHART.datasets[0],
            data: MOCK_VIEWS_CHART.datasets[0].data.map((d) => ({
              ...d,
              value: d.value * 15, // Scale up for team
            })),
          },
        ],
      },
    },
    insights: MOCK_COACH_INSIGHTS,
    recommendations: MOCK_COACH_RECOMMENDATIONS,
  };
}
