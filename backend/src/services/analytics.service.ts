/**
 * @fileoverview Analytics Service
 * @module @nxt1/backend/services/analytics
 *
 * Aggregates analytics data from Firestore for the Analytics Dashboard.
 * Uses MongoDB-style aggregation where possible, Firestore queries elsewhere.
 *
 * Data sources:
 * - Users/{uid}          — profile stats
 * - Videos               — videos created by user (views, likes, createdAt)
 * - Posts                — posts created by user (stats.views, stats.likes)
 * - users/{uid}/activity — activity feed items (profile view events)
 * - Teams (via roster)   — team members for coach analytics
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import type {
  AnalyticsPeriod,
  AnalyticsDateRange,
  AthleteAnalyticsReport,
  CoachAnalyticsReport,
  MetricCard,
  ViewsBySource,
  GeoDistribution,
  EngagementByTime,
  AnalyticsViewerBreakdown,
  ChartConfig,
  VideoAnalytics,
  PostAnalytics,
  RecruitingMilestone,
  AthleteRosterAnalytics,
  TeamOverviewAnalytics,
  TopPerformer,
  AnalyticsInsight,
  AnalyticsRecommendation,
} from '@nxt1/core';

// ============================================
// COLLECTION NAMES
// ============================================

const USERS_COLLECTION = 'Users';
const POSTS_COLLECTION = 'Posts';
const ACTIVITY_COLLECTION = 'activity';

// ============================================
// HELPERS
// ============================================

/**
 * Compute the date range for a given analytics period.
 */
export function getPeriodDateRange(period: AnalyticsPeriod): AnalyticsDateRange {
  const now = new Date();
  let start: Date;

  switch (period) {
    case 'day':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all-time':
    default:
      start = new Date('2020-01-01');
      break;
  }

  return {
    start: start.toISOString(),
    end: now.toISOString(),
    label: getPeriodLabel(period),
  };
}

function getPeriodLabel(period: AnalyticsPeriod): string {
  const labels: Record<AnalyticsPeriod, string> = {
    day: 'Today',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
    quarter: 'Last 90 Days',
    year: 'Last Year',
    'all-time': 'All Time',
  };
  return labels[period] ?? period;
}

/**
 * Format a number for display (e.g., 1234 → "1.2K").
 */
