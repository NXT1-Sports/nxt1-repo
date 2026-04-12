#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 2 — Legacy User Migration (nxt-1-de054 → V3 Schema)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Migrates every legacy Users document from the `nxt-1-de054` project into the
 * V3 `users` collection on the target project (staging or production).
 *
 * This is the BIGGEST and most critical script.  It implements all 14 field-
 * mapping categories (A–N) from the migration plan.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run --limit=50
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --target=production --verbose
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --resume
 *
 * Flags:
 *   --dry-run       Transform & log but write nothing
 *   --limit=N       Process at most N legacy docs
 *   --target=       staging (default) | production
 *   --verbose       Print per-user transform detail
 *   --resume        Start after last migrated user (by createdAt)
 *   --legacy-sa=    Override path to legacy service account JSON
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  getLimit,
  hasFlag,
  PAGE_SIZE,
  COLLECTIONS,
  BatchWriter,
  ProgressReporter,
  printBanner,
  printSummary,
  writeReport,
  formatNum,
  toISOString,
  cleanString,
  cleanEmail,
  parseNum,
  parseInt_,
  humanize,
  normalizeRole,
  migrationMeta,
  safeJsonParse,
} from './migration-utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape we need out of legacy doc data (untyped Firestore doc). */
interface LegacyUser {
  [key: string]: unknown;
}

interface TransformResult {
  user: Record<string, unknown>;
  warnings: string[];
}

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  warnings: number;
  roleBreakdown: Record<string, number>;
  sportBreakdown: Record<string, number>;
  formatBreakdown: { v1: number; v2: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Height/weight field names that belong at root `measurables[]` not per-sport */
const ROOT_MEASURABLE_FIELDS = new Set([
  'height',
  'weight',
  'wingspan',
  'armLength',
  'handSize',
  'reach',
]);

/**
 * Determine if a legacy doc is V2 format (already has nested objects)
 * vs V1 format (all flat fields).
 */
function isV2Format(d: LegacyUser): boolean {
  return (
    Array.isArray(d['sports']) &&
    (d['sports'] as unknown[]).length > 0 &&
    typeof (d['sports'] as unknown[])[0] === 'object'
  );
}

const LEGACY_BUCKET = process.env['LEGACY_FIREBASE_STORAGE_BUCKET'] || 'nxt-1-de054.appspot.com';
const STAGING_BUCKET =
  process.env['STAGING_FIREBASE_STORAGE_BUCKET'] || 'nxt-1-staging-v2.firebasestorage.app';

/**
 * Rewrite a Firebase Storage URL from legacy bucket → staging bucket.
 * Handles both URL formats:
 *   https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/...
 *   https://storage.googleapis.com/nxt-1-de054.appspot.com/...
 * Returns the original URL unchanged if it's not a legacy storage URL.
 */
function rewriteStorageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(
      `https://firebasestorage.googleapis.com/v0/b/${LEGACY_BUCKET}/`,
      `https://firebasestorage.googleapis.com/v0/b/${STAGING_BUCKET}/`
    )
    .replace(
      `https://storage.googleapis.com/${LEGACY_BUCKET}/`,
      `https://storage.googleapis.com/${STAGING_BUCKET}/`
    );
}

/** Apply rewriteStorageUrl to an array of URLs */
function rewriteStorageUrls(urls: string[]): string[] {
  return urls.map((u) => rewriteStorageUrl(u) ?? u);
}

