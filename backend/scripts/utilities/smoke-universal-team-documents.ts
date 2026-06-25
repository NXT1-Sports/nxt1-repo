import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';

import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

type SmokeTarget = 'local' | 'staging';
type FirebaseProject = 'staging' | 'production';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface AuthSession {
  readonly idToken: string;
  readonly expiresIn: number;
  readonly uid: string;
  readonly email: string;
}

interface FirebaseProjectConfig {
  readonly projectId: string;
  readonly apiKey: string;
  readonly apiBaseUrl: string;
  readonly sourceFile: string;
}

interface ResolvedTargetConfig {
  readonly target: SmokeTarget;
  readonly project: FirebaseProject;
  readonly baseUrl: string;
  readonly projectConfig: FirebaseProjectConfig;
}

interface SmokeState {
  playbookId?: string;
  gamePlanId?: string;
  callsheetId?: string;
  scriptId?: string;
}

interface RequestResult {
  readonly res: Response;
  readonly data: any;
}

interface VerifyResult {
  readonly universalFiles: {
    readonly gamePlan: boolean;
    readonly callsheet: boolean;
    readonly practiceScript: boolean;
  };
  readonly universalMeta: {
    readonly gamePlanType: string | null;
    readonly callsheetType: string | null;
    readonly practiceScriptType: string | null;
    readonly gamePlanPayloadKind: string | null;
    readonly callsheetPayloadKind: string | null;
    readonly practiceScriptPayloadKind: string | null;
  };
  readonly legacyCollections: {
    readonly gamePlan: boolean;
    readonly callsheet: boolean;
    readonly practiceScript: boolean;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv({ path: path.join(backendRoot, '.env') });
dotenv({ path: path.join(backendRoot, '.env.local'), override: true });
dotenv({ path: path.join(repoRoot, 'apps/web/e2e/.env'), override: true });

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseProjectConfig(filePath: string): FirebaseProjectConfig {
  const source = fs.readFileSync(filePath, 'utf8');
  const projectIdMatch = source.match(/projectId:\s*'([^']+)'/);
  const apiKeyMatch = source.match(/apiKey:\s*'([^']+)'/);
  const apiBaseUrlMatch = source.match(/apiURL:\s*'([^']+)'/);

  if (!projectIdMatch?.[1] || !apiKeyMatch?.[1] || !apiBaseUrlMatch?.[1]) {
    throw new Error(`Unable to parse Firebase config from ${filePath}`);
  }

  return {
    projectId: projectIdMatch[1],
    apiKey: apiKeyMatch[1],
    apiBaseUrl: apiBaseUrlMatch[1],
    sourceFile: filePath,
  };
}

function resolveTargetConfig(): ResolvedTargetConfig {
  const targetArg = getArgValue('--target') ?? 'local';
  if (targetArg !== 'local' && targetArg !== 'staging') {
    throw new Error(`Unsupported --target value: ${targetArg}`);
  }

  const stagingConfig = parseProjectConfig(
    path.join(repoRoot, 'apps/web/src/environments/environment.staging.ts')
  );
  const localConfig = parseProjectConfig(
    path.join(repoRoot, 'apps/web/src/environments/environment.ts')
  );

  const project = (getArgValue('--project') ?? 'staging') as FirebaseProject;
  if (project !== 'staging' && project !== 'production') {
    throw new Error(`Unsupported --project value: ${project}`);
  }

  const explicitBaseUrl = getArgValue('--base-url');
  const baseUrl = explicitBaseUrl
    ? explicitBaseUrl.replace(/\/+$/, '')
    : targetArg === 'local'
      ? `${localConfig.apiBaseUrl.replace(/\/+$/, '')}/agent-x`
      : `${stagingConfig.apiBaseUrl.replace(/\/+$/, '')}/agent-x`;

  return {
    target: targetArg,
    project,
    baseUrl,
    projectConfig: project === 'production' ? localConfig : stagingConfig,
  };
}

