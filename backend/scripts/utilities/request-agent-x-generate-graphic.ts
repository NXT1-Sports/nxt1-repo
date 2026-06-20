import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';

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

interface ParsedEvent {
  readonly event: string;
  readonly data: unknown;
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

function loadFirebaseProjectConfig(): FirebaseProjectConfig {
  const explicitEnvironment =
    getArgValue('--environment') ?? process.env['LIVE_TEST_ENVIRONMENT'] ?? 'staging';
  const explicitProject =
    getArgValue('--firebase-project') ?? process.env['LIVE_TEST_FIREBASE_PROJECT_ID'];

  const projectConfigs = [
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.staging.ts')),
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.prod.ts')),
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.ts')),
  ];

  if (explicitProject) {
    const matched = projectConfigs.find((config) => config.projectId === explicitProject);
    if (matched) {
      return matched;
    }
  }

  if (explicitEnvironment === 'production') {
    return projectConfigs.find((config) => config.projectId === 'nxt-1-v2') ?? projectConfigs[0];
  }

  if (explicitEnvironment === 'staging') {
    return (
      projectConfigs.find((config) => config.projectId === 'nxt-1-staging-v2') ?? projectConfigs[0]
    );
  }

  return projectConfigs[0];
}

async function signInWithE2ECredentials(
  projectConfig: FirebaseProjectConfig
): Promise<AuthSession> {
  const email = process.env['E2E_TEST_USER_EMAIL'];
  const password = process.env['E2E_TEST_USER_PASSWORD'];

  if (!email || !password) {
    throw new Error(
      'Missing E2E_TEST_USER_EMAIL or E2E_TEST_USER_PASSWORD. Expected apps/web/e2e/.env or env overrides.'
    );
  }

  console.error(`[agent-x-generate-graphic] Attempting password sign-in for ${email}`);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${projectConfig.apiKey}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
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

  if (response.ok && payload?.idToken && payload.localId && payload.email) {
    return {
      idToken: payload.idToken,
      expiresIn: Number(payload.expiresIn ?? '0'),
      uid: payload.localId,
      email: payload.email,
    };
  }

  console.error('[agent-x-generate-graphic] Password sign-in failed, falling back to custom token');
  return signInWithCustomToken(projectConfig, email);
}

async function signInWithCustomToken(
  projectConfig: FirebaseProjectConfig,
  email: string
): Promise<AuthSession> {
  console.error(`[agent-x-generate-graphic] Loading Firebase Admin user for ${email}`);
  const firebaseModule =
    projectConfig.projectId === 'nxt-1-staging-v2'
      ? await import('../../src/utils/firebase-staging.js')
      : await import('../../src/utils/firebase.js');
  const adminAuth =
    firebaseModule.default && typeof firebaseModule.default.auth === 'function'
      ? firebaseModule.default.auth()
      : 'stagingAuth' in firebaseModule
        ? firebaseModule.stagingAuth
        : firebaseModule.auth;

  const userRecord = await adminAuth.getUserByEmail(email);
  console.error(`[agent-x-generate-graphic] Minting custom token for ${userRecord.uid}`);
  const customToken = await adminAuth.createCustomToken(userRecord.uid, {
    e2eLiveRequest: true,
  });

  console.error('[agent-x-generate-graphic] Exchanging custom token for Firebase ID token');
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${projectConfig.apiKey}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
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
      `Firebase sign-in failed: status=${response.status} statusText=${response.statusText} payload=${JSON.stringify(payload)}`
    );
  }

  return {
    idToken: payload.idToken,
    expiresIn: Number(payload.expiresIn ?? '0'),
    uid: payload.localId ?? userRecord.uid,
    email: payload.email ?? email,
  };
}

function normalizeUrl(baseUrl: string, requestPath: string): string {
  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }

  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '');
  const trimmedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${trimmedBaseUrl}${trimmedPath}`;
}

function requireHttpsImageUrl(): string {
  const imageUrl = getArgValue('--image-url');
  if (!imageUrl) {
    throw new Error(
      'Missing --image-url. Provide --image-url or --image-path so the helper can upload a local file first.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error(`Invalid --image-url: ${imageUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('The Agent X chat route only accepts https attachment URLs.');
  }

  return parsed.toString();
}