/** Safely extract a nested value: get(data, 'social.hudl') */
function deepGet(obj: LegacyUser, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Build a slug-style username from name parts.
 * 'John' + 'Smith' + 2026 → 'john-smith-2026'
 */
function generateUsername(firstName: string, lastName: string, classOf?: unknown): string {
  const parts = [firstName, lastName]
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (classOf && typeof classOf === 'number') parts.push(String(classOf));
  else if (classOf && typeof classOf === 'string' && /^\d{4}$/.test(classOf)) parts.push(classOf);

  return parts.join('-') || 'user';
}

// ─── Core Transform ───────────────────────────────────────────────────────────

/**
 * Transform a single legacy user document into the V3 User shape.
 * Implements mapping categories A → N from the migration plan.
 */
function transformLegacyUser(docId: string, d: LegacyUser): TransformResult {
  const warnings: string[] = [];
  const v2 = isV2Format(d);

  // ─── A. Core Identity ───────────────────────────────────────────────
  const email = cleanEmail(d['email']) || '';
  const firstName = cleanString(d['firstName']) || 'Unknown';
  const lastName = cleanString(d['lastName']) || '';
  const displayName =
    cleanString(d['displayName']) || [firstName, lastName].filter(Boolean).join(' ');
  const unicode = cleanString(d['unicode']) || '';
  const username = unicode || generateUsername(firstName, lastName, d['classOf']);

  const profileImg = rewriteStorageUrl(cleanString(d['profileImg']));
  const profileImgs: string[] = profileImg ? [profileImg] : [];

  // ─── B. Role Mapping ────────────────────────────────────────────────
  const rawRole = cleanString(d['athleteOrParentOrCoach']) || cleanString(d['role']) || 'athlete';
  let role = normalizeRole(rawRole);

  // isCollegeCoach override → recruiter
  if (d['isCollegeCoach'] === true) {
    role = 'recruiter';
  }

  // ─── C. Sports Array (CRITICAL) ────────────────────────────────────
  const sports: Record<string, unknown>[] = [];

  if (v2 && Array.isArray(d['sports'])) {
    // V2 format: map existing sports[] to V3 SportProfile shape
    for (let i = 0; i < (d['sports'] as unknown[]).length; i++) {
      const s = (d['sports'] as Record<string, unknown>[])[i];
      if (!s || typeof s !== 'object') continue;
      sports.push(mapV2Sport(s, i, d, warnings));
    }
  } else {
    // V1 format: build sports[0] from flat primary fields
    const primarySport = cleanString(d['primarySport']);
    if (primarySport) {
      sports.push(
        buildSportProfile(
          {
            sport: primarySport,
            positions: d['primarySportPositions'],
            athleticInfo: d['primarySportAthleticInfo'],
            stats: d['primarySportStats'],
            gameStats: d['primarySportGameStats'],
            profileImg: rewriteStorageUrl(cleanString(d['primarySportProfileImg']) || profileImg),
            level: cleanString(d['level']),
            side: d['side'],
          },
          /* order */ 0,
          d,
          warnings
        )
      );
    }

    // Build sports[1] from secondary fields
    const secondarySport = cleanString(d['secondarySport']);
    if (secondarySport) {
      sports.push(
        buildSportProfile(
          {
            sport: secondarySport,
            positions: d['secondarySportPositions'],
            athleticInfo: d['secondarySportAthleticInfo'],
            stats: d['secondarySportStats'],
            gameStats: d['secondarySportGameStats'],
            profileImg: undefined,
            level: undefined,
            side: undefined,
          },
          /* order */ 1,
          d,
          warnings
        )
      );
    }
  }

  if (sports.length === 0 && role === 'athlete') {
    warnings.push('Athlete has no sport data');
  }

  // ─── D. Measurables (root-level) ───────────────────────────────────
  const measurables = extractRootMeasurables(d, v2);

  // ─── E. Location & Contact ─────────────────────────────────────────
  const location = buildLocation(d, v2);
  const contact = buildContact(d, v2, email);
  const preferredContactMethod = cleanString(d['preferredContactMethod']) || undefined;

  // ─── F. Academics ──────────────────────────────────────────────────
  const academics = buildAcademics(d);
  const classOf =
    d['classOf'] !== undefined && d['classOf'] !== null
      ? typeof d['classOf'] === 'number'
        ? d['classOf']
        : parseInt_(d['classOf'])
      : undefined;

  // ─── G. Team History ───────────────────────────────────────────────
  const teamHistory = buildTeamHistory(d);

  // ─── H. Connected Sources & Emails ─────────────────────────────────
  const connectedSources = buildConnectedSources(d);
  const connectedEmails = buildConnectedEmails(d, email);

  // ─── I. Social Links → extra ConnectedSources ──────────────────────
  const socialSources = buildSocialSources(d);
  connectedSources.push(...socialSources);

  // ─── J. Preferences ────────────────────────────────────────────────
  const preferences = buildPreferences(d);

  // ─── K. Counters ───────────────────────────────────────────────────
  const _counters: Record<string, unknown> = {
    profileViews: parseNum(d['profileViews']) ?? 0,
    videoViews: parseNum(d['videoViews']) ?? 0,
    postsCount: 0,
    sharesCount: 0,
    highlightCount: 0,
    offerCount: 0,
    eventCount: 0,
  };

  // ─── L. Timestamps ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const createdAt = toISOString(d['createdAt']) || now;
  const updatedAt = toISOString(d['lastUpdated']) || toISOString(d['updatedAt']) || now;
  const lastLoginAt = toISOString(d['lastLoginTime']) || toISOString(d['lastLoginAt']) || undefined;

  // ─── B (cont). Role-specific data blocks ───────────────────────────
  const roleData = buildRoleSpecificData(d, role, academics, warnings);

  // ─── M. Migration Metadata ─────────────────────────────────────────
  const meta = migrationMeta(docId, COLLECTIONS.LEGACY_USERS);

  // ─── Assemble V3 User ──────────────────────────────────────────────
  const user: Record<string, unknown> = {
    // A — Identity
    id: docId,
    email,
    emailVerified: true,
    firstName,
    lastName,
    displayName,
    username,
    unicode,
    aboutMe: cleanString(d['aboutMe']) || '',
    bannerImg: rewriteStorageUrl(cleanString(d['bannerImg'])) || null,
    profileImgs: rewriteStorageUrls(profileImgs),
    gender: cleanString(d['gender']) || undefined,

    // B — Role & Status
    role,
    status: 'active',

    // C — Sports
    sports,
    activeSportIndex: typeof d['activeSportIndex'] === 'number' ? d['activeSportIndex'] : 0,

    // D — Measurables
    measurables,

    // E — Location & Contact
    location,
    contact,
    ...(preferredContactMethod ? { preferredContactMethod } : {}),

    // F — Academics & ClassOf
    ...(academics ? { academics } : {}),
    ...(classOf !== undefined ? { classOf } : {}),

    // G — Team History
    teamHistory,

    // H+I — Connected Sources & Emails
    connectedSources,
    connectedEmails,

    // Role-specific blocks
    ...roleData,

    // Verification (defaults for migrated users)
    verificationStatus: cleanString(d['verificationStatus']) || 'unverified',

    // Profile code
    ...(d['profileCode'] ? { profileCode: d['profileCode'] } : {}),

    // Team code (kept for backward compatibility)
    ...(d['teamCode'] ? { teamCode: d['teamCode'] } : {}),

    // Onboarding (migrated users considered onboarded)
    onboardingCompleted: d['onboardingCompleted'] === true || true,

    // J — Preferences
    preferences,

    // K — Counters
    _counters,

    // L — Timestamps
    createdAt,
    updatedAt,
    lastLoginAt,

    // M — Meta
    ...meta,
  };

  // Strip undefined values (Firestore doesn't accept explicit undefined)
  stripUndefined(user);

  return { user, warnings };
}

// ─── Sub-transforms ───────────────────────────────────────────────────────────

/**
 * Build a SportProfile from flat V1 legacy fields.
 */
function buildSportProfile(
  params: {
    sport: string;
    positions: unknown;
    athleticInfo: unknown;
    stats: unknown;
    gameStats: unknown;
    profileImg: string | undefined;
    level: string | undefined;
    side: unknown;
  },
  order: number,
  d: LegacyUser,
  warnings: string[]
): Record<string, unknown> {
  const sport = params.sport.toLowerCase().trim();
  const positions = normalizePositions(params.positions);

  // ── Metrics → verifiedMetrics (per-sport, excluding root measurables)
  const verifiedMetrics = buildVerifiedMetrics(params.athleticInfo);

  // ── Team info
  const teamName =
    order === 0
      ? cleanString(d['highSchool']) || cleanString(d['club']) || cleanString(d['teamName'])
      : cleanString(d['secondaryHighSchool']) || undefined;
  const suffix = cleanString(d['highSchoolSuffix']);
  const teamType = suffix === 'Club' ? 'club' : 'high-school';

  const team: Record<string, unknown> | undefined = teamName
    ? {
        name: teamName,
        type: teamType,
        logoUrl: rewriteStorageUrl(cleanString(d['teamLogoImg'])) || undefined,
        mascot: cleanString(d['mascot']) || undefined,
        primaryColor: cleanString(d['teamColor1']) || undefined,
        secondaryColor: cleanString(d['teamColor2']) || undefined,
      }
    : undefined;

  // ── Coach contact (primary sport only)
  const coachFirstName = cleanString(d['coachFirstName']);
  const coach: Record<string, unknown> | undefined =
    order === 0 && coachFirstName
      ? {
          firstName: coachFirstName,
          lastName: cleanString(d['coachLastName']) || '',
          email: cleanEmail(d['coachEmail']) || undefined,
          phone: cleanString(d['coachPhoneNumber']) || undefined,
        }
      : undefined;

  // ── Season record
  const rawSeason = d['seasonRecord'];
  const seasonRecord =
    rawSeason && typeof rawSeason === 'object'
      ? {
          wins: parseNum((rawSeason as Record<string, unknown>)['wins']) ?? 0,
          losses: parseNum((rawSeason as Record<string, unknown>)['losses']) ?? 0,
          ties: parseNum((rawSeason as Record<string, unknown>)['ties']) ?? 0,
          season: cleanString((rawSeason as Record<string, unknown>)['season']) || undefined,
        }
      : undefined;

  // ── Recruiting summary (denormalized counters)
  const recruiting = buildRecruitingSummary(d, order, warnings);

  // ── Primary video
  const pinnedVideo = rewriteStorageUrl(cleanString(d['pinnedProfileVideo']));
  const primaryVideo = pinnedVideo ? { url: pinnedVideo } : undefined;

  const now = new Date().toISOString();

  const profile: Record<string, unknown> = {
    sport,
    order,
    profileImg: rewriteStorageUrl(params.profileImg) || undefined,
    positions,
    level: params.level || undefined,
    side: normalizeSide(params.side),
    verifiedMetrics,
    ...(team ? { team } : {}),
    ...(coach ? { coach } : {}),
    ...(seasonRecord ? { seasonRecord } : {}),
    ...(recruiting ? { recruiting } : {}),
    ...(primaryVideo ? { primaryVideo } : {}),
    createdAt: toISOString(d['createdAt']) || now,
    updatedAt: now,
  };

  stripUndefined(profile);
  return profile;
}

/**
 * Map a V2 sport object (already partially nested) to V3 SportProfile.
 */
function mapV2Sport(
  s: Record<string, unknown>,
  index: number,
  d: LegacyUser,
  warnings: string[]
): Record<string, unknown> {
  const sport = cleanString(s['sport'])?.toLowerCase() || 'unknown';
  const positions = normalizePositions(s['positions']);
  const now = new Date().toISOString();

  // V2 may already have verifiedMetrics or need them built from athleticInfo
  let verifiedMetrics: Record<string, unknown>[] = [];
  if (Array.isArray(s['verifiedMetrics'])) {
    verifiedMetrics = (s['verifiedMetrics'] as Record<string, unknown>[]).filter(
      (m) => m && typeof m === 'object'
    );
  } else if (s['athleticInfo'] && typeof s['athleticInfo'] === 'object') {
    verifiedMetrics = buildVerifiedMetrics(s['athleticInfo']);
  }

  // Map team (V2 may have team as nested object already)
  const team = s['team'] && typeof s['team'] === 'object' ? s['team'] : undefined;

  // Map coach
  const coach = s['coach'] && typeof s['coach'] === 'object' ? s['coach'] : undefined;

  // Map seasonRecord
  const seasonRecord =
    s['seasonRecord'] && typeof s['seasonRecord'] === 'object' ? s['seasonRecord'] : undefined;

  // Map recruiting
  const recruiting =
    s['recruiting'] && typeof s['recruiting'] === 'object'
      ? s['recruiting']
      : index === 0
        ? buildRecruitingSummary(d, 0, warnings)
        : undefined;

  // Primary video
  const primaryVideo =
    s['primaryVideo'] && typeof s['primaryVideo'] === 'object' ? s['primaryVideo'] : undefined;

  const profile: Record<string, unknown> = {
    sport,
    order: typeof s['order'] === 'number' ? s['order'] : index,
    profileImg: rewriteStorageUrl(cleanString(s['profileImg'])) || undefined,
    positions,
    level: cleanString(s['level']) || undefined,
    side: normalizeSide(s['side']),
    verifiedMetrics,
    ...(team ? { team } : {}),
    ...(coach ? { coach } : {}),
    ...(seasonRecord ? { seasonRecord } : {}),
    ...(recruiting ? { recruiting } : {}),
    ...(primaryVideo ? { primaryVideo } : {}),
    createdAt: toISOString(s['createdAt']) || toISOString(d['createdAt']) || now,
    updatedAt: now,
  };

  stripUndefined(profile);
  return profile;
}

/**
 * Build verifiedMetrics[] from a legacy athleticInfo map.
 * Excludes root measurables (height/weight) — those go to User.measurables[].
 */
function buildVerifiedMetrics(athleticInfo: unknown): Record<string, unknown>[] {
  if (!athleticInfo || typeof athleticInfo !== 'object') return [];

  const metrics: Record<string, unknown>[] = [];
  const info = athleticInfo as Record<string, unknown>;

  for (const [field, value] of Object.entries(info)) {
    // Skip root measurable fields — they go to User.measurables[]
    if (ROOT_MEASURABLE_FIELDS.has(field)) continue;
    // Skip empty/null values
    if (value === null || value === undefined || value === '') continue;

    metrics.push({
      id: `${field}_legacy`,
      field,
      label: humanize(field),
      value: typeof value === 'number' ? value : String(value),
      source: 'legacy-import',
      verified: false,
    });
  }

  return metrics;
}

/**
 * Extract root-level measurables (height, weight) from athleticInfo.
 */
function extractRootMeasurables(d: LegacyUser, v2: boolean): Record<string, unknown>[] {
  const measurables: Record<string, unknown>[] = [];

  // If V2 format and already has measurables[], pass through
  if (v2 && Array.isArray(d['measurables'])) {
    return (d['measurables'] as Record<string, unknown>[]).filter(
      (m) => m && typeof m === 'object'
    );
  }

  // V1: extract from primarySportAthleticInfo
  const info = d['primarySportAthleticInfo'] as Record<string, unknown> | undefined;
  if (!info || typeof info !== 'object') return [];

  for (const field of ROOT_MEASURABLE_FIELDS) {
    const value = info[field];
    if (value === null || value === undefined || value === '') continue;

    measurables.push({
      id: `${field}_legacy`,
      field,
      label: humanize(field),
      value: typeof value === 'number' ? value : String(value),
      source: 'legacy-import',
      verified: false,
    });
  }

  return measurables;
}

/**
 * Build the Location object from flat or nested legacy fields.
 */
function buildLocation(d: LegacyUser, v2: boolean): Record<string, unknown> {
  // V2 users may already have nested location
  if (v2 && d['location'] && typeof d['location'] === 'object') {
    const loc = d['location'] as Record<string, unknown>;
    return {
      city: cleanString(loc['city']) || '',
      state: cleanString(loc['state']) || '',
      country: cleanString(loc['country']) || 'US',
      address: cleanString(loc['address']) || undefined,
      zipCode: loc['zipCode'] ? String(loc['zipCode']) : undefined,
    };
  }

  // V1: flat fields
  return {
    city: cleanString(d['city']) || '',
    state: cleanString(d['state']) || '',
    country: cleanString(d['country']) || 'US',
    address: cleanString(d['address']) || undefined,
    zipCode: d['zipCode'] ? String(d['zipCode']) : undefined,
  };
}

/**
 * Build the ContactInfo object from flat or nested legacy fields.
 */
function buildContact(d: LegacyUser, v2: boolean, fallbackEmail: string): Record<string, unknown> {
  // V2 users may already have nested contact
  if (v2 && d['contact'] && typeof d['contact'] === 'object') {
    const c = d['contact'] as Record<string, unknown>;
    return {
      email: cleanEmail(c['email']) || fallbackEmail,
      phone: cleanString(c['phone']) || undefined,
    };
  }

  // V1: flat fields
  return {
    email: cleanEmail(d['contactEmail']) || fallbackEmail,
    phone: cleanString(d['phoneNumber']) || undefined,
  };
}

/**
 * Build AcademicInfo from legacy academicInfo object.
 */
function buildAcademics(d: LegacyUser): Record<string, unknown> | undefined {
  const info = d['academicInfo'] as Record<string, unknown> | undefined;
  if (!info || typeof info !== 'object') return undefined;

  const gpa = parseNum(info['gpa']);
  const satScore = parseInt_(info['sat']);
  const actScore = parseInt_(info['act']);

  // Only return if at least one field has data
  if (gpa === undefined && satScore === undefined && actScore === undefined) return undefined;

  const result: Record<string, unknown> = {};
  if (gpa !== undefined) result['gpa'] = gpa;
  if (satScore !== undefined) result['satScore'] = satScore;
  if (actScore !== undefined) result['actScore'] = actScore;
  return result;
}

/**
 * Build teamHistory[] from legacy flat team fields.
 */
function buildTeamHistory(d: LegacyUser): Record<string, unknown>[] {
  const history: Record<string, unknown>[] = [];

  // Primary team (highSchool or club)
  const highSchool = cleanString(d['highSchool']);
  const suffix = cleanString(d['highSchoolSuffix']);
  if (highSchool) {
    const entry: Record<string, unknown> = {
      name: highSchool,
      type: suffix === 'Club' ? 'club' : 'high-school',
      isCurrent: true,
    };
    const sport = cleanString(d['primarySport']);
    if (sport) entry['sport'] = sport.toLowerCase();
    const state = cleanString(d['state']);
    const city = cleanString(d['city']);
    if (city || state) entry['location'] = { city: city || '', state: state || '' };
    if (d['teamLogoImg']) entry['logoUrl'] = rewriteStorageUrl(cleanString(d['teamLogoImg']));
    history.push(entry);
  }

  // Club team (if different from highSchool)
  const club = cleanString(d['club']);
  if (club && club !== highSchool) {
    const entry: Record<string, unknown> = {
      name: club,
      type: 'club',
      isCurrent: true,
    };
    const sport = cleanString(d['primarySport']);
    if (sport) entry['sport'] = sport.toLowerCase();
    history.push(entry);
  }

  // Secondary highSchool
  const secondaryHS = cleanString(d['secondaryHighSchool']);
  if (secondaryHS && secondaryHS !== highSchool) {
    history.push({
      name: secondaryHS,
      type: 'high-school',
      isCurrent: false,
    });
  }

  return history;
}

/**
 * Build connectedSources[] from legacy link fields.
 */
function buildConnectedSources(d: LegacyUser): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];

  // Hudl
  const hudl =
    cleanString(d['hudlAccountLink']) || cleanString(deepGet(d, 'social.hudl') as string);
  if (hudl) {
    sources.push({
      platform: 'hudl',
      profileUrl: hudl,
      syncStatus: 'idle',
      displayOrder: sources.length,
    });
  }

  // YouTube
  const youtube =
    cleanString(d['youtubeAccountLink']) || cleanString(deepGet(d, 'social.youtube') as string);
  if (youtube) {
    sources.push({
      platform: 'youtube',
      profileUrl: youtube,
      syncStatus: 'idle',
      displayOrder: sources.length,
    });
  }

  // MaxPreps
  const maxpreps = cleanString(d['sportsAccountLink']);
  if (maxpreps) {
    sources.push({
      platform: 'maxpreps',
      profileUrl: maxpreps,
      syncStatus: 'idle',
      displayOrder: sources.length,
    });
  }

  return sources;
}

