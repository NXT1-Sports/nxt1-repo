/**
 * @fileoverview Phase 1 — Analyze Legacy Users (Read-Only Recon)
 *
 * Scans ALL legacy Users documents in `nxt-1-de054` and produces a
 * comprehensive data-quality report. NO writes occur — this is purely
 * observational to guide the actual migration.
 *
 * Reports generated:
 *   - Field presence distribution (which of 150+ fields exist)
 *   - Role distribution (Athlete / Coach / Parent / etc.)
 *   - Sport distribution (football, basketball, etc.)
 *   - Schema version detection (V1 flat vs V2 nested)
 *   - Data quality issues (missing names, invalid classOf, etc.)
 *   - Content volume (posts, templates, sessions)
 *   - Recruiting data presence (offers, visits, camps)
 *   - Connected account tallies
 *
 * Usage:
 *   npx tsx scripts/migration/analyze-legacy-users.ts
 *   npx tsx scripts/migration/analyze-legacy-users.ts --limit=100
 *   npx tsx scripts/migration/analyze-legacy-users.ts --limit=50 --verbose
 */

import {
  initLegacyApp,
  getLimit,
  isVerbose,
  PAGE_SIZE,
  printBanner,
  printSummary,
  printTopN,
  writeReport,
  formatNum,
  ProgressReporter,
  COLLECTIONS,
  safeJsonParse,
} from './migration-utils.js';

// ─── Report Types ─────────────────────────────────────────────────────────────

interface AnalysisReport {
  timestamp: string;
  usersScanned: number;

  // Role distribution
  roleDistribution: Record<string, number>;

  // Sport distribution
  primarySportDistribution: Record<string, number>;
  secondarySportDistribution: Record<string, number>;
  usersWithSecondarySport: number;

  // Schema detection
  schemaVersions: Record<string, number>;
  v1FlatUsers: number;
  v2NestedUsers: number;

  // Field presence (how many users have each field)
  fieldPresence: Record<string, number>;

  // Data quality issues
  issues: {
    missingEmail: number;
    missingFirstName: number;
    missingLastName: number;
    missingRole: number;
    missingPrimarySport: number;
    invalidClassOf: number;
    emptyProfileImg: number;
    duplicateEmails: string[];
    nullOrUndefinedId: number;
  };

  // Content volume
  contentVolume: {
    totalPosts: number;
    totalSessions: number;
    totalOwnTemplates: number;
    totalOwnProfiles: number;
    totalOwnMixtapes: number;
    maxPostsPerUser: number;
    maxSessionsPerUser: number;
    maxTemplatesPerUser: number;
    usersWithPosts: number;
    usersWithSessions: number;
    usersWithTemplates: number;
  };

  // Team associations
  teams: {
    usersWithTeamCode: number;
    uniqueTeamCodes: string[];
    usersWithHighSchool: number;
    usersWithClub: number;
  };

  // Recruiting data
  recruiting: {
    usersWithOffers: number;
    usersWithCollegeInterests: number;
    usersWithCollegeVisits: number;
    usersWithCollegeCamps: number;
    usersCommitted: number;
    totalOffers: number;
    totalInterests: number;
    totalVisits: number;
    totalCamps: number;
  };

  // Connected accounts
  connectedAccounts: {
    gmail: number;
    microsoft: number;
    hudl: number;
    youtube: number;
    maxpreps: number;
    twitter: number;
    instagram: number;
    tiktok: number;
  };

  // Timestamps
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
  usersWithLastLogin: number;

  // Counters
  totalProfileViews: number;
  totalVideoViews: number;
  usersWithProfileViews: number;
  usersWithVideoViews: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 1: Analyze Legacy Users');

  const { db } = initLegacyApp();
  const limit = getLimit();