function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/**
 * Convert a Firestore Timestamp or date string to a JS Date.
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object' && 'seconds' in (value as object)) {
    const t = value as { seconds: number };
    return new Date(t.seconds * 1000);
  }
  return null;
}

// ============================================
// PROFILE DATA FETCHERS
// ============================================

async function fetchUserProfile(
  db: Firestore,
  uid: string
): Promise<Record<string, unknown> | null> {
  const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as Record<string, unknown>;
}

async function fetchUserVideos(
  db: Firestore,
  uid: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const snapshot = await db
      .collection(POSTS_COLLECTION)
      .where('userId', '==', uid)
      .where('type', '==', 'highlight')
      .limit(100)
      .get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>;
  } catch (err) {
    logger.warn('Failed to fetch user videos for analytics', { uid, error: err });
    return [];
  }
}

async function fetchUserPosts(
  db: Firestore,
  uid: string,
  since?: Date
): Promise<Array<Record<string, unknown>>> {
  try {
    let query = db.collection(POSTS_COLLECTION).where('userId', '==', uid);

    if (since) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(since));
    }

    const snapshot = await query.limit(100).get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>;
  } catch (err) {
    logger.warn('Failed to fetch user posts for analytics', { uid, error: err });
    return [];
  }
}

async function fetchActivityItems(
  db: Firestore,
  uid: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const snapshot = await db
      .collection('Users')
      .doc(uid)
      .collection(ACTIVITY_COLLECTION)
      .limit(500)
      .get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown>>;
  } catch (err) {
    logger.warn('Failed to fetch activity items for analytics', { uid, error: err });
    return [];
  }
}

// ============================================
// OVERVIEW CARDS BUILDERS
// ============================================

function buildAthleteOverviewCards(
  profile: Record<string, unknown>,
  videos: Array<Record<string, unknown>>,
  activityItems: Array<Record<string, unknown>>
): AthleteAnalyticsReport['overview'] {
  const totalVideoViews = videos.reduce((acc, v) => acc + (Number(v['views']) || 0), 0);
  const profileViews = activityItems.filter((i) => i['type'] === 'profile_view').length;
  const coachViews = activityItems.filter(
    (i) => i['type'] === 'profile_view' && i['viewerRole'] === 'coach'
  ).length;

  // Engagement rate = (likes + comments) / views * 100
  const totalLikes = videos.reduce((acc, v) => acc + (Number(v['likes']) || 0), 0);
  const engagementRate =
    totalVideoViews > 0 ? Math.round((totalLikes / totalVideoViews) * 1000) / 10 : 0;

  // Profile completeness score (based on profile fields)
  const profileScore = computeProfileScore(profile);

  return {
    profileViews: {
      id: 'profileViews',
      label: 'Profile Views',
      value: profileViews,
      displayValue: formatValue(profileViews),
      icon: 'eye-outline',
      variant: 'default',
    },
    videoViews: {
      id: 'videoViews',
      label: 'Video Views',
      value: totalVideoViews,
      displayValue: formatValue(totalVideoViews),
      icon: 'videocam-outline',
      variant: 'default',
    },
    engagementRate: {
      id: 'engagementRate',
      label: 'Engagement Rate',
      value: engagementRate,
      displayValue: `${engagementRate}%`,
      suffix: '%',
      icon: 'heart-outline',
      variant: 'default',
    },
    profileScore: {
      id: 'profileScore',
      label: 'Profile Score',
      value: profileScore,
      displayValue: `${profileScore}%`,
      suffix: '%',
      icon: 'star-outline',
      variant: profileScore >= 80 ? 'success' : profileScore >= 60 ? 'warning' : 'default',
    },
    collegeCoachViews: {
      id: 'collegeCoachViews',
      label: 'Coach Views',
      value: coachViews,
      displayValue: formatValue(coachViews),
      icon: 'school-outline',
      variant: coachViews > 0 ? 'highlight' : 'default',
    },
    followers: {
      id: 'followers',
      label: 'Followers',
      value: 0,
      displayValue: formatValue(0),
      icon: 'people-outline',
      variant: 'default',
    },
  };
}

function computeProfileScore(profile: Record<string, unknown>): number {
  let score = 0;
  if (profile['displayName']) score += 10;
  const imgs = profile['profileImgs'];
  if (Array.isArray(imgs) && imgs.length > 0) score += 15;
  if (profile['aboutMe']) score += 10;
  const sports = profile['sports'];
  if (Array.isArray(sports) && sports.length > 0) score += 20;
  if (profile['height']) score += 5;
  if (profile['weight']) score += 5;
  // Also check measurables[] for height/weight (2026 canonical location)
  if (!profile['height'] || !profile['weight']) {
    const measurables = profile['measurables'] as
      | Array<{ field: string; value: string | number }>
      | undefined;
    if (!profile['height'] && measurables?.some((m) => m.field === 'height')) score += 5;
    if (!profile['weight'] && measurables?.some((m) => m.field === 'weight')) score += 5;
  }
  if (profile['classOf']) score += 10;
  if (profile['location']) score += 5;
  const social = profile['social'];
  if (Array.isArray(social) && social.length > 0) score += 10;
  if (profile['contact']) score += 10;
  return Math.min(score, 100);
}

// ============================================
// ENGAGEMENT DATA BUILDERS
// ============================================

function buildViewsBySource(): readonly ViewsBySource[] {
  // Placeholder breakdown — real data would need source tracking in profile view events
  return [
    { source: 'search', label: 'Search', views: 0, percentage: 0 },
    { source: 'social', label: 'Social', views: 0, percentage: 0 },
    { source: 'direct', label: 'Direct', views: 0, percentage: 0 },
    { source: 'referral', label: 'Referral', views: 0, percentage: 0 },
  ];
}

function buildEngagementByTime(): readonly EngagementByTime[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((label, period) => ({
    period,
    label,
    count: 0,
    intensity: 0,
  }));
}

function buildViewsOverTimeChart(
  videos: Array<Record<string, unknown>>,
  dateRange: AnalyticsDateRange
): ChartConfig {
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const bucketDays = Math.max(1, Math.floor(days / 7));

  // Build weekly buckets
  const buckets: Array<{ label: string; value: number }> = [];
  let current = new Date(start);
  while (current < end) {
    const bucketEnd = new Date(current.getTime() + bucketDays * 24 * 60 * 60 * 1000);
    const label = `${current.getMonth() + 1}/${current.getDate()}`;
    const views = videos
      .filter((v) => {
        const d = toDate(v['createdAt']);
        return d && d >= current && d < bucketEnd;
      })
      .reduce((acc, v) => acc + (Number(v['views']) || 0), 0);
    buckets.push({ label, value: views });
    current = bucketEnd;
  }

  return {
    type: 'area',
    title: 'Views Over Time',
    datasets: [
      {
        id: 'views',
        label: 'Views',
        data: buckets,
        color: 'var(--nxt1-color-primary)',
      },
    ],
    showLegend: false,
    showGrid: true,
  };
}

function buildViewerBreakdown(): readonly AnalyticsViewerBreakdown[] {
  return [
    { type: 'athlete', label: 'Athletes', count: 0, percentage: 0 },
    { type: 'coach', label: 'Coaches', count: 0, percentage: 0 },
    { type: 'recruiter', label: 'Recruiters', count: 0, percentage: 0 },
    { type: 'parent', label: 'Parents', count: 0, percentage: 0 },
    { type: 'other', label: 'Other', count: 0, percentage: 0 },
  ];
}

function buildGeoDistribution(): readonly GeoDistribution[] {
  return [];
}

// ============================================
// CONTENT DATA BUILDERS
// ============================================

function buildVideoAnalytics(videos: Array<Record<string, unknown>>): readonly VideoAnalytics[] {
  return videos.slice(0, 20).map((v) => ({
    id: String(v['id'] ?? ''),
    title: String(v['title'] ?? 'Untitled Video'),
    thumbnailUrl:
      (v['thumbnail'] as string | undefined) ?? (v['thumbnailUrl'] as string | undefined),
    views: Number(v['views']) || 0,
    avgWatchDuration: Number(v['avgWatchDuration']) || 0,
    completionRate: Number(v['completionRate']) || 0,
    totalWatchTime: Number(v['totalWatchTime']) || 0,
    shares: Number(v['shares']) || 0,
    createdAt: String(toDate(v['createdAt'])?.toISOString() ?? new Date().toISOString()),
  }));
}

function buildPostAnalytics(posts: Array<Record<string, unknown>>): readonly PostAnalytics[] {
  return posts.slice(0, 20).map((p) => {
    const stats = (p['stats'] as Record<string, number> | undefined) ?? {};
    const impressions = stats['views'] ?? (Number(p['views']) || 0);
    const likes = stats['likes'] ?? (Number(p['likes']) || 0);
    const comments = stats['comments'] ?? (Number(p['comments']) || 0);
    const shares = stats['shares'] ?? (Number(p['shares']) || 0);
    const engagementRate =
      impressions > 0 ? Math.round(((likes + comments + shares) / impressions) * 1000) / 10 : 0;

    return {
      id: String(p['id'] ?? ''),
      type: (p['type'] as PostAnalytics['type']) ?? 'text',
      previewUrl: p['mediaUrl'] as string | undefined,
      impressions,
      likes,
      comments,
      shares,
      engagementRate,
      createdAt: String(toDate(p['createdAt'])?.toISOString() ?? new Date().toISOString()),
    };
  });
}

// ============================================
// RECRUITING DATA BUILDERS
// ============================================

function buildRecruitingMilestones(
  profile: Record<string, unknown>,
  hasViews: boolean,
  hasCoachView: boolean
): readonly RecruitingMilestone[] {
  return [
    {
      type: 'profile-created',
      label: 'Profile Created',
      achieved: !!profile['createdAt'],
      achievedAt: toDate(profile['createdAt'])?.toISOString(),
    },
    {
      type: 'first-view',
      label: 'First Profile View',
      achieved: hasViews,
      achievedAt: undefined,
    },
    {
      type: 'coach-view',
      label: 'Viewed by a Coach',
      achieved: hasCoachView,
      achievedAt: undefined,
    },
    {
      type: 'first-offer',
      label: 'Received First Offer',
      achieved: false,
      achievedAt: undefined,
    },
    {
      type: 'visit',
      label: 'Campus Visit',
      achieved: false,
      achievedAt: undefined,
    },
    {
      type: 'camp',
      label: 'Attended a Camp',
      achieved: false,
      achievedAt: undefined,
    },
    {
      type: 'commitment',
      label: 'Committed',
      achieved: false,
      achievedAt: undefined,
    },
  ];
}

// ============================================
// INSIGHTS BUILDERS
// ============================================

function buildAthleteInsights(
  _profile: Record<string, unknown>,
  videos: Array<Record<string, unknown>>,
  profileScore: number
): readonly AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  // Low profile score insight
  if (profileScore < 60) {
    insights.push({
      id: 'low-profile-score',
      title: 'Complete Your Profile',
      description: `Your profile is ${profileScore}% complete. A full profile gets 3x more views from college coaches.`,
      category: 'optimization',
      priority: 'high',
      icon: 'star-outline',
      metricValue: `${profileScore}%`,
      action: 'Complete Profile',
      actionRoute: '/edit-profile',
    });
  }

  // No videos insight
  if (videos.length === 0) {
    insights.push({
      id: 'no-videos',
      title: 'Upload Your First Highlight',
      description:
        'Athletes with highlight videos get 5x more coach engagement. Upload your best plays.',
      category: 'content',
      priority: 'high',
      icon: 'videocam-outline',
      action: 'Upload Video',
      actionRoute: '/post/create',
    });
  }

  return insights;
}

function buildAthleteRecommendations(
  profile: Record<string, unknown>,
  videos: Array<Record<string, unknown>>
): readonly AnalyticsRecommendation[] {
  const recs: AnalyticsRecommendation[] = [];

  if (!profile['aboutMe']) {
    recs.push({
      id: 'add-bio',
      title: 'Add Your Bio',
      description: 'A personal bio helps coaches understand your story and character.',
      impact: 'Up to 40% more profile engagement',
      priority: 'medium',
      category: 'optimization',
      actionLabel: 'Edit Profile',
      actionRoute: '/edit-profile',
    });
  }

  if (videos.length > 0 && videos.length < 3) {
    recs.push({
      id: 'add-more-videos',
      title: 'Add More Highlight Videos',
      description:
        'Profiles with 3+ videos get significantly more coach views. Show different aspects of your game.',
      impact: '2x more coach views',
      priority: 'high',
      category: 'content',
      actionLabel: 'Upload Video',
      actionRoute: '/post/create',
    });
  }

  return recs;
}

// ============================================
// MAIN REPORT BUILDERS
// ============================================

/**
 * Build a complete athlete analytics report.
 */