async function loadFirebaseAdmin(project: FirebaseProject): Promise<{ auth: Auth; db: Firestore }> {
  if (project === 'production') {
    const firebaseModule = await import('../../src/utils/firebase.js');
    return { auth: firebaseModule.auth, db: firebaseModule.db };
  }

  const firebaseModule = await import('../../src/utils/firebase-staging.js');
  return { auth: firebaseModule.stagingAuth, db: firebaseModule.stagingDb };
}

async function signInWithPassword(
  projectConfig: FirebaseProjectConfig,
  email: string,
  password: string
): Promise<AuthSession | null> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${projectConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = (await response.json()) as
    | {
        idToken?: string;
        expiresIn?: string;
        localId?: string;
        email?: string;
      }
    | undefined;

  if (!response.ok || !payload?.idToken || !payload.localId || !payload.email) {
    return null;
  }

  return {
    idToken: payload.idToken,
    expiresIn: Number(payload.expiresIn ?? '0'),
    uid: payload.localId,
    email: payload.email,
  };
}

async function signInWithCustomToken(
  projectConfig: FirebaseProjectConfig,
  adminAuth: Auth,
  email: string,
  target: SmokeTarget
): Promise<AuthSession> {
  const userRecord = await adminAuth.getUserByEmail(email);
  const customToken = await adminAuth.createCustomToken(userRecord.uid, {
    universalTeamDocumentSmoke: true,
    smokeTarget: target,
  });

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${projectConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const payload = (await response.json()) as
    | {
        idToken?: string;
        expiresIn?: string;
        localId?: string;
        email?: string;
        error?: { message?: string };
      }
    | undefined;

  if (!response.ok || !payload?.idToken) {
    throw new Error(
      `Custom-token sign-in failed: ${payload?.error?.message ?? response.statusText}`
    );
  }

  return {
    idToken: payload.idToken,
    expiresIn: Number(payload.expiresIn ?? '0'),
    uid: payload.localId ?? userRecord.uid,
    email: payload.email ?? email,
  };
}

async function signIn(
  projectConfig: FirebaseProjectConfig,
  adminAuth: Auth,
  email: string,
  target: SmokeTarget
): Promise<AuthSession> {
  const password = process.env['E2E_TEST_USER_PASSWORD'];
  if (password) {
    const passwordSession = await signInWithPassword(projectConfig, email, password);
    if (passwordSession) {
      return passwordSession;
    }
  }

  return signInWithCustomToken(projectConfig, adminAuth, email, target);
}

async function request(
  method: HttpMethod,
  url: string,
  idToken: string,
  body?: unknown,
  expectJson = true
): Promise<RequestResult> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: any = text;
  if (expectJson) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed: ${response.status} ${response.statusText} :: ${typeof data === 'string' ? data : JSON.stringify(data)}`
    );
  }

  return { res: response, data };
}

async function safeRequest(
  method: HttpMethod,
  url: string,
  idToken: string,
  body?: unknown
): Promise<void> {
  try {
    await request(method, url, idToken, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SAFE_CLEANUP_FAILURE ${message}`);
  }
}

async function verifyPersistence(
  db: Firestore,
  state: Required<SmokeState>
): Promise<VerifyResult> {
  const [
    universalGamePlan,
    universalCallsheet,
    universalScript,
    legacyGamePlan,
    legacyCallsheet,
    legacyScript,
  ] = await Promise.all([
    db.collection('UniversalFiles').doc(state.gamePlanId).get(),
    db.collection('UniversalFiles').doc(state.callsheetId).get(),
    db.collection('UniversalFiles').doc(state.scriptId).get(),
    db.collection('TeamGamePlans').doc(state.gamePlanId).get(),
    db.collection('TeamCallsheets').doc(state.callsheetId).get(),
    db.collection('TeamPracticeScripts').doc(state.scriptId).get(),
  ]);

  return {
    universalFiles: {
      gamePlan: universalGamePlan.exists,
      callsheet: universalCallsheet.exists,
      practiceScript: universalScript.exists,
    },
    universalMeta: {
      gamePlanType: universalGamePlan.data()?.['type'] ?? null,
      callsheetType: universalCallsheet.data()?.['type'] ?? null,
      practiceScriptType: universalScript.data()?.['type'] ?? null,
      gamePlanPayloadKind: universalGamePlan.data()?.['payloadKind'] ?? null,
      callsheetPayloadKind: universalCallsheet.data()?.['payloadKind'] ?? null,
      practiceScriptPayloadKind: universalScript.data()?.['payloadKind'] ?? null,
    },
    legacyCollections: {
      gamePlan: legacyGamePlan.exists,
      callsheet: legacyCallsheet.exists,
      practiceScript: legacyScript.exists,
    },
  };
}

