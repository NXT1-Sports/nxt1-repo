import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';

type Target = 'production' | 'staging';

interface FirebaseCliAuthModule {
  getGlobalDefaultAccount(): FirebaseCliAccount | undefined;
  getProjectDefaultAccount(projectDir?: string): FirebaseCliAccount | undefined;
  setActiveAccount(options: FirebaseCliOptions, account: FirebaseCliAccount): void;
}

interface FirebaseCliApiModule {
  getAccessToken(): Promise<string>;
}

interface FirebaseCliAccount {
  readonly user?: { readonly email?: string };
  readonly tokens?: { readonly refresh_token?: string };
}

interface FirebaseCliOptions {
  project: string;
  user?: FirebaseCliAccount['user'];
  tokens?: FirebaseCliAccount['tokens'];
}

interface AuthUser {
  readonly localId: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly providerUserInfo?: readonly { readonly providerId?: string }[];
}

interface FirestoreDocument {
  readonly name: string;
  readonly fields?: Record<string, FirestoreValue>;
}

interface FirestoreValue {
  readonly stringValue?: string;
  readonly timestampValue?: string;
}

interface RepairArgs {
  readonly email: string;
  readonly password: string;
  readonly target: Target;
  readonly projectId: string;
  readonly uid?: string;
  readonly commit: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');
const requireFromScript = createRequire(import.meta.url);

dotenv({ path: path.join(backendRoot, '.env'), quiet: true });
dotenv({ path: path.join(backendRoot, '.env.local'), override: true, quiet: true });

function usage(): string {
  return [
    'Usage:',
    '  npm run auth:repair-email-password -- --email user@example.com --password NXT1-Reset7! --target production --commit',
    '',
    'Options:',
    '  --email <email>       Email the user should sign in with. Required.',
    '  --password <password> Temp password to set. Defaults to a short generated password.',
    '  --uid <uid>           Existing Firebase Auth UID to force when email lookup is ambiguous or missing.',
    '  --target <target>     production or staging. Defaults to production.',
    '  --project <projectId> Explicit Firebase project ID override.',
    '  --commit              Apply the Auth password update. Without this, only prints the planned repair.',
    '',
    'Notes:',
    '  - Uses the signed-in Firebase CLI account. Run `firebase login --reauth` if credentials are stale.',
    '  - Auth email lookup runs first; Firestore Users email lookup is a fallback to preserve the existing UID/data.',
  ].join('\n');
}

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeEmail(email: string | undefined): string {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('Missing or invalid --email value.');
  }
  return normalized;
}

function normalizeTarget(target: string | undefined): Target {
  const normalized = (target ?? 'production').trim().toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  throw new Error(`Unsupported --target value: ${target}. Expected production or staging.`);
}

function projectIdForTarget(target: Target, explicitProjectId: string | undefined): string {
  if (explicitProjectId?.trim()) return explicitProjectId.trim();
  return target === 'production' ? 'nxt-1-v2' : 'nxt-1-staging-v2';
}

function generateTempPassword(): string {
  const digit = crypto.randomInt(2, 10);
  return `NXT1-Reset${digit}!`;
}

function normalizePassword(password: string | undefined): string {
  const normalized = password?.trim() || generateTempPassword();
  if (normalized.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  return normalized;
}

function parseArgs(): RepairArgs {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const email = normalizeEmail(getArgValue('--email'));
  const target = normalizeTarget(getArgValue('--target'));
  const projectId = projectIdForTarget(target, getArgValue('--project'));

  return {
    email,
    password: normalizePassword(getArgValue('--password')),
    target,
    projectId,
    uid: getArgValue('--uid')?.trim() || undefined,
    commit: hasFlag('--commit'),
  };
}

function resolveFirebaseToolsModule<T>(relativeModulePath: string): T {
  const candidates = [
    relativeModulePath,
    path.join('/opt/homebrew/lib/node_modules/firebase-tools/lib', relativeModulePath),
    path.join('/usr/local/lib/node_modules/firebase-tools/lib', relativeModulePath),
    process.env['FIREBASE_TOOLS_ROOT']
      ? path.join(process.env['FIREBASE_TOOLS_ROOT'], 'lib', relativeModulePath)
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return requireFromScript(candidate) as T;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  throw new Error(
    'Unable to load firebase-tools internals. Install Firebase CLI or set FIREBASE_TOOLS_ROOT to the firebase-tools package root.'
  );
}

async function getFirebaseCliAccessToken(projectId: string): Promise<string> {
  const auth = resolveFirebaseToolsModule<FirebaseCliAuthModule>('auth');
  const api = resolveFirebaseToolsModule<FirebaseCliApiModule>('apiv2');
  const account =
    auth.getProjectDefaultAccount(repoRoot) ??
    auth.getProjectDefaultAccount(backendRoot) ??
    auth.getGlobalDefaultAccount();

  if (!account) {
    throw new Error('No Firebase CLI account found. Run `firebase login --reauth`.');
  }

  const options: FirebaseCliOptions = { project: projectId };
  auth.setActiveAccount(options, account);
  return api.getAccessToken();
}

async function postJson<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? response.statusText);
  }

  return payload;
}

async function getJson<T>(url: string, token: string): Promise<T | undefined> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return undefined;

  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? response.statusText);
  }

  return payload;
}

function authBaseUrl(projectId: string): string {
  return `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`;
}