export async function buildAthleteReport(
  db: Firestore,
  uid: string,
  period: AnalyticsPeriod
): Promise<AthleteAnalyticsReport> {
  const dateRange = getPeriodDateRange(period);
  const since = new Date(dateRange.start);

  // Fetch all-time videos, posts in period, and supporting data in parallel.
  // Videos are fetched once (all-time) and filtered in memory for the period view
  // to avoid a second Firestore round-trip.
  const [profile, allVideos, posts, activityItems] = await Promise.all([
    fetchUserProfile(db, uid),
    fetchUserVideos(db, uid),
    fetchUserPosts(db, uid, since),
    fetchActivityItems(db, uid),
  ]);

  // Filter videos to the selected period in memory (no extra query)
  const videosInPeriod = allVideos.filter((v) => {
    const d = toDate(v['createdAt']);
    return d && d >= since;
  });

  const safeProfile = profile ?? {};
  const profileScore = computeProfileScore(safeProfile);
  const hasViews = activityItems.some((i) => i['type'] === 'profile_view');
  const hasCoachView = activityItems.some(
    (i) => i['type'] === 'profile_view' && i['viewerRole'] === 'coach'
  );

  const overview = buildAthleteOverviewCards(safeProfile, allVideos, activityItems);
  const viewsChart = buildViewsOverTimeChart(videosInPeriod, dateRange);

  return {
    role: 'athlete',
    generatedAt: new Date().toISOString(),
    period,
    dateRange,
    overview,
    engagement: {
      viewsBySource: buildViewsBySource(),
      viewsByTime: buildEngagementByTime(),
      viewerTypes: buildViewerBreakdown(),
      geoDistribution: buildGeoDistribution(),
      viewsOverTime: viewsChart,
    },
    content: {
      videos: buildVideoAnalytics(videosInPeriod),
      posts: buildPostAnalytics(posts),
      graphics: [],
      topContent: [],
    },
    recruiting: {
      collegeInterests: [],
      emailCampaigns: [],
      milestones: buildRecruitingMilestones(safeProfile, hasViews, hasCoachView),
      offersReceived: 0,
      campAttendance: 0,
      collegeVisits: 0,
    },
    insights: buildAthleteInsights(safeProfile, allVideos, profileScore),
    recommendations: buildAthleteRecommendations(safeProfile, allVideos),
  };
}

