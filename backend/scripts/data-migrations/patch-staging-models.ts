/**
 * Compatibility wrapper for the shared Agent X model-routing apply workflow.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/patch-staging-models.ts
 *   npx tsx scripts/data-migrations/patch-staging-models.ts --commit
 */

import { applyAgentModelRoutingPreset } from '../config/agent-model-routing.js';

async function main(): Promise<void> {
  await applyAgentModelRoutingPreset({
    target: 'staging',
    presetName: 'staging-current',
    commit: process.argv.includes('--commit'),
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
