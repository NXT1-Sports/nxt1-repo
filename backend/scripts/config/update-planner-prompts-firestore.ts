import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_CONFIG_DOC_ID,
  APP_CONFIG_COLLECTION,
} from '../src/modules/agent/config/agent-app-config.js';
import { PlannerAgent } from '../src/modules/agent/agents/planner.agent.js';
import { AdminCoordinatorAgent } from '../src/modules/agent/agents/admin-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../src/modules/agent/agents/brand-coordinator.agent.js';
import { DataCoordinatorAgent } from '../src/modules/agent/agents/data-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../src/modules/agent/agents/performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../src/modules/agent/agents/recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../src/modules/agent/agents/strategy-coordinator.agent.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const stagingOnly = args.includes('--staging-only');
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
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return {
    plannerSystemPrompt: new PlannerAgent({} as never).getSystemPrompt(promptContext),
    agentSystemPrompts: {
      admin_coordinator: new AdminCoordinatorAgent()
        .getSystemPrompt(promptContext)
        .replace(today, '{{today}}'),
      brand_coordinator: new BrandCoordinatorAgent().getSystemPrompt(promptContext),
      data_coordinator: new DataCoordinatorAgent().getSystemPrompt(promptContext),
      performance_coordinator: new PerformanceCoordinatorAgent().getSystemPrompt(promptContext),
      recruiting_coordinator: new RecruitingCoordinatorAgent().getSystemPrompt(promptContext),
      strategy_coordinator: new StrategyCoordinatorAgent().getSystemPrompt(promptContext),
    },
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

  const environments: Array<'production' | 'staging'> = stagingOnly
    ? ['staging']
    : ['production', 'staging'];

  const targets = environments.map((env) => {
    const db = getOrInitFirestore(env);
    return {
      name: env,
      projectId: assertExpectedProjectTarget(env),
      ref: db.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID),
    };
  });

  for (const target of targets) {
    const snap = await target.ref.get();
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const currentPrompts = (data['prompts'] as Record<string, unknown>) ?? {};
    const currentAgentPrompts =
      (currentPrompts['agentSystemPrompts'] as Record<string, string>) ?? {};

    const promptDiffs = {
      plannerSystemPrompt: summarizeDiff(
        String(currentPrompts['plannerSystemPrompt'] ?? ''),
        prompts.plannerSystemPrompt
      ),
      ...Object.fromEntries(
        Object.entries(prompts.agentSystemPrompts).map(([k, v]) => [
          k,
          summarizeDiff(String(currentAgentPrompts[k] ?? ''), v),
        ])
      ),
    };

    const legacyFields = ['classifierSystemPrompt', 'conversationSystemPrompt'].filter(
      (f) => f in currentPrompts
    );

    console.log(`[${target.name}] Project ${target.projectId}`);
    for (const [k, v] of Object.entries(promptDiffs)) {
      console.log(`  ${k}: ${v}`);
    }
    if (legacyFields.length > 0) {
      console.log(`  legacy fields to remove: ${legacyFields.join(', ')}`);
    }

    const hasChanges =
      Object.values(promptDiffs).some((v) => v !== 'unchanged') || legacyFields.length > 0;

    if (!hasChanges) {
      console.log(`[${target.name}] Prompt templates already up to date.`);
      continue;
    }

    if (!commit) {
      console.log(`[${target.name}] Dry run only. Re-run with --commit to apply changes.`);
      continue;
    }

    // Build update payload using dot-notation field paths for precise control
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      'prompts.plannerSystemPrompt': prompts.plannerSystemPrompt,
    };
    for (const [k, v] of Object.entries(prompts.agentSystemPrompts)) {
      updatePayload[`prompts.agentSystemPrompts.${k}`] = v;
    }
    for (const field of legacyFields) {
      updatePayload[`prompts.${field}`] = admin.firestore.FieldValue.delete();
    }

    await target.ref.update(updatePayload);
    console.log(`[${target.name}] AppConfig/agentConfig prompts updated.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
