#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Migrate Target Users' TeamCodes → Organizations + Teams + RosterEntries
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For each canary user in user-uid-mapping.json:
 *   1. Fetch their legacy Users doc → extract embedded `teamCode` object
 *   2. Fetch the full TeamCode doc from legacy by teamCode.id
 *   3. Create/update Organization doc in staging
 *   4. Create Team doc in staging
 *   5. Create RosterEntries for all members in the TeamCode doc
 *
 * Collections in staging (V3):
 *   - Organizations
 *   - Teams
 *   - RosterEntries
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-target-teamcodes.ts --dry-run
 *   npx tsx scripts/migration/migrate-target-teamcodes.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { FieldValue, type Firestore as FirestoreDb } from 'firebase-admin/firestore';
import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  COLLECTIONS,
  printBanner,
  toISOString,
  cleanString,
  cleanEmail,
  migrationMeta,
} from './migration-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbeddedTeamCode {
  id?: string;
  teamCode?: string;
  teamName?: string;
  teamType?: string;
  sportName?: string;
  sport?: string;
  state?: string;
  city?: string;
  customUrl?: string;
  unicode?: string;
  athleteMember?: number;
  panelMember?: number;
  packageId?: string;
  billingCycle?: string;
  isActive?: boolean;
  isFreeTrial?: boolean;
  trialStartDate?: unknown;
  expireAt?: unknown;
  createAt?: unknown;
  createdAt?: unknown;
  teamLogoImg?: string;
  teamColor1?: string;
  teamColor2?: string;
  mascot?: string;
  division?: string;
  conference?: string;
  seasonRecord?: { wins?: number; losses?: number; ties?: number };
  socialLinks?: Record<string, unknown>;
  contactInfo?: Record<string, unknown>;
  teamLinks?: Record<string, unknown>;
  sponsor?: { name?: string; logoImg?: string };
  members?: Array<{
    id?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    email?: string;
    phoneNumber?: string;
    classOf?: number;
    gpa?: string | number;
    position?: string | string[];
    joinTime?: unknown;
    [k: string]: unknown;
  }>;
  memberIds?: string[];
  price?: string;
  role?: string;
  [k: string]: unknown;
}

// ─── Normalization Helpers ────────────────────────────────────────────────────

const TEAM_TYPE_MAP: Record<string, string> = {
  'high school': 'high-school',
  highschool: 'high-school',
  'high-school': 'high-school',
  juco: 'juco',
  'middle school': 'middle-school',
  middleschool: 'middle-school',
  'middle-school': 'middle-school',
  club: 'club',
  college: 'college',
  organization: 'organization',
  service: 'organization',
};

function normalizeTeamType(v: unknown): string {
  if (typeof v !== 'string') return 'high-school';
  return TEAM_TYPE_MAP[v.trim().toLowerCase()] ?? 'high-school';
}

const MEMBER_ROLE_MAP: Record<string, string> = {
  administrative: 'director',
  admin: 'director',
  athlete: 'athlete',
  coach: 'coach',
  media: 'coach',
};

function normalizeMemberRole(role: unknown): string {
  if (typeof role !== 'string') return 'athlete';
  return MEMBER_ROLE_MAP[role.trim().toLowerCase()] ?? 'athlete';
}

// ─── Utility: strip undefined values from a doc ──────────────────────────────

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ─── Slug Generation (matches team-code.service.ts logic) ────────────────────

