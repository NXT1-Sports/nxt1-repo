/**
 * @fileoverview Script to re-sync all onboarded B2C users into Notion.
 *
 * Promotes all users who have completed onboarding (`onboardingCompleted: true` in Firestore)
 * to the `Onboarding Completed` stage in the Notion B2C Users database.
 *
 * Usage:
 *   cd backend && npx tsx scripts/sync-onboarded-b2c-users-notion.ts [--dry-run] [--env=production|staging]
 */

import { execSync } from 'node:child_process';

// Ensure Notion & Firebase production defaults are set before static imports run
if (!process.env['NOTION_API_TOKEN']) {
  process.env['NOTION_API_TOKEN'] = 'ntn_b38264946492oyCJBDyZyII01etd90y3sByx28xZPJ2buq';
}
if (!process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID']) {
  process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID'] = '9bbfe296a14a4a0a8eac2c45cb796b4b';
}
if (!process.env['NOTION_SIGNUP_DASHBOARD_ENABLED']) {
  process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
}

if (!process.env['FIREBASE_PRIVATE_KEY'] || !process.env['FIREBASE_CLIENT_EMAIL']) {
  try {
    const clientEmail = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_CLIENT_EMAIL --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    const privateKey = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_PRIVATE_KEY --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    if (clientEmail && privateKey) {
      process.env['FIREBASE_PROJECT_ID'] = 'nxt-1-v2';
      process.env['FIREBASE_CLIENT_EMAIL'] = clientEmail;
      process.env['FIREBASE_PRIVATE_KEY'] = privateKey;
    }
  } catch {
    // Best effort loading from gcloud Secret Manager
  }
}

interface SyncCliArgs {
  readonly isDryRun: boolean;
  readonly environment: 'production' | 'staging';
}

function parseCliArgs(): SyncCliArgs {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const envArg = args.find((arg) => arg.startsWith('--env='));
  const environment = envArg?.split('=')[1] === 'staging' ? 'staging' : 'production';

  return { isDryRun, environment };
}

async function syncOnboardedB2CUsersToNotion(): Promise<void> {
  const { reupsertB2CUsersAccountStartedEntry } =
    await import('../src/services/marketing/lifecycle/b2c-users.service.js');
  const { db } = await import('../src/utils/firebase.js');
  const { logger } = await import('../src/utils/logger.js');
  const { isDryRun, environment } = parseCliArgs();

  logger.info('[SyncOnboardedB2CUsers] Starting B2C Users Notion Stage Sync', {
    isDryRun,
    environment,
  });

  const snapshot = await db.collection('Users').where('onboardingCompleted', '==', true).get();

  logger.info(
    `[SyncOnboardedB2CUsers] Found ${snapshot.docs.length} onboarded users in Firestore.`
  );

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    const userData = doc.data();
    const email = userData['email'] || userData['contact']?.['email'] || 'N/A';

    if (isDryRun) {
      logger.info(`[DRY RUN] Would re-upsert B2C user: ${userId} (${email})`);
      successCount++;
      continue;
    }

    try {
      const result = await reupsertB2CUsersAccountStartedEntry({
        db,
        userId,
        environment,
      });

      if (result.status === 'created' || result.status === 'existing') {
        successCount++;
        logger.info(`[SyncOnboardedB2CUsers] Successfully updated user ${userId} (${email})`, {
          status: result.status,
          pageId: result.pageId,
          pageUrl: result.pageUrl,
        });
      } else if (result.status === 'skipped') {
        skipCount++;
        logger.info(`[SyncOnboardedB2CUsers] Skipped user ${userId} (${email})`, {
          reason: result.reason,
        });
      } else {
        failCount++;
        logger.error(`[SyncOnboardedB2CUsers] Failed user ${userId} (${email})`, {
          reason: result.reason,
        });
      }
    } catch (error) {
      failCount++;
      logger.error(`[SyncOnboardedB2CUsers] Exception processing user ${userId} (${email})`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('[SyncOnboardedB2CUsers] Finished B2C Users Notion Stage Sync', {
    total: snapshot.docs.length,
    successCount,
    skipCount,
    failCount,
  });
}

syncOnboardedB2CUsersToNotion()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[SyncOnboardedB2CUsers] Fatal error in sync script', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
