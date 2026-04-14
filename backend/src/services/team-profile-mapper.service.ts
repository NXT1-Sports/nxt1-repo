/**
 * @fileoverview Team Profile Mapper Service
 * @module @nxt1/backend/services/team-profile-mapper
 *
 * Maps TeamCode (database model) to TeamProfilePageData (frontend model)
 * Handles data transformation and enrichment for team profile pages
 */

import type { Firestore } from 'firebase-admin/firestore';
import type {
  TeamProfilePageData,
  TeamProfileTeam,
  TeamProfileRosterMember,
  TeamProfileStaffMember,
  TeamProfileScheduleEvent,
  TeamProfilePost,
  TeamProfilePostType,
  TeamProfileQuickStats,
  TeamProfileSocialLink,
} from '@nxt1/core/team-profile';
import type { TeamCode, RosterEntry, TeamEvent } from '@nxt1/core/models';
import { RosterEntryStatus } from '@nxt1/core/models';
import type { NewsArticle } from '@nxt1/core/news';
import { logger } from '../utils/logger.js';
import { getUsersByIds, type UserData } from './users.service.js';

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
  sports?: Array<{ positions?: string[] }>;
};

/**
 * Organization branding/location data used as fallback when the Team
 * document doesn't carry its own (new architecture: branding & location
 * live on the Organization, not on the Team).
 */
