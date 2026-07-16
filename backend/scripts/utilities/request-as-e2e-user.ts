import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface AuthSession {
  readonly idToken: string;
  readonly refreshToken: string;
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

interface RequestOptions {
  readonly method: HttpMethod;
  readonly baseUrl: string;
  readonly path?: string;
  readonly body?: string;
  readonly headers: Record<string, string>;
  readonly tokenOnly: boolean;
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

function parseHeaders(headerArgs: string[]): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const header of headerArgs) {
    const separatorIndex = header.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid --header value: ${header}. Expected Name:Value.`);
    }

    const name = header.slice(0, separatorIndex).trim();
    const value = header.slice(separatorIndex + 1).trim();
    if (!name || !value) {
      throw new Error(`Invalid --header value: ${header}. Expected Name:Value.`);
    }

    headers[name] = value;
  }

  return headers;
}

function collectHeaderArgs(): string[] {
  const headers: string[] = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === '--header') {
      const value = process.argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --header');
      }
      headers.push(value);
    }
  }

  return headers;
}

function normalizeMethod(method: string | undefined): HttpMethod {
  const normalized = (method ?? 'GET').toUpperCase();
  if (
    normalized !== 'GET' &&
    normalized !== 'POST' &&
    normalized !== 'PUT' &&
    normalized !== 'PATCH' &&
    normalized !== 'DELETE'
  ) {
    throw new Error(`Unsupported HTTP method: ${normalized}`);
  }
  return normalized;
}

function normalizeUrl(baseUrl: string, requestPath: string): string {
  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }

  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '');
  const trimmedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${trimmedBaseUrl}${trimmedPath}`;
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
  const explicitProject =
    getArgValue('--firebase-project') ??
    process.env['LIVE_TEST_FIREBASE_PROJECT_ID'] ??
    process.env['FIREBASE_PROJECT_ID'];

  const projectConfigs = [
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.prod.ts')),
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.ts')),
    parseProjectConfig(path.join(repoRoot, 'apps/web/src/environments/environment.staging.ts')),
  ];

  if (explicitProject) {
    const matchedConfig = projectConfigs.find((config) => config.projectId === explicitProject);
    if (matchedConfig) {
      return matchedConfig;
    }
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

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${projectConfig.apiKey}`,
    {
      method: 'POST',
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
        refreshToken?: string;
        expiresIn?: string;
        localId?: string;
        email?: string;
        error?: { message?: string };
      }
    | undefined;

  if (!response.ok || !payload?.idToken || !payload.localId || !payload.email) {
    throw new Error(`Firebase sign-in failed: ${payload?.error?.message ?? response.statusText}`);
  }

  return {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken ?? '',
    expiresIn: Number(payload.expiresIn ?? '0'),
    uid: payload.localId,
    email: payload.email,
  };
}

function parseRequestOptions(): RequestOptions {
  const method = normalizeMethod(getArgValue('--method'));
  const requestPath = getArgValue('--path') ?? getArgValue('--url');
  const body = getArgValue('--body');
  const tokenOnly = hasFlag('--token-only') || !requestPath;
  const headers = parseHeaders(collectHeaderArgs());

  return {
    method,
    baseUrl: getArgValue('--base-url') ?? '',
    path: requestPath,
    body,
    headers,
    tokenOnly,
  };
}

async function run(): Promise<void> {
  const projectConfig = loadFirebaseProjectConfig();
  const options = parseRequestOptions();
  const session = await signInWithE2ECredentials(projectConfig);
  const resolvedBaseUrl = options.baseUrl || projectConfig.apiBaseUrl;

  if (options.tokenOnly) {
    console.log(
      JSON.stringify(
        {
          authenticated: true,
          email: session.email,
          uid: session.uid,
          expiresInSeconds: session.expiresIn,
          firebaseProjectId: projectConfig.projectId,
          firebaseConfigSource: path.relative(repoRoot, projectConfig.sourceFile),
          apiBaseUrl: resolvedBaseUrl,
        },
        null,
        2
      )
    );
    return;
  }

  const url = normalizeUrl(resolvedBaseUrl, options.path!);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.idToken}`,
    ...options.headers,
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body,
  });

  const rawText = await response.text();
  let parsedBody: unknown;

  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
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
          method: options.method,
          url,
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

  if (!response.ok) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
});