/**
 * Build connectedEmails[] — metadata only, NO token migration.
 */
function buildConnectedEmails(d: LegacyUser, fallbackEmail: string): Record<string, unknown>[] {
  const emails: Record<string, unknown>[] = [];
  const createdAt = toISOString(d['createdAt']) || new Date().toISOString();

  // Gmail
  if (d['connectedGmailToken']) {
    const gmailEmail =
      cleanEmail(d['connectedGmailEmail']) || cleanEmail(d['contactEmail']) || fallbackEmail;
    emails.push({
      email: gmailEmail,
      provider: 'gmail',
      isActive: false, // Must re-auth
      connectedAt: createdAt,
    });
  }

  // Microsoft
  if (d['connectedMicrosoftToken']) {
    const msEmail = cleanEmail(d['connectedMicrosoftEmail']) || fallbackEmail;
    emails.push({
      email: msEmail,
      provider: 'microsoft',
      isActive: false, // Must re-auth
      connectedAt: createdAt,
    });
  }

  return emails;
}

/**
 * Build social connectedSources (Twitter, Instagram, TikTok).
 */
function buildSocialSources(d: LegacyUser): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];

  const socialMap: Array<{ field: string; nested: string; platform: string }> = [
    { field: 'twitter', nested: 'social.twitter', platform: 'twitter' },
    { field: 'instagram', nested: 'social.instagram', platform: 'instagram' },
    { field: 'tiktok', nested: 'social.tiktok', platform: 'tiktok' },
  ];

  for (const { field, nested, platform } of socialMap) {
    const url = cleanString(d[field]) || cleanString(deepGet(d, nested) as string);
    if (url) {
      sources.push({
        platform,
        profileUrl: url,
        syncStatus: 'idle',
        displayOrder: 100 + sources.length, // After primary sources
      });
    }
  }

  return sources;
}

