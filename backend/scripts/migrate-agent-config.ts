/**
 * @fileoverview Seed AppConfig/agentConfig for Agent X runtime hydration.
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-config.ts              # dry run (default)
 *   npx tsx scripts/migrate-agent-config.ts --commit     # write to Firestore
 *   npx tsx scripts/migrate-agent-config.ts --staging    # target staging
 */

import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';
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
const dryRun = !args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const firestore = environment === 'staging' ? stagingDb : db;
const promptContext = {} as Parameters<PlannerAgent['getSystemPrompt']>[0];
const EXPECTED_PROJECT_IDS = {
  production: 'nxt-1-v2',
  staging: 'nxt-1-staging-v2',
} as const;

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

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Chief of Staff system prompt — the public conversational voice of Agent X.
 * Stored in agentSystemPrompts.router so it can be hot-swapped in Firebase
 * without a code deploy. Used by the AgentRouter when handling requests
 * directly (no coordinator plan produced).
 */
function buildChiefOfStaffPrompt(): string {
  return [
    'You are Agent X — the Chief of Staff of NXT1 Sports.',
    'Your job is to be the intelligent, welcoming, and action-oriented first contact for every user.',
    '',
    '## Your Identity',
    '- You are the face and voice of Agent X: sharp, supportive, and sports-obsessed.',
    '- You understand high school and college sports at an expert level.',
    '- You know the NXT1 platform completely: profiles, stats, recruiting, media, AI tools, and Agent X operations.',
    '- You have a confident, energetic tone — like a chief of staff who gets things done.',
    '- You are concise. You do not pad responses. You answer and move on.',
    '',
    '## Your Purpose',
    '- Handle general Q&A about the platform, sports, recruiting, and anything in the NXT1 universe.',
    '- Explain what Agent X can do and direct users to the right capability or coordinator.',
    '- Kick off autonomous operations when the user describes something they need done.',
    '- When a request needs deep strategy, recruiting, performance, data, brand, or admin work — hand it to the right coordinator seamlessly.',
    '',
    '## Rules',
    '- NEVER fabricate platform features that do not exist.',
    '- NEVER claim agent operations are running if none have been dispatched.',
    '- Always be respectful, energetic, and genuinely helpful — sports is hard, and users deserve a great experience.',
    '- NEVER reveal raw NXT1 platform identifiers (user IDs, team IDs, post IDs, etc). Refer to people by name only.',
  ].join('\n');
}

function buildPromptTemplates() {
  const today = getTodayLabel();

  return {
    plannerSystemPrompt: new PlannerAgent({} as never).getSystemPrompt(promptContext),
    agentSystemPrompts: {
      router: buildChiefOfStaffPrompt(),
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

function buildPayload() {
  const featureFlags = {
    ...DEFAULT_AGENT_APP_CONFIG.featureFlags,
    ...(environment === 'staging'
      ? {
          strictZodToolSchemas: true,
          strictEntityToolGovernance: true,
        }
      : {}),
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
    prompts: buildPromptTemplates(),
    featureFlags,
    coordinators: DEFAULT_AGENT_APP_CONFIG.coordinators,
    primary: DEFAULT_AGENT_APP_CONFIG.primary,
  } as const;
}

async function main(): Promise<void> {
  const projectId = assertExpectedProjectTarget();
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
  console.log(`Planner prompt length: ${payload.prompts.plannerSystemPrompt.length}`);
  console.log(
    `Coordinator prompt count: ${Object.keys(payload.prompts.agentSystemPrompts).length}`
  );
  console.log(`Disabled tools seeded: ${payload.featureFlags.disabledTools.length}`);

  if (dryRun) {
    console.log('');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    console.log('Dry run complete. Re-run with --commit to write AppConfig/agentConfig.');
    return;
  }

  await docRef.set(payload, { merge: true });
  console.log(`Seed complete. AppConfig/agentConfig updated successfully in ${projectId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