  const report: AnalysisReport = {
    timestamp: new Date().toISOString(),
    usersScanned: 0,
    roleDistribution: {},
    primarySportDistribution: {},
    secondarySportDistribution: {},
    usersWithSecondarySport: 0,
    schemaVersions: {},
    v1FlatUsers: 0,
    v2NestedUsers: 0,
    fieldPresence: {},
    issues: {
      missingEmail: 0,
      missingFirstName: 0,
      missingLastName: 0,
      missingRole: 0,
      missingPrimarySport: 0,
      invalidClassOf: 0,
      emptyProfileImg: 0,
      duplicateEmails: [],
      nullOrUndefinedId: 0,
    },
    contentVolume: {
      totalPosts: 0,
      totalSessions: 0,
      totalOwnTemplates: 0,
      totalOwnProfiles: 0,
      totalOwnMixtapes: 0,
      maxPostsPerUser: 0,
      maxSessionsPerUser: 0,
      maxTemplatesPerUser: 0,
      usersWithPosts: 0,
      usersWithSessions: 0,
      usersWithTemplates: 0,
    },
    teams: {
      usersWithTeamCode: 0,
      uniqueTeamCodes: [],
      usersWithHighSchool: 0,
      usersWithClub: 0,
    },
    recruiting: {
      usersWithOffers: 0,
      usersWithCollegeInterests: 0,
      usersWithCollegeVisits: 0,
      usersWithCollegeCamps: 0,
      usersCommitted: 0,
      totalOffers: 0,
      totalInterests: 0,
      totalVisits: 0,
      totalCamps: 0,
    },
    connectedAccounts: {
      gmail: 0,
      microsoft: 0,
      hudl: 0,
      youtube: 0,
      maxpreps: 0,
      twitter: 0,
      instagram: 0,
      tiktok: 0,
    },
    oldestCreatedAt: null,
    newestCreatedAt: null,
    usersWithLastLogin: 0,
    totalProfileViews: 0,
    totalVideoViews: 0,
    usersWithProfileViews: 0,
    usersWithVideoViews: 0,
  };

  const emailSet = new Set<string>();
  const emailDuplicates = new Set<string>();
  const teamCodeSet = new Set<string>();
  const progress = new ProgressReporter('Scanning Users');

