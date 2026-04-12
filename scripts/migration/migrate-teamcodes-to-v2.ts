/**
 * @fileoverview Phase 5 — Migrate TeamCodes → Organizations + Teams + RosterEntries
 *
 * Reads every document in the legacy `TeamCodes` collection and writes:
 *   1. An **Organization** doc (one per unique team name + state + city)
 *   2. A **Team** doc linked to that Organization
 *   3. **RosterEntry** docs for every `members[]` entry
 *
 * Billing fields (`packageId`, `isFreeTrial`, `trialStartDate`, `expireAt`)
 * are written to `billingContexts`.
 *
 * Idempotent — uses set({ merge: true }) and _legacyId tracking.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --dry-run --limit=20
 *   npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --target=staging
 *   npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --target=production
 */

import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  getLimit,
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
  migrationMeta,
  normalizeRole,
} from './migration-utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegacyTeamMember {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  joinTime?: unknown;
  role?: string;
  isVerify?: boolean;
  position?: string | string[];
  classOf?: number;
  gpa?: string | number;
  profileLink?: string;
  email?: string;
  phoneNumber?: string;
  title?: string;
  [key: string]: unknown;
}

interface LegacyTeamCode {
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
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
  };
  contactInfo?: {
    phoneNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    fieldLocation?: string;
  };
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
  };
  sponsor?: { name?: string; logoImg?: string };
  members?: LegacyTeamMember[];
  memberIds?: string[];
  analytic?: { totalProfileView?: number; totalTeamPageTraffic?: number };
  totalTraffic?: number;
  lastUpdatedStat?: unknown;
  [key: string]: unknown;
}

// ─── Team Type Normalization ──────────────────────────────────────────────────

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
};

function normalizeTeamType(
  value: unknown
): 'high-school' | 'club' | 'college' | 'juco' | 'middle-school' | 'organization' {
  if (typeof value !== 'string') return 'high-school';
  const cleaned = value.trim().toLowerCase();
  return (TEAM_TYPE_MAP[cleaned] ?? 'high-school') as ReturnType<typeof normalizeTeamType>;
}

// ─── Member Role Normalization ────────────────────────────────────────────────

const MEMBER_ROLE_MAP: Record<string, string> = {
  administrative: 'director',
  admin: 'director',
  athlete: 'athlete',
  coach: 'coach',
  media: 'coach', // Media members mapped to coach role in V3
};

function normalizeMemberRole(role: unknown): string {
  if (typeof role !== 'string') return 'athlete';
  const cleaned = role.trim().toLowerCase();
  return MEMBER_ROLE_MAP[cleaned] ?? 'athlete';
}

// ─── Org Key Dedup ────────────────────────────────────────────────────────────

/**
 * Generate a deterministic key for deduplication of organizations.
 * Two TeamCode docs with the same team name, state, and city are assumed
 * to belong to the same organization (different sports / seasons).
 */
function orgKey(teamName: string, state: string, city: string): string {
  return `${teamName.trim().toLowerCase()}|${(state || '').trim().toLowerCase()}|${(city || '').trim().toLowerCase()}`;
}

// ─── Transform Helpers ────────────────────────────────────────────────────────

