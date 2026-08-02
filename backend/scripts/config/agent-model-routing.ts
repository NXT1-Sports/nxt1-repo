import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  getAgentModelRoutingPreset,
  type AgentModelRoutingPreset,
  type AgentModelRoutingPresetName,
} from './agent-model-routing-presets.js';

export type AgentModelRoutingTarget = 'staging' | 'production';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadBackendScriptEnv(): void {
  loadDotenv({ path: resolve(backendRoot, '.env') });
  loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });
}

function resolveFirebaseCredentials(target: AgentModelRoutingTarget): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} {
  const prefix = target === 'production' ? 'FIREBASE' : 'STAGING_FIREBASE';
  const projectId = process.env[`${prefix}_PROJECT_ID`]?.trim();
  const clientEmail = process.env[`${prefix}_CLIENT_EMAIL`]?.trim();
  const privateKey = process.env[`${prefix}_PRIVATE_KEY`]?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Missing ${prefix}_PROJECT_ID / ${prefix}_CLIENT_EMAIL / ${prefix}_PRIVATE_KEY in backend .env`
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function initAgentModelRoutingFirestore(target: AgentModelRoutingTarget): Firestore {
  const credentials = resolveFirebaseCredentials(target);
  const appName = `agent-model-routing-${target}`;
  const existing = getApps().find((app) => app.name === appName);
  const app =
    existing ??
    initializeApp(
      {
        credential: cert(credentials),
        projectId: credentials.projectId,
      },
      appName
    );

  return getFirestore(app);
}

function summarisePreset(preset: AgentModelRoutingPreset): string[] {
  const textLines = preset.catalogue.text
    ? [`text:            ${preset.catalogue.text}`]
    : [
        `routing:         ${preset.catalogue.routing}`,
        `extraction:      ${preset.catalogue.extraction}`,
        `chat:            ${preset.catalogue.chat}`,
        `task_automation: ${preset.catalogue.task_automation}`,
      ];

  return [
    ...textLines,
    `vision_analysis: ${preset.catalogue.vision_analysis}`,
    `default effort: ${preset.defaultEffortLevel}`,
    `effort high:     ${preset.effortProfiles.high.model} (${preset.effortProfiles.high.reasoningEffort})`,
    `effort medium:   ${preset.effortProfiles.medium.model} (${preset.effortProfiles.medium.reasoningEffort})`,
    `effort low:      ${preset.effortProfiles.low.model} (${preset.effortProfiles.low.reasoningEffort})`,
  ];
}

export async function applyAgentModelRoutingPreset(options: {
  readonly target: AgentModelRoutingTarget;
  readonly presetName: AgentModelRoutingPresetName;
  readonly commit: boolean;
}): Promise<void> {
  loadBackendScriptEnv();

  const preset = getAgentModelRoutingPreset(options.presetName);
  const db = initAgentModelRoutingFirestore(options.target);
  const patch = {
    'modelRouting.catalogue': preset.catalogue,
    'modelRouting.fallbackChains': preset.fallbackChains,
    'modelRouting.defaultEffortLevel': preset.defaultEffortLevel,
    'modelRouting.effortProfiles': preset.effortProfiles,
    updatedAt: new Date().toISOString(),
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Agent Model Routing Apply');
  console.log(`  Target: ${options.target}`);
  console.log(`  Preset: ${options.presetName} (${preset.label})`);
  console.log(`  Mode:   ${options.commit ? 'COMMIT' : 'DRY RUN (no writes)'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log(preset.description);
  console.log('');
  for (const line of summarisePreset(preset)) {
    console.log(`  ${line}`);
  }
  console.log('');

  if (!options.commit) {
    console.log('Dry run complete. Re-run with --commit to write to Firestore.');
    return;
  }

  const docRef = db.collection('AppConfig').doc('agentConfig');
  await docRef.update(patch);

  console.log(
    `✅ AppConfig/agentConfig.modelRouting updated in ${options.target}. Backend picks it up within 60s.`
  );
}