  /**
   * Track field presence: counts how many user docs contain each field.
   */
  function trackFields(data: Record<string, unknown>): void {
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== '') {
        report.fieldPresence[key] = (report.fieldPresence[key] ?? 0) + 1;
      }
    }
  }

  /**
   * Detect whether this user uses V2 nested format (has `sports[]`, `location`, `contact`)
   * or V1 flat format (has `primarySport`, `city`, `phoneNumber` at root).
   */
  function detectSchema(data: Record<string, unknown>): 'v1-flat' | 'v2-nested' {
    if (Array.isArray(data['sports']) && data['sports'].length > 0) return 'v2-nested';
    if (typeof data['location'] === 'object' && data['location'] !== null) return 'v2-nested';
    return 'v1-flat';
  }

  // ─── Paginate Through Legacy Users ──────────────────────────────────────

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = db.collection(COLLECTIONS.LEGACY_USERS).limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      report.usersScanned++;
      const data = doc.data();
      const uid = doc.id;

      // ── Field Presence ──
      trackFields(data);

      // ── Schema Detection ──
      const schema = detectSchema(data);
      if (schema === 'v2-nested') {
        report.v2NestedUsers++;
      } else {
        report.v1FlatUsers++;
      }
      const version = data['_schemaVersion'] ?? 'none';
      const versionKey = String(version);
      report.schemaVersions[versionKey] = (report.schemaVersions[versionKey] ?? 0) + 1;

      // ── Role Distribution ──
      const role = (data['athleteOrParentOrCoach'] ?? data['role'] ?? 'MISSING') as string;
      const roleKey = String(role).trim().toLowerCase() || 'empty-string';
      report.roleDistribution[roleKey] = (report.roleDistribution[roleKey] ?? 0) + 1;
      if (role === 'MISSING') report.issues.missingRole++;

      // ── Sport Distribution ──
      const primarySport = data['primarySport'] as string | undefined;
      if (primarySport && typeof primarySport === 'string' && primarySport.trim()) {
        const sportKey = primarySport.trim().toLowerCase();
        report.primarySportDistribution[sportKey] =
          (report.primarySportDistribution[sportKey] ?? 0) + 1;
      } else {
        // Only flag missing sport for athlete-like roles
        const roleLower = String(role).toLowerCase();
        if (['athlete', 'parent', 'fan', 'recruit'].includes(roleLower) || role === 'MISSING') {
          report.issues.missingPrimarySport++;
        }
      }

      const secondarySport = data['secondarySport'] as string | undefined;
      if (secondarySport && typeof secondarySport === 'string' && secondarySport.trim()) {
        report.usersWithSecondarySport++;
        const secKey = secondarySport.trim().toLowerCase();
        report.secondarySportDistribution[secKey] =
          (report.secondarySportDistribution[secKey] ?? 0) + 1;
      }

      // ── Data Quality Issues ──
      if (!data['email'] || typeof data['email'] !== 'string' || !data['email'].trim()) {
        report.issues.missingEmail++;
      } else {
        const email = (data['email'] as string).trim().toLowerCase();
        if (emailSet.has(email)) {
          emailDuplicates.add(email);
        } else {
          emailSet.add(email);
        }
      }

      if (
        !data['firstName'] ||
        typeof data['firstName'] !== 'string' ||
        !data['firstName'].trim()
      ) {
        report.issues.missingFirstName++;
      }
      if (!data['lastName'] || typeof data['lastName'] !== 'string' || !data['lastName'].trim()) {
        report.issues.missingLastName++;
      }
      if (
        !data['profileImg'] ||
        typeof data['profileImg'] !== 'string' ||
        !data['profileImg'].trim()
      ) {
        report.issues.emptyProfileImg++;
      }

      const classOf = data['classOf'];
      if (classOf !== undefined && classOf !== null) {
        const year = typeof classOf === 'number' ? classOf : parseInt(String(classOf), 10);
        if (isNaN(year) || year < 2000 || year > 2040) {
          report.issues.invalidClassOf++;
        }
      }

      if (!uid || uid === 'undefined' || uid === 'null') {
        report.issues.nullOrUndefinedId++;
      }

      // ── Content Volume ──
      const posts = data['posts'] as unknown[] | undefined;
      if (Array.isArray(posts) && posts.length > 0) {
        report.contentVolume.usersWithPosts++;
        report.contentVolume.totalPosts += posts.length;
        if (posts.length > report.contentVolume.maxPostsPerUser) {
          report.contentVolume.maxPostsPerUser = posts.length;
        }
      }

      const sessions = data['sessions'] as unknown[] | undefined;
      if (Array.isArray(sessions) && sessions.length > 0) {
        report.contentVolume.usersWithSessions++;
        report.contentVolume.totalSessions += sessions.length;
        if (sessions.length > report.contentVolume.maxSessionsPerUser) {
          report.contentVolume.maxSessionsPerUser = sessions.length;
        }
      }

      const ownTemplates = data['ownTemplates'] as unknown[] | undefined;
      const ownProfiles = data['ownProfiles'] as unknown[] | undefined;
      const ownMixtapes = data['ownMixtapes'] as unknown[] | undefined;
      const templateCount =
        (Array.isArray(ownTemplates) ? ownTemplates.length : 0) +
        (Array.isArray(ownProfiles) ? ownProfiles.length : 0) +
        (Array.isArray(ownMixtapes) ? ownMixtapes.length : 0);
      if (templateCount > 0) {
        report.contentVolume.usersWithTemplates++;
        report.contentVolume.totalOwnTemplates += Array.isArray(ownTemplates)
          ? ownTemplates.length
          : 0;
        report.contentVolume.totalOwnProfiles += Array.isArray(ownProfiles)
          ? ownProfiles.length
          : 0;
        report.contentVolume.totalOwnMixtapes += Array.isArray(ownMixtapes)
          ? ownMixtapes.length
          : 0;
        if (templateCount > report.contentVolume.maxTemplatesPerUser) {
          report.contentVolume.maxTemplatesPerUser = templateCount;
        }
      }

      // ── Team Associations ──
      const teamCode = data['teamCode'] as string | undefined;
      if (teamCode && typeof teamCode === 'string' && teamCode.trim()) {
        report.teams.usersWithTeamCode++;
        teamCodeSet.add(teamCode.trim());
      }
      if (
        data['highSchool'] &&
        typeof data['highSchool'] === 'string' &&
        data['highSchool'].trim()
      ) {
        report.teams.usersWithHighSchool++;
      }
      if (data['club'] && typeof data['club'] === 'string' && data['club'].trim()) {
        report.teams.usersWithClub++;
      }

      // ── Recruiting Data ──
      const offers = data['offers'] as string | undefined;
      if (offers && typeof offers === 'string' && offers.trim()) {
        const parsed = safeJsonParse<unknown[]>(offers);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          report.recruiting.usersWithOffers++;
          report.recruiting.totalOffers += parsed.length;
        }
      }

      const collegeInterests = data['collegeInterests'] as unknown[] | undefined;
      if (Array.isArray(collegeInterests) && collegeInterests.length > 0) {
        report.recruiting.usersWithCollegeInterests++;
        report.recruiting.totalInterests += collegeInterests.length;
      }

      const collegeVisits = data['collegeVisits'] as unknown[] | undefined;
      if (Array.isArray(collegeVisits) && collegeVisits.length > 0) {
        report.recruiting.usersWithCollegeVisits++;
        report.recruiting.totalVisits += collegeVisits.length;
      }

      const collegeCamps = data['collegeCamps'] as unknown[] | undefined;
      if (Array.isArray(collegeCamps) && collegeCamps.length > 0) {
        report.recruiting.usersWithCollegeCamps++;
        report.recruiting.totalCamps += collegeCamps.length;
      }

      if (data['isCommitted'] === true || data['committmentStatus'] === 'Committed') {
        report.recruiting.usersCommitted++;
      }

      // ── Connected Accounts ──
      if (data['connectedGmailToken']) report.connectedAccounts.gmail++;
      if (data['connectedMicrosoftToken']) report.connectedAccounts.microsoft++;
      if (data['hudlAccountLink'] || (data['socialLinks'] as Record<string, unknown>)?.['hudl']) {
        report.connectedAccounts.hudl++;
      }
      if (
        data['youtubeAccountLink'] ||
        (data['socialLinks'] as Record<string, unknown>)?.['youtube']
      ) {
        report.connectedAccounts.youtube++;
      }
      if (data['sportsAccountLink']) report.connectedAccounts.maxpreps++;
      if (data['twitter'] || (data['socialLinks'] as Record<string, unknown>)?.['twitter']) {
        report.connectedAccounts.twitter++;
      }
      if (data['instagram'] || (data['socialLinks'] as Record<string, unknown>)?.['instagram']) {
        report.connectedAccounts.instagram++;
      }
      if (data['tiktok'] || (data['socialLinks'] as Record<string, unknown>)?.['tiktok']) {
        report.connectedAccounts.tiktok++;
      }

      // ── Timestamps ──
      const createdAt = data['createdAt'] as { toDate?: () => Date } | string | undefined;
      if (createdAt) {
        let dateStr: string | undefined;
        if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt) {
          try {
            dateStr = (createdAt as { toDate: () => Date }).toDate().toISOString();
          } catch {
            /* skip */
          }
        } else if (typeof createdAt === 'string') {
          dateStr = createdAt;
        }
        if (dateStr) {
          if (!report.oldestCreatedAt || dateStr < report.oldestCreatedAt) {
            report.oldestCreatedAt = dateStr;
          }
          if (!report.newestCreatedAt || dateStr > report.newestCreatedAt) {
            report.newestCreatedAt = dateStr;
          }
        }
      }

      if (data['lastLoginTime']) report.usersWithLastLogin++;

      // ── Views / Counters ──
      const profileViews = typeof data['profileViews'] === 'number' ? data['profileViews'] : 0;
      const videoViews = typeof data['videoViews'] === 'number' ? data['videoViews'] : 0;
      if (profileViews > 0) {
        report.usersWithProfileViews++;
        report.totalProfileViews += profileViews;
      }
      if (videoViews > 0) {
        report.usersWithVideoViews++;
        report.totalVideoViews += videoViews;
      }

      // Verbose logging
      if (isVerbose && report.usersScanned <= 5) {
        console.log(
          `\n  [VERBOSE] User ${uid}: role=${role}, sport=${primarySport ?? 'N/A'}, schema=${schema}`
        );
      }

      progress.tick(report.usersScanned);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (limit > 0 && report.usersScanned >= limit) break;
  }

  progress.done(report.usersScanned);

  // ── Finalize deduplication ──
  report.issues.duplicateEmails = [...emailDuplicates];
  report.teams.uniqueTeamCodes = [...teamCodeSet];

  // ─── Print Console Report ─────────────────────────────────────────────────

  printSummary('Overview', [
    ['Total Users Scanned', report.usersScanned],
    ['V1 (flat fields)', report.v1FlatUsers],
    ['V2 (nested objects)', report.v2NestedUsers],
    ['Users with Secondary Sport', report.usersWithSecondarySport],
    ['Date Range', `${report.oldestCreatedAt ?? 'N/A'} → ${report.newestCreatedAt ?? 'N/A'}`],
  ]);

  printTopN('Role Distribution', report.roleDistribution);
  printTopN('Primary Sport Distribution', report.primarySportDistribution);
  if (Object.keys(report.secondarySportDistribution).length > 0) {
    printTopN('Secondary Sport Distribution', report.secondarySportDistribution);
  }
  printTopN('Schema Versions', report.schemaVersions);

  printSummary('Data Quality Issues', [
    ['Missing Email', report.issues.missingEmail],
    ['Missing First Name', report.issues.missingFirstName],
    ['Missing Last Name', report.issues.missingLastName],
    ['Missing Role', report.issues.missingRole],
    ['Missing Primary Sport (athletes)', report.issues.missingPrimarySport],
    ['Invalid classOf', report.issues.invalidClassOf],
    ['No Profile Image', report.issues.emptyProfileImg],
    ['Duplicate Emails', report.issues.duplicateEmails.length],
    ['Null/Undefined IDs', report.issues.nullOrUndefinedId],
  ]);

  printSummary('Content Volume', [
    ['Users w/ Posts', report.contentVolume.usersWithPosts],
    ['Total Posts (embedded)', report.contentVolume.totalPosts],
    ['Max Posts/User', report.contentVolume.maxPostsPerUser],
    ['Users w/ Sessions', report.contentVolume.usersWithSessions],
    ['Total Sessions', report.contentVolume.totalSessions],
    ['Max Sessions/User', report.contentVolume.maxSessionsPerUser],
    ['Users w/ Templates', report.contentVolume.usersWithTemplates],
    ['Total Templates', report.contentVolume.totalOwnTemplates],
    ['Total Profiles', report.contentVolume.totalOwnProfiles],
    ['Total Mixtapes', report.contentVolume.totalOwnMixtapes],
    ['Max Templates/User', report.contentVolume.maxTemplatesPerUser],
  ]);

  printSummary('Team Associations', [
    ['Users with TeamCode', report.teams.usersWithTeamCode],
    ['Unique TeamCodes', report.teams.uniqueTeamCodes.length],
    ['Users with High School', report.teams.usersWithHighSchool],
    ['Users with Club', report.teams.usersWithClub],
  ]);

  printSummary('Recruiting Data', [
    ['Users with Offers', report.recruiting.usersWithOffers],
    ['Total Offers', report.recruiting.totalOffers],
    ['Users with College Interests', report.recruiting.usersWithCollegeInterests],
    ['Total Interests', report.recruiting.totalInterests],
    ['Users with Visits', report.recruiting.usersWithCollegeVisits],
    ['Total Visits', report.recruiting.totalVisits],
    ['Users with Camps', report.recruiting.usersWithCollegeCamps],
    ['Total Camps', report.recruiting.totalCamps],
    ['Committed', report.recruiting.usersCommitted],
  ]);

  printSummary('Connected Accounts', [
    ['Gmail', report.connectedAccounts.gmail],
    ['Microsoft', report.connectedAccounts.microsoft],
    ['Hudl', report.connectedAccounts.hudl],
    ['YouTube', report.connectedAccounts.youtube],
    ['MaxPreps', report.connectedAccounts.maxpreps],
    ['Twitter/X', report.connectedAccounts.twitter],
    ['Instagram', report.connectedAccounts.instagram],
    ['TikTok', report.connectedAccounts.tiktok],
  ]);

  printSummary('Engagement', [
    ['Users with Profile Views', report.usersWithProfileViews],
    ['Total Profile Views', report.totalProfileViews],
    ['Users with Video Views', report.usersWithVideoViews],
    ['Total Video Views', report.totalVideoViews],
    ['Users with Last Login', report.usersWithLastLogin],
  ]);

  // Top 30 most common fields
  printTopN('Field Presence (top 30)', report.fieldPresence, 30);

  // ── Write JSON Report ──
  // Convert Sets to arrays for JSON serialization
  const jsonReport = {
    ...report,
    issues: {
      ...report.issues,
      duplicateEmails: report.issues.duplicateEmails.slice(0, 100), // Cap at 100
    },
    teams: {
      ...report.teams,
      uniqueTeamCodes: report.teams.uniqueTeamCodes.slice(0, 500), // Cap for readability
    },
  };
  writeReport(`analyze-legacy-users-${new Date().toISOString().slice(0, 10)}.json`, jsonReport);

  console.log('\n  ✅ Analysis complete. Review the report before proceeding to migration.\n');
}

main().catch((err) => {
  console.error('\n  ❌ Fatal error:', err);
  process.exit(1);
});
