import {
  applyAgentModelRoutingPreset,
  type AgentModelRoutingTarget,
} from './agent-model-routing.js';
import type { AgentModelRoutingPresetName } from './agent-model-routing-presets.js';

function parseArgValue(flag: string): string | undefined {
  const direct = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) {
    return direct.slice(flag.length + 1).trim();
  }

  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1]?.trim();
}

function printUsage(): void {
  console.log(
    'Usage: tsx scripts/config/apply-agent-model-routing.ts --target=<staging|production> --preset=<production-current|staging-current> [--commit]'
  );
}

async function main(): Promise<void> {
  const target = parseArgValue('--target') as AgentModelRoutingTarget | undefined;
  const presetName = parseArgValue('--preset') as AgentModelRoutingPresetName | undefined;
  const commit = process.argv.includes('--commit');

  if (!target || !presetName) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (target !== 'staging' && target !== 'production') {
    throw new Error(`Unsupported --target value: ${target}`);
  }

  if (presetName !== 'production-current' && presetName !== 'staging-current') {
    throw new Error(`Unsupported --preset value: ${presetName}`);
  }

  await applyAgentModelRoutingPreset({ target, presetName, commit });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
