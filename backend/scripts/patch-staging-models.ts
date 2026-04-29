/**
 * One-off patch: update AppConfig/agentConfig modelRouting in staging Firestore
 * to use DEV model catalogue instead of prod models.
 *
 * Usage:
 *   npx tsx scripts/patch-staging-models.ts              # dry run
 *   npx tsx scripts/patch-staging-models.ts --commit     # write to Firestore
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

// ─── DEV Model Catalogue (inlined — no @nxt1/core dependency) ────────────────

const DEV_CATALOGUE = {
  routing: 'anthropic/claude-sonnet-4-5',
  extraction: 'anthropic/claude-haiku-4-5',
  data_heavy: 'qwen/qwen3.6-plus',
  evaluator: 'minimax/minimax-m2.7',
  compliance: 'openai/gpt-4o',
  copywriting: 'anthropic/claude-sonnet-4-5',
  prompt_engineering: 'anthropic/claude-sonnet-4-5',
  chat: 'anthropic/claude-haiku-4-5',
  task_automation: 'anthropic/claude-sonnet-4-5',
  image_generation: 'google/gemini-3-pro-image-preview',
  video_generation: 'google/gemini-3-pro-image-preview',
  vision_analysis: 'openai/gpt-4o',
  video_analysis: 'google/gemini-2.5-flash',
  audio_analysis: 'openai/gpt-4o',
  voice_generation: 'openai/gpt-4o-mini',
  music_generation: 'openai/gpt-4o-mini',
  embedding: 'openai/text-embedding-3-small',
  moderation: 'meta-llama/llama-guard-3-8b',
} as const;

const DEV_FALLBACK_CHAINS: Record<string, readonly string[]> = {
  routing: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5'],
  extraction: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'qwen/qwen3.6-plus'],
  data_heavy: ['qwen/qwen3.6-plus', 'anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini'],
  evaluator: ['minimax/minimax-m2.7', 'anthropic/claude-sonnet-4', 'openai/gpt-4o'],
  compliance: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4-5'],
  copywriting: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'qwen/qwen3.6-plus'],
  prompt_engineering: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5'],
  chat: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'deepseek/deepseek-v3.2'],
  task_automation: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5'],
  image_generation: ['google/gemini-3-pro-image-preview'],
  video_generation: ['google/gemini-3-pro-image-preview'],
  vision_analysis: ['openai/gpt-4o', 'anthropic/claude-sonnet-4'],
  video_analysis: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro'],
  audio_analysis: ['openai/gpt-4o', 'anthropic/claude-sonnet-4'],
  voice_generation: ['openai/gpt-4o-mini'],
  music_generation: ['openai/gpt-4o-mini'],
  embedding: ['openai/text-embedding-3-small'],
  moderation: ['meta-llama/llama-guard-3-8b', 'openai/gpt-4o-mini'],
};

// ─── Firebase staging init ────────────────────────────────────────────────────

function initStagingFirestore() {
  const projectId = process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing STAGING_FIREBASE_PROJECT_ID / STAGING_FIREBASE_CLIENT_EMAIL / STAGING_FIREBASE_PRIVATE_KEY in .env'
    );
  }

  const appName = 'staging-patch';
  const existing = getApps().find((a) => a.name === appName);
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = initStagingFirestore();

  const patch = {
    'modelRouting.catalogue': DEV_CATALOGUE,
    'modelRouting.fallbackChains': DEV_FALLBACK_CHAINS,
    updatedAt: new Date().toISOString(),
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Staging Model Routing Patch');
  console.log(`  Project: nxt-1-staging-v2`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('Patching modelRouting.catalogue:');
  console.log(`  routing:    ${DEV_CATALOGUE.routing}`);
  console.log(`  extraction: ${DEV_CATALOGUE.extraction}`);
  console.log(`  chat:       ${DEV_CATALOGUE.chat}`);
  console.log(`  evaluator:  ${DEV_CATALOGUE.evaluator}`);
  console.log('  ... (all tiers → dev models)');
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run with --commit to write to Firestore.');
    return;
  }

  const docRef = db.collection('AppConfig').doc('agentConfig');
  await docRef.update(patch);
  console.log('✅ AppConfig/agentConfig.modelRouting updated in nxt-1-staging-v2.');
  console.log('   Backend will pick up new models within 60s (cache TTL).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