function buildOrganizationDoc(
  legacy: LegacyTeamCode,
  orgId: string,
  adminMembers: LegacyTeamMember[]
): Record<string, unknown> {
  const teamType = normalizeTeamType(legacy.teamType);

  const admins = adminMembers
    .filter((m) => m.id)
    .map((m) => ({
      userId: m.id,
      role: normalizeMemberRole(m.role) as 'athlete' | 'coach' | 'director',
      addedAt: toISOString(m.joinTime) ?? new Date().toISOString(),
      firstName: cleanString(m.firstName) ?? undefined,
      lastName: cleanString(m.lastName) ?? undefined,
      email: cleanEmail(m.email) ?? undefined,
    }));

  // If no admin members found, use the first coach or first member
  const ownerId = admins[0]?.userId ?? adminMembers[0]?.id ?? 'system';

  return {
    name: cleanString(legacy.teamName) ?? 'Unknown Organization',
    type: teamType,
    status: legacy.isActive !== false ? 'active' : 'inactive',
    location:
      legacy.state || legacy.city
        ? {
            city: cleanString(legacy.city) ?? undefined,
            state: cleanString(legacy.state) ?? undefined,
            country: 'US',
          }
        : undefined,
    logoUrl: cleanString(legacy.teamLogoImg) ?? undefined,
    primaryColor: cleanString(legacy.teamColor1) ?? undefined,
    secondaryColor: cleanString(legacy.teamColor2) ?? undefined,
    mascot: cleanString(legacy.mascot) ?? undefined,
    admins,
    ownerId,
    isClaimed: true,
    source: 'import' as const,
    teamCount: 1, // Will be incremented if multiple teams share this org
    createdAt:
      toISOString(legacy.createAt) ?? toISOString(legacy.createdAt) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: ownerId,
    ...migrationMeta(orgId, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

function buildTeamDoc(
  legacy: LegacyTeamCode,
  legacyId: string,
  organizationId: string
): Record<string, unknown> {
  const sportName = cleanString(legacy.sportName) ?? cleanString(legacy.sport) ?? 'Unknown';

  return {
    // Core Identity
    teamName: cleanString(legacy.teamName) ?? 'Unknown Team',
    teamCode: cleanString(legacy.teamCode) ?? legacyId,
    teamType: normalizeTeamType(legacy.teamType),
    sportName,
    organizationId,

    // Location (denormalized from org for query convenience)
    state: cleanString(legacy.state) ?? '',
    city: cleanString(legacy.city) ?? '',

    // Season Info
    division: cleanString(legacy.division) ?? undefined,
    conference: cleanString(legacy.conference) ?? undefined,

    // Status & Subscription
    status: legacy.isActive !== false ? 'active' : 'inactive',
    isActive: legacy.isActive !== false,
    isFreeTrial: legacy.isFreeTrial ?? false,
    trialStartDate: toISOString(legacy.trialStartDate) ?? undefined,
    expireAt: toISOString(legacy.expireAt) ?? undefined,

    // Branding
    logoUrl: cleanString(legacy.teamLogoImg) ?? undefined,
    teamLogoImg: cleanString(legacy.teamLogoImg) ?? undefined,
    primaryColor: cleanString(legacy.teamColor1) ?? undefined,
    secondaryColor: cleanString(legacy.teamColor2) ?? undefined,
    mascot: cleanString(legacy.mascot) ?? undefined,

    // URLs
    customUrl: cleanString(legacy.customUrl) ?? undefined,
    unicode: cleanString(legacy.unicode) ?? undefined,

    // Team Links
    teamLinks: legacy.teamLinks ?? undefined,

    // Season Stats
    seasonRecord: legacy.seasonRecord ?? undefined,
    lastUpdatedStat: toISOString(legacy.lastUpdatedStat) ?? undefined,

    // Contact & Social
    socialLinks: legacy.socialLinks ?? undefined,
    contactInfo: legacy.contactInfo ?? undefined,

    // Sponsor
    sponsor: legacy.sponsor ?? undefined,

    // Analytics (cached counts)
    athleteMember: legacy.athleteMember ?? 0,
    panelMember: legacy.panelMember ?? 0,
    totalTraffic: legacy.totalTraffic ?? 0,
    analytic: legacy.analytic ?? undefined,

    // Metadata
    createdAt:
      toISOString(legacy.createAt) ?? toISOString(legacy.createdAt) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isClaimed: true,
    source: 'import' as const,

    ...migrationMeta(legacyId, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

function buildRosterEntry(
  member: LegacyTeamMember,
  teamId: string,
  organizationId: string,
  sportName: string
): Record<string, unknown> | null {
  if (!member.id) return null;

  const role = normalizeMemberRole(member.role);
  const positions: string[] = [];
  if (member.position) {
    if (Array.isArray(member.position)) {
      positions.push(...member.position.filter(Boolean).map(String));
    } else if (typeof member.position === 'string' && member.position.trim()) {
      positions.push(member.position.trim());
    }
  }

  return {
    userId: member.id,
    teamId,
    organizationId,
    role,
    status: 'active',
    positions: positions.length > 0 ? positions : undefined,
    classOf: typeof member.classOf === 'number' ? member.classOf : undefined,
    gpa: member.gpa ?? undefined,
    joinedAt: toISOString(member.joinTime) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Cached user data for display
    firstName: cleanString(member.firstName) ?? undefined,
    lastName: cleanString(member.lastName) ?? undefined,
    email: cleanEmail(member.email) ?? undefined,
    phoneNumber: cleanString(member.phoneNumber) ?? undefined,
  };
}

function buildBillingContext(
  legacy: LegacyTeamCode,
  organizationId: string,
  teamId: string
): Record<string, unknown> | null {
  // Only create billing docs for teams with a packageId
  if (!legacy.packageId) return null;

  return {
    entityType: 'organization',
    entityId: organizationId,
    teamId,
    provider: 'legacy',
    packageId: cleanString(legacy.packageId) ?? undefined,
    status: legacy.isActive !== false ? 'active' : 'cancelled',
    isFreeTrial: legacy.isFreeTrial ?? false,
    trialStartDate: toISOString(legacy.trialStartDate) ?? undefined,
    expireAt: toISOString(legacy.expireAt) ?? undefined,
    createdAt:
      toISOString(legacy.createAt) ?? toISOString(legacy.createdAt) ?? new Date().toISOString(),
    ...migrationMeta(teamId, COLLECTIONS.LEGACY_TEAMCODES),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 5 — Migrate TeamCodes → Orgs + Teams + RosterEntries');

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();
  const limit = getLimit();

  const writer = new BatchWriter(targetDb, isDryRun);
  const progress = new ProgressReporter('TeamCodes');

  // Tracking
  const stats = {
    teamCodesProcessed: 0,
    organizationsCreated: 0,
    organizationsSkipped: 0, // Deduped (already created for another team in same org)
    teamsCreated: 0,
    rosterEntriesCreated: 0,
    billingContextsCreated: 0,
    membersSkippedNoId: 0,
    errors: 0,
  };

  // Org dedup: Map orgKey → generated orgId
  const orgCache = new Map<string, string>();

  // Paginate legacy TeamCodes
  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let totalProcessed = 0;

  while (true) {
    let query = legacyDb
      .collection(COLLECTIONS.LEGACY_TEAMCODES)
      .orderBy('__name__')
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      if (limit > 0 && totalProcessed >= limit) break;

      const legacyId = doc.id;
      const data = doc.data() as LegacyTeamCode;
      totalProcessed++;
      progress.tick(totalProcessed);

      try {
        const teamName = cleanString(data.teamName) ?? 'Unknown Team';
        const state = cleanString(data.state) ?? '';
        const city = cleanString(data.city) ?? '';
        const key = orgKey(teamName, state, city);
        const sportName = cleanString(data.sportName) ?? cleanString(data.sport) ?? 'Unknown';

        // ---------- 1. Organization ----------
        let organizationId: string;
        if (orgCache.has(key)) {
          organizationId = orgCache.get(key)!;
          stats.organizationsSkipped++;

          // Increment teamCount on existing org
          const orgRef = targetDb.collection(COLLECTIONS.ORGANIZATIONS).doc(organizationId);
          writer.set(orgRef, {
            teamCount: FirebaseFirestore.FieldValue.increment(1) as unknown as number,
          });
        } else {
          // Create new organization. Use legacyId as seed for deterministic ID
          organizationId = `org_${legacyId}`;

          // Find admin/coach members for the org admins list
          const adminMembers = (data.members ?? []).filter(
            (m) => m.role && ['Administrative', 'admin', 'Coach', 'coach'].includes(String(m.role))
          );

          const orgDoc = buildOrganizationDoc(data, organizationId, adminMembers);
          const orgRef = targetDb.collection(COLLECTIONS.ORGANIZATIONS).doc(organizationId);
          writer.set(orgRef, orgDoc);
          orgCache.set(key, organizationId);
          stats.organizationsCreated++;
        }

        // ---------- 2. Team ----------
        const teamId = legacyId; // Preserve legacy TeamCode doc ID
        const teamDoc = buildTeamDoc(data, legacyId, organizationId);
        const teamRef = targetDb.collection(COLLECTIONS.TEAMS).doc(teamId);
        writer.set(teamRef, teamDoc);
        stats.teamsCreated++;

        // ---------- 3. RosterEntries from members[] ----------
        const members = data.members ?? [];
        const processedMemberIds = new Set<string>();

        for (const member of members) {
          if (!member.id) {
            stats.membersSkippedNoId++;
            continue;
          }

          // Skip duplicate members within the same team
          if (processedMemberIds.has(member.id)) continue;
          processedMemberIds.add(member.id);

          const entry = buildRosterEntry(member, teamId, organizationId, sportName);
          if (!entry) continue;

          // Deterministic ID: {userId}_{teamId}
          const entryId = `${member.id}_${teamId}`;
          const entryRef = targetDb.collection(COLLECTIONS.ROSTER_ENTRIES).doc(entryId);
          writer.set(entryRef, {
            ...entry,
            ...migrationMeta(entryId, COLLECTIONS.LEGACY_TEAMCODES),
          });
          stats.rosterEntriesCreated++;
        }

        // Also process memberIds[] for users not in members[]
        const memberIds = data.memberIds ?? [];
        for (const memberId of memberIds) {
          if (!memberId || processedMemberIds.has(memberId)) continue;
          processedMemberIds.add(memberId);

          // Minimal roster entry — we only have the user ID
          const entryId = `${memberId}_${teamId}`;
          const entryRef = targetDb.collection(COLLECTIONS.ROSTER_ENTRIES).doc(entryId);
          writer.set(entryRef, {
            userId: memberId,
            teamId,
            organizationId,
            role: 'athlete', // Default to athlete for ID-only members
            status: 'active',
            joinedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...migrationMeta(entryId, COLLECTIONS.LEGACY_TEAMCODES),
          });
          stats.rosterEntriesCreated++;
        }

        // ---------- 4. Billing Context ----------
        const billingDoc = buildBillingContext(data, organizationId, teamId);
        if (billingDoc) {
          const billingId = `billing_${teamId}`;
          const billingRef = targetDb.collection(COLLECTIONS.BILLING_CONTEXTS).doc(billingId);
          writer.set(billingRef, billingDoc);
          stats.billingContextsCreated++;
        }

        await writer.flushIfNeeded();
      } catch (err) {
        stats.errors++;
        console.error(
          `\n  ❌ Error processing TeamCode ${legacyId}:`,
          err instanceof Error ? err.message : err
        );
        if (isVerbose) console.error(err);
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (limit > 0 && totalProcessed >= limit) break;
    if (snapshot.docs.length < PAGE_SIZE) break;
  }

  // Final flush
  await writer.flush();
  progress.done(totalProcessed);

  // ─── Report ───────────────────────────────────────────────────────────────
  const { writes, errors: writeErrors } = writer.stats;

  printSummary('TeamCodes Migration Results', [
    ['TeamCodes processed', (stats.teamCodesProcessed = totalProcessed)],
    ['Organizations created', stats.organizationsCreated],
    ['Organizations deduped', stats.organizationsSkipped],
    ['Teams created', stats.teamsCreated],
    ['RosterEntries created', stats.rosterEntriesCreated],
    ['Billing contexts created', stats.billingContextsCreated],
    ['Members skipped (no ID)', stats.membersSkippedNoId],
    ['Processing errors', stats.errors],
    ['Firestore writes', writes],
    ['Write errors', writeErrors],
    ['Mode', isDryRun ? 'DRY RUN' : 'LIVE'],
  ]);

  // Write JSON report
  const reportData = {
    timestamp: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'live',
    stats,
    firestoreWrites: writes,
    firestoreErrors: writeErrors,
    uniqueOrganizations: orgCache.size,
  };
  writeReport(`teamcodes-migration-${isDryRun ? 'dryrun' : 'live'}-${Date.now()}.json`, reportData);

  if (stats.errors > 0) {
    console.log(`\n  ⚠️  ${stats.errors} errors occurred — review logs above.`);
  }

  console.log('\n  ✅ Phase 5 complete.\n');
  process.exit(stats.errors > 0 ? 1 : 0);
}

// ─── Firestore FieldValue import ──────────────────────────────────────────────
import { FieldValue as FirestoreFieldValue } from 'firebase-admin/firestore';

// Redeclare for namespace usage inside the main function
const FirebaseFirestore = {
  FieldValue: FirestoreFieldValue,
};

main().catch((err) => {
  console.error('\n  💥 Fatal error:', err);
  process.exit(1);
});
