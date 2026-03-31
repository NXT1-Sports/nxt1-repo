/**
 * @fileoverview Team Profile Mapper Service
 * @module @nxt1/backend/services/team-profile-mapper
 *
 * Maps TeamCode (database model) to TeamProfilePageData (frontend model)
 * Handles data transformation and enrichment for team profile pages
 */

import type { TeamCode, RosterEntry } from '@nxt1/core/models';
import { ROLE, RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import type { TeamEvent } from '@nxt1/core/models';
import type {
  TeamProfilePageData,
  TeamProfileTeam,
  TeamProfileSocialLink,
  TeamProfileRosterMember,
  TeamProfileStaffMember,
  TeamProfileQuickStats,
  TeamProfilePost,
  TeamProfilePostType,
  TeamProfileScheduleEvent,
  TeamProfileStatsCategory,
  TeamProfileRecruitingActivity,
} from '@nxt1/core/team-profile';
import type { NewsArticle } from '@nxt1/core';
import { getUsersByIds, type UserData } from './users.service.js';
import { createOrganizationService } from './organization.service.js';
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
  profileImgs?: string[];
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

/**
 * Fetch all active/pending RosterEntries for a team from the RosterEntries collection.
 * This is the NEW architecture — users join teams via RosterEntries, not memberIds.
 */
async function fetchRosterEntriesForTeam(
  teamId: string,
  firestore: FirebaseFirestore.Firestore
): Promise<RosterEntry[]> {
  if (!teamId) return [];

  logger.debug('[team-profile-mapper] Fetching roster entries for team', { teamId });

  try {
    const snapshot = await firestore
      .collection('RosterEntries')
      .where('teamId', '==', teamId)
      .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
      .get();

    if (snapshot.empty) {
      logger.info('[team-profile-mapper] No roster entries found for team', { teamId });
      return [];
    }

    const entries: RosterEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data['userId'] ?? '',
        teamId: data['teamId'] ?? '',
        organizationId: data['organizationId'] ?? '',
        role: data['role'] ?? RosterRole.ATHLETE,
        status: data['status'] ?? RosterEntryStatus.PENDING,
        jerseyNumber: data['jerseyNumber'],
        positions: data['positions'] ?? [],
        primaryPosition: data['primaryPosition'],
        season: data['season'],
        classOfWhenJoined: data['classOfWhenJoined'],
        stats: data['stats'],
        rating: data['rating'],
        coachNotes: data['coachNotes'],
        joinedAt: data['joinedAt']?.toDate?.() ?? data['joinedAt'] ?? new Date().toISOString(),
        updatedAt: data['updatedAt']?.toDate?.() ?? data['updatedAt'],
        leftAt: data['leftAt']?.toDate?.() ?? data['leftAt'],
        invitedBy: data['invitedBy'],
        approvedBy: data['approvedBy'],
        approvedAt: data['approvedAt']?.toDate?.() ?? data['approvedAt'],
        // Cached user data for display (denormalized)
        firstName: data['firstName'],
        lastName: data['lastName'],
        profileImg: data['profileImg'],
        email: data['email'],
        phoneNumber: data['phoneNumber'],
        classOf: data['classOf'],
        gpa: data['gpa'],
        height: data['height'],
        weight: data['weight'],
      } satisfies RosterEntry;
    });

    logger.info('[team-profile-mapper] Fetched roster entries for team', {
      teamId,
      count: entries.length,
    });

    return entries;
  } catch (error) {
    logger.error('[team-profile-mapper] Failed to fetch roster entries for team', {
      teamId,
      error,
    });
    return [];
  }
}

/**
 * Batch-fetch full User documents for a list of user IDs.
 * Re-uses fetchUsersByIds (which has Redis caching) — no extra Firestore reads on cache hit.
 * Returns a Map<userId, UserDataRecord> so mappers can read up-to-date profile fields
 * (firstName, lastName, profileImg, unicode, height, weight, etc.) directly from
 * the User document instead of the stale denormalized cache on RosterEntry.
 */
async function fetchUserDataMap(
  userIds: string[],
  firestore?: FirebaseFirestore.Firestore
): Promise<Map<string, UserDataRecord>> {
  if (userIds.length === 0) return new Map();

  const users = await fetchUsersByIds(userIds, firestore);
  const map = new Map<string, UserDataRecord>();
  for (const user of users) {
    if (user.id) {
      map.set(user.id, user as UserDataRecord);
    }
  }
  return map;
}

