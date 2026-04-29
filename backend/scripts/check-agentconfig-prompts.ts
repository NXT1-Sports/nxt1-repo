import { config as loadDotenv } from 'dotenv';
import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';

loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

function summarize(prompt: string) {
  return {
    length: prompt.length,
    hasAlwaysRespondDirectly: /ALWAYS respond directly/i.test(prompt),
    hasDirectResponseSection: /Direct Response/i.test(prompt),
    hasExternalAppsRefusalPattern: /can'?t directly open|external applications/i.test(prompt),
    directResponseSnippet: (prompt.match(/Direct Response[\s\S]{0,450}/i)?.[0] ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

function summarizeConfig(config: Record<string, unknown>) {
  const prompts = (config.prompts as Record<string, unknown> | undefined) ?? {};
  const agentSystemPrompts =
    (prompts.agentSystemPrompts as Record<string, unknown> | undefined) ?? {};

  const plannerPrompt = String(prompts.plannerSystemPrompt ?? '');
  const primaryPrompt = String(prompts.primarySystemPrompt ?? '');
  const routerPrompt = String(agentSystemPrompts.router ?? '');

  return {
    promptKeys: Object.keys(prompts),
    planner: summarize(plannerPrompt),
    primary: {
      length: primaryPrompt.length,
      enabled: primaryPrompt.trim().length > 0,
    },
    router: {
      length: routerPrompt.length,
      enabled: routerPrompt.trim().length > 0,
    },
    coordinatorPromptCount: Object.keys(agentSystemPrompts).length,
    coordinatorIds: Object.keys(agentSystemPrompts),
  };
}

async function main(): Promise<void> {
  const [prodSnap, stageSnap] = await Promise.all([
    db.collection('AppConfig').doc('agentConfig').get(),
    stagingDb.collection('AppConfig').doc('agentConfig').get(),
  ]);

  const prod = (prodSnap.data() ?? {}) as Record<string, unknown>;
  const stage = (stageSnap.data() ?? {}) as Record<string, unknown>;

  console.log(
    JSON.stringify(
      {
        nodeEnv: process.env.NODE_ENV ?? null,
        production: summarizeConfig(prod),
        staging: summarizeConfig(stage),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