interface OrgOverlay {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  mascot?: string | null;
  city?: string;
  state?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch user documents by IDs, with logging.
 */
async function fetchUsersByIds(
  userIds: string[],
  db?: Firestore
): Promise<Map<string, UserDataRecord>> {
  if (!userIds.length) return new Map();
  try {
    const users = await getUsersByIds(userIds, db);
    const map = new Map<string, UserDataRecord>();
    for (const u of users) {
      map.set(u.id, u as UserDataRecord);
    }
    return map;
  } catch (err) {
    logger.error('[TeamProfileMapper] Failed to fetch users', { err, count: userIds.length });
    return new Map();
  }
}

/**
 * Query the RosterEntries sub-collection (or top-level collection) for a team.
 */
async function fetchRosterEntriesForTeam(teamId: string, db: Firestore): Promise<RosterEntry[]> {
  try {
    const snap = await db
      .collection('RosterEntries')
      .where('teamId', '==', teamId)
      .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
      .get();
    return snap.docs.map((d) => ({ ...(d.data() as RosterEntry), id: d.id }));
  } catch (err) {
    logger.error('[TeamProfileMapper] Failed to fetch RosterEntries', { err, teamId });
    return [];
  }
}

/**
 * Build a userId → UserDataRecord map (used for live display-name hydration).
 */
async function fetchUserDataMap(
  userIds: string[],
  db?: Firestore
): Promise<Map<string, UserDataRecord>> {
  return fetchUsersByIds(userIds, db);
}

// ─── String / date helpers ────────────────────────────────────────────────────

function toSafeISOString(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

/** Institutional suffixes we strip when building the display name. */
const ORG_SUFFIXES_TO_STRIP = [
  'high school',
  'high',
  'middle school',
  'middle',
  'junior high',
  'elementary school',
  'elementary',
  'academy',
  'preparatory school',
  'preparatory',
  'prep school',
  'prep',
  'college',
  'university',
  'school',
];

/**
 * Build a concise team display name.
 * e.g. orgName="Hoover High School", teamName="Lions" → "Hoover Lions"
 */
function buildTeamDisplayName(orgName: string | undefined, teamName: string): string {
  if (!orgName) return teamName;
  let shortened = orgName.trim();
  const lower = shortened.toLowerCase();
  for (const suffix of ORG_SUFFIXES_TO_STRIP) {
    if (lower.endsWith(suffix)) {
      shortened = shortened.slice(0, shortened.length - suffix.length).trim();
      break;
    }
  }
  if (!shortened) return teamName;
  return `${shortened} ${teamName}`.trim();
}

function buildTeamSlug(teamCode: TeamCode & { id?: string }): string {
  if (teamCode.slug) return teamCode.slug;
  if (teamCode.unicode) return teamCode.unicode;
  return (teamCode.teamCode ?? teamCode.id ?? '').toLowerCase().replace(/\s+/g, '-');
}

function formatRecord(seasonRecord: TeamCode['seasonRecord']): TeamProfileTeam['record'] {
  if (!seasonRecord) return undefined;
  return {
    wins: seasonRecord.wins ?? 0,
    losses: seasonRecord.losses ?? 0,
    ties: seasonRecord.ties ?? undefined,
    formatted:
      seasonRecord.wins !== undefined && seasonRecord.losses !== undefined
        ? `${seasonRecord.wins}-${seasonRecord.losses}${seasonRecord.ties ? `-${seasonRecord.ties}` : ''}`
        : undefined,
  };
}

function extractHandle(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/([^/?#]+)\/?$/);
  return match ? match[1] : undefined;
}

/** Returns true for roles that represent athletes/players (vs. staff). */
function isAthleteRole(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase();
  return r === 'athlete' || r === 'player';
}

// ─── Team core mapper ─────────────────────────────────────────────────────────

function mapTeamCodeToTeam(
  teamCode: TeamCode & { id?: string },
  org?: OrgOverlay
): TeamProfileTeam {
  const teamId = teamCode.id ?? teamCode.teamCode;

  // Priority: teamCode fields → OrgOverlay fallback
  const city = teamCode.city ?? org?.city ?? '';
  const state = teamCode.state ?? org?.state ?? '';
  const location = [city, state].filter(Boolean).join(', ');
  const logoUrl = teamCode.logoUrl ?? teamCode.teamLogoImg ?? org?.logoUrl ?? undefined;
  const primaryColor = teamCode.primaryColor ?? org?.primaryColor ?? undefined;
  const secondaryColor = teamCode.secondaryColor ?? org?.secondaryColor ?? undefined;
  const mascot = teamCode.mascot ?? org?.mascot ?? undefined;

  const teamName = teamCode.teamName ?? '';
  buildTeamDisplayName(org?.name, teamName); // computed for future use

  const socialLinks = teamCode.socialLinks as Record<string, string> | null | undefined;
  const social: TeamProfileSocialLink[] = socialLinks
    ? Object.entries(socialLinks)
        .filter(([, url]) => Boolean(url))
        .map(([platform, url]) => ({
          platform,
          url,
          handle: extractHandle(url),
        }))
    : [];

  const links = teamCode.teamLinks
    ? {
        newsPageUrl: teamCode.teamLinks.newsPageUrl,
        schedulePageUrl: teamCode.teamLinks.schedulePageUrl,
        registrationUrl: teamCode.teamLinks.registrationUrl,
        rosterUrl: (teamCode.teamLinks as unknown as Record<string, unknown>)['rosterUrl'] as
          | string
          | undefined,
      }
    : undefined;

  return {
    id: teamId,
    slug: buildTeamSlug(teamCode),
    teamCode: teamCode.teamCode ?? undefined,
    unicode: teamCode.unicode,
    teamName,
    teamType: (teamCode.teamType as TeamProfileTeam['teamType']) ?? 'high-school',
    sport: teamCode.sport ?? teamCode.sportName ?? '',
    city,
    state,
    location,
    logoUrl,
    bannerImg: (teamCode as unknown as Record<string, unknown>)['bannerImg'] as string | undefined,
    galleryImages: teamCode.galleryImages ?? [],
    description: teamCode.description,
    record: formatRecord(teamCode.seasonRecord),
    branding:
      primaryColor || secondaryColor || mascot
        ? { primaryColor, secondaryColor, mascot }
        : undefined,
    contact: teamCode.contactInfo
      ? {
          phone: teamCode.contactInfo.phone ?? undefined,
          email: teamCode.contactInfo.email,
        }
      : undefined,
    social,
    links,
    sponsors:
      teamCode.sponsor?.name || teamCode.sponsor?.logoImg
        ? [{ name: teamCode.sponsor.name ?? '', logoUrl: teamCode.sponsor.logoImg }]
        : [],
    division: teamCode.division,
    conference: teamCode.conference,
    seasonHistory: (teamCode.seasonHistory as TeamProfileTeam['seasonHistory']) ?? [],
    verificationStatus: 'unverified',
    isActive: teamCode.isActive !== false,
    createdAt: toSafeISOString(teamCode.createdAt),
    updatedAt: toSafeISOString(
      (teamCode as unknown as Record<string, unknown>)['updatedAt'] ?? teamCode.createdAt
    ),
  };
}

// ─── Roster / Staff mappers (legacy architecture) ─────────────────────────────

function mapUserToRoster(
  userId: string,
  user: UserDataRecord,
  memberMeta?: {
    role?: unknown;
    joinTime?: unknown;
    position?: unknown;
    classOf?: unknown;
    isVerify?: boolean;
  }
): TeamProfileRosterMember {
  const position = memberMeta?.position;
  return {
    id: userId,
    firstName: user.firstName ?? (user.displayName ?? user.name ?? '').split(' ')[0] ?? '',
    lastName:
      user.lastName ?? (user.displayName ?? user.name ?? '').split(' ').slice(1).join(' ') ?? '',
    profileImg: user.profileImgs?.[0],
    role: 'athlete',
    jerseyNumber: user.jerseyNumber,
    position: Array.isArray(position)
      ? (position as string[])[0]
      : (position as string | undefined),
    classYear:
      user.classOf !== undefined
        ? String(user.classOf)
        : memberMeta?.classOf !== undefined
          ? String(memberMeta.classOf)
          : undefined,
    height: user.height,
    weight: user.weight,
    isVerified: user.isVerify ?? memberMeta?.isVerify ?? false,
    joinedAt: toSafeISOString(memberMeta?.joinTime),
  };
}

function mapUserToStaff(
  userId: string,
  user: UserDataRecord,
  memberMeta?: { role?: unknown; title?: string; email?: string; phoneNumber?: string }
): TeamProfileStaffMember {
  const role = String(memberMeta?.role ?? user.role ?? '').toLowerCase();
  const staffRole: TeamProfileStaffMember['role'] = role.includes('head')
    ? 'head-coach'
    : role === 'coach'
      ? 'head-coach'
      : role === 'director'
        ? 'director'
        : role === 'assistant' || role.includes('assistant')
          ? 'assistant-coach'
          : 'head-coach';

  return {
    id: userId,
    firstName: user.firstName ?? (user.displayName ?? user.name ?? '').split(' ')[0] ?? '',
    lastName:
      user.lastName ?? (user.displayName ?? user.name ?? '').split(' ').slice(1).join(' ') ?? '',
    title: memberMeta?.title ?? user.title ?? String(memberMeta?.role ?? user.role ?? ''),
    role: staffRole,
    email: memberMeta?.email ?? user.email,
    phone: memberMeta?.phoneNumber ?? user.phone ?? user.phoneNumber,
    profileImg: user.profileImgs?.[0],
  };
}

// ─── Roster / Staff mappers (new RosterEntry architecture) ────────────────────

function toStaffRole(role: string): TeamProfileStaffMember['role'] {
  const r = role.toLowerCase();
  if (r.includes('head')) return 'head-coach';
  if (r === 'coach') return 'head-coach';
  if (r === 'director') return 'director';
  if (r.includes('assistant')) return 'assistant-coach';
  return 'head-coach';
}

function mapRosterEntryToRosterMember(
  entry: RosterEntry,
  userDataMap: Map<string, UserDataRecord>
): TeamProfileRosterMember {
  const entryAny = entry as unknown as Record<string, unknown>;
  const user = userDataMap.get(entry.userId);
  return {
    id: entry.userId,
    firstName:
      user?.firstName ??
      entry.firstName ??
      (user?.displayName ?? user?.name ?? '').split(' ')[0] ??
      '',
    lastName:
      user?.lastName ??
      (entryAny['lastName'] as string | undefined) ??
      (user?.displayName ?? user?.name ?? '').split(' ').slice(1).join(' ') ??
      '',
    displayName: user?.displayName ?? user?.name,
    profileImg: user?.profileImgs?.[0],
    role: 'athlete',
    jerseyNumber: (entryAny['jerseyNumber'] as string | undefined) ?? user?.jerseyNumber,
    position: (entryAny['position'] as string | undefined) ?? user?.sports?.[0]?.positions?.[0],
    classYear:
      (entryAny['classYear'] as string | undefined) ??
      (user?.classOf !== undefined ? String(user.classOf) : undefined),
    height: user?.height,
    weight: user?.weight,
    isVerified: user?.isVerify ?? false,
    joinedAt: toSafeISOString(entryAny['joinedAt'] ?? entryAny['createdAt']),
  };
}

function mapRosterEntryToStaffMember(
  entry: RosterEntry,
  userDataMap: Map<string, UserDataRecord>
): TeamProfileStaffMember {
  const entryAny = entry as unknown as Record<string, unknown>;
  const user = userDataMap.get(entry.userId);
  return {
    id: entry.userId,
    firstName:
      user?.firstName ??
      entry.firstName ??
      (user?.displayName ?? user?.name ?? '').split(' ')[0] ??
      '',
    lastName:
      user?.lastName ??
      (entryAny['lastName'] as string | undefined) ??
      (user?.displayName ?? user?.name ?? '').split(' ').slice(1).join(' ') ??
      '',
    title: (entryAny['title'] as string | undefined) ?? user?.title ?? String(entry.role ?? ''),
    role: toStaffRole(String(entry.role ?? '')),
    email: user?.email,
    phone: user?.phone ?? user?.phoneNumber,
    profileImg: user?.profileImgs?.[0],
  };
}

// ─── Schedule Fetching ────────────────────────────────────────────────────────

async function fetchTeamSchedule(
  teamId: string,
  db: Firestore
): Promise<TeamProfileScheduleEvent[]> {
  try {
    const snap = await db
      .collection('Events')
      .where('teamId', '==', teamId)
      .where('ownerType', '==', 'team')
      .get();

    const events = snap.docs.map((d) => {
      const data = d.data() as TeamEvent & Record<string, unknown>;
      return {
        id: d.id,
        type: (data['type'] as TeamProfileScheduleEvent['type']) ?? 'game',
        name: data['name'] as string | undefined,
        opponent: data['opponent'] as string | undefined,
        opponentLogoUrl: data['opponentLogoUrl'] as string | undefined,
        date: toSafeISOString(data['date']),
        time: data['time'] as string | undefined,
        location: data['location'] as string | undefined,
        isHome: Boolean(data['isHome']),
        status: (data['status'] as TeamProfileScheduleEvent['status']) ?? 'upcoming',
        result: data['result'] as TeamProfileScheduleEvent['result'] | undefined,
      } satisfies TeamProfileScheduleEvent;
    });

    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    logger.error('[TeamProfileMapper] Failed to fetch schedule', { err, teamId });
    return [];
  }
}

// ─── Posts Fetching ───────────────────────────────────────────────────────────

function toTeamPostType(raw: unknown): TeamProfilePost['type'] {
  const allowed: TeamProfilePostType[] = [
    'video',
    'image',
    'text',
    'highlight',
    'news',
    'announcement',
  ];
  const t = String(raw ?? '').toLowerCase() as TeamProfilePost['type'];
  return allowed.includes(t) ? t : 'text';
}

async function fetchTeamPosts(teamId: string, db: Firestore): Promise<TeamProfilePost[]> {
  try {
    const snap = await db.collection('Posts').where('teamId', '==', teamId).limit(50).get();

    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          type: toTeamPostType(data['type']),
          title: data['title'] as string | undefined,
          body: data['body'] as string | undefined,
          thumbnailUrl: data['thumbnailUrl'] as string | undefined,
          mediaUrl: data['mediaUrl'] as string | undefined,
          externalLink: data['externalLink'] as string | undefined,
          likeCount: (data['likeCount'] as number) ?? 0,
          commentCount: (data['commentCount'] as number) ?? 0,
          shareCount: (data['shareCount'] as number) ?? 0,
          viewCount: data['viewCount'] as number | undefined,
          isPinned: Boolean(data['isPinned']),
          createdAt: toSafeISOString(data['createdAt']),
        } satisfies TeamProfilePost;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  } catch (err) {
    logger.error('[TeamProfileMapper] Failed to fetch posts', { err, teamId });
    return [];
  }
}

// ─── News Fetching ────────────────────────────────────────────────────────────

async function fetchTeamNews(teamId: string, db: Firestore): Promise<NewsArticle[]> {
  try {
    const snap = await db
      .collection('News')
      .where('teamId', '==', teamId)
      .where('type', '==', 'team')
      .orderBy('publishedAt', 'desc')
      .limit(5)
      .get();

    return snap.docs.map((d) => {
      return d.data() as unknown as NewsArticle;
    });
  } catch (err) {
    logger.error('[TeamProfileMapper] Failed to fetch news', { err, teamId });
    return [];
  }
}

// ─── Access helpers ───────────────────────────────────────────────────────────

function isUserTeamAdmin(
  userId: string,
  rosterEntries: RosterEntry[],
  legacyMembers: TeamCode['members']
): boolean {
  const entryMatch = rosterEntries.find((r) => r.userId === userId);
  if (entryMatch) {
    return ['director', 'coach'].includes(String(entryMatch.role ?? '').toLowerCase());
  }
  const legacyMatch = legacyMembers?.find((m) => m.id === userId);
  if (legacyMatch) {
    return ['admin', 'coach', 'owner', 'director'].includes(
      String(legacyMatch.role ?? '').toLowerCase()
    );
  }
  return false;
}

function isUserTeamMember(
  userId: string,
  rosterEntries: RosterEntry[],
  legacyMembers: TeamCode['members'],
  memberIds: string[] | undefined
): boolean {
  if (rosterEntries.some((r) => r.userId === userId)) return true;
  if (legacyMembers?.some((m) => m.id === userId)) return true;
  if (memberIds?.includes(userId)) return true;
  return false;
}

// ─── Quick stats ──────────────────────────────────────────────────────────────

function generateQuickStats(
  teamCode: TeamCode & { id?: string },
  roster: TeamProfileRosterMember[],
  schedule: TeamProfileScheduleEvent[],
  posts: TeamProfilePost[]
): TeamProfileQuickStats {
  return {
    pageViews: teamCode.totalTraffic ?? teamCode.analytic?.totalTeamPageTraffic ?? 0,
    rosterCount: roster.length || (teamCode.memberIds?.length ?? 0),
    totalPosts: posts.length,
    highlightCount: 0,
    eventCount: schedule.length,
    shareCount: 0,
  };
}

// ─── Core Mapper ─────────────────────────────────────────────────────────────

/**
 * Map a TeamCode document to TeamProfilePageData.
 * Fetches live user data, Organization overlay, RosterEntries, schedule, posts, and news.
 */
export async function mapTeamCodeToProfile(
  teamCode: TeamCode & { id?: string },
  options: MapTeamProfileOptions = {},
  db?: Firestore
): Promise<TeamProfilePageData> {
  const teamId = teamCode.id ?? teamCode.teamCode;
  const { userId, includeRoster = true, includeSchedule = false, includePosts = false } = options;

  // ── Organization overlay ──────────────────────────────────────────────────
  let org: OrgOverlay | undefined;
  const orgId = (teamCode as unknown as Record<string, unknown>)['organizationId'] as
    | string
    | undefined;
  if (orgId && db) {
    try {
      const orgSnap = await db.collection('Organizations').doc(orgId).get();
      if (orgSnap.exists) {
        const orgData = orgSnap.data() as Record<string, unknown>;
        org = {
          name: orgData['name'] as string | undefined,
          logoUrl: orgData['logoUrl'] as string | null | undefined,
          primaryColor: orgData['primaryColor'] as string | null | undefined,
          secondaryColor: orgData['secondaryColor'] as string | null | undefined,
          mascot: orgData['mascot'] as string | null | undefined,
          city: orgData['city'] as string | undefined,
          state: orgData['state'] as string | undefined,
        };
      }
    } catch (err) {
      logger.warn('[TeamProfileMapper] Could not fetch Organization overlay', { err, orgId });
    }
  }

  // ── Team core data ────────────────────────────────────────────────────────
  const team = mapTeamCodeToTeam(teamCode, org);

  // ── Roster mapping ────────────────────────────────────────────────────────
  const roster: TeamProfileRosterMember[] = [];
  const staff: TeamProfileStaffMember[] = [];
  let rosterEntries: RosterEntry[] = [];

  if (includeRoster) {
    // 1. Try new RosterEntries collection
    if (db) {
      rosterEntries = await fetchRosterEntriesForTeam(teamId, db);
    }

    if (rosterEntries.length > 0) {
      // New architecture: hydrate with live user data
      const userIds = [...new Set(rosterEntries.map((r) => r.userId).filter(Boolean))];
      const userDataMap = await fetchUserDataMap(userIds, db);

      for (const entry of rosterEntries) {
        if (isAthleteRole(String(entry.role ?? ''))) {
          roster.push(mapRosterEntryToRosterMember(entry, userDataMap));
        } else {
          staff.push(mapRosterEntryToStaffMember(entry, userDataMap));
          // Staff are also roster members (for member checks)
          roster.push(mapRosterEntryToRosterMember(entry, userDataMap));
        }
      }
    } else if (teamCode.memberIds && teamCode.memberIds.length > 0) {
      // Legacy architecture: fetch User documents by memberIds
      const legacyUserIds = teamCode.memberIds.filter(Boolean);
      const legacyUserMap = await fetchUserDataMap(legacyUserIds, db);

      // De-duplicate against any embedded members array
      const processedIds = new Set<string>();

      for (const member of teamCode.members ?? []) {
        processedIds.add(member.id);
        const user = legacyUserMap.get(member.id);
        const memberRole = String(member.role ?? '').toLowerCase();
        if (isAthleteRole(memberRole)) {
          roster.push(
            user
              ? mapUserToRoster(member.id, user, member as unknown as Record<string, unknown>)
              : {
                  id: member.id,
                  firstName: member.firstName,
                  lastName: member.lastName,
                  role: 'athlete',
                  position: Array.isArray(member.position)
                    ? (member.position as string[])[0]
                    : (member.position as string | undefined),
                  classYear: member.classOf !== undefined ? String(member.classOf) : undefined,
                  isVerified: member.isVerify,
                  joinedAt: toSafeISOString(member.joinTime),
                }
          );
        } else {
          if (user) {
            staff.push(
              mapUserToStaff(member.id, user, member as unknown as Record<string, unknown>)
            );
          } else {
            staff.push({
              id: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              title: member.title ?? String(member.role ?? ''),
              role: 'head-coach',
              email: member.email,
              phone: member.phoneNumber,
            });
          }
          // Staff count as roster members too
          const user2 = legacyUserMap.get(member.id);
          roster.push(
            user2
              ? mapUserToRoster(member.id, user2, member as unknown as Record<string, unknown>)
              : {
                  id: member.id,
                  firstName: member.firstName,
                  lastName: member.lastName,
                  role: 'athlete',
                  isVerified: member.isVerify,
                  joinedAt: toSafeISOString(member.joinTime),
                }
          );
        }
      }

      // Add remaining memberIds not in members array
      for (const uid of legacyUserIds) {
        if (processedIds.has(uid)) continue;
        const user = legacyUserMap.get(uid);
        if (user) {
          roster.push(mapUserToRoster(uid, user));
        } else {
          roster.push({ id: uid, firstName: '', lastName: '', role: 'athlete' });
        }
      }
    }
  }

  // ── Access control ─────────────────────────────────────────────────────────
  let isMember = false;
  let isTeamAdmin = false;

  if (userId) {
    isMember = isUserTeamMember(userId, rosterEntries, teamCode.members, teamCode.memberIds);
    isTeamAdmin = isUserTeamAdmin(userId, rosterEntries, teamCode.members);
  }

  // ── Schedule, Posts & News ─────────────────────────────────────────────────
  const [schedule, recentPosts, news] = await Promise.all([
    includeSchedule && db
      ? fetchTeamSchedule(teamId, db)
      : Promise.resolve<TeamProfileScheduleEvent[]>([]),
    includePosts && db ? fetchTeamPosts(teamId, db) : Promise.resolve<TeamProfilePost[]>([]),
    includePosts && db ? fetchTeamNews(teamId, db) : Promise.resolve<NewsArticle[]>([]),
  ]);

  // ── Quick stats ────────────────────────────────────────────────────────────
  const quickStats = generateQuickStats(teamCode, roster, schedule, recentPosts);

  return {
    team,
    quickStats,
    roster,
    schedule,
    stats: teamCode.statsCategories,
    staff,
    recentPosts,
    newsArticles: news,
    recruitingActivity: teamCode.recruitingActivities,
    isTeamAdmin,
    canEdit: isTeamAdmin,
    isMember,
  };
}

/**
 * Lightweight summary mapper — for team lists, search results, etc.
 * Does not fetch live user data or sub-collections.
 */
export function mapTeamCodeToSummary(
  teamCode: TeamCode & { id?: string },
  org?: OrgOverlay
): Pick<
  TeamProfileTeam,
  | 'id'
  | 'slug'
  | 'unicode'
  | 'teamName'
  | 'sport'
  | 'teamType'
  | 'city'
  | 'state'
  | 'location'
  | 'logoUrl'
  | 'branding'
  | 'isActive'
> & { memberCount: number } {
  const team = mapTeamCodeToTeam(teamCode, org);
  return {
    id: team.id,
    slug: team.slug,
    unicode: team.unicode,
    teamName: team.teamName,
    sport: team.sport,
    teamType: team.teamType,
    city: team.city,
    state: team.state,
    location: team.location,
    logoUrl: team.logoUrl,
    branding: team.branding,
    isActive: team.isActive,
    memberCount: teamCode.memberIds?.length ?? 0,
  };
}