// ============================================
// MAPPER FUNCTIONS
// ============================================

/**
 * Safely convert a date value to ISO string
 * Handles string, Date, Firestore Timestamp, and invalid values
 */
function toSafeISOString(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }

  // Already a string - return as-is
  if (typeof value === 'string') {
    return value;
  }

  // Try to convert to Date
  try {
    const date = new Date(value as string | number | Date);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      logger.warn('[team-profile-mapper] Invalid date value, using current time', { value });
      return new Date().toISOString();
    }

    return date.toISOString();
  } catch (err) {
    logger.warn('[team-profile-mapper] Failed to convert date, using current time', { value, err });
    return new Date().toISOString();
  }
}

/**
 * Organization branding/location data used as fallback when the Team
 * document doesn't carry its own (new architecture: branding & location
 * live on the Organization, not on the Team).
 */
interface OrgOverlay {
  /** Full organization name, e.g. "Hoover High School" or "Prime Time Athletics" */
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  mascot?: string | null;
  city?: string;
  state?: string;
}

/**
 * Generic institutional suffixes to strip before appending a mascot.
 * "Hoover High School" + "Lions" → strip "High School" → "Hoover Lions"
 */
const ORG_SUFFIXES_TO_STRIP = [
  'high school',
  'middle school',
  'junior high',
  'elementary school',
  'university',
  'college',
  'junior college',
  'community college',
  'athletics',
  'athletic club',
  'sports club',
  'sports',
] as const;

/**
 * Build the human-readable team display name.
 *
 * Rules:
 *  - If a mascot exists: strip generic org suffixes and append the mascot.
 *    "Hoover High School" + "Lions" → "Hoover Lions"
 *    "Prime Time Athletics" + (no mascot) → "Prime Time Athletics"
 *  - If no mascot: return the org/team name as-is.
 *  - Falls back to the raw teamName stored on the Team doc if no org data.
 */
function buildTeamDisplayName(teamName: string, orgName?: string, mascot?: string | null): string {
  const base = orgName?.trim() || teamName.trim();
  if (!mascot?.trim()) return base;

  // Strip the generic institutional suffix so we get the short form
  const baseLower = base.toLowerCase();
  let short = base;
  for (const suffix of ORG_SUFFIXES_TO_STRIP) {
    if (baseLower.endsWith(suffix)) {
      short = base.slice(0, base.length - suffix.length).trim();
      break;
    }
  }

  return `${short} ${mascot.trim()}`;
}

/**
 * Map TeamCode to TeamProfileTeam.
 *
 * Branding and location are resolved with the following priority:
 *   1. Legacy values on the Team document (backward compat with existing data)
 *   2. Organization document values (new architecture)
 *   3. Empty string / undefined
 */
