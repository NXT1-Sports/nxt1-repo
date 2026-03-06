/**
 * @fileoverview Team Profile Mapper Service
 * @module @nxt1/backend/services/team-profile-mapper
 *
 * Maps TeamCode (database model) to TeamProfilePageData (frontend model)
 * Handles data transformation and enrichment for team profile pages
 */

import type { TeamCode } from '@nxt1/core/models';
import { ROLE } from '@nxt1/core/models';
import type { TeamEvent } from '@nxt1/core/models';
import type {
  TeamProfilePageData,
  TeamProfileTeam,
  TeamProfileSocialLink,
  TeamProfileRosterMember,
  TeamProfileStaffMember,
  TeamProfileFollowStats,
  TeamProfileQuickStats,
  TeamProfilePost,
  TeamProfilePostType,
  TeamProfileScheduleEvent,
  TeamProfileStatsCategory,
  TeamProfileRecruitingActivity,
} from '@nxt1/core/team-profile';
import type { NewsArticle } from '@nxt1/core';
import { getUsersByIds, type UserData } from './users.service.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface MapTeamProfileOptions {
  /** Current user ID (for admin/member checks) */
  userId?: string;
  /** Whether to include full roster details */
  includeRoster?: boolean;
  /** Whether to include schedule */
  includeSchedule?: boolean;
  /** Whether to include posts */
  includePosts?: boolean;
}

type UserDataRecord = UserData & {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  name?: string;
  jerseyNumber?: string;
  classOf?: string | number;
  height?: string;
  weight?: string;
  profileImg?: string;
  profilePhoto?: string;
  unicode?: string;
  username?: string;
  isVerify?: boolean;
  role?: string;
  title?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  bio?: string;
  sports?: Array<{
    positions?: string[];
  }>;
};

function toTeamProfileType(teamType: TeamCode['teamType']): TeamProfileTeam['teamType'] {
  return teamType;
}

// ============================================
// USER FETCHING
// ============================================

/**
 * Fetch multiple users by IDs (via users.service with Redis caching)
 * Returns UserData[] with all profile data (profileImg, height, weight, etc.)
 */
async function fetchUsersByIds(
  userIds: string[],
  firestore?: FirebaseFirestore.Firestore
): Promise<UserData[]> {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  logger.debug('[team-profile-mapper] Fetching users via service', {
    count: userIds.length,
  });

  try {
    // Fetch via users.service (with Redis caching)
    const users = await getUsersByIds(userIds, firestore);

    logger.info('[team-profile-mapper] Users fetched', {
      requested: userIds.length,
      found: users.length,
    });

    return users;
  } catch (error) {
    logger.error('[team-profile-mapper] Failed to fetch users:', { error });
    return [];
  }
}

// ============================================
// MAPPER FUNCTIONS
// ============================================

/**
 * Parse slug to extract unicode
 * Format: "TeamName_with_underscores-sportName-unicode"
 * Example: "Đội_Bóng_Rồng_Lửa_Hà_Nội-Basketball_mens-866839"
 */
export function parseSlugToUnicode(slug: string): string | null {
  if (!slug) return null;

  // Slug format: TeamName-SportName-Unicode
  // Unicode is the last segment after the last hyphen
  const parts = slug.split('-');
  if (parts.length < 3) return null;

  const unicode = parts[parts.length - 1];

  // Validate unicode (6 digits)
  if (!/^\d{6}$/.test(unicode)) {
    return null;
  }

  return unicode;
}

/**
 * Map TeamCode to TeamProfileTeam
 */
