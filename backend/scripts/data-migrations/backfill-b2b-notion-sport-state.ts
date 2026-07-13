#!/usr/bin/env tsx
/**
 * @fileoverview Backfill B2B Notion Sport/State fields
 * @module @nxt1/backend/scripts
 *
 * Backfills Sport + State on existing B2B funnel rows by re-upserting
 * Account Started data from eligible user docs.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/backfill-b2b-notion-sport-state.ts
 *   npx tsx scripts/data-migrations/backfill-b2b-notion-sport-state.ts --commit
 *   npx tsx scripts/data-migrations/backfill-b2b-notion-sport-state.ts --staging
 *   npx tsx scripts/data-migrations/backfill-b2b-notion-sport-state.ts --commit --limit=200
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { UserRole } from '@nxt1/core';
import type { UserV2Document } from '../../src/routes/auth/shared.js';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

function parseArgs(): {
  readonly commit: boolean;
  readonly staging: boolean;
  readonly limit: number;
} {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const staging = args.includes('--staging');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : 500;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 5000) : 500;

  return { commit, staging, limit };
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isCoachOrDirector(role: UserRole | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return normalized === 'coach' || normalized === 'director';
}

function getPrimarySportProfile(user: UserV2Document) {
  if (!user.sports || user.sports.length === 0) return undefined;
  const activeIndex =
    typeof user.activeSportIndex === 'number' && user.activeSportIndex >= 0
      ? user.activeSportIndex
      : 0;
  return user.sports[activeIndex] ?? user.sports[0];
}

function resolvePrimarySport(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.sport) ||
    compactText(user.sports?.find((sport) => compactText(sport.sport))?.sport)
  );
}

function resolveTeamName(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.team?.name) ||
    compactText(user.teamCode?.teamName) ||
    compactText(user.coach?.organization) ||
    compactText(user.organization) ||
    compactText(user.sports?.find((sport) => compactText(sport.team?.name))?.team?.name)
  );
}

function resolveTeamType(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.team?.type) ||
    compactText(user.sports?.find((sport) => compactText(sport.team?.type))?.team?.type)
  );
}

function resolveTeamId(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.team?.teamId) ||
    compactText(user.sports?.find((sport) => compactText(sport.team?.teamId))?.team?.teamId) ||
    compactText(user.teamCode?.teamId)
  );
}

function resolveOrganizationId(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.team?.organizationId) ||
    compactText(
      user.sports?.find((sport) => compactText(sport.team?.organizationId))?.team?.organizationId
    )
  );
}

function resolveOrganizationType(user: UserV2Document): string | undefined {
  return (
    compactText(getPrimarySportProfile(user)?.team?.type) ||
    compactText(user.sports?.find((sport) => compactText(sport.team?.type))?.team?.type)
  );
}

function hasOrganizationContext(user: UserV2Document): boolean {
  return Boolean(
    resolveOrganizationId(user) ||
    resolveTeamName(user) ||
    compactText(user.coach?.organization) ||
    compactText(user.organization)
  );
}

async function main(): Promise<void> {
  const { commit, staging, limit } = parseArgs();
  const env = staging ? 'staging' : 'production';

  const [{ upsertSignupDashboardEntry }, { db }] = await Promise.all([
    import('../../src/services/marketing/integrations/notion/signup-dashboard-entry.service.js'),
    staging
      ? import('../../src/utils/firebase-staging.js').then((m) => ({ db: m.stagingDb }))
      : import('../../src/utils/firebase.js'),
  ]);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  B2B Notion Sport/State Backfill');
  console.log(`  Environment: ${env}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Limit: ${limit}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const snapshot = await db
    .collection('Users')
    .where('lifecycle.signup.notionDashboard.status', '==', 'created')
    .limit(limit)
    .get();

  const stats = {
    scanned: snapshot.size,
    eligible: 0,
    skippedNoRoleOrOrg: 0,
    skippedMissingSportAndState: 0,
    created: 0,
    existing: 0,
    skipped: 0,
    failed: 0,
  };

  for (const doc of snapshot.docs) {
    const user = doc.data() as UserV2Document;
    if (!isCoachOrDirector(user.role) || !hasOrganizationContext(user)) {
      stats.skippedNoRoleOrOrg += 1;
      continue;
    }

    const primarySport = resolvePrimarySport(user);
    const state = compactText(user.location?.state ?? user.state);

    if (!primarySport && !state) {
      stats.skippedMissingSportAndState += 1;
      continue;
    }

    stats.eligible += 1;

    if (!commit) {
      continue;
    }

    try {
      const result = await upsertSignupDashboardEntry({
        userId: doc.id,
        environment: env,
        role: user.role as UserRole,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        email: user.contact?.email ?? user.email,
        phone: user.contact?.phone,
        primarySport,
        teamName: resolveTeamName(user),
        teamType: resolveTeamType(user),
        teamId: resolveTeamId(user),
        organizationId: resolveOrganizationId(user),
        organizationType: resolveOrganizationType(user),
        city: user.location?.city ?? user.city,
        state,
        referralId: user.referralId,
        referralSource: user.referralSource,
        referralDetails: user.referralDetails,
        referralClubName: user.referralClubName,
        referralOtherSpecify: user.referralOtherSpecify,
        teamCode: user.teamCode?.teamCode,
        teamCodeName: user.teamCode?.teamName,
      });

      if (result.status === 'created') {
        stats.created += 1;
      } else if (result.status === 'existing') {
        stats.existing += 1;
      } else {
        stats.skipped += 1;
      }
    } catch (error) {
      stats.failed += 1;
      console.error('[backfill-b2b-notion-sport-state] Failed user', {
        userId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('Results:');
  console.log(`  scanned:                    ${stats.scanned}`);
  console.log(`  eligible:                   ${stats.eligible}`);
  console.log(`  skipped no role/org:        ${stats.skippedNoRoleOrOrg}`);
  console.log(`  skipped no sport+state:     ${stats.skippedMissingSportAndState}`);
  console.log(`  upsert existing:            ${stats.existing}`);
  console.log(`  upsert created:             ${stats.created}`);
  console.log(`  upsert skipped:             ${stats.skipped}`);
  console.log(`  failed:                     ${stats.failed}`);
  console.log('');

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to apply updates.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal backfill error:', error);
    process.exit(1);
  });