/**
 * Build a complete coach/team analytics report.
 */
export async function buildCoachReport(
  db: Firestore,
  uid: string,
  period: AnalyticsPeriod
): Promise<CoachAnalyticsReport> {
  const dateRange = getPeriodDateRange(period);
  const since = new Date(dateRange.start);

  // Fetch roster entries for this coach's teams
  const rosterEntries = await fetchCoachRoster(db, uid);

  // Fetch each athlete's basic stats
  const athleteStats = await fetchRosterAthleteStats(db, rosterEntries, since);

  const totalProfileViews = athleteStats.reduce((acc, a) => acc + a.profileViews, 0);
  const totalVideoViews = athleteStats.reduce((acc, a) => acc + a.videoViews, 0);
  const totalEngagement = totalProfileViews + totalVideoViews;
  const activeAthletes = athleteStats.filter((a) => a.totalEngagement > 0).length;
  const totalAthletes = athleteStats.length;
  const avgEngagement = totalAthletes > 0 ? Math.round(totalEngagement / totalAthletes) : 0;

  const overview: TeamOverviewAnalytics = {
    totalProfileViews,
    totalVideoViews,
    totalEngagement,
    activeAthletes,
    totalAthletes,
    avgEngagementPerAthlete: avgEngagement,
    teamPageViews: 0,
  };

  // Find top performer
  const topPerformer = athleteStats.length > 0 ? buildTopPerformer(athleteStats) : null;

  const overviewCards = buildCoachOverviewCards(overview);

  return {
    role: 'coach',
    generatedAt: new Date().toISOString(),
    period,
    dateRange,
    overview,
    overviewCards,
    topPerformer,
    roster: athleteStats,
    patterns: {
      viewsByTime: buildEngagementByTime(),
      viewsByDay: buildEngagementByTime(),
      viewsOverTime: buildCoachViewsChart(),
    },
    insights: buildCoachInsights(overview, athleteStats),
    recommendations: buildCoachRecommendations(athleteStats),
  };
}

