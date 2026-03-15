/**
 * @fileoverview Profile Mappers — Platform-agnostic data transformers
 * @module @nxt1/ui/profile
 *
 * Converts raw API types (from @nxt1/core) into the UI types consumed by
 * ProfileService and the shell components.
 *
 * Single source of truth: ALL ProfileUser fields are derived exclusively
 * from the shared `User` model (packages/core/src/models/user.model.ts).
 * No fields are invented or duplicated here.
 *
 * Shared between web and mobile apps — no platform code here.
 */

import type {
  User,
  UserAward,
  TeamHistoryEntry,
  DataVerification,
  ProfilePageData,
  ProfileUser,
  ProfileUserRole,
  ProfileSport,
  ProfileAward,
  ProfileTeamAffiliation,
  ProfileTeamType,
  ProfileSchool,
  ProfileContact,
  ProfileCoachContact,
  ProfileConnectedSource,
  AthleticStat,
  AthleticStatsCategory,
  ProfileRecruitingActivity,
  ProfileRecruitingCategory,
  VerifiedStat,
  VerifiedMetric,
  RecruitingActivity,
  ProfileSeasonGameLog,
} from '@nxt1/core';
import { isTeamRole, isAthleteRole, USER_ROLES } from '@nxt1/core';

// ─── helpers ─────────────────────────────────────────────────────────────────
/** Map a UserAward (User model) → ProfileAward (UI model). */
function mapAward(award: UserAward, index: number): ProfileAward {
  return {
    id: (award as unknown as { id?: string }).id ?? `award-${index}`,
    title: award.title,
    issuer: award.issuer,
    season: award.season,
    sport: award.sport,
  };
}

/** Map a TeamHistoryEntry (User model) → ProfileTeamAffiliation (UI model). */
function mapTeamHistory(entry: TeamHistoryEntry): ProfileTeamAffiliation {
  const location = entry.location
    ? [entry.location.city, entry.location.state].filter(Boolean).join(', ')
    : undefined;

  const seasonRecord =
    entry.record?.wins !== undefined && entry.record?.losses !== undefined
      ? entry.record.ties
        ? `${entry.record.wins}-${entry.record.losses}-${entry.record.ties}`
        : `${entry.record.wins}-${entry.record.losses}`
      : undefined;

  return {
    name: entry.name,
    type: (entry.type as ProfileTeamType | undefined) ?? 'other',
    logoUrl: entry.logoUrl,
    location,
    seasonRecord,
    wins: entry.record?.wins,
    losses: entry.record?.losses,
    ties: entry.record?.ties,
    sport: entry.sport,
  };
}

/** Map a User.connectedSources entry → ProfileConnectedSource (UI model). */
function mapConnectedSource(
  src: NonNullable<User['connectedSources']>[number]
): ProfileConnectedSource {
  return {
    platform: src.platform,
    profileUrl: src.profileUrl,
    lastSyncedAt:
      src.lastSyncedAt instanceof Date
        ? src.lastSyncedAt.toISOString()
        : (src.lastSyncedAt ?? undefined),
    syncStatus: src.syncStatus,
    syncedFields: src.syncedFields ? [...src.syncedFields] : undefined,
  };
}

/** Convert Date | string | undefined to ISO string, falling back to `now`. */
function toIso(v: Date | string | undefined, now: string): string {
  if (!v) return now;
  return v instanceof Date ? v.toISOString() : v;
}

/** Convert a value to a display string, appending unit when present. */
function formatStatValue(value: string | number | undefined, unit?: string): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  return unit ? `${str} ${unit}` : str;
}

/** Capitalize first letter of a string. */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Convert VerifiedStat[] → AthleticStatsCategory[] grouped by category.
 * Used for the Stats tab.
 */
function verifiedStatsToCategories(stats: VerifiedStat[]): AthleticStatsCategory[] {
  const groups = new Map<string, AthleticStat[]>();
  for (const stat of stats) {
    const key = capitalize(stat.category ?? 'general');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      label: stat.label,
      value: formatStatValue(stat.value),
      unit: stat.unit,
      verified: stat.verified,
    });
  }
  return Array.from(groups.entries()).map(([name, s]) => ({ name, stats: s }));
}