function resolveLocalImagePath(): string | null {
  const imagePath = getArgValue('--image-path');
  if (!imagePath) {
    return null;
  }

  const candidates = [
    path.resolve(process.cwd(), imagePath),
    path.resolve(repoRoot, imagePath),
    path.resolve(backendRoot, imagePath),
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(`Image file not found. Checked: ${candidates.join(', ')}`);
  }

  return resolved;
}

function inferMimeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

async function uploadLocalImageViaApi(params: {
  readonly filePath: string;
  readonly baseUrl: string;
  readonly idToken: string;
}): Promise<{ url: string; sizeBytes: number; mimeType: string }> {
  const filePath = params.filePath;
  console.error(`[agent-x-generate-graphic] Uploading local image via backend route: ${filePath}`);
  const fileBuffer = await fs.promises.readFile(filePath);
  const contentType = inferMimeTypeFromPath(filePath);
  const formData = new FormData();
  formData.set(
    'file',
    new Blob([fileBuffer], { type: contentType }),
    path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_')
  );

  const response = await fetch(normalizeUrl(params.baseUrl, '/upload/profile-photo'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.idToken}`,
    },
    body: formData,
  });

  const payload = (await response.json()) as
    | {
        success?: boolean;
        error?: string;
        data?: {
          url?: string;
          size?: number;
          mimeType?: string;
        };
      }
    | undefined;

  if (!response.ok || !payload?.success || !payload.data?.url) {
    throw new Error(
      `Backend upload failed: ${payload?.error ?? response.statusText ?? 'Unknown upload error'}`
    );
  }

  console.error(`[agent-x-generate-graphic] Upload complete: ${payload.data.url}`);

  return {
    url: payload.data.url,
    sizeBytes: payload.data.size ?? fileBuffer.byteLength,
    mimeType: payload.data.mimeType ?? contentType,
  };
}

function inferMimeType(imageUrl: string): string {
  const explicit = getArgValue('--mime-type');
  if (explicit) {
    return explicit;
  }

  const pathname = new URL(imageUrl).pathname.toLowerCase();
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function inferName(imageUrl: string): string {
  const explicit = getArgValue('--name');
  if (explicit) {
    return explicit;
  }

  const pathname = new URL(imageUrl).pathname;
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  return lastSegment && lastSegment.trim().length > 0
    ? decodeURIComponent(lastSegment)
    : 'attached-image.png';
}

async function inferSizeBytes(imageUrl: string): Promise<number> {
  const explicit = getArgValue('--size-bytes');
  if (explicit) {
    const parsed = Number(explicit);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }

  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    const parsed = Number(contentLength ?? '');
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  } catch {
    // Fall back to the smallest DTO-valid size when the remote host does not expose content-length.
  }

  return 1;
}

function parseEventFrame(frame: string): ParsedEvent | null {
  const trimmed = frame.trim();
  if (!trimmed) return null;

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  const rawData = dataLines.join('\n');
  if (!rawData) {
    return { event, data: null };
  }

  try {
    return { event, data: JSON.parse(rawData) as unknown };
  } catch {
    return { event, data: rawData };
  }
}

async function readSseEvents(response: Response): Promise<ParsedEvent[]> {
  if (!response.body) {
    return [];
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ParsedEvent[] = [];

  const flushFrames = (isFinal: boolean): void => {
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const parsed = parseEventFrame(part);
      if (parsed) events.push(parsed);
    }

    if (isFinal && buffer.trim()) {
      const parsed = parseEventFrame(buffer);
      if (parsed) events.push(parsed);
      buffer = '';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushFrames(false);

    if (events.some((event) => event.event === 'done' || event.event === 'error')) {
      await reader.cancel();
      break;
    }
  }

  buffer += decoder.decode();
  flushFrames(true);
  return events;
}

function summarizeEvents(events: readonly ParsedEvent[]): Record<string, unknown> {
  const threadEvent = events.find((event) => event.event === 'thread');
  const doneEvent = [...events].reverse().find((event) => event.event === 'done');
  const errorEvents = events.filter((event) => event.event === 'error');
  const stepErrors = events.filter(
    (event) =>
      event.event === 'step' &&
      typeof event.data === 'object' &&
      event.data !== null &&
      (event.data as Record<string, unknown>)['status'] === 'error'
  );
  const operationEvents = events.filter((event) => event.event === 'operation');
  const lastOperation = operationEvents.at(-1);

  return {
    totalEvents: events.length,
    thread: threadEvent?.data ?? null,
    lastOperation: lastOperation?.data ?? null,
    done: doneEvent?.data ?? null,
    errors: errorEvents.map((event) => event.data),
    stepErrors: stepErrors.map((event) => event.data),
    eventCounts: events.reduce<Record<string, number>>((counts, event) => {
      counts[event.event] = (counts[event.event] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

async function run(): Promise<void> {
  const localImagePath = resolveLocalImagePath();
  const projectConfig = loadFirebaseProjectConfig();
  const session = await signInWithE2ECredentials(projectConfig);
  console.error(`[agent-x-generate-graphic] Authenticated as ${session.email} (${session.uid})`);
  const baseUrl = getArgValue('--base-url') ?? projectConfig.apiBaseUrl;
  const uploadedLocalImage = localImagePath
    ? await uploadLocalImageViaApi({
        filePath: localImagePath,
        baseUrl,
        idToken: session.idToken,
      })
    : null;
  const imageUrl = uploadedLocalImage?.url ?? requireHttpsImageUrl();
  const requestUrl = normalizeUrl(baseUrl, '/agent-x/chat');
  const message =
    getArgValue('--message') ??
    'Create me a premium recruiting social graphic from this attached image. Use the attached image as the subject reference and produce the final graphic, not just a plan.';
  const mimeType = uploadedLocalImage?.mimeType ?? inferMimeType(imageUrl);
  const sizeBytes = uploadedLocalImage?.sizeBytes ?? (await inferSizeBytes(imageUrl));
  const attachmentName = localImagePath ? path.basename(localImagePath) : inferName(imageUrl);

  const body = {
    message,
    mode: getArgValue('--mode') ?? 'brand',
    attachments: [
      {
        id: crypto.randomUUID(),
        url: imageUrl,
        name: attachmentName,
        mimeType,
        type: 'image',
        sizeBytes,
      },
    ],
    ...(hasFlag('--no-selected-action')
      ? {}
      : {
          selectedAction: {
            coordinatorId: 'brand_coordinator',
            actionId: 'brand-post',
            surface: 'command',
            label: 'Create Brand Post',
          },
        }),
  };

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.error(
    `[agent-x-generate-graphic] Chat request sent: ${requestUrl} status=${response.status}`
  );

  if (!response.ok || !response.body) {
    const rawText = await response.text();
    let parsedBody: unknown;
    try {
      parsedBody = rawText ? (JSON.parse(rawText) as unknown) : null;
    } catch {
      parsedBody = rawText;
    }

    console.log(
      JSON.stringify(
        {
          authenticated: true,
          email: session.email,
          uid: session.uid,
          request: {
            url: requestUrl,
            imageUrl,
            ...(localImagePath ? { localImagePath } : {}),
            message,
          },
          response: {
            status: response.status,
            ok: response.ok,
            body: parsedBody,
          },
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const events = await readSseEvents(response);
  const summary = summarizeEvents(events);

  console.log(
    JSON.stringify(
      {
        authenticated: true,
        email: session.email,
        uid: session.uid,
        expiresInSeconds: session.expiresIn,
        firebaseProjectId: projectConfig.projectId,
        firebaseConfigSource: path.relative(repoRoot, projectConfig.sourceFile),
        request: {
          url: requestUrl,
          imageUrl,
          ...(localImagePath ? { localImagePath } : {}),
          attachmentName,
          mimeType,
          sizeBytes,
          selectedAction: hasFlag('--no-selected-action')
            ? null
            : {
                coordinatorId: 'brand_coordinator',
                actionId: 'brand-post',
                surface: 'command',
              },
          message,
        },
        response: {
          status: response.status,
          ok: response.ok,
        },
        summary,
        ...(hasFlag('--verbose-events') ? { events } : {}),
      },
      null,
      2
    )
  );

  const hasStreamError =
    Array.isArray(summary['errors']) && (summary['errors'] as readonly unknown[]).length > 0;
  if (hasStreamError) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