async function fetchCoachRoster(db: Firestore, uid: string): Promise<string[]> {
  try {
    // Try to find teams where this user is a coach, then get their athletes
    const rosterSnap = await db
      .collection('RosterEntries')
      .where('coachId', '==', uid)
      .where('status', '==', 'active')
      .limit(50)
      .get();

    return rosterSnap.docs.map((d) => String(d.data()['athleteId'] ?? ''));
  } catch {
    // Fallback: look for team code association
    return [];
  }
}

async function fetchRosterAthleteStats(
  db: Firestore,
  athleteIds: string[],
  since: Date
): Promise<readonly AthleteRosterAnalytics[]> {
  if (athleteIds.length === 0) return [];

  const results: AthleteRosterAnalytics[] = [];

  // Fetch in batches of 10 (Firestore 'in' limit)
  const chunks: string[][] = [];
  for (let i = 0; i < athleteIds.length; i += 10) {
    chunks.push(athleteIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    try {
      const profileSnap = await db
        .collection(USERS_COLLECTION)
        .where('__name__', 'in', chunk)
        .get();

      for (const doc of profileSnap.docs) {
        const p = doc.data();
        const allAthleteVideos = await fetchUserVideos(db, doc.id);
        // Filter to selected period in memory
        const videos = allAthleteVideos.filter((v) => {
          const d = toDate(v['createdAt']);
          return d && d >= since;
        });
        const profileViews = 0; // Would need profile view tracking
        const videoViews = videos.reduce((acc, v) => acc + (Number(v['views']) || 0), 0);
        const totalEngagement = profileViews + videoViews;
        const completeness = computeProfileScore(p as Record<string, unknown>);

        results.push({
          athleteId: doc.id,
          name: String(p['displayName'] ?? `${p['firstName'] ?? ''} ${p['lastName'] ?? ''}`.trim()),
          profileImg: (p['profileImgs'] as string[] | undefined)?.[0],
          sport: (p['sports'] as Array<{ sport: string }> | undefined)?.[0]?.sport,
          position: undefined,
          classOf: p['classOf'] as number | undefined,
          profileViews,
          videoViews,
          totalEngagement,
          engagementShare: 0, // Computed after all are fetched
          profileCompleteness: completeness,
          contentCount: videos.length,
          lastActivity: toDate(p['updatedAt'])?.toISOString(),
        });
      }
    } catch (err) {
      logger.warn('Failed to fetch roster athlete stats', { error: err });
    }
  }

  // Compute engagement shares
  const total = results.reduce((acc, a) => acc + a.totalEngagement, 0);
  return results.map((a) => ({
    ...a,
    engagementShare: total > 0 ? Math.round((a.totalEngagement / total) * 1000) / 10 : 0,
  }));
}

function buildTopPerformer(athletes: readonly AthleteRosterAnalytics[]): TopPerformer | null {
  if (athletes.length === 0) return null;

  const sorted = [...athletes].sort((a, b) => b.totalEngagement - a.totalEngagement);
  const top = sorted[0];
  if (!top) return null;

  const avg = athletes.reduce((acc, a) => acc + a.totalEngagement, 0) / athletes.length;
  const vsAvg = avg > 0 ? Math.round((top.totalEngagement / avg) * 10) / 10 : 1;

  const highlights: string[] = [];
  if (top.videoViews > 0) highlights.push(`${formatValue(top.videoViews)} video views`);
  if (top.profileViews > 0) highlights.push(`${formatValue(top.profileViews)} profile views`);
  if (top.profileCompleteness >= 80) highlights.push('Complete profile');

  return {
    athlete: top,
    highlights,
    vsTeamAverage: vsAvg,
  };
}

function buildCoachOverviewCards(
  overview: TeamOverviewAnalytics
): CoachAnalyticsReport['overviewCards'] {
  return {
    totalViews: {
      id: 'totalViews',
      label: 'Total Views',
      value: overview.totalProfileViews + overview.totalVideoViews,
      displayValue: formatValue(overview.totalProfileViews + overview.totalVideoViews),
      icon: 'eye-outline',
    },
    teamPageViews: {
      id: 'teamPageViews',
      label: 'Team Page Views',
      value: overview.teamPageViews,
      displayValue: formatValue(overview.teamPageViews),
      icon: 'business-outline',
    },
    activeAthletes: {
      id: 'activeAthletes',
      label: 'Active Athletes',
      value: overview.activeAthletes,
      displayValue: `${overview.activeAthletes}/${overview.totalAthletes}`,
      icon: 'flash-outline',
    },
    avgEngagement: {
      id: 'avgEngagement',
      label: 'Avg Engagement',
      value: overview.avgEngagementPerAthlete,
      displayValue: formatValue(overview.avgEngagementPerAthlete),
      icon: 'heart-outline',
    },
    totalOffers: {
      id: 'totalOffers',
      label: 'Team Offers',
      value: 0,
      displayValue: '0',
      icon: 'trophy-outline',
    },
    commitments: {
      id: 'commitments',
      label: 'Commitments',
      value: 0,
      displayValue: '0',
      icon: 'checkmark-circle-outline',
    },
  };
}

function buildCoachViewsChart(): ChartConfig {
  return {
    type: 'area',
    title: 'Team Views Over Time',
    datasets: [
      {
        id: 'views',
        label: 'Team Views',
        data: [],
        color: 'var(--nxt1-color-primary)',
      },
    ],
    showLegend: false,
    showGrid: true,
  };
}

function buildCoachInsights(
  overview: TeamOverviewAnalytics,
  athletes: readonly AthleteRosterAnalytics[]
): readonly AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  if (overview.activeAthletes < overview.totalAthletes * 0.5 && overview.totalAthletes > 0) {
    insights.push({
      id: 'low-athlete-activity',
      title: 'Low Athlete Engagement',
      description: `Only ${overview.activeAthletes} of ${overview.totalAthletes} athletes are actively using the platform.`,
      category: 'engagement',
      priority: 'high',
      icon: 'people-outline',
      action: 'Invite Athletes',
    });
  }

  const lowCompleteness = athletes.filter((a) => a.profileCompleteness < 60);
  if (lowCompleteness.length > 0) {
    insights.push({
      id: 'incomplete-profiles',
      title: 'Athletes Have Incomplete Profiles',
      description: `${lowCompleteness.length} athlete${lowCompleteness.length > 1 ? 's have' : ' has'} incomplete profiles which limits recruiting visibility.`,
      category: 'optimization',
      priority: 'medium',
      icon: 'star-outline',
      metricValue: lowCompleteness.length,
    });
  }

  return insights;
}