function isSuccessfulVerification(verification: VerifyResult): boolean {
  return (
    verification.universalFiles.gamePlan &&
    verification.universalFiles.callsheet &&
    verification.universalFiles.practiceScript &&
    !verification.legacyCollections.gamePlan &&
    !verification.legacyCollections.callsheet &&
    !verification.legacyCollections.practiceScript &&
    verification.universalMeta.gamePlanPayloadKind === 'native' &&
    verification.universalMeta.callsheetPayloadKind === 'native' &&
    verification.universalMeta.practiceScriptPayloadKind === 'native'
  );
}

async function run(): Promise<void> {
  const targetConfig = resolveTargetConfig();
  const email = getArgValue('--email') ?? process.env['E2E_TEST_USER_EMAIL'] ?? '';
  const teamId = getArgValue('--team-id') ?? '0ORPTNTxADr8wMmQkDrr';
  const sport = getArgValue('--sport') ?? 'football';
  const keepArtifacts = hasFlag('--keep');

  if (!email) {
    throw new Error('Missing --email and E2E_TEST_USER_EMAIL is not set');
  }

  const { auth: adminAuth, db } = await loadFirebaseAdmin(targetConfig.project);
  const session = await signIn(targetConfig.projectConfig, adminAuth, email, targetConfig.target);

  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const smokeName = `${targetConfig.target.toUpperCase()} Universal Smoke ${now}`;
  const state: SmokeState = {};
  let verification: VerifyResult | null;

  try {
    const playbookCreate = await request(
      'POST',
      `${targetConfig.baseUrl}/playbooks`,
      session.idToken,
      {
        teamId,
        sport,
        name: smokeName,
        season: '2026',
        source: `${targetConfig.target}-smoke`,
      }
    );
    state.playbookId = playbookCreate.data.data.playbook.id;

    const gamePlanCreate = await request(
      'POST',
      `${targetConfig.baseUrl}/gameplans`,
      session.idToken,
      {
        teamId,
        sport,
        title: `${smokeName} Game Plan`,
        phase: 'pregame',
        status: 'draft',
        gameDate: stamp.slice(0, 10),
        opponentName: `${targetConfig.target} smoke opponent`,
        identityFocus: `${targetConfig.target} smoke possession control`,
        primaryAttackPlan: 'Attack leverage with scripted formations',
        strengthsWeaknesses: [
          {
            team: 'opponent',
            label: 'Boundary leverage',
            content: 'Corners open hips early versus motion.',
          },
        ],
      }
    );
    state.gamePlanId =
      playbookCreate.data?.data?.gamePlan?.id ?? gamePlanCreate.data.data.gamePlan.id;

    const callsheetCreate = await request(
      'POST',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/callsheets`,
      session.idToken,
      {
        teamId,
        sport,
        title: `${smokeName} Callsheet`,
        situation: '3rd and medium',
        plays: [
          { playName: 'Inside Zone', score: 95, reasoning: 'Stable smoke test call' },
          { playName: 'Mesh', score: 89, reasoning: 'Quick separation answer' },
        ],
        notes: `${targetConfig.target} smoke callsheet notes`,
      }
    );
    state.callsheetId = callsheetCreate.data.data.callsheet.id;

    const practiceCreate = await request(
      'POST',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/practice-scripts`,
      session.idToken,
      {
        teamId,
        title: `${smokeName} Practice Script`,
        focus: `${targetConfig.target} smoke install`,
        tempo: 'Fast',
        objectives: [`Validate ${targetConfig.target} universal document persistence`],
        periods: [
          {
            label: 'Indy',
            clock: '12:00',
            reps: 8,
            callType: 'Indy',
            playName: 'Inside Zone',
            coachingPoint: 'Footwork and leverage',
            notes: `${targetConfig.target} smoke period check`,
          },
        ],
        notes: `${targetConfig.target} smoke script notes`,
      }
    );
    state.scriptId = practiceCreate.data.data.script.id;

    await request(
      'GET',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}`,
      session.idToken
    );
    await request(
      'GET',
      `${targetConfig.baseUrl}/gameplans/${encodeURIComponent(state.gamePlanId)}`,
      session.idToken
    );
    await request(
      'GET',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/callsheets/${encodeURIComponent(state.callsheetId)}?teamId=${encodeURIComponent(teamId)}`,
      session.idToken
    );
    await request(
      'GET',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/practice-scripts/${encodeURIComponent(state.scriptId)}?teamId=${encodeURIComponent(teamId)}`,
      session.idToken
    );

    await request(
      'PUT',
      `${targetConfig.baseUrl}/gameplans/${encodeURIComponent(state.gamePlanId)}`,
      session.idToken,
      {
        title: `${smokeName} Game Plan Updated`,
        identityFocus: `Updated ${targetConfig.target} smoke identity`,
      }
    );
    await request(
      'PATCH',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/callsheets/${encodeURIComponent(state.callsheetId)}`,
      session.idToken,
      {
        teamId,
        title: `${smokeName} Callsheet Updated`,
        notes: `Updated ${targetConfig.target} smoke callsheet notes`,
      }
    );
    await request(
      'PATCH',
      `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/practice-scripts/${encodeURIComponent(state.scriptId)}`,
      session.idToken,
      {
        teamId,
        title: `${smokeName} Practice Script Updated`,
        notes: `Updated ${targetConfig.target} smoke script notes`,
      }
    );

    verification = await verifyPersistence(db, state as Required<SmokeState>);

    const output = {
      ok: isSuccessfulVerification(verification),
      mode: targetConfig.target,
      baseUrl: targetConfig.baseUrl,
      firebaseProjectId: targetConfig.projectConfig.projectId,
      firebaseConfigSource: path.relative(repoRoot, targetConfig.projectConfig.sourceFile),
      email: session.email,
      uid: session.uid,
      ids: state,
      ...verification,
    };

    console.log(JSON.stringify(output, null, 2));

    if (!output.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`UNIVERSAL_TEAM_DOCUMENT_SMOKE_FAILURE ${message}`);
    console.error(
      JSON.stringify({ mode: targetConfig.target, baseUrl: targetConfig.baseUrl, state }, null, 2)
    );
    process.exitCode = 1;
  } finally {
    if (!keepArtifacts) {
      if (state.scriptId && state.playbookId) {
        await safeRequest(
          'DELETE',
          `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/practice-scripts/${encodeURIComponent(state.scriptId)}?teamId=${encodeURIComponent(teamId)}`,
          session.idToken
        );
      }
      if (state.callsheetId && state.playbookId) {
        await safeRequest(
          'DELETE',
          `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}/callsheets/${encodeURIComponent(state.callsheetId)}?teamId=${encodeURIComponent(teamId)}`,
          session.idToken
        );
      }
      if (state.gamePlanId) {
        await safeRequest(
          'DELETE',
          `${targetConfig.baseUrl}/gameplans/${encodeURIComponent(state.gamePlanId)}`,
          session.idToken
        );
      }
      if (state.playbookId) {
        await safeRequest(
          'DELETE',
          `${targetConfig.baseUrl}/playbooks/${encodeURIComponent(state.playbookId)}`,
          session.idToken
        );
      }
    }
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
});
