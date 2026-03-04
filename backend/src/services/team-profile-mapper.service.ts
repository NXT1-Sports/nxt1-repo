/**
 * @fileoverview Team Profile Mapper Service
 * @module @nxt1/backend/services/team-profile-mapper
 *
 * Maps TeamCode (database model) to TeamProfilePageData (frontend model)
 * Handles data transformation and enrichment for team profile pages
 */

import type { TeamCode } from '@nxt1/core/models';
import { ROLE } from '@nxt1/core/models';
import type {
  TeamProfilePageData,
  TeamProfileTeam,
  TeamProfileRosterMember,
  TeamProfileStaffMember,
  TeamProfileFollowStats,
  TeamProfileQuickStats,
} from '@nxt1/core/team-profile';
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
    teamType: teamCode.teamType as any,
    sport: teamCode.sportName || '',
    city: teamCode.city,
    state: teamCode.state,
    location,
    logoUrl: teamCode.teamLogoImg,
    galleryImages: [], // TODO: Add gallery support
    description: (teamCode as any).description, // Team description
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
    seasonHistory: (teamCode as any).seasonHistory, // Season-by-season history
    social: teamCode.socialLinks
      ? Object.entries(teamCode.socialLinks).map(([platform, url]) => ({
          platform: platform as any,
          url: url || '',
          username: extractHandle(url || ''),
        }))
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
  const userData = user as any;
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
    profileCode: userData.username || user.id || '', // Profile link uses username
    isVerified: userData.isVerify || false,
    views: undefined, // TODO: Add analytics
  };
}

/**
 * Map User to TeamProfileStaffMember
 */
function mapUserToStaff(user: UserData): TeamProfileStaffMember {
  const userData = user as any;

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
    profileCode: userData.username || user.id || '',
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

  // Helper to check if user is athlete/roster member
  // Athletes: role is "athlete", "player", or "roster"
  // Staff: everyone else (coach, admin, media, etc.)
  const isAthlete = (user: UserData) => {
    const role = ((user as any).role || '').toLowerCase();
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

  return {
    team,
    roster,
    staff,
    followStats,
    quickStats,
    schedule: [], // TODO: Implement schedule
    stats: [], // TODO: Implement stats
    recentPosts: [], // TODO: Implement posts
    recruitingActivity: [], // TODO: Implement recruiting
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
