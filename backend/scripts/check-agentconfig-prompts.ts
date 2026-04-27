import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

function summarize(prompt: string) {
  return {
    length: prompt.length,
    hasAlwaysRespondDirectly: /ALWAYS respond directly/i.test(prompt),
    hasDirectResponseSection: /Direct Response/i.test(prompt),
    hasExternalAppsRefusalPattern: /can'?t directly open|external applications/i.test(prompt),
    directResponseSnippet: (prompt.match(/Direct Response[\s\S]{0,450}/i)?.[0] ?? '').replace(/\s+/g, ' ').trim(),
  };
}

async function main(): Promise<void> {
  const [{ db }, { stagingDb }] = await Promise.all([
    import('../src/utils/firebase.js'),
    import('../src/utils/firebase-staging.js'),
  ]);

  const [prodSnap, stageSnap] = await Promise.all([
    db.collection('AppConfig').doc('agentConfig').get(),
    stagingDb.collection('AppConfig').doc('agentConfig').get(),
  ]);

  const prod = prodSnap.data() ?? {};
  const stage = stageSnap.data() ?? {};
  const prodPrompt = String((prod as any)?.prompts?.plannerSystemPrompt ?? '');
  const stagePrompt = String((stage as any)?.prompts?.plannerSystemPrompt ?? '');

  console.log(
    JSON.stringify(
      {
        nodeEnv: process.env.NODE_ENV ?? null,
        production: summarize(prodPrompt),
        staging: summarize(stagePrompt),
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