function mapTeamCodeToTeam(teamCode: TeamCode): TeamProfileTeam {
  const location =
    teamCode.city && teamCode.state
      ? `${teamCode.city}, ${teamCode.state}`
      : teamCode.city || teamCode.state || '';

  return {
    id: teamCode.id || '',
    slug: buildTeamSlug(teamCode),
    unicode: teamCode.unicode || '',
    teamName: teamCode.teamName,
    teamType: toTeamProfileType(teamCode.teamType),
    sport: teamCode.sportName || '',
    city: teamCode.city,
    state: teamCode.state,
    location,
    logoUrl: teamCode.teamLogoImg,
    galleryImages: [], // TODO: Add gallery support
    description: teamCode.description,
    branding: {
      primaryColor: teamCode.teamColor1,
      secondaryColor: teamCode.teamColor2,
      mascot: teamCode.mascot,
    },
    record: teamCode.seasonRecord
      ? {
          wins: teamCode.seasonRecord.wins || 0,
          losses: teamCode.seasonRecord.losses || 0,
          ties: teamCode.seasonRecord.ties || 0,
          formatted: formatRecord(teamCode.seasonRecord),
        }
      : undefined,
    division: teamCode.division,
    conference: teamCode.conference,
    seasonHistory: teamCode.seasonHistory,
    social: teamCode.socialLinks
      ? Object.entries(teamCode.socialLinks).map(
          ([platform, url]) =>
            ({
              platform,
              url: url || '',
              username: extractHandle(url || ''),
            }) satisfies TeamProfileSocialLink
        )
      : [],
    contact: teamCode.contactInfo
      ? {
          email: teamCode.contactInfo.email,
          phone: teamCode.contactInfo.phone || undefined,
        }
      : undefined,
    links: teamCode.teamLinks,
    sponsors: teamCode.sponsor
      ? [
          {
            name: teamCode.sponsor.name || '',
            logoUrl: teamCode.sponsor.logoImg,
            tier: 'partner' as const,
          },
        ]
      : [],
    verificationStatus: 'unverified', // TODO: Add verification logic
    isActive: teamCode.isActive ?? true,
    createdAt: teamCode.createAt
      ? typeof teamCode.createAt === 'string'
        ? teamCode.createAt
        : teamCode.createAt.toISOString()
      : new Date().toISOString(),
    updatedAt: teamCode.lastUpdatedStat
      ? typeof teamCode.lastUpdatedStat === 'string'
        ? teamCode.lastUpdatedStat
        : new Date(teamCode.lastUpdatedStat).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Map User to TeamProfileRosterMember
 */
function mapUserToRoster(user: UserData, index: number): TeamProfileRosterMember {
  // Get primary sport data (user.sports is array of SportProfile)
  const userData = user as UserDataRecord;
  const primarySport =
    Array.isArray(userData.sports) && userData.sports.length > 0 ? userData.sports[0] : null;

  // SportProfile has: sportName, positions[], level, achievements, etc.
  // Get first position from positions[] array
  const position =
    Array.isArray(primarySport?.positions) && primarySport.positions.length > 0
      ? primarySport.positions[0]
      : undefined;

  return {
    id: user.id || '',
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    displayName:
      userData.displayName || userData.name || `${userData.firstName} ${userData.lastName}`,
    role: 'athlete',
    position,
    jerseyNumber: userData.jerseyNumber || (index + 1).toString(),
    classYear: userData.classOf?.toString(),
    height: userData.height,
    weight: userData.weight,
    profileImg: userData.profileImg || userData.profilePhoto || undefined,
    profileCode: userData.unicode || userData.username || user.id || '', // Profile link uses unicode > username > uid
    isVerified: userData.isVerify || false,
    views: undefined, // TODO: Add analytics
  };
}

/**
 * Map User to TeamProfileStaffMember
 */
function mapUserToStaff(user: UserData): TeamProfileStaffMember {
  const userData = user as UserDataRecord;

  // Determine staff role from role string
  let staffRole: TeamProfileStaffMember['role'] = 'other';
  const userRole = (userData.role || '').toLowerCase();

  if (userRole.includes('coach')) {
    staffRole = 'head-coach';
  } else if (userRole.includes('admin') || userRole.includes('director')) {
    staffRole = 'director';
  }

  return {
    id: user.id || '',
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    title:
      userData.title || staffRole.replace('-', ' ').replace(/^\w/, (c: string) => c.toUpperCase()),
    role: staffRole,
    profileImg: userData.profileImg || userData.profilePhoto || undefined,
    profileCode: userData.unicode || userData.username || user.id || '', // Profile link uses unicode > username > uid
    email: userData.email,
    phone: userData.phone || userData.phoneNumber,
    bio: userData.bio,
    yearsWithTeam: undefined, // TODO: Calculate from joinDate
  };
}

/**
 * Build team slug from team data
 */
function buildTeamSlug(teamCode: TeamCode): string {
  const namePart = teamCode.teamName.replace(/\s+/g, '_');
  const sportPart = teamCode.sportName || 'sports';
  const unicode = teamCode.unicode || 'unknown';
  return `${namePart}-${sportPart}-${unicode}`;
}

/**
 * Format season record
 */
function formatRecord(record: {
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
}): string {
  const wins = record.wins || 0;
  const losses = record.losses || 0;
  const ties = record.ties || 0;

  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }
  return `${wins}-${losses}`;
}

/**
 * Extract handle from social URL
 */
function extractHandle(url: string): string | undefined {
  if (!url) return undefined;

  // Extract @handle or last path segment
  const match = url.match(/@([a-zA-Z0-9_]+)|\/([a-zA-Z0-9_]+)\/?$/);
  return match ? match[1] || match[2] : undefined;
}

/**
 * Generate follow stats (for now, mock data - TODO: implement real analytics)
 */
function generateFollowStats(): TeamProfileFollowStats {
  return {
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
  };
}

/**
 * Fetch team schedule events from the TeamEvents collection
 */
async function fetchTeamSchedule(
  teamId: string,
  firestore: FirebaseFirestore.Firestore,
  limit = 50
): Promise<TeamProfileScheduleEvent[]> {
  if (!teamId) return [];

  try {
    const snapshot = await firestore.collection('TeamEvents').where('teamId', '==', teamId).get();

    if (snapshot.empty) {
      logger.info('[team-profile-mapper] No schedule events found for team', { teamId });
      return [];
    }

    // Sort in-memory by date asc (upcoming first), avoid composite index
    const sortedDocs = snapshot.docs
      .sort((a, b) => {
        const aDate = a.data()['date'] ?? '';
        const bDate = b.data()['date'] ?? '';
        return aDate.localeCompare(bDate);
      })
      .slice(0, limit);

    const events: TeamProfileScheduleEvent[] = sortedDocs.map((doc) => {
      // Cast Firestore data to TeamEvent (includes doc id)
      const raw = doc.data() as Partial<TeamEvent>;

      const result = raw.result
        ? {
            teamScore: raw.result.teamScore ?? 0,
            opponentScore: raw.result.opponentScore ?? 0,
            outcome: raw.result.outcome ?? 'tie',
            overtime: raw.result.overtime ?? false,
          }
        : undefined;

      return {
        id: doc.id,
        type: raw.type ?? 'game',
        name: raw.name,
        opponent: raw.opponent,
        opponentLogoUrl: raw.opponentLogoUrl,
        date: raw.date ?? new Date().toISOString(),
        time: raw.time,
        location: raw.location,
        isHome: raw.isHome ?? true,
        result,
        status: raw.status ?? 'upcoming',
      } satisfies TeamProfileScheduleEvent;
    });

    logger.info('[team-profile-mapper] Fetched team schedule', { teamId, count: events.length });
    return events;
  } catch (error) {
    logger.error('[team-profile-mapper] Failed to fetch team schedule', { teamId, error });
    return [];
  }
}

/**
 * Map raw Firestore post type string to TeamProfilePostType
 */
function toTeamPostType(raw: string): TeamProfilePostType {
  const allowed: TeamProfilePostType[] = [
    'video',
    'image',
    'text',
    'highlight',
    'news',
    'announcement',
  ];
  return allowed.includes(raw as TeamProfilePostType) ? (raw as TeamProfilePostType) : 'text';
}

/**
 * Fetch team posts from the Posts collection (shared with the feed)
 * Looks for documents with teamId == teamCode.id, ordered by createdAt desc
 */
async function fetchTeamPosts(
  teamId: string,
  firestore: FirebaseFirestore.Firestore,
  limit = 20
): Promise<TeamProfilePost[]> {
  if (!teamId) return [];

  try {
    const snapshot = await firestore.collection('Posts').where('teamId', '==', teamId).get();

    if (snapshot.empty) {
      logger.info('[team-profile-mapper] No posts found for team', { teamId });
      return [];
    }

    // Sort in-memory (newest first) to avoid a composite Firestore index requirement
    const sortedDocs = snapshot.docs
      .sort((a, b) => {
        const aMs = (a.data()['createdAt']?.toMillis?.() as number) ?? 0;
        const bMs = (b.data()['createdAt']?.toMillis?.() as number) ?? 0;
        return bMs - aMs;
      })
      .slice(0, limit);

    const posts: TeamProfilePost[] = sortedDocs.map((doc) => {
      const d = doc.data();
      const createdAt: string =
        d['createdAt']?.toDate?.()?.toISOString?.() ?? new Date().toISOString();

      const post: TeamProfilePost = {
        id: doc.id,
        type: toTeamPostType(d['type'] ?? 'text'),
        title: d['title'] ?? undefined,
        body: d['content'] ?? undefined,
        thumbnailUrl:
          Array.isArray(d['images']) && d['images'].length > 0
            ? d['images'][0]
            : (d['thumbnailUrl'] ?? undefined),
        mediaUrl: d['videoUrl'] ?? d['mediaUrl'] ?? undefined,
        externalLink:
          Array.isArray(d['externalLinks']) && d['externalLinks'].length > 0
            ? d['externalLinks'][0]
            : undefined,
        likeCount: d['stats']?.likes ?? 0,
        commentCount: d['stats']?.comments ?? 0,
        shareCount: d['stats']?.shares ?? 0,
        viewCount: d['stats']?.views ?? 0,
        duration: d['duration'] ?? undefined,
        isPinned: d['isPinned'] ?? false,
        createdAt,
      };

      return post;
    });

    logger.info('[team-profile-mapper] Fetched team posts', {
      teamId,
      count: posts.length,
    });

    return posts;
  } catch (error) {
    logger.error('[team-profile-mapper] Failed to fetch team posts', { teamId, error });
    return [];
  }
}

/**
 * Fetch team news articles from the News collection (type==='team' documents).
 */
async function fetchTeamNews(
  teamId: string,
  firestore: FirebaseFirestore.Firestore,
  limit = 10
): Promise<NewsArticle[]> {
  if (!teamId) return [];
  try {
    const snapshot = await firestore
      .collection('News')
      .where('teamId', '==', teamId)
      .where('type', '==', 'team')
      .get();
    if (snapshot.empty) {
      logger.info('[team-profile-mapper] No news articles found for team', { teamId });
      return [];
    }
    const articles = snapshot.docs
      .sort((a, b) => {
        const aTime = String(a.data()['publishedAt'] ?? '');
        const bTime = String(b.data()['publishedAt'] ?? '');
        return bTime.localeCompare(aTime);
      })
      .slice(0, limit)
      .map((doc) => {
        const d = doc.data();
        return { id: doc.id, ...d } as NewsArticle;
      });
    logger.info('[team-profile-mapper] Fetched team news articles', {
      teamId,
      count: articles.length,
    });
    return articles;
  } catch (error) {
    logger.error('[team-profile-mapper] Failed to fetch team news', { teamId, error });
    return [];
  }
}

/**
 * Generate quick stats
 */
function generateQuickStats(teamCode: TeamCode): TeamProfileQuickStats {
  const rosterCount = teamCode.memberIds?.length || 0;

  return {
    pageViews: teamCode.totalTraffic || teamCode.analytic?.totalTeamPageTraffic || 0,
    rosterCount,
    totalPosts: 0, // TODO: Fetch from posts collection
    highlightCount: 0, // TODO: Fetch from media
    eventCount: 0, // TODO: Fetch from schedule
    shareCount: 0, // TODO: Implement sharing analytics
  };
}

/**
 * Check if user is team admin
 */
function isUserTeamAdmin(teamCode: TeamCode, userId?: string): boolean {
  if (!userId) return false;

  const member = teamCode.members?.find((m) => m.id === userId);
  return member?.role === ROLE.admin;
}

/**
 * Check if user is team member
 */
function isUserTeamMember(teamCode: TeamCode, userId?: string): boolean {
  if (!userId) return false;

  return teamCode.memberIds?.includes(userId) || false;
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map TeamCode to TeamProfilePageData
 *
 * This is now async because it fetches user data from Firestore.
 * Uses memberIds array instead of members to avoid data duplication.
 */
export async function mapTeamCodeToProfile(
  teamCode: TeamCode,
  options: MapTeamProfileOptions = {},
  firestore?: FirebaseFirestore.Firestore
): Promise<TeamProfilePageData> {
  const { userId, includeRoster = true } = options;

  logger.info('[mapTeamCodeToProfile] 🚀 START mapping', {
    teamId: teamCode.id,
    userId,
    memberIds: teamCode.memberIds,
    memberIdsCount: teamCode.memberIds?.length,
    hasDescription: !!teamCode.description,
    hasSeasonHistory: !!teamCode.seasonHistory,
  });

  // Core team data
  const team = mapTeamCodeToTeam(teamCode);

  // Fetch all members from Users collection
  logger.info('[mapTeamCodeToProfile] 📥 Fetching users...', {
    memberIds: teamCode.memberIds,
  });
  const members = teamCode.memberIds ? await fetchUsersByIds(teamCode.memberIds, firestore) : [];

  // Helper to check if user is athlete/roster member.
  // Priority: role in TeamCode.members array (if present) → fallback to User doc role.
  // Athletes: 'Athlete' | 'athlete' | 'player'
  // Staff: 'Coach' | 'Administrative' | 'Media' | 'admin' | 'coach' | 'media'
  const memberRoleMap = new Map<string, string>();
  for (const m of teamCode.members ?? []) {
    if (m.id) memberRoleMap.set(m.id, (m.role || '').toLowerCase());
  }

  const isAthlete = (user: UserData) => {
    const teamRole = memberRoleMap.get(user.id || '');
    if (teamRole) {
      return teamRole === 'athlete' || teamRole === 'player';
    }
    // Fallback: use User doc's own role field
    const role = ((user as UserDataRecord).role || '').toLowerCase();
    return role === 'athlete' || role === 'player';
  };

  logger.info('Team members fetched', {
    teamId: teamCode.id,
    membersCount: members.length,
    athletes: members.filter(isAthlete).length,
    staff: members.filter((m) => !isAthlete(m)).length,
  });

  // Roster (athletes only)
  const roster: TeamProfileRosterMember[] = includeRoster
    ? members.filter(isAthlete).map((m, i) => mapUserToRoster(m, i + 1))
    : [];

  // Staff (coaches, admin, media)
  const staff: TeamProfileStaffMember[] = members
    .filter((m) => !isAthlete(m))
    .map((m) => mapUserToStaff(m));

  // Stats
  const followStats = generateFollowStats();
  const quickStats = generateQuickStats(teamCode);

  // Permissions
  const isTeamAdmin = isUserTeamAdmin(teamCode, userId);
  const isMember = isUserTeamMember(teamCode, userId);
  const canEdit = isTeamAdmin;

  // Posts — fetch from shared Posts collection using teamId
  const recentPosts = firestore ? await fetchTeamPosts(teamCode.id || '', firestore) : [];

  // News articles — fetch from News collection (type==='team' documents)
  const newsArticles = firestore ? await fetchTeamNews(teamCode.id || '', firestore) : [];

  // Schedule — fetch from TeamEvents collection
  const schedule = firestore ? await fetchTeamSchedule(teamCode.id || '', firestore) : [];

  // Update quick stats with real post count
  const finalQuickStats: TeamProfileQuickStats = {
    ...quickStats,
    totalPosts: recentPosts.length,
    eventCount: schedule.length,
  };

  return {
    team,
    roster,
    staff,
    followStats,
    quickStats: finalQuickStats,
    schedule,
    stats: (teamCode.statsCategories ?? []) as TeamProfileStatsCategory[],
    recentPosts,
    newsArticles,
    recruitingActivity: (teamCode.recruitingActivities ?? []) as TeamProfileRecruitingActivity[],
    isTeamAdmin,
    isMember,
    canEdit,
  };
}

/**
 * Map TeamCode to lightweight summary (for lists)
 */
export function mapTeamCodeToSummary(teamCode: TeamCode) {
  return {
    id: teamCode.id,
    slug: buildTeamSlug(teamCode),
    unicode: teamCode.unicode,
    teamName: teamCode.teamName,
    sport: teamCode.sportName,
    city: teamCode.city,
    state: teamCode.state,
    logoUrl: teamCode.teamLogoImg,
    memberCount: teamCode.members?.length || 0,
    record: teamCode.seasonRecord ? formatRecord(teamCode.seasonRecord) : undefined,
  };
}