function buildTeamSlug(teamName: string): string {
  return teamName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function generateUniqueTeamSlug(
  db: FirestoreDb,
  teamName: string,
  excludeDocId?: string
): Promise<string> {
  const base = buildTeamSlug(teamName);
  if (!base) return `team-${Date.now().toString(36).slice(-6)}`;

  const check = async (candidate: string) => {
    const snap = await db
      .collection(COLLECTIONS.TEAMS)
      .where('slug', '==', candidate)
      .limit(2)
      .get();
    // Allow if empty, or the only match is the doc we're updating
    const others = snap.docs.filter((d) => d.id !== excludeDocId);
    return others.length === 0;
  };

  if (await check(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (await check(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

// ─── Document Builders ────────────────────────────────────────────────────────

function buildOrganizationDoc(
  tc: EmbeddedTeamCode,
  orgId: string,
  firstAdminUserId: string
): Record<string, unknown> {
  return {
    name: cleanString(tc.teamName) ?? 'Unknown Organization',
    type: normalizeTeamType(tc.teamType),
    status: tc.isActive !== false ? 'active' : 'inactive',
    location:
      tc.state || tc.city
        ? {
            city: cleanString(tc.city) ?? undefined,
            state: cleanString(tc.state) ?? undefined,
            country: 'US',
          }
        : undefined,
    logoUrl: cleanString(tc.teamLogoImg) ?? undefined,
    primaryColor: cleanString(tc.teamColor1) ?? undefined,
    secondaryColor: cleanString(tc.teamColor2) ?? undefined,
    mascot: cleanString(tc.mascot) ?? undefined,
    admins: [
      {
        userId: firstAdminUserId,
        role: normalizeMemberRole(tc.role ?? 'director'),
        addedAt: toISOString(tc.createAt) ?? toISOString(tc.createdAt) ?? new Date().toISOString(),
      },
    ],
    ownerId: firstAdminUserId,
    isClaimed: true,
    source: 'import',
    teamCount: 1,
    createdAt: toISOString(tc.createAt) ?? toISOString(tc.createdAt) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: firstAdminUserId,
    ...migrationMeta(orgId, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

function buildTeamDoc(
  tc: EmbeddedTeamCode,
  legacyId: string,
  organizationId: string,
  slug: string
): Record<string, unknown> {
  const sportName = cleanString(tc.sportName) ?? cleanString(tc.sport) ?? 'Unknown';

  return {
    teamName: cleanString(tc.teamName) ?? 'Unknown Team',
    teamCode: cleanString(tc.teamCode) ?? legacyId,
    teamType: normalizeTeamType(tc.teamType),
    sportName,
    organizationId,
    state: cleanString(tc.state) ?? '',
    city: cleanString(tc.city) ?? '',
    slug,
    division: cleanString(tc.division) ?? undefined,
    conference: cleanString(tc.conference) ?? undefined,
    status: tc.isActive !== false ? 'active' : 'inactive',
    isActive: tc.isActive !== false,
    isFreeTrial: tc.isFreeTrial ?? false,
    trialStartDate: toISOString(tc.trialStartDate) ?? undefined,
    expireAt: toISOString(tc.expireAt) ?? undefined,
    logoUrl: cleanString(tc.teamLogoImg) ?? undefined,
    teamLogoImg: cleanString(tc.teamLogoImg) ?? undefined,
    primaryColor: cleanString(tc.teamColor1) ?? undefined,
    secondaryColor: cleanString(tc.teamColor2) ?? undefined,
    mascot: cleanString(tc.mascot) ?? undefined,
    customUrl: cleanString(tc.customUrl) ?? undefined,
    unicode: cleanString(tc.unicode) ?? undefined,
    teamLinks: tc.teamLinks ?? undefined,
    seasonRecord: tc.seasonRecord ?? undefined,
    socialLinks: tc.socialLinks ?? undefined,
    contactInfo: tc.contactInfo ?? undefined,
    sponsor: tc.sponsor ?? undefined,
    athleteMember: tc.athleteMember ?? 0,
    panelMember: tc.panelMember ?? 0,
    isClaimed: true,
    source: 'import',
    createdAt: toISOString(tc.createAt) ?? toISOString(tc.createdAt) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...migrationMeta(legacyId, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

function buildRosterEntry(
  userId: string,
  teamId: string,
  organizationId: string,
  member: EmbeddedTeamCode['members'] extends Array<infer T> ? T : never,
  legacy: EmbeddedTeamCode
): Record<string, unknown> {
  const positions: string[] = [];
  if (member['position']) {
    if (Array.isArray(member['position'])) {
      positions.push(...member['position'].filter(Boolean).map(String));
    } else if (typeof member['position'] === 'string' && member['position'].trim()) {
      positions.push(member['position'].trim());
    }
  }

  return {
    userId,
    teamId,
    organizationId,
    role: normalizeMemberRole(member['role'] ?? legacy['role'] ?? 'athlete'),
    status: 'active',
    positions: positions.length > 0 ? positions : undefined,
    classOf: typeof member['classOf'] === 'number' ? member['classOf'] : undefined,
    gpa: member['gpa'] ?? undefined,
    joinedAt: toISOString(member['joinTime']) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    firstName: cleanString(member['firstName']) ?? undefined,
    lastName: cleanString(member['lastName']) ?? undefined,
    email: cleanEmail(member['email']) ?? undefined,
    phoneNumber: cleanString(member['phoneNumber']) ?? undefined,
    ...migrationMeta(`${userId}_${teamId}`, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printBanner('Migrate Target Users TeamCodes → Orgs + Teams + RosterEntries');

  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();

  // Load canary UIDs
  const mappingPath = resolve(__dirname, 'user-uid-mapping.json');
  const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
  const userEntries: Array<{ uid: string; email: string }> = mapping.results;

  const stats = {
    usersProcessed: 0,
    teamsFound: 0,
    orgsCreated: 0,
    teamsCreated: 0,
    rosterEntriesCreated: 0,
    errors: 0,
  };

  // Track already-processed teamCode doc IDs (avoid double-processing shared teams)
  const processedTeamIds = new Set<string>();

  for (const { uid, email } of userEntries) {
    stats.usersProcessed++;
    console.log(`\n── ${email} (${uid})`);

    // 1. Fetch legacy user doc
    const userSnap = await legacyDb.collection(COLLECTIONS.LEGACY_USERS).doc(uid).get();
    if (!userSnap.exists) {
      console.log(`   ⚠ No legacy user doc — skipping`);
      continue;
    }

    const userData = userSnap.data()!;
    const rawTeamCode = userData['teamCode'];

    // The teamCode field in legacy is the FULL embedded TeamCode object
    if (!rawTeamCode || typeof rawTeamCode !== 'object') {
      console.log(`   ℹ No teamCode field — user has no team`);
      continue;
    }

    const embedded = rawTeamCode as EmbeddedTeamCode;
    const legacyTeamId = embedded.id;

    if (!legacyTeamId) {
      console.log(`   ⚠ teamCode object has no .id — cannot resolve full doc`);
      continue;
    }

    if (processedTeamIds.has(legacyTeamId)) {
      console.log(`   ℹ Team ${legacyTeamId} already processed — creating RosterEntry only`);
      // Still need to create rosterEntry for this user
      const teamId = legacyTeamId;
      const orgId = `${legacyTeamId}`;
      const entryId = `${uid}_${teamId}`;
      const entryRef = targetDb.collection(COLLECTIONS.ROSTER_ENTRIES).doc(entryId);
      const entryDoc = {
        userId: uid,
        teamId,
        organizationId: orgId,
        role: normalizeMemberRole(embedded.role),
        status: 'active',
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...migrationMeta(entryId, COLLECTIONS.LEGACY_TEAMCODES),
      };
      if (!isDryRun) {
        await entryRef.set(stripUndefined(entryDoc), { merge: true });
      } else {
        console.log(`   [DRY] RosterEntry: ${entryId}`);
      }
      stats.rosterEntriesCreated++;
      continue;
    }

    stats.teamsFound++;
    processedTeamIds.add(legacyTeamId);

    // 2. Fetch full TeamCode doc from legacy
    const tcSnap = await legacyDb.collection(COLLECTIONS.LEGACY_TEAMCODES).doc(legacyTeamId).get();

    // Use full doc if available, otherwise fall back to embedded object
    const tc: EmbeddedTeamCode = tcSnap.exists
      ? ({ id: legacyTeamId, ...tcSnap.data()! } as EmbeddedTeamCode)
      : { ...embedded, id: legacyTeamId };

    if (!tcSnap.exists) {
      console.log(
        `   ⚠ TeamCode doc ${legacyTeamId} not in legacy Firestore — using embedded data`
      );
    } else {
      console.log(`   ✔ Found TeamCode: ${tc.teamName} | ${tc.sportName} | ${tc.teamType}`);
    }

    // 3. Organization
    const orgId = `${legacyTeamId}`;
    const orgRef = targetDb.collection(COLLECTIONS.ORGANIZATIONS).doc(orgId);
    const orgDoc = buildOrganizationDoc(tc, orgId, uid);

    if (isDryRun) {
      console.log(`   [DRY] Organization: ${orgId} — name="${orgDoc['name']}"`);
    } else {
      await orgRef.set(stripUndefined(orgDoc), { merge: true });
      console.log(`   ✔ Organization: ${orgId}`);
    }
    stats.orgsCreated++;

    // 4. Team
    const teamId = legacyTeamId;
    const teamRef = targetDb.collection(COLLECTIONS.TEAMS).doc(teamId);

    // Generate slug from team name, ensuring uniqueness in staging Teams collection
    const slug = await generateUniqueTeamSlug(targetDb, tc.teamName ?? 'Unknown Team', teamId);
    const teamDoc = buildTeamDoc(tc, legacyTeamId, orgId, slug);

    if (isDryRun) {
      console.log(
        `   [DRY] Team: ${teamId} — ${teamDoc['teamName']} (${teamDoc['sportName']}) slug="${slug}"`
      );
    } else {
      await teamRef.set(stripUndefined(teamDoc), { merge: true });
      console.log(`   ✔ Team: ${teamId}  slug="${slug}"  link="/team/${slug}"`);
    }
    stats.teamsCreated++;

    // 5. RosterEntries — from members[] and memberIds[]
    const members = tc.members ?? [];
    const memberIds = tc.memberIds ?? [];
    const processedMemberSet = new Set<string>();

    // First: the current user (the one who owns/joined this team)
    const ownerEntryId = `${uid}_${teamId}`;
    const ownerEntry = {
      userId: uid,
      teamId,
      organizationId: orgId,
      role: normalizeMemberRole(tc.role ?? 'director'),
      status: 'active',
      joinedAt: toISOString(tc.createAt) ?? toISOString(tc.createdAt) ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      email: cleanEmail(userData['email'] as string) ?? undefined,
      firstName: cleanString(userData['firstName'] as string) ?? undefined,
      lastName: cleanString(userData['lastName'] as string) ?? undefined,
      ...migrationMeta(ownerEntryId, COLLECTIONS.LEGACY_TEAMCODES),
    };

    if (isDryRun) {
      console.log(`   [DRY] RosterEntry (owner): ${ownerEntryId}`);
    } else {
      await targetDb
        .collection(COLLECTIONS.ROSTER_ENTRIES)
        .doc(ownerEntryId)
        .set(stripUndefined(ownerEntry), { merge: true });
    }
    stats.rosterEntriesCreated++;
    processedMemberSet.add(uid);

    // Members from members[]
    for (const member of members) {
      if (!member.id || processedMemberSet.has(member.id)) continue;
      processedMemberSet.add(member.id);

      const entryId = `${member.id}_${teamId}`;
      const entryDoc = buildRosterEntry(member.id, teamId, orgId, member, tc);

      if (isDryRun) {
        console.log(
          `   [DRY] RosterEntry: ${entryId} (${member.firstName} ${member.lastName}, ${member.role})`
        );
      } else {
        await targetDb
          .collection(COLLECTIONS.ROSTER_ENTRIES)
          .doc(entryId)
          .set(stripUndefined(entryDoc), { merge: true });
      }
      stats.rosterEntriesCreated++;
    }

    // Members from memberIds[] not yet covered
    for (const memberId of memberIds) {
      if (!memberId || processedMemberSet.has(memberId)) continue;
      processedMemberSet.add(memberId);

      const entryId = `${memberId}_${teamId}`;
      const minimalEntry = {
        userId: memberId,
        teamId,
        organizationId: orgId,
        role: 'athlete',
        status: 'active',
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...migrationMeta(entryId, COLLECTIONS.LEGACY_TEAMCODES),
      };

      if (isDryRun) {
        console.log(`   [DRY] RosterEntry (memberId only): ${entryId}`);
      } else {
        await targetDb
          .collection(COLLECTIONS.ROSTER_ENTRIES)
          .doc(entryId)
          .set(minimalEntry, { merge: true });
      }
      stats.rosterEntriesCreated++;
    }

    if (isVerbose) {
      console.log(`   members[]: ${members.length}, memberIds[]: ${memberIds.length}`);
    }

    if (!isDryRun) {
      // Update team member counts
      await teamRef.update({
        athleteMember: FieldValue.increment(0), // keep existing
        updatedAt: new Date().toISOString(),
      });
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Users processed     : ${stats.usersProcessed}`);
  console.log(`  Teams found         : ${stats.teamsFound}`);
  console.log(`  Organizations created: ${stats.orgsCreated}`);
  console.log(`  Teams created       : ${stats.teamsCreated}`);
  console.log(`  RosterEntries created: ${stats.rosterEntriesCreated}`);
  console.log(`  Errors              : ${stats.errors}`);
  console.log('═══════════════════════════════════════════════');

  if (isDryRun) console.log('\n  DRY RUN — no data was written');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