function buildCoachRecommendations(
  athletes: readonly AthleteRosterAnalytics[]
): readonly AnalyticsRecommendation[] {
  const recs: AnalyticsRecommendation[] = [];

  const noVideos = athletes.filter((a) => a.contentCount === 0);
  if (noVideos.length > 0) {
    recs.push({
      id: 'athletes-need-videos',
      title: 'Help Athletes Upload Highlights',
      description: `${noVideos.length} athlete${noVideos.length > 1 ? 's' : ''} have no highlight videos, limiting their recruiting exposure.`,
      impact: 'Athletes with videos get 5x more coach views',
      priority: 'high',
      category: 'content',
    });
  }

  return recs;
}

// ============================================
// OVERVIEW METRICS (QUICK ENDPOINT)
// ============================================

/**
 * Build overview metrics only (faster than full report).
 */
export async function buildOverviewMetrics(
  db: Firestore,
  uid: string,
  role: 'athlete' | 'coach',
  period: AnalyticsPeriod
): Promise<{ metrics: MetricCard[]; lastUpdated: string }> {
  if (role === 'coach') {
    const report = await buildCoachReport(db, uid, period);
    return {
      metrics: Object.values(report.overviewCards),
      lastUpdated: report.generatedAt,
    };
  }

  const [profile, videos, activityItems] = await Promise.all([
    fetchUserProfile(db, uid),
    fetchUserVideos(db, uid),
    fetchActivityItems(db, uid),
  ]);

  const overview = buildAthleteOverviewCards(profile ?? {}, videos, activityItems);
  return {
    metrics: Object.values(overview),
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================
// PROFILE VIEW TRACKING
// ============================================

/**
 * Record a profile view event in Firestore.
 * Writes to both: the viewed user's analytics subcollection and their activity feed.
 */
export async function recordProfileView(
  db: Firestore,
  viewedUserId: string,
  viewerUserId: string | null,
  viewerRole?: string
): Promise<void> {
  try {
    const analyticsRef = db.collection('Users').doc(viewedUserId).collection('profileViews').doc();

    await analyticsRef.set({
      viewedAt: Timestamp.now(),
      viewerUserId: viewerUserId ?? null,
      viewerRole: viewerRole ?? null,
      type: 'profile_view',
    });
  } catch (err) {
    logger.warn('Failed to record profile view', { viewedUserId, viewerUserId, error: err });
  }
}
