import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

function hardenPlannerPrompt(prompt) {
  const source = String(prompt ?? '');
  if (!source.trim()) return source;

  const marker = '## Imperative Action Guardrails';
  if (source.includes(marker)) return source;

  const guardrails = [
    marker,
    '- Imperative action requests are NEVER direct-response requests.',
    '- If the user asks Agent X to perform work (for example: open, launch, navigate, go to, watch, log in, send, create, run), you MUST return one or more coordinator tasks.',
    '- For these action requests, tasks MUST be non-empty and directResponse MUST be omitted.',
    '- Do not return refusal-style text such as "I cannot directly open ..." when platform/browser tooling can be used via coordinator execution.',
  ].join('\n');

  const outputFormatHeader = '## Output Format (STRICT JSON)';
  if (source.includes(outputFormatHeader)) {
    return source.replace(outputFormatHeader, `${guardrails}\n\n${outputFormatHeader}`);
  }

  return `${source}\n\n${guardrails}`;
}

const [{ db }, { stagingDb }] = await Promise.all([
  import('./dist/utils/firebase.js'),
  import('./dist/utils/firebase-staging.js'),
]);

const targets = [
  { name: 'production', ref: db.collection('AppConfig').doc('agentConfig') },
  { name: 'staging', ref: stagingDb.collection('AppConfig').doc('agentConfig') },
];

for (const target of targets) {
  const snap = await target.ref.get();
  if (!snap.exists) {
    console.log(`[${target.name}] AppConfig/agentConfig not found. Skipping.`);
    continue;
  }

  const data = snap.data() ?? {};
  const currentPrompt = String(data?.prompts?.plannerSystemPrompt ?? '');
  const updatedPrompt = hardenPlannerPrompt(currentPrompt);

  if (updatedPrompt === currentPrompt) {
    console.log(`[${target.name}] Planner prompt already hardened. No change.`);
    continue;
  }

  await target.ref.set(
    {
      updatedAt: new Date().toISOString(),
      prompts: {
        plannerSystemPrompt: updatedPrompt,
      },
    },
    { merge: true }
  );

  console.log(`[${target.name}] Updated planner prompt. Length ${currentPrompt.length} -> ${updatedPrompt.length}`);
}