/**
 * Convert VerifiedMetric[] → AthleticStatsCategory[] grouped by category.
 * Used for the Metrics tab.
 */
function verifiedMetricsToCategories(metrics: VerifiedMetric[]): AthleticStatsCategory[] {
  const groups = new Map<string, AthleticStat[]>();
  for (const metric of metrics) {
    const key = capitalize(metric.category ?? 'general');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      label: metric.label,
      value: formatStatValue(metric.value),
      unit: metric.unit,
      verified: metric.verified,
    });
  }
  return Array.from(groups.entries()).map(([name, s]) => ({ name, stats: s }));
}

/** Convert RecruitingActivity → ProfileRecruitingActivity. */
function recruitingActivityToProfile(activity: RecruitingActivity): ProfileRecruitingActivity {
  const now = new Date().toISOString();
  return {
    id: activity.id,
    category: activity.category as ProfileRecruitingCategory,
    collegeName: activity.collegeName,
    collegeLogoUrl: activity.collegeLogoUrl,
    division: activity.division,
    conference: activity.conference,
    city: activity.city,
    state: activity.state,
    sport: activity.sport,
    date: toIso(activity.date as Date | string | undefined, now),
    endDate: activity.endDate
      ? toIso(activity.endDate as Date | string | undefined, now)
      : undefined,
    scholarshipType: activity.scholarshipType,
    visitType: activity.visitType,
    commitmentStatus: activity.commitmentStatus,
    announcedAt: activity.announcedAt
      ? toIso(activity.announcedAt as Date | string | undefined, now)
      : undefined,
    coachName: activity.coachName,
    coachTitle: activity.coachTitle,
    notes: activity.notes,
    graphicUrl: activity.graphicUrl,
    verified: activity.verified,
  };
}

// ─── main mapper ─────────────────────────────────────────────────────────────

/**
 * Transform a raw API `User` object into the `ProfilePageData` shape
 * expected by UIProfileService / ProfileShellComponent.
 *
 * Field mapping follows the canonical `User` model from
 * packages/core/src/models/user.model.ts — no field names are invented here.
 *
 * @param user         - Raw User from the backend API
 * @param isOwnProfile - Whether the viewer owns this profile
 */