/**
 * Build recruiting summary from denormalized legacy fields.
 * Only for primary sport (order === 0).
 */
function buildRecruitingSummary(
  d: LegacyUser,
  order: number,
  warnings: string[]
): Record<string, unknown> | undefined {
  if (order !== 0) return undefined;

  const isCommitted = d['isCommitted'] === true;
  const committedBy = d['committmentBy'] as Record<string, unknown> | undefined;

  // Parse offers JSON
  let offerCount = 0;
  const offersRaw = d['offers'];
  if (typeof offersRaw === 'string' && offersRaw.trim()) {
    const parsed = safeJsonParse<unknown[]>(offersRaw);
    if (parsed && Array.isArray(parsed)) {
      offerCount = parsed.length;
    } else {
      warnings.push(`Could not parse offers JSON (length=${offersRaw.length})`);
    }
  } else if (Array.isArray(offersRaw)) {
    offerCount = offersRaw.length;
  }

  const visitCount = Array.isArray(d['collegeVisits'])
    ? (d['collegeVisits'] as unknown[]).length
    : 0;
  const campCount = Array.isArray(d['collegeCamps']) ? (d['collegeCamps'] as unknown[]).length : 0;
  const interestCount = Array.isArray(d['collegeInterests'])
    ? (d['collegeInterests'] as unknown[]).length
    : 0;

  // Only produce a summary if there's any recruiting data
  if (
    !isCommitted &&
    offerCount === 0 &&
    visitCount === 0 &&
    campCount === 0 &&
    interestCount === 0 &&
    !d['rating'] &&
    !d['ratedBy']
  ) {
    return undefined;
  }

  const summary: Record<string, unknown> = {
    isCommitted,
    offerCount,
    interestCount,
    visitCount,
    campCount,
  };

  if (committedBy && typeof committedBy === 'object') {
    if (committedBy['name']) summary['committedTo'] = cleanString(committedBy['name'] as string);
    if (committedBy['logoUrl'])
      summary['committedLogoUrl'] = cleanString(committedBy['logoUrl'] as string);
  }

  if (d['rating']) summary['rating'] = d['rating'];
  if (d['ratedBy']) summary['ratedBy'] = d['ratedBy'];

  return summary;
}

