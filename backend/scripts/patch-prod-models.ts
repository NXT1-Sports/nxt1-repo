/**
 * One-off patch: update AppConfig/agentConfig modelRouting in production Firestore
 * to use the approved 2026 production model catalogue and fallback chains.
 *
 * Usage:
 *   npx tsx scripts/patch-prod-models.ts              # dry run
 *   npx tsx scripts/patch-prod-models.ts --commit     # write to Firestore
 */

import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');

const PROD_CATALOGUE = {
  routing: '~anthropic/claude-sonnet-latest',
  extraction: 'anthropic/claude-opus-4.7',
  data_heavy: 'x-ai/grok-4.3',
  evaluator: 'anthropic/claude-opus-4.7',
  compliance: 'openai/o1',
  copywriting: '~anthropic/claude-opus-latest',
  prompt_engineering: 'openai/o1',
  chat: 'openai/gpt-chat-latest',
  task_automation: 'openai/gpt-5.5-pro',
  image_generation: 'openai/gpt-5.4-image-2',
  video_generation: 'google/gemini-3-pro-image-preview',
  vision_analysis: 'google/gemini-3.1-pro-preview',
  video_analysis: 'google/gemini-3.1-pro-preview',
  audio_analysis: 'openai/gpt-5.5',
  voice_generation: 'openai/gpt-audio-mini',
  music_generation: 'google/lyria-3-pro-preview',
  embedding: 'openai/text-embedding-3-small',
  moderation: 'meta-llama/llama-guard-3-8b',
} as const;

const PROD_FALLBACK_CHAINS: Record<string, readonly string[]> = {
  routing: [
    '~anthropic/claude-sonnet-latest',
    'mistralai/mistral-medium-3-5',
    'anthropic/claude-opus-4.7',
    'openai/gpt-5.5-pro',
  ],
  extraction: ['anthropic/claude-opus-4.7', 'openai/o1', 'openai/gpt-4o-mini'],
  data_heavy: ['x-ai/grok-4.3', 'openai/o3-deep-research', 'openai/gpt-5.5-pro'],
  evaluator: ['anthropic/claude-opus-4.7', 'openai/o1', 'anthropic/claude-sonnet-4'],
  compliance: ['openai/o1', 'anthropic/claude-opus-4.7', 'openai/gpt-4o'],
  copywriting: ['~anthropic/claude-opus-latest', 'openai/gpt-5.5-pro', 'anthropic/claude-opus-4.5'],
  prompt_engineering: ['openai/o1', 'anthropic/claude-opus-4.7', 'openai/gpt-4o'],
  chat: ['openai/gpt-chat-latest', 'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.5'],
  task_automation: [
    'openai/gpt-5.5-pro',
    'mistralai/mistral-medium-3-5',
    'anthropic/claude-opus-4.7',
  ],
  image_generation: ['openai/gpt-5.4-image-2', 'google/gemini-3-pro-image-preview'],
  video_generation: ['google/gemini-3-pro-image-preview'],
  vision_analysis: [
    'google/gemini-3.1-pro-preview',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'openai/gpt-5.5-pro',
    'openai/gpt-4o',
  ],
  video_analysis: [
    'google/gemini-3.1-pro-preview',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
  ],
  audio_analysis: [
    'openai/gpt-5.5',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'openai/gpt-4o',
  ],
  voice_generation: ['openai/gpt-audio-mini', 'openai/gpt-4o-mini-tts-2025-12-15'],
  music_generation: ['google/lyria-3-pro-preview', 'google/lyria-3-clip-preview'],
  embedding: ['openai/text-embedding-3-small'],
  moderation: ['meta-llama/llama-guard-3-8b', 'openai/gpt-4o-mini'],
};

function initProductionFirestore() {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env'
    );
  }

  const appName = 'production-model-patch';
  const existing = getApps().find((app) => app.name === appName);
  const app =
    existing ??
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      },
      appName
    );

  return getFirestore(app);
}

async function main(): Promise<void> {
  const db = initProductionFirestore();

  const patch = {
    'modelRouting.catalogue': PROD_CATALOGUE,
    'modelRouting.fallbackChains': PROD_FALLBACK_CHAINS,
    updatedAt: new Date().toISOString(),
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Production Model Routing Patch');
  console.log('  Project: nxt-1-v2');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('Patching modelRouting.catalogue:');
  console.log(`  routing:        ${PROD_CATALOGUE.routing}`);
  console.log(`  data_heavy:     ${PROD_CATALOGUE.data_heavy}`);
  console.log(`  chat:           ${PROD_CATALOGUE.chat}`);
  console.log(`  task_automation:${PROD_CATALOGUE.task_automation}`);
  console.log('  ... (all prod tiers and fallback chains updated)');
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run with --commit to write to Firestore.');
    return;
  }

  const docRef = db.collection('AppConfig').doc('agentConfig');
  await docRef.update(patch);

  const snap = await docRef.get();
  const data = snap.data() ?? {};
  console.log('✅ AppConfig/agentConfig.modelRouting updated in nxt-1-v2.');
  console.log('   Backend will pick up new models within 60s (cache TTL).');
  console.log('');
  console.log(
    JSON.stringify(
      {
        catalogue: {
          routing: data['modelRouting']?.catalogue?.routing,
          data_heavy: data['modelRouting']?.catalogue?.data_heavy,
          chat: data['modelRouting']?.catalogue?.chat,
          task_automation: data['modelRouting']?.catalogue?.task_automation,
        },
        fallbackChains: {
          routing: data['modelRouting']?.fallbackChains?.routing,
          data_heavy: data['modelRouting']?.fallbackChains?.data_heavy,
          task_automation: data['modelRouting']?.fallbackChains?.task_automation,
          vision_analysis: data['modelRouting']?.fallbackChains?.vision_analysis,
          audio_analysis: data['modelRouting']?.fallbackChains?.audio_analysis,
        },
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