export function userToProfilePageData(user: User, isOwnProfile: boolean): ProfilePageData {
  const now = new Date().toISOString();
  // Firestore documents expose 'uid' on the deserialized object; the REST API
  // uses 'id'. Accept either.
  const uid = (user as unknown as { uid?: string }).uid ?? user.id;

  // ── Active sport ──────────────────────────────────────────────────────────
  const activeSportIndex = user.activeSportIndex ?? 0;
  const activeSport = user.sports?.[activeSportIndex];

  // ── Primary sport (ProfileSport) ──────────────────────────────────────────
  const primarySport: ProfileSport | undefined = activeSport
    ? {
        name: activeSport.sport ?? 'Sport',
        icon: (activeSport.sport ?? 'sport').toLowerCase().replace(/\s+/g, '-'),
        position: activeSport.positions?.[0],
        secondaryPositions: activeSport.positions?.slice(1),
        jerseyNumber: activeSport.jerseyNumber,
      }
    : undefined;

  // ── Additional sports ─────────────────────────────────────────────────────
  const additionalSports: ProfileSport[] = (user.sports ?? [])
    .filter((_, i) => i !== activeSportIndex)
    .map((s) => ({
      name: s.sport ?? 'Sport',
      icon: (s.sport ?? 'sport').toLowerCase().replace(/\s+/g, '-'),
      position: s.positions?.[0],
      secondaryPositions: s.positions?.slice(1),
      jerseyNumber: s.jerseyNumber,
    }));

  // ── Location — "City, State" string ───────────────────────────────────────
  const location = user.location
    ? [user.location.city, user.location.state].filter(Boolean).join(', ')
    : undefined;

  // ── School (from active sport's team) ────────────────────────────────────
  const teamInfo = activeSport?.team;
  const school: ProfileSchool | undefined = teamInfo?.name
    ? {
        name: teamInfo.name,
        type: (teamInfo.type as ProfileTeamType | undefined) ?? 'high-school',
        logoUrl: teamInfo.logo ?? undefined,
      }
    : undefined;

  // ── Team affiliations (from User.teamHistory) ─────────────────────────────
  const teamAffiliations: readonly ProfileTeamAffiliation[] | undefined = user.teamHistory?.length
    ? user.teamHistory.map(mapTeamHistory)
    : undefined;

  // ── Awards (from User.awards) ─────────────────────────────────────────────
  const awards: readonly ProfileAward[] | undefined = user.awards?.length
    ? user.awards.map(mapAward)
    : undefined;

  // ── Contact (from User.contact) ───────────────────────────────────────────
  const contact: ProfileContact | undefined = user.contact?.email
    ? { email: user.contact.email, phone: user.contact.phone ?? undefined }
    : undefined;

  // ── Coach contact (from active sport's coach field) ────────────────────────
  // User.sports[n].coach: CoachContact → ProfileCoachContact
  const coachContact: ProfileCoachContact | undefined = activeSport?.coach?.firstName
    ? {
        firstName: activeSport.coach.firstName,
        lastName: activeSport.coach.lastName,
        email: activeSport.coach.email ?? undefined,
        phone: activeSport.coach.phone ?? undefined,
        title: activeSport.coach.title ?? undefined,
      }
    : undefined;

  // ── Connected sources (from User.connectedSources) ────────────────────────
  const connectedSources: readonly ProfileConnectedSource[] | undefined = user.connectedSources
    ?.length
    ? user.connectedSources.map(mapConnectedSource)
    : undefined;

  // ── Measurables / stats verification (from active sport's verification) ─────
  // Prefer the new agnostic `verifications[]` array; fall back to deprecated fields.
  const sportVerif = activeSport?.verification;
  const measurablesVerifiedBy = sportVerif?.measurablesVerifiedBy ?? undefined;
  const measurablesVerifiedUrl = sportVerif?.measurablesVerifiedUrl ?? undefined;
  const statsVerifiedBy = sportVerif?.statsVerifiedBy ?? undefined;
  const statsVerifiedUrl = sportVerif?.statsVerifiedUrl ?? undefined;

  // Agnostic section-level verifications (2026 architecture).
  // Merge sport-level verifications into the ProfileUser.verifications array.
  const verifications: readonly DataVerification[] | undefined = activeSport?.verifications?.length
    ? (activeSport.verifications as DataVerification[])
    : undefined;

  // ── Academic data (User.athlete.academics) ─────────────────────────────────
  const academics = user.athlete?.academics;
  const gpa = academics?.gpa !== undefined ? String(academics.gpa) : undefined;
  const sat = academics?.satScore !== undefined ? String(academics.satScore) : undefined;
  const act = academics?.actScore !== undefined ? String(academics.actScore) : undefined;

  // ── Role-derived fields ────────────────────────────────────────────────────
  const isRecruiterRole = user.role === USER_ROLES.RECRUITER;
  const userIsTeamRole = isTeamRole(user.role);
  const userIsAthleteRole = isAthleteRole(user.role);

  // College team name: for recruiters (college coaches) use their institution; for athletes
  // with a college affiliation use the college sport team name.
  const collegeTeamName: string | undefined = isRecruiterRole
    ? (user.recruiter?.institution ?? undefined)
    : (user.sports?.find((s) => s.team?.type === 'college')?.team?.name ?? undefined);

  // Title: coaches, recruiters, and directors carry a role-specific title field.
  const title: string | undefined =
    user.coach?.title ?? user.recruiter?.title ?? user.director?.title ?? undefined;

  // ── Profile images ────────────────────────────────────────────────────────
  const bannerImg = user.bannerImg ?? undefined;
  // Carousel: use profileImgs array (new)
  const profileImgs: readonly string[] = user.profileImgs?.length ? user.profileImgs : [];
  // Primary profile image: first from array or undefined
  const profileImg = profileImgs[0] ?? undefined;

  // ── Counters (from User._counters) ────────────────────────────────────────
  const counters = user._counters;

  // ── Assemble ProfileUser ───────────────────────────────────────────────────
  const profileUser: ProfileUser = {
    uid,
    profileCode: user.profileCode ?? user.unicode ?? uid,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    displayName: user.displayName,

    // Images
    profileImg,
    bannerImg,
    profileImgs,

    // Role
    role: (user.role ?? 'athlete') as unknown as ProfileUserRole,
    isRecruit: userIsAthleteRole || !user.role,
    isCollegeCoach: isRecruiterRole,
    isTeamManager: userIsTeamRole,

    // Status
    verificationStatus: user.verificationStatus ?? 'unverified',

    // Bio
    aboutMe: user.aboutMe ?? activeSport?.aboutMe,

    // Sports
    primarySport,
    additionalSports: additionalSports.length ? additionalSports : undefined,

    // School / team
    school,
    teamAffiliations,
    collegeTeamName,

    // Physical attributes
    classYear: user.classOf?.toString(),
    height: user.height,
    weight: user.weight,

    // Verification — deprecated flat fields (sport.verification)
    measurablesVerifiedBy,
    measurablesVerifiedUrl,
    statsVerifiedBy,
    statsVerifiedUrl,

    // Verification — agnostic array (2026 architecture)
    verifications,

    // Academics
    gpa,
    sat,
    act,

    // Location
    location,

    // Contact
    contact,
    coachContact,
    connectedSources,

    // Awards
    awards,

    // Coach/director role title
    title,

    // Timestamps
    createdAt: toIso(user.createdAt as Date | string | undefined, now),
    updatedAt: toIso(user.updatedAt as Date | string | undefined, now),
  };

  // ── Tab data from sports[0] embedded fields ────────────────────────────────
  // These fields are seeded / kept in sync directly on the User doc to avoid
  // sub-collection reads on every profile page load.

  const sportAny = activeSport as unknown as Record<string, unknown> | undefined;

  const athleticStats: AthleticStatsCategory[] =
    sportAny?.['verifiedStats'] && Array.isArray(sportAny['verifiedStats'])
      ? verifiedStatsToCategories(sportAny['verifiedStats'] as VerifiedStat[])
      : [];

  const metrics: AthleticStatsCategory[] =
    sportAny?.['verifiedMetrics'] && Array.isArray(sportAny['verifiedMetrics'])
      ? verifiedMetricsToCategories(sportAny['verifiedMetrics'] as VerifiedMetric[])
      : activeSport?.verifiedMetrics?.length
        ? verifiedMetricsToCategories(activeSport.verifiedMetrics)
        : [];

  // Events are now ONLY loaded from the dedicated /schedule API endpoint.
  // Do NOT extract embedded upcomingEvents to prevent data flash/inconsistency.
  // const events: ProfileEvent[] = [];

  const recruitingActivity: ProfileRecruitingActivity[] =
    sportAny?.['recruitingActivities'] && Array.isArray(sportAny['recruitingActivities'])
      ? (sportAny['recruitingActivities'] as RecruitingActivity[]).map(recruitingActivityToProfile)
      : [];

  const gameLog: readonly ProfileSeasonGameLog[] =
    sportAny?.['verifiedGameLog'] && Array.isArray(sportAny['verifiedGameLog'])
      ? (sportAny['verifiedGameLog'] as ProfileSeasonGameLog[])
      : [];

  return {
    user: profileUser,
    aboutMe: profileUser.aboutMe ?? '',
    followStats: {
      followersCount: counters?.followersCount ?? 0,
      followingCount: counters?.followingCount ?? 0,
      isFollowing: false,
      isFollowedBy: false,
    },
    quickStats: {
      profileViews: counters?.profileViews ?? 0,
      videoViews: counters?.videoViews ?? 0,
      totalPosts: counters?.postsCount ?? 0,
      highlightCount: counters?.highlightCount ?? 0,
      offerCount: counters?.offerCount ?? 0,
      eventCount: counters?.eventCount ?? 0,
      collegeInterestCount: 0,
      shareCount: counters?.sharesCount ?? 0,
    },
    athleticStats: athleticStats.length ? athleticStats : undefined,
    metrics: metrics.length ? metrics : undefined,
    // events: removed — now ONLY from dedicated /schedule API
    events: undefined,
    gameLog: gameLog.length ? gameLog : undefined,
    recruitingActivity: recruitingActivity.length ? recruitingActivity : undefined,
    // recentPosts is no longer embedded — loaded separately from the timeline sub-collection
    recentPosts: [],
    isOwnProfile,
    canEdit: isOwnProfile,
  };
}