/**
 * Build preferences from legacy boolean flags.
 */
function buildPreferences(d: LegacyUser): Record<string, unknown> {
  // Dismissed prompts: legacy boolean flags → prompt ID strings
  const dismissedPrompts: string[] = [];
  const promptFlags: Array<{ field: string; promptId: string }> = [
    { field: 'isShowedHowCollegeCreditWorks', promptId: 'college-credit-intro' },
    { field: 'isShowedFirstOpenCampaigns', promptId: 'first-open-campaigns' },
    { field: 'hasSeenFeedbackModal', promptId: 'feedback-modal' },
    { field: 'showedTrialMessage', promptId: 'trial-message' },
    { field: 'showedHearAbout', promptId: 'hear-about' },
  ];

  for (const { field, promptId } of promptFlags) {
    if (d[field] === true) dismissedPrompts.push(promptId);
  }

  return {
    notifications: {
      push: d['pushNotifications'] !== false, // default true
      email: true,
      sms: false,
      marketing: true,
    },
    activityTracking: d['activityTracking'] !== false, // default true
    analyticsTracking: true,
    biometricLogin: false,
    dismissedPrompts,
    defaultSportIndex: 0,
    theme: 'system',
    language: 'en',
  };
}

/**
 * Build role-specific data blocks (AthleteData, CoachData, RecruiterData, etc.)
 */