function mapTeamCodeToTeam(teamCode: TeamCode, org?: OrgOverlay): TeamProfileTeam {
  // Resolve location: team doc first, org fallback second
  const city = teamCode.city || org?.city || '';
  const state = teamCode.state || org?.state || '';
  const location = city && state ? `${city}, ${state}` : city || state || '';

  // Resolve branding: team doc first, org fallback second
  const logoUrl = teamCode.logoUrl ?? teamCode.teamLogoImg ?? org?.logoUrl ?? undefined;
  const primaryColor =
    teamCode.primaryColor ?? teamCode.teamColor1 ?? org?.primaryColor ?? undefined;
  const secondaryColor =
    teamCode.secondaryColor ?? teamCode.teamColor2 ?? org?.secondaryColor ?? undefined;
  const mascot = teamCode.mascot ?? org?.mascot ?? undefined;

  // Resolve display name:
  //   High school: "Hoover High School" + mascot "Lions" → "Hoover Lions"
  //   Club:        "Prime Time Athletics" + no mascot   → "Prime Time Athletics"
  //   Legacy team doc with its own mascot field overrides org mascot.
  const displayName = buildTeamDisplayName(teamCode.teamName, org?.name, mascot);

  return {
    id: teamCode.id || '',
    slug: buildTeamSlug(teamCode),
    unicode: teamCode.unicode || '',
    teamName: displayName,
    teamType: toTeamProfileType(teamCode.teamType),
    sport: teamCode.sport || '',
    city,
    state,
    location,
    logoUrl: logoUrl ?? undefined,
    galleryImages: teamCode.galleryImages || [],
    description: teamCode.description,
    branding: {
      primaryColor: primaryColor ?? undefined,
      secondaryColor: secondaryColor ?? undefined,
      mascot: mascot ?? undefined,
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
    social: teamCode.connectedSources?.length
      ? teamCode.connectedSources.map(
          (src) =>
            ({
              platform: src.platform,
              url: src.profileUrl || '',
              username: extractHandle(src.profileUrl || ''),
              displayOrder: src.displayOrder,
            }) satisfies TeamProfileSocialLink
        )
      : teamCode.socialLinks
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
    createdAt: toSafeISOString(teamCode.createdAt ?? teamCode.createAt),
    updatedAt: toSafeISOString(teamCode.lastUpdatedStat),
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

  // SportProfile has: sport, positions[], level, achievements, etc.
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
    profileImg: userData.profileImgs?.[0] || undefined,
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
    profileImg: userData.profileImgs?.[0] || undefined,
    profileCode: userData.unicode || userData.username || user.id || '', // Profile link uses unicode > username > uid
    email: userData.email,
    phone: userData.phone || userData.phoneNumber,
    bio: userData.bio,
    yearsWithTeam: undefined, // TODO: Calculate from joinDate
  };
}

/**
 * Returns true if a RosterRole corresponds to an athlete (player) position.
 * Athletes: ATHLETE, STARTER (varsity), JV, BENCH
 * Staff:    OWNER, HEAD_COACH, ASSISTANT_COACH, STAFF, MEDIA, PARENT
 */
function isAthleteRosterRole(role: RosterRole): boolean {
  return (
    role === RosterRole.ATHLETE ||
    role === RosterRole.STARTER ||
    role === RosterRole.JV ||
    role === RosterRole.BENCH
  );
}

/**
 * Map a RosterEntry (new architecture) to TeamProfileRosterMember.
 * Display fields (name, profileImg, height, weight, unicode) are read from the
 * live User document (via userDataMap) so profile updates are always reflected.
 * Team-specific fields (jerseyNumber, positions, role, joinedAt) come from
 * RosterEntry, which is their authoritative source.
 */
function mapRosterEntryToRosterMember(
  entry: RosterEntry,
  index: number,
  userDataMap: Map<string, UserDataRecord>
): TeamProfileRosterMember {
  const user = userDataMap.get(entry.userId);

  // Team-specific fields always come from RosterEntry
  const jerseyNumber = entry.jerseyNumber != null ? String(entry.jerseyNumber) : String(index);
  const position = entry.primaryPosition ?? entry.positions?.[0];
  const classYear =
    (entry.classOf ?? user?.classOf) != null ? String(entry.classOf ?? user?.classOf) : undefined;
  const joinedAt =
    entry.joinedAt instanceof Date
      ? entry.joinedAt.toISOString()
      : typeof entry.joinedAt === 'string'
        ? entry.joinedAt
        : undefined;

  // Display fields come from User document (live, Redis-cached)
  const firstName = user?.firstName ?? entry.firstName ?? '';
  const lastName = user?.lastName ?? entry.lastName ?? '';
  const profileImg = user?.profileImgs?.[0] ?? entry.profileImg ?? undefined;
  const height = user?.height ?? entry.height;
  const weight = user?.weight ?? entry.weight;
  const unicode = user?.unicode ?? undefined;
  const displayName =
    user?.displayName ??
    user?.name ??
    (firstName || lastName ? `${firstName} ${lastName}`.trim() : entry.userId);

  return {
    id: entry.userId,
    firstName,
    lastName,
    displayName,
    role: 'athlete',
    position,
    jerseyNumber,
    classYear,
    height,
    weight,
    profileImg,
    profileCode: unicode ?? entry.userId, // prefer unicode for /profile/:unicode navigation
    isVerified: user?.isVerify ?? false,
    joinedAt,
    views: undefined,
  } satisfies TeamProfileRosterMember;
}

/**
 * Map RosterRole enum to TeamProfileStaffMember['role'].
 */
function toStaffRole(role: RosterRole): TeamProfileStaffMember['role'] {
  switch (role) {
    case RosterRole.HEAD_COACH:
    case RosterRole.OWNER:
      return 'head-coach';
    case RosterRole.ASSISTANT_COACH:
      return 'assistant-coach';
    default:
      return 'other';
  }
}

/**
 * Map a RosterEntry (new architecture) to TeamProfileStaffMember.
 * Display fields come from the live User document (via userDataMap).
 * Team-specific fields (role) come from RosterEntry.
 */
function mapRosterEntryToStaffMember(
  entry: RosterEntry,
  userDataMap: Map<string, UserDataRecord>
): TeamProfileStaffMember {
  const user = userDataMap.get(entry.userId);
  const staffRole = toStaffRole(entry.role);

  const titleMap: Partial<Record<RosterRole, string>> = {
    [RosterRole.OWNER]: 'Team Owner',
    [RosterRole.HEAD_COACH]: 'Head Coach',
    [RosterRole.ASSISTANT_COACH]: 'Assistant Coach',
    [RosterRole.STAFF]: 'Staff',
    [RosterRole.MEDIA]: 'Media',
    [RosterRole.PARENT]: 'Parent / Guardian',
  };
  const title = titleMap[entry.role] ?? 'Staff';

  // Display fields from live User doc
  const firstName = user?.firstName ?? entry.firstName ?? '';
  const lastName = user?.lastName ?? entry.lastName ?? '';
  const profileImg = user?.profileImgs?.[0] ?? entry.profileImg ?? undefined;
  const unicode = user?.unicode ?? undefined;

  return {
    id: entry.userId,
    firstName,
    lastName,
    title,
    role: staffRole,
    profileImg,
    profileCode: unicode ?? entry.userId, // prefer unicode for /profile/:unicode navigation
    email: user?.email ?? entry.email,
    phone: user?.phone ?? user?.phoneNumber ?? entry.phoneNumber,
    bio: user?.bio ?? undefined,
    yearsWithTeam: undefined,
  } satisfies TeamProfileStaffMember;
}

/**
 * Build team slug from team name only (no unicode)
 * Format: lowercase-team-name-with-dashes
 * Example: riverside-phoenix
 */
function buildTeamSlug(teamCode: TeamCode): string {
  // Convert to lowercase, replace spaces and special chars with dashes
  const slug = teamCode.teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
  return slug;
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
 * Fetch team schedule events from the Events collection
 */
async function fetchTeamSchedule(
  teamId: string,
  firestore: FirebaseFirestore.Firestore,
  limit = 50
): Promise<TeamProfileScheduleEvent[]> {
  if (!teamId) return [];

  try {
    const snapshot = await firestore
      .collection('Events')
      .where('teamId', '==', teamId)
      .where('ownerType', '==', 'team')
      .get();

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

  // Core team data — fetch Organization for branding/location fallback
  let orgOverlay: OrgOverlay | undefined;
  if (teamCode.organizationId && firestore) {
    try {
      const orgService = createOrganizationService(firestore);
      const org = await orgService.getOrganizationById(teamCode.organizationId);
      orgOverlay = {
        name: org.name,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        secondaryColor: org.secondaryColor,
        mascot: org.mascot,
        city: org.location?.city,
        state: org.location?.state,
      };
    } catch {
      logger.warn('[mapTeamCodeToProfile] Failed to fetch organization for overlay', {
        organizationId: teamCode.organizationId,
        teamId: teamCode.id,
      });
    }
  }
  const team = mapTeamCodeToTeam(teamCode, orgOverlay);

  // ─── NEW ARCHITECTURE: Query RosterEntries collection ─────────────────────
  // Members who joined via the invite/join flow are stored here, not in memberIds.
  const rosterEntries = firestore
    ? await fetchRosterEntriesForTeam(teamCode.id || '', firestore)
    : [];

  // Batch-fetch live User documents for all roster entry members (Redis-cached, 15 min TTL)
  // This ensures display fields (profileImg, firstName, lastName, etc.) are always
  // up to date — we do NOT rely on the denormalized cache stored on RosterEntry.
  const rosterUserIds = rosterEntries.map((e) => e.userId);
  const userDataMap =
    rosterUserIds.length > 0
      ? await fetchUserDataMap(rosterUserIds, firestore)
      : new Map<string, UserDataRecord>();

  // ─── LEGACY ARCHITECTURE: memberIds on Team document ────────────────────────
  // Backward-compat for teams that pre-date RosterEntries.
  // Exclude any userId already present in rosterEntries to avoid duplicates.
  const rosterEntryUserIds = new Set(rosterEntries.map((e) => e.userId));
  const legacyMemberIds = (teamCode.memberIds ?? []).filter((id) => !rosterEntryUserIds.has(id));

  logger.info('[mapTeamCodeToProfile] 📥 Fetching members...', {
    teamId: teamCode.id,
    rosterEntryCount: rosterEntries.length,
    legacyMemberIdCount: legacyMemberIds.length,
  });

  const legacyMembers =
    legacyMemberIds.length > 0 ? await fetchUsersByIds(legacyMemberIds, firestore) : [];

  // Helper to classify legacy Users as athlete vs staff
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

  // Build roster from RosterEntries (new architecture)
  const rosterFromEntries: TeamProfileRosterMember[] = includeRoster
    ? rosterEntries
        .filter((e) => isAthleteRosterRole(e.role))
        .map((e, i) => mapRosterEntryToRosterMember(e, i + 1, userDataMap))
    : [];

  // Build staff from RosterEntries (new architecture)
  const staffFromEntries: TeamProfileStaffMember[] = rosterEntries
    .filter((e) => !isAthleteRosterRole(e.role))
    .map((e) => mapRosterEntryToStaffMember(e, userDataMap));

  // Build roster from legacy memberIds (backward compat)
  const rosterFromLegacy: TeamProfileRosterMember[] = includeRoster
    ? legacyMembers
        .filter(isAthlete)
        .map((m, i) => mapUserToRoster(m, rosterFromEntries.length + i + 1))
    : [];

  // Build staff from legacy memberIds (backward compat)
  const staffFromLegacy: TeamProfileStaffMember[] = legacyMembers
    .filter((m) => !isAthlete(m))
    .map((m) => mapUserToStaff(m));

  // Merge both sources — RosterEntries takes precedence (comes first)
  const roster: TeamProfileRosterMember[] = [...rosterFromEntries, ...rosterFromLegacy];
  const staff: TeamProfileStaffMember[] = [...staffFromEntries, ...staffFromLegacy];

  logger.info('[mapTeamCodeToProfile] 👥 Roster resolved', {
    teamId: teamCode.id,
    fromRosterEntries: rosterEntries.length,
    fromLegacyMemberIds: legacyMembers.length,
    athletes: roster.length,
    staff: staff.length,
  });

  // Stats
  const quickStats = generateQuickStats(teamCode);

  // Permissions
  const isTeamAdmin = isUserTeamAdmin(teamCode, userId);
  const isMember = isUserTeamMember(teamCode, userId);
  const canEdit = isTeamAdmin;

  // Posts — fetch from shared Posts collection using teamId
  const recentPosts = firestore ? await fetchTeamPosts(teamCode.id || '', firestore) : [];

  // News articles — fetch from News collection (type==='team' documents)
  const newsArticles = firestore ? await fetchTeamNews(teamCode.id || '', firestore) : [];

  // Schedule — fetch from Events collection
  const schedule = firestore ? await fetchTeamSchedule(teamCode.id || '', firestore) : [];

  // Update quick stats with real counts
  const finalQuickStats: TeamProfileQuickStats = {
    ...quickStats,
    rosterCount: roster.length + staff.length, // real count from RosterEntries + legacy
    totalPosts: recentPosts.length,
    eventCount: schedule.length,
  };

  return {
    team,
    roster,
    staff,
    quickStats: finalQuickStats,
    schedule,
    stats: (teamCode.statsCategories ?? []) as TeamProfileStatsCategory[],
    recentPosts,
    newsArticles,
    recruitingActivity: (teamCode.recruitingActivities ?? []) as TeamProfileRecruitingActivity[],
    isTeamAdmin,
    isMember,
    canEdit,
    followStats: {
      followersCount: 0,
      isFollowing: false,
    },
  };
}

/**
 * Map TeamCode to lightweight summary (for lists).
 * Uses Organization data as fallback for branding/location.
 */
export function mapTeamCodeToSummary(teamCode: TeamCode, org?: OrgOverlay) {
  const mascot = teamCode.mascot ?? org?.mascot ?? undefined;
  const displayName = buildTeamDisplayName(teamCode.teamName, org?.name, mascot);
  return {
    id: teamCode.id,
    slug: buildTeamSlug(teamCode),
    unicode: teamCode.unicode,
    teamName: displayName,
    sport: teamCode.sport,
    city: teamCode.city || org?.city || '',
    state: teamCode.state || org?.state || '',
    logoUrl: teamCode.logoUrl ?? teamCode.teamLogoImg ?? org?.logoUrl ?? undefined,
    memberCount: teamCode.members?.length || 0,
    record: teamCode.seasonRecord ? formatRecord(teamCode.seasonRecord) : undefined,
  };
}
