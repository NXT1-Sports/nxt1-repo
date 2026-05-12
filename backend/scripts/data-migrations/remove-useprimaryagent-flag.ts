/**
 * @fileoverview Remove legacy featureFlags.useprimaryAgent from AppConfig/agentConfig.
 *
 * Usage:
 *   npx tsx scripts/remove-useprimaryagent-flag.ts            # dry run
 *   npx tsx scripts/remove-useprimaryagent-flag.ts --commit   # apply changes
 */

import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';

const APP_CONFIG_COLLECTION = 'AppConfig';
const AGENT_CONFIG_DOC_ID = 'agentConfig';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const args = process.argv.slice(2);
const commit = args.includes('--commit');

const EXPECTED_PROJECT_IDS = {
  production: 'nxt-1-v2',
  staging: 'nxt-1-staging-v2',
} as const;

type EnvironmentName = keyof typeof EXPECTED_PROJECT_IDS;

function resolveConfiguredProjectId(environment: EnvironmentName): string | undefined {
  if (environment === 'staging') {
    return (
      process.env['STAGING_FIREBASE_PROJECT_ID'] ??
      process.env['GOOGLE_CLOUD_PROJECT'] ??
      process.env['GCLOUD_PROJECT']
    );
  }

  return (
    process.env['FIREBASE_PROJECT_ID'] ??
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['GCLOUD_PROJECT']
  );
}

function assertExpectedProjectTarget(environment: EnvironmentName): string {
  const expectedProjectId = EXPECTED_PROJECT_IDS[environment];
  const configuredProjectId = resolveConfiguredProjectId(environment);

  if (!configuredProjectId) {
    throw new Error(
      `Unable to resolve Firebase project id for ${environment}. ` +
        `Set GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT to ${expectedProjectId} before running this script.`
    );
  }

  if (configuredProjectId !== expectedProjectId) {
    throw new Error(
      `Refusing to update ${environment}: resolved project id is ${configuredProjectId}, expected ${expectedProjectId}.`
    );
  }

  return configuredProjectId;
}

async function removeLegacyFlag(environment: EnvironmentName): Promise<void> {
  const projectId = assertExpectedProjectTarget(environment);
  const firestore = environment === 'staging' ? stagingDb : db;
  const docRef = firestore.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID);

  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(
      `[${environment}] ${APP_CONFIG_COLLECTION}/${AGENT_CONFIG_DOC_ID} not found. Skipping.`
    );
    return;
  }

  const data = snap.data() as { featureFlags?: Record<string, unknown> };
  const hasLegacyFlag =
    data.featureFlags && Object.prototype.hasOwnProperty.call(data.featureFlags, 'useprimaryAgent');

  if (!hasLegacyFlag) {
    console.log(
      `[${environment}] Project ${projectId}: featureFlags.useprimaryAgent already absent.`
    );
    return;
  }

  console.log(`[${environment}] Project ${projectId}: featureFlags.useprimaryAgent found.`);
  if (!commit) {
    console.log(`[${environment}] Dry run only. Re-run with --commit to remove it.`);
    return;
  }

  await docRef.set(
    {
      updatedAt: new Date().toISOString(),
      featureFlags: {
        useprimaryAgent: admin.firestore.FieldValue.delete(),
      },
    },
    { merge: true }
  );

  console.log(`[${environment}] Removed featureFlags.useprimaryAgent.`);
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Remove Legacy useprimaryAgent Flag');
  console.log(`  Mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  await removeLegacyFlag('production');
  await removeLegacyFlag('staging');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