function buildRoleSpecificData(
  d: LegacyUser,
  role: string,
  academics: Record<string, unknown> | undefined,
  warnings: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (role === 'athlete') {
    const parentName = cleanString(d['parentName']);
    const parentEmail = cleanEmail(d['parentEmail']);
    const parentPhone = cleanString(d['parentPhone']);
    const parentRelationship = cleanString(d['parentRelationship']);

    const athleteData: Record<string, unknown> = {};
    if (academics) athleteData['academics'] = academics;

    if (parentName || parentEmail || parentPhone) {
      athleteData['parentInfo'] = {
        name: parentName || '',
        email: parentEmail || '',
        phone: parentPhone || '',
        relationship: parentRelationship || 'parent',
      };
    }

    const rawParentRole = cleanString(d['athleteOrParentOrCoach']) || cleanString(d['role']);
    if (rawParentRole?.toLowerCase() === 'parent') {
      // This is actually a parent user migrated as athlete — mark parent data
      if (!athleteData['parentInfo']) {
        athleteData['parentInfo'] = {
          name: [cleanString(d['firstName']), cleanString(d['lastName'])].filter(Boolean).join(' '),
          email: cleanEmail(d['email']) || '',
          phone: cleanString(d['phoneNumber']) || '',
          relationship: 'parent',
        };
      }
    }

    if (Object.keys(athleteData).length > 0) {
      result['athlete'] = athleteData;
    }

    // Also populate parent block if role was parent
    if (rawParentRole?.toLowerCase() === 'parent') {
      result['parent'] = {
        linkedAthleteIds: [],
      };
    }
  }

  if (role === 'coach') {
    const coachData: Record<string, unknown> = {
      title: cleanString(d['coachTitle']) || undefined,
      yearsExperience: parseNum(d['coachYearsExperience']) ?? undefined,
    };

    if (d['canManageMultipleTeams'] === true) {
      coachData['canManageMultipleTeams'] = true;
    }
    if (Array.isArray(d['managedTeamCodes'])) {
      coachData['managedTeamCodes'] = d['managedTeamCodes'];
    }
    if (Array.isArray(d['coachingSports'])) {
      coachData['coachingSports'] = d['coachingSports'];
    }

    stripUndefined(coachData);
    if (Object.keys(coachData).length > 0) {
      result['coach'] = coachData;
    }
  }

  if (role === 'recruiter' || d['isCollegeCoach'] === true) {
    const recruiterData: Record<string, unknown> = {
      recruiterType: 'college_coach',
      title: cleanString(d['coachTitle']) || undefined,
      institution: cleanString(d['collegeName']) || cleanString(d['institution']) || undefined,
      division: cleanString(d['division']) || undefined,
      conference: cleanString(d['conference']) || undefined,
    };

    if (Array.isArray(d['sports'])) {
      recruiterData['sports'] = d['sports'];
    } else if (d['primarySport']) {
      recruiterData['sports'] = [cleanString(d['primarySport'])?.toLowerCase()];
    }

    stripUndefined(recruiterData);
    result['recruiter'] = recruiterData;
  }

  if (role === 'director') {
    result['director'] = {};
  }

  return result;
}

