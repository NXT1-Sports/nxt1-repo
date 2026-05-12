/**
 * @fileoverview Seed AppConfig/agentConfig for Agent X runtime hydration.
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-config.ts              # dry run (default)
 *   npx tsx scripts/migrate-agent-config.ts --commit     # write to Firestore
 *   npx tsx scripts/migrate-agent-config.ts --staging    # target staging
 */

import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_CONFIG_DOC_ID,
  APP_CONFIG_COLLECTION,
  DEFAULT_AGENT_APP_CONFIG,
} from '../src/modules/agent/config/agent-app-config.js';
import {
  DEV_MODEL_CATALOGUE,
  DEV_FALLBACK_CHAIN,
  PROD_MODEL_CATALOGUE,
  PROD_FALLBACK_CHAIN,
} from '../src/modules/agent/llm/llm.types.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const EXPECTED_PROJECT_IDS = {
  production: 'nxt-1-v2',
  staging: 'nxt-1-staging-v2',
} as const;

async function getFirestoreForEnvironment(): Promise<Firestore> {
  const projectId =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_PROJECT_ID']
      : process.env['FIREBASE_PROJECT_ID'];
  const clientEmail =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']
      : process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n')
      : process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_STORAGE_BUCKET']
      : process.env['FIREBASE_STORAGE_BUCKET'];

  const appName = `agent-config-seed-${environment}`;
  const existingApp = admin.apps.find((app) => app?.name === appName);

  const app =
    existingApp ??
    admin.initializeApp(
      {
        credential:
          projectId && clientEmail && privateKey
            ? admin.credential.cert({ projectId, clientEmail, privateKey })
            : admin.credential.applicationDefault(),
        storageBucket,
      },
      appName
    );

  const firestore = app.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

function resolveConfiguredProjectId(): string | undefined {
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

function assertExpectedProjectTarget(): string {
  const expectedProjectId = EXPECTED_PROJECT_IDS[environment];
  const configuredProjectId = resolveConfiguredProjectId();

  if (!configuredProjectId) {
    throw new Error(
      `Unable to resolve Firebase project id for ${environment}. ` +
        `Set GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT to ${expectedProjectId} before running this script.`
    );
  }

  if (configuredProjectId !== expectedProjectId) {
    throw new Error(
      `Refusing to seed ${environment}: resolved project id is ${configuredProjectId}, expected ${expectedProjectId}.`
    );
  }

  return configuredProjectId;
}

function buildPayload() {
  const featureFlags = {
    ...DEFAULT_AGENT_APP_CONFIG.featureFlags,
  };

  // Staging is seeded with DEV models (cheap, fast) — prod gets PROD models.
  // The code-level MODEL_CATALOGUE is the Firestore fallback; seeding the right
  // catalogue here ensures Firestore always reflects the intended environment.
  const modelCatalogue = environment === 'staging' ? DEV_MODEL_CATALOGUE : PROD_MODEL_CATALOGUE;
  const modelFallbackChain = environment === 'staging' ? DEV_FALLBACK_CHAIN : PROD_FALLBACK_CHAIN;

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    operationalLimits: DEFAULT_AGENT_APP_CONFIG.operationalLimits,
    domainKnowledge: DEFAULT_AGENT_APP_CONFIG.domainKnowledge,
    modelRouting: {
      catalogue: modelCatalogue,
      fallbackChains: modelFallbackChain,
    },
    featureFlags,
    coordinators: DEFAULT_AGENT_APP_CONFIG.coordinators,
    primary: DEFAULT_AGENT_APP_CONFIG.primary,
  } as const;
}

async function main(): Promise<void> {
  const projectId = assertExpectedProjectTarget();
  const firestore = await getFirestoreForEnvironment();
  const payload = buildPayload();
  const docRef = firestore.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Agent Config Seed');
  console.log(`  Environment: ${environment}`);
  console.log(`  Project: ${projectId}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('Prompt source: CODE ONLY (Firestore prompts will be cleared)');
  console.log(`Disabled tools seeded: ${payload.featureFlags.disabledTools.length}`);

  if (dryRun) {
    console.log('');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    console.log(
      'Dry run complete. Re-run with --commit to write AppConfig/agentConfig and clear Firestore prompts.'
    );
    return;
  }

  await docRef.set(payload, { merge: true });
  await docRef.update({
    prompts: admin.firestore.FieldValue.delete(),
    updatedBy: admin.firestore.FieldValue.delete(),
    'featureFlags.useprimaryAgent': admin.firestore.FieldValue.delete(),
  });
  console.log(`Seed complete. AppConfig/agentConfig updated successfully in ${projectId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
