/**
 * @fileoverview V3 Schema Migration Script
 *
 * Adds V3 field names alongside legacy fields in existing Firestore documents.
 * This is a non-destructive migration — legacy fields are preserved for backward
 * compatibility with V1/V2 consumers.
 *
 * Collections migrated:
 *   - TeamCodes: teamLogoImg → logoUrl, teamColor1 → primaryColor,
 *                teamColor2 → secondaryColor, createAt → createdAt
 *   - Users:     _schemaVersion bumped to 3, sports[].team.logo/colors
 *                denormalized with V3 field names in subscription.teamCode
 *   - RelationalIds: Backfills organizationId + teamId on User.sports[].team
 *                    by looking up RosterEntries → Team docs for each user
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/migrate-v3-schemas.ts                    # dry-run on production
 *   npx tsx scripts/migrate-v3-schemas.ts --apply            # apply on production
 *   npx tsx scripts/migrate-v3-schemas.ts --env=staging      # dry-run on staging
 *   npx tsx scripts/migrate-v3-schemas.ts --env=staging --apply
 *   npx tsx scripts/migrate-v3-schemas.ts --collection=TeamCodes      # migrate only TeamCodes
 *   npx tsx scripts/migrate-v3-schemas.ts --collection=Users          # migrate only Users
 *   npx tsx scripts/migrate-v3-schemas.ts --collection=RelationalIds  # backfill relational IDs only
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const useStaging = getArg('env') === 'staging';
const dryRun = !hasFlag('apply');
const collectionFilter = getArg('collection'); // 'TeamCodes' | 'Users' | null (both)

// ─── Firebase Init ────────────────────────────────────────────────────────────
const projectId = useStaging
  ? process.env['STAGING_FIREBASE_PROJECT_ID']!
  : process.env['FIREBASE_PROJECT_ID']!;
const clientEmail = useStaging
  ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']!
  : process.env['FIREBASE_CLIENT_EMAIL']!;
const privateKey = useStaging
  ? process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n')
  : process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('[migrate-v3] Missing Firebase credentials in .env');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

const db = getFirestore();
const BATCH_SIZE = 500;

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  teamCodesScanned: 0,
  teamCodesUpdated: 0,
  teamCodesSkipped: 0,
  usersScanned: 0,
  usersUpdated: 0,
  usersSkipped: 0,
  relationalScanned: 0,
  relationalUpdated: 0,
  relationalSkipped: 0,
  relationalNoRosterEntry: 0,
};

// ─── TeamCodes Migration ──────────────────────────────────────────────────────
async function migrateTeamCodes(): Promise<void> {
  console.log('\n━━━ Migrating TeamCodes ━━━');

  const collectionRef = db.collection('TeamCodes');
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let hasMore = true;

  while (hasMore) {
    let query = collectionRef.orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      stats.teamCodesScanned++;
      const data = doc.data();
      const updates: Record<string, unknown> = {};

      // logoUrl ← teamLogoImg (only if V3 field missing)
      if (data['logoUrl'] === undefined && data['teamLogoImg'] !== undefined) {
        updates['logoUrl'] = data['teamLogoImg'];
      }

      // primaryColor ← teamColor1
      if (data['primaryColor'] === undefined && data['teamColor1'] !== undefined) {
        updates['primaryColor'] = data['teamColor1'];
      }

      // secondaryColor ← teamColor2
      if (data['secondaryColor'] === undefined && data['teamColor2'] !== undefined) {
        updates['secondaryColor'] = data['teamColor2'];
      }

      // createdAt ← createAt
      if (data['createdAt'] === undefined && data['createAt'] !== undefined) {
        updates['createdAt'] = data['createAt'];
      }

      if (Object.keys(updates).length === 0) {
        stats.teamCodesSkipped++;
        continue;
      }

      stats.teamCodesUpdated++;
      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update TeamCodes/${doc.id}:`,
          Object.keys(updates).join(', ')
        );
      } else {
        batch.update(doc.ref, updates);
        batchCount++;
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} TeamCode updates`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(
    `  TeamCodes — Scanned: ${stats.teamCodesScanned}, Updated: ${stats.teamCodesUpdated}, Skipped: ${stats.teamCodesSkipped}`
  );
}

// ─── Users Migration ──────────────────────────────────────────────────────────
async function migrateUsers(): Promise<void> {
  console.log('\n━━━ Migrating Users ━━━');

  const collectionRef = db.collection('Users');
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let hasMore = true;

  while (hasMore) {
    let query = collectionRef.orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      stats.usersScanned++;
      const data = doc.data();
      const updates: Record<string, unknown> = {};

      // Bump schema version if not already 3
      const currentVersion = data['_schemaVersion'] ?? 1;
      if (currentVersion < 3) {
        updates['_schemaVersion'] = 3;
      }

      // Add logoUrl to subscription.teamCode if it only has teamLogoImg
      const teamCode = data['subscription']?.['teamCode'];
      if (teamCode && teamCode['logoUrl'] === undefined && teamCode['teamLogoImg'] !== undefined) {
        updates['subscription.teamCode.logoUrl'] = teamCode['teamLogoImg'];
      }

      // Backfill V3 fields on sports[].team embedded objects
      const sports = data['sports'] as Array<Record<string, unknown>> | undefined;
      if (sports?.length) {
        let sportsModified = false;
        const updatedSports = sports.map((sport) => {
          const team = sport['team'] as Record<string, unknown> | undefined;
          if (!team) return sport;

          const needsLogoUrl = team['logoUrl'] === undefined && team['logo'] !== undefined;
          const needsPrimary =
            team['primaryColor'] === undefined &&
            Array.isArray(team['colors']) &&
            (team['colors'] as string[]).length > 0;
          const needsSecondary =
            team['secondaryColor'] === undefined &&
            Array.isArray(team['colors']) &&
            (team['colors'] as string[]).length > 1;

          if (!needsLogoUrl && !needsPrimary && !needsSecondary) return sport;

          sportsModified = true;
          const colors = (team['colors'] as string[]) || [];
          return {
            ...sport,
            team: {
              ...team,
              ...(needsLogoUrl && { logoUrl: team['logo'] }),
              ...(needsPrimary && { primaryColor: colors[0] }),
              ...(needsSecondary && { secondaryColor: colors[1] }),
            },
          };
        });

        if (sportsModified) {
          updates['sports'] = updatedSports;
        }
      }

      if (Object.keys(updates).length === 0) {
        stats.usersSkipped++;
        continue;
      }

      stats.usersUpdated++;
      if (dryRun) {
        console.log(`  [DRY RUN] Would update Users/${doc.id}:`, Object.keys(updates).join(', '));
      } else {
        batch.update(doc.ref, updates);
        batchCount++;
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} User updates`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(
    `  Users — Scanned: ${stats.usersScanned}, Updated: ${stats.usersUpdated}, Skipped: ${stats.usersSkipped}`
  );
}

// ─── Relational IDs Backfill ──────────────────────────────────────────────────
// For existing users whose sports[].team lacks organizationId/teamId,
// look up their RosterEntries → Team docs to resolve the relational IDs.
async function migrateRelationalIds(): Promise<void> {
  console.log('\n━━━ Backfilling Relational IDs on Users.sports[].team ━━━');

  const usersRef = db.collection('Users');
  const rosterRef = db.collection('RosterEntries');
  const teamsRef = db.collection('Teams');
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let hasMore = true;

  while (hasMore) {
    let query = usersRef.orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      stats.relationalScanned++;
      const data = doc.data();
      const sports = data['sports'] as Array<Record<string, unknown>> | undefined;

      // Skip users with no sports or no team data
      if (!sports?.length) {
        stats.relationalSkipped++;
        continue;
      }

      // Check if any sport.team is missing relational IDs
      const needsBackfill = sports.some((sport) => {
        const team = sport['team'] as Record<string, unknown> | undefined;
        return team?.['name'] && !team['organizationId'];
      });

      if (!needsBackfill) {
        stats.relationalSkipped++;
        continue;
      }

      // Look up RosterEntries for this user
      const rosterSnapshot = await rosterRef
        .where('userId', '==', doc.id)
        .where('status', 'in', ['active', 'pending'])
        .get();

      if (rosterSnapshot.empty) {
        stats.relationalNoRosterEntry++;
        continue;
      }

      // Fetch Team docs to get sportName + organizationId
      const entries = rosterSnapshot.docs.map((d) => ({
        teamId: d.data()['teamId'] as string,
        organizationId: d.data()['organizationId'] as string,
      }));

      const uniqueTeamIds = [...new Set(entries.map((e) => e.teamId))];
      const teamDocs = await Promise.all(uniqueTeamIds.map((id) => teamsRef.doc(id).get()));

      // Build sport name → { teamId, organizationId } map
      const sportTeamMap = new Map<string, { teamId: string; organizationId: string }>();
      for (const teamDoc of teamDocs) {
        if (!teamDoc.exists) continue;
        const teamData = teamDoc.data()!;
        const sportName = ((teamData['sportName'] as string) || '').toLowerCase();
        const organizationId = teamData['organizationId'] as string;
        if (sportName && organizationId) {
          sportTeamMap.set(sportName, { teamId: teamDoc.id, organizationId });
        }
      }

      if (sportTeamMap.size === 0) {
        stats.relationalNoRosterEntry++;
        continue;
      }

      // Backfill relational IDs on matching sports
      let modified = false;
      const updatedSports = sports.map((sport) => {
        const team = sport['team'] as Record<string, unknown> | undefined;
        if (!team?.['name'] || team['organizationId']) return sport;

        const sportName = ((sport['sport'] as string) || '').toLowerCase();
        const resolved = sportTeamMap.get(sportName);
        if (!resolved) return sport;

        modified = true;
        return {
          ...sport,
          team: {
            ...team,
            organizationId: resolved.organizationId,
            teamId: resolved.teamId,
          },
        };
      });

      if (!modified) {
        stats.relationalSkipped++;
        continue;
      }

      stats.relationalUpdated++;
      if (dryRun) {
        console.log(`  [DRY RUN] Would backfill relational IDs on Users/${doc.id}`);
      } else {
        batch.update(doc.ref, { sports: updatedSports });
        batchCount++;
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} relational ID backfills`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(
    `  Relational — Scanned: ${stats.relationalScanned}, Updated: ${stats.relationalUpdated}, Skipped: ${stats.relationalSkipped}, No RosterEntry: ${stats.relationalNoRosterEntry}`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     V3 Schema Migration                  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Environment: ${useStaging ? 'STAGING' : 'PRODUCTION'}`);
  console.log(
    `  Mode:        ${dryRun ? 'DRY RUN (use --apply to commit)' : '🔴 APPLYING CHANGES'}`
  );
  if (collectionFilter) {
    console.log(`  Collection:  ${collectionFilter}`);
  }

  if (!collectionFilter || collectionFilter === 'TeamCodes') {
    await migrateTeamCodes();
  }

  if (!collectionFilter || collectionFilter === 'Users') {
    await migrateUsers();
  }

  if (!collectionFilter || collectionFilter === 'RelationalIds') {
    await migrateRelationalIds();
  }

  console.log('\n━━━ Summary ━━━');
  console.log(`  TeamCodes:      ${stats.teamCodesUpdated}/${stats.teamCodesScanned} updated`);
  console.log(`  Users:          ${stats.usersUpdated}/${stats.usersScanned} updated`);
  console.log(
    `  Relational IDs: ${stats.relationalUpdated}/${stats.relationalScanned} updated (${stats.relationalNoRosterEntry} without RosterEntry)`
  );

  if (dryRun) {
    console.log('\n  ⚠️  This was a dry run. Use --apply to commit changes.');
  } else {
    console.log('\n  ✅ Migration complete.');
  }
}

main().catch((err) => {
  console.error('[migrate-v3] Fatal error:', err);
  process.exit(1);
});
