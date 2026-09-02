import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateWeeklyReleaseNotes } from '../../src/services/platform/release-notes-generator.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

dotenv({ path: path.join(backendRoot, '.env') });
dotenv({ path: path.join(backendRoot, '.env.local'), override: true });

type TargetEnvironment = 'staging' | 'production';

function getArgValue(flag: string): string | undefined {
  const inlineArg = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inlineArg) {
    return inlineArg.slice(flag.length + 1);
  }

  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function resolveTarget(): TargetEnvironment {
  const value = (getArgValue('--target') ?? 'staging').trim().toLowerCase();
  if (value === 'production') return 'production';
  return 'staging';
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function loadFirestoreForTarget(target: TargetEnvironment) {
  if (target === 'production') {
    const module = await import('../../src/utils/firebase.js');
    return module.db;
  }

  const module = await import('../../src/utils/firebase-staging.js');
  return module.stagingDb;
}

async function main(): Promise<void> {
  const target = resolveTarget();
  const force = hasFlag('--force');
  const db = await loadFirestoreForTarget(target);

  console.log(`\n🚀 Generating weekly release notes for ${target}${force ? ' (force)' : ''}`);

  const result = await generateWeeklyReleaseNotes(db, { force });

  if (result.status === 'skipped') {
    console.log('ℹ️  Release notes skipped');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('✅ Release note generated');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Weekly release notes generation failed:', err);
  process.exit(1);
});