// ─── Small Helpers ────────────────────────────────────────────────────────────

/** Normalize positions to string[] */
function normalizePositions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((p) => typeof p === 'string' && p.trim());
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  return [];
}

/** Normalize side field to string[] | undefined */
function normalizeSide(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const filtered = raw.filter((s) => typeof s === 'string' && s.trim());
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return undefined;
}

/** Recursively strip undefined values from an object */
function stripUndefined(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) {
      delete obj[key];
    } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      stripUndefined(obj[key] as Record<string, unknown>);
    }
  }
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 2 — User Migration (V1/V2 → V3)');

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();

  const limit = getLimit();
  const resume = hasFlag('resume');
  const targetUsersOnly = hasFlag('target-users');

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    warnings: 0,
    roleBreakdown: {},
    sportBreakdown: {},
    formatBreakdown: { v1: 0, v2: 0 },
  };

  const errorLog: Array<{ uid: string; error: string }> = [];
  const warningLog: Array<{ uid: string; warnings: string[] }> = [];

  // Determine resume cursor
  let resumeAfter: FirestoreTimestamp | undefined;
  if (resume) {
    // Find the last migrated user in target by _migratedAt
    const lastMigrated = await targetDb
      .collection(COLLECTIONS.USERS)
      .where('_migratedFrom', '==', `nxt-1-de054/${COLLECTIONS.LEGACY_USERS}`)
      .orderBy('_migratedAt', 'desc')
      .limit(1)
      .get();

    if (!lastMigrated.empty) {
      const lastDoc = lastMigrated.docs[0].data();
      const lastCreatedAt = lastDoc['createdAt'];
      if (lastCreatedAt) {
        console.log(`  Resuming after last migrated user (createdAt: ${lastCreatedAt})`);
        // Convert ISO string back to Firestore Timestamp for query
        resumeAfter = FirestoreTimestamp.fromDate(new Date(lastCreatedAt as string));
      }
    }
    if (!resumeAfter) {
      console.log('  No previously migrated users found — starting from beginning');
    }
  }

  const writer = new BatchWriter(targetDb, isDryRun);
  const progress = new ProgressReporter('Users');

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;

  console.log('  Starting user migration…\n');

  // ─── Mode A: Migrate only target users (from target-users.json) ─────
  if (targetUsersOnly) {
    const mappingPath = resolve(__migrateDirname, 'user-uid-mapping.json');
    const mapping: { results: Array<{ email: string; uid: string }> } = JSON.parse(
      readFileSync(mappingPath, 'utf-8')
    );
    const targetUids = mapping.results.map((u) => u.uid);
    console.log(`  Mode: target-users only (${targetUids.length} users)\n`);

    for (const uid of targetUids) {
      stats.total++;
      processed++;
      const email = mapping.results.find((u) => u.uid === uid)?.email || uid;

      try {
        const legacyDoc = await legacyDb.collection(COLLECTIONS.LEGACY_USERS).doc(uid).get();
        if (!legacyDoc.exists) {
          console.log(`  ⚠ ${email} (${uid}) — legacy doc not found, skipping`);
          stats.skipped++;
          continue;
        }
        const data = legacyDoc.data() as LegacyUser;

        // Track format
        if (isV2Format(data)) stats.formatBreakdown.v2++;
        else stats.formatBreakdown.v1++;

        const { user, warnings } = transformLegacyUser(uid, data);

        const role = user['role'] as string;
        stats.roleBreakdown[role] = (stats.roleBreakdown[role] || 0) + 1;

        const sports = user['sports'] as Record<string, unknown>[];
        for (const s of sports) {
          const sn = (s['sport'] as string) || 'unknown';
          stats.sportBreakdown[sn] = (stats.sportBreakdown[sn] || 0) + 1;
        }

        if (warnings.length > 0) {
          stats.warnings += warnings.length;
          warningLog.push({ uid, warnings });
        }

        console.log(`  → ${email}`);
        if (isVerbose) {
          console.log(`     role=${role}, sports=${sports.length}, firstName=${user['firstName']}`);
        }

        const ref = targetDb.collection(COLLECTIONS.USERS).doc(uid);
        writer.set(ref, user);
        await writer.flushIfNeeded();

        stats.migrated++;
        console.log(`     ✅ Done`);
      } catch (err) {
        stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorLog.push({ uid, error: msg });
        console.error(`  ❌ ${email}: ${msg}`);
      }
    }

    await writer.flush();
  } else {
    // ─── Mode B: Full migration (paginate all users) ──────────────────
    while (true) {
      // Build paginated query
      let query: FirebaseFirestore.Query = legacyDb
        .collection(COLLECTIONS.LEGACY_USERS)
        .orderBy('createdAt', 'asc')
        .limit(PAGE_SIZE);

      if (resumeAfter && !cursor) {
        query = query.startAfter(resumeAfter);
      } else if (cursor) {
        query = query.startAfter(cursor);
      }

      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        if (limit > 0 && processed >= limit) break;

        stats.total++;
        processed++;
        const uid = doc.id;
        const data = doc.data() as LegacyUser;

        try {
          // Track format
          if (isV2Format(data)) {
            stats.formatBreakdown.v2++;
          } else {
            stats.formatBreakdown.v1++;
          }

          // Transform
          const { user, warnings } = transformLegacyUser(uid, data);

          // Track role
          const role = user['role'] as string;
          stats.roleBreakdown[role] = (stats.roleBreakdown[role] || 0) + 1;

          // Track sports
          const sports = user['sports'] as Record<string, unknown>[];
          for (const s of sports) {
            const sn = (s['sport'] as string) || 'unknown';
            stats.sportBreakdown[sn] = (stats.sportBreakdown[sn] || 0) + 1;
          }

          // Track warnings
          if (warnings.length > 0) {
            stats.warnings += warnings.length;
            warningLog.push({ uid, warnings });
            if (isVerbose) {
              console.log(`\n    ⚠ ${uid}: ${warnings.join('; ')}`);
            }
          }

          // Write to target (preserve UID)
          const ref = targetDb.collection(COLLECTIONS.USERS).doc(uid);
          writer.set(ref, user);
          await writer.flushIfNeeded();

          stats.migrated++;

          if (isVerbose && stats.migrated % 50 === 0) {
            console.log(
              `\n    ✓ ${uid} → role=${role}, sports=${sports.length}, measurables=${(user['measurables'] as unknown[]).length}`
            );
          }
        } catch (err) {
          stats.errors++;
          const msg = err instanceof Error ? err.message : String(err);
          errorLog.push({ uid, error: msg });
          console.error(`\n    ❌ ${uid}: ${msg}`);
        }

        progress.tick(processed);
      }

      cursor = snap.docs[snap.docs.length - 1];

      // Respect limit
      if (limit > 0 && processed >= limit) break;
    } // end while (Mode B)
  } // end else (Mode B)

  // Flush remaining writes
  await writer.flush();
  progress.done(processed);

  // ─── Report ─────────────────────────────────────────────────────────
  const { writes, errors: writeErrors } = writer.stats;

  printSummary('Migration Results', [
    ['Total legacy docs', stats.total],
    ['Migrated', stats.migrated],
    ['Skipped', stats.skipped],
    ['Errors', stats.errors],
    ['Warnings (total)', stats.warnings],
    ['Writes committed', writes],
    ['Write errors', writeErrors],
    ['V1 format', stats.formatBreakdown.v1],
    ['V2 format', stats.formatBreakdown.v2],
  ]);

  if (Object.keys(stats.roleBreakdown).length > 0) {
    printSummary(
      'Role Breakdown',
      Object.entries(stats.roleBreakdown).sort(([, a], [, b]) => b - a)
    );
  }

  if (Object.keys(stats.sportBreakdown).length > 0) {
    printSummary(
      'Sport Breakdown (top 20)',
      Object.entries(stats.sportBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
    );
  }

  // Write JSON report
  writeReport(`user-migration-${new Date().toISOString().slice(0, 10)}.json`, {
    timestamp: new Date().toISOString(),
    dryRun: isDryRun,
    stats,
    errors: errorLog,
    warnings: warningLog.slice(0, 200), // Cap for file size
  });

  if (stats.errors > 0) {
    console.log(`\n  ⚠ ${stats.errors} user(s) failed — check report for details.`);
  }

  console.log('\n  Done.\n');
  process.exit(stats.errors > 0 ? 1 : 0);
}

// ─── Firestore Timestamp import ───────────────────────────────────────────────
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __migrateDirname = dirname(fileURLToPath(import.meta.url));

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