async function lookupAuthUser(
  projectId: string,
  token: string,
  lookup: { email?: string; uid?: string }
) {
  const body = lookup.uid ? { localId: [lookup.uid] } : { email: [lookup.email] };
  const payload = await postJson<{ users?: AuthUser[] }>(
    `${authBaseUrl(projectId)}/accounts:lookup`,
    token,
    body
  );
  return payload.users?.[0];
}

function firestoreString(
  document: FirestoreDocument | undefined,
  field: string
): string | undefined {
  return document?.fields?.[field]?.stringValue;
}

function documentId(documentName: string): string {
  return documentName.split('/').pop() ?? documentName;
}

async function queryUsersByEmail(
  projectId: string,
  token: string,
  fieldPath: 'email' | 'emailLower' | 'normalizedEmail',
  email: string
): Promise<FirestoreDocument[]> {
  const payload = await postJson<{ document?: FirestoreDocument }[]>(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`,
    token,
    {
      structuredQuery: {
        from: [{ collectionId: 'Users' }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: email },
          },
        },
        limit: 10,
      },
    }
  );

  return payload.flatMap((result) => (result.document ? [result.document] : []));
}

async function findUserDocumentByEmail(
  projectId: string,
  token: string,
  email: string
): Promise<FirestoreDocument | undefined> {
  const queryAttempts: Array<['email' | 'emailLower' | 'normalizedEmail', string]> = [
    ['email', email],
    ['emailLower', email],
    ['normalizedEmail', email],
  ];

  for (const [fieldPath, value] of queryAttempts) {
    const documents = await queryUsersByEmail(projectId, token, fieldPath, value);
    if (documents.length > 1) {
      throw new Error(
        `Found ${documents.length} Users documents with ${fieldPath}=${email}. Re-run with --uid to avoid changing the wrong account.`
      );
    }
    if (documents[0]) return documents[0];
  }

  return undefined;
}

async function getUserDocument(
  projectId: string,
  token: string,
  uid: string
): Promise<FirestoreDocument | undefined> {
  const mask = ['email', 'displayName', 'firstName', 'lastName', 'role']
    .map((fieldPath) => `mask.fieldPaths=${encodeURIComponent(fieldPath)}`)
    .join('&');
  return getJson<FirestoreDocument>(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/Users/${encodeURIComponent(uid)}?${mask}`,
    token
  );
}

function providers(user: AuthUser | undefined): string[] {
  return (
    user?.providerUserInfo?.flatMap((provider) =>
      provider.providerId ? [provider.providerId] : []
    ) ?? []
  );
}

async function resolveTargetUser(args: RepairArgs, token: string) {
  if (args.uid) {
    const authUser = await lookupAuthUser(args.projectId, token, { uid: args.uid });
    if (!authUser) throw new Error(`No Firebase Auth user found for UID ${args.uid}.`);
    return {
      uid: args.uid,
      authUser,
      userDocument: await getUserDocument(args.projectId, token, args.uid),
    };
  }

  const authUser = await lookupAuthUser(args.projectId, token, { email: args.email });
  if (authUser) {
    return {
      uid: authUser.localId,
      authUser,
      userDocument: await getUserDocument(args.projectId, token, authUser.localId),
    };
  }

  const userDocument = await findUserDocumentByEmail(args.projectId, token, args.email);
  if (!userDocument) {
    throw new Error(
      `No Firebase Auth user or Users document found for ${args.email}. Re-run with --uid if you know the existing account UID.`
    );
  }

  const uid = documentId(userDocument.name);
  const userByUid = await lookupAuthUser(args.projectId, token, { uid });
  if (!userByUid) {
    throw new Error(
      `Users/${uid} exists for ${args.email}, but no matching Firebase Auth user exists.`
    );
  }

  return { uid, authUser: userByUid, userDocument };
}

async function updatePassword(args: RepairArgs, token: string, uid: string): Promise<AuthUser> {
  return postJson<AuthUser>(`${authBaseUrl(args.projectId)}/accounts:update`, token, {
    localId: uid,
    email: args.email,
    password: args.password,
    emailVerified: true,
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const token = await getFirebaseCliAccessToken(args.projectId);
  const targetUser = await resolveTargetUser(args, token);
  const beforeProviders = providers(targetUser.authUser);

  const plan = {
    target: args.target,
    projectId: args.projectId,
    email: args.email,
    uid: targetUser.uid,
    firestoreUser: targetUser.userDocument
      ? {
          path: `Users/${documentId(targetUser.userDocument.name)}`,
          email: firestoreString(targetUser.userDocument, 'email'),
          displayName: firestoreString(targetUser.userDocument, 'displayName'),
          firstName: firestoreString(targetUser.userDocument, 'firstName'),
          lastName: firestoreString(targetUser.userDocument, 'lastName'),
          role: firestoreString(targetUser.userDocument, 'role'),
        }
      : null,
    beforeProviders,
    commit: args.commit,
  };

  if (!args.commit) {
    console.log(
      JSON.stringify(
        { dryRun: true, plan, tempPassword: args.password, next: 'Re-run with --commit to apply.' },
        null,
        2
      )
    );
    return;
  }

  const updatedUser = await updatePassword(args, token, targetUser.uid);
  const verifiedUser = await lookupAuthUser(args.projectId, token, { uid: targetUser.uid });

  console.log(
    JSON.stringify(
      {
        updated: true,
        projectId: args.projectId,
        email: updatedUser.email ?? args.email,
        uid: updatedUser.localId ?? targetUser.uid,
        emailVerified: updatedUser.emailVerified ?? true,
        providers: providers(verifiedUser),
        tempPassword: args.password,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('\n' + usage());
  process.exit(1);
});
