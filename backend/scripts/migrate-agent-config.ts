/**
 * @fileoverview Seed AppConfig/agentConfig for Agent X runtime hydration.
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-config.ts              # dry run (default)
 *   npx tsx scripts/migrate-agent-config.ts --commit     # write to Firestore
 *   npx tsx scripts/migrate-agent-config.ts --staging    # target staging
 */

import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';
import {
  AGENT_CONFIG_DOC_ID,
  APP_CONFIG_COLLECTION,
  DEFAULT_COORDINATOR_UI_CONFIG,
  DEFAULT_AGENT_APP_CONFIG,
} from '../src/modules/agent/config/agent-app-config.js';
import { PlannerAgent } from '../src/modules/agent/agents/planner.agent.js';
import { AdminCoordinatorAgent } from '../src/modules/agent/agents/admin-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../src/modules/agent/agents/brand-coordinator.agent.js';
import { DataCoordinatorAgent } from '../src/modules/agent/agents/data-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../src/modules/agent/agents/performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../src/modules/agent/agents/recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../src/modules/agent/agents/strategy-coordinator.agent.js';

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

function buildPromptTemplates() {
  const today = getTodayLabel();

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

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    operationalLimits: DEFAULT_AGENT_APP_CONFIG.operationalLimits,
    domainKnowledge: DEFAULT_AGENT_APP_CONFIG.domainKnowledge,
    modelRouting: DEFAULT_AGENT_APP_CONFIG.modelRouting,
    prompts: buildPromptTemplates(),
    featureFlags,
    coordinators: DEFAULT_AGENT_APP_CONFIG.coordinators.map((coordinator) => {
      const ui = DEFAULT_COORDINATOR_UI_CONFIG[coordinator.id];
      return {
        ...coordinator,
        availableForRoles: ui?.availableForRoles ?? coordinator.availableForRoles,
        commands: ui?.commands ?? coordinator.commands,
        scheduledActions: ui?.scheduledActions ?? coordinator.scheduledActions,
      };
    }),
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
