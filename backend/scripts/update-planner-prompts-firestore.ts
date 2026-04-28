import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_CONFIG_DOC_ID,
  APP_CONFIG_COLLECTION,
} from '../src/modules/agent/config/agent-app-config.js';
import { PlannerAgent } from '../src/modules/agent/agents/planner.agent.js';
import { ClassifierAgent } from '../src/modules/agent/agents/classifier.agent.js';
import { ConversationAgent } from '../src/modules/agent/agents/conversation.agent.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const promptContext = {} as Parameters<PlannerAgent['getSystemPrompt']>[0];
const EXPECTED_PROJECT_IDS = {
  production: 'nxt-1-v2',
  staging: 'nxt-1-staging-v2',
} as const;

function getOrInitFirestore(environment: 'production' | 'staging') {
  const appName = environment === 'production' ? 'agent-config-prod-v2' : 'agent-config-staging-v2';
  const existing = admin.apps.find((app) => app?.name === appName);
  if (existing) {
    const firestore = existing.firestore();
    firestore.settings({ ignoreUndefinedProperties: true });
    return firestore;
  }

  const projectId =
    environment === 'production'
      ? process.env['FIREBASE_PROJECT_ID']
      : process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail =
    environment === 'production'
      ? process.env['FIREBASE_CLIENT_EMAIL']
      : process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey =
    environment === 'production'
      ? process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n')
      : process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Missing Firebase credentials in env for ${environment}.`);
  }

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      projectId,
    },
    appName
  );

  const firestore = app.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

function buildPromptTemplates() {
  return {
    plannerSystemPrompt: new PlannerAgent({} as never).getSystemPrompt(promptContext),
    classifierSystemPrompt: new ClassifierAgent({} as never).getSystemPrompt(),
    conversationSystemPrompt: new ConversationAgent({} as never).getSystemPrompt(),
  } as const;
}

function resolveConfiguredProjectId(environment: 'production' | 'staging'): string | undefined {
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

function assertExpectedProjectTarget(environment: 'production' | 'staging'): string {
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

function summarizeDiff(currentPrompt: string, nextPrompt: string): string {
  if (currentPrompt === nextPrompt) {
    return 'unchanged';
  }

  return `${currentPrompt.length} -> ${nextPrompt.length}`;
}

async function main(): Promise<void> {
  const prompts = buildPromptTemplates();
  const db = getOrInitFirestore('production');
  const stagingDb = getOrInitFirestore('staging');
  const targets = [
    {
      name: 'production' as const,
      projectId: assertExpectedProjectTarget('production'),
      ref: db.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID),
    },
    {
      name: 'staging' as const,
      projectId: assertExpectedProjectTarget('staging'),
      ref: stagingDb.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID),
    },
  ];

  for (const target of targets) {
    const snap = await target.ref.get();
    const currentPrompts =
      ((snap.data() ?? {}) as { prompts?: Record<string, string> }).prompts ?? {};
    const promptDiffs = {
      plannerSystemPrompt: summarizeDiff(
        String(currentPrompts['plannerSystemPrompt'] ?? ''),
        prompts.plannerSystemPrompt
      ),
      classifierSystemPrompt: summarizeDiff(
        String(currentPrompts['classifierSystemPrompt'] ?? ''),
        prompts.classifierSystemPrompt
      ),
      conversationSystemPrompt: summarizeDiff(
        String(currentPrompts['conversationSystemPrompt'] ?? ''),
        prompts.conversationSystemPrompt
      ),
    };

    console.log(`[${target.name}] Project ${target.projectId}`);
    console.log(
      `[${target.name}] planner=${promptDiffs.plannerSystemPrompt}, classifier=${promptDiffs.classifierSystemPrompt}, conversation=${promptDiffs.conversationSystemPrompt}`
    );

    const hasChanges = Object.values(promptDiffs).some((value) => value !== 'unchanged');
    if (!hasChanges) {
      console.log(`[${target.name}] Prompt templates already up to date.`);
      continue;
    }

    if (!commit) {
      console.log(`[${target.name}] Dry run only. Re-run with --commit to apply changes.`);
      continue;
    }

    await target.ref.set(
      {
        updatedAt: new Date().toISOString(),
        prompts,
      },
      { merge: true }
    );

    console.log(`[${target.name}] AppConfig/agentConfig prompts updated.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
