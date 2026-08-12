import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv({ path: path.join(backendRoot, '.env'), quiet: true });
dotenv({ path: path.join(backendRoot, '.env.local'), override: true, quiet: true });
dotenv({ path: path.join(repoRoot, 'apps/web/e2e/.env'), override: true, quiet: true });

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function requireArg(flag) {
  const value = getArgValue(flag)?.trim();
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

function parseProductionWebConfig(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const read = (pattern, label) => {
    const match = source.match(pattern);
    if (!match?.[1]) throw new Error(`Unable to parse ${label} from ${filePath}`);
    return match[1];
  };

  return {
    webUrl: read(/webUrl:\s*'([^']+)'/, 'webUrl'),
    apiURL: read(/apiURL:\s*'([^']+)'/, 'apiURL'),
    firebase: {
      apiKey: read(/apiKey:\s*'([^']+)'/, 'firebase.apiKey'),
      authDomain: read(/authDomain:\s*'([^']+)'/, 'firebase.authDomain'),
      projectId: read(/projectId:\s*'([^']+)'/, 'firebase.projectId'),
      storageBucket: read(/storageBucket:\s*'([^']+)'/, 'firebase.storageBucket'),
      messagingSenderId: read(/messagingSenderId:\s*'([^']+)'/, 'firebase.messagingSenderId'),
      appId: read(/appId:\s*'([^']+)'/, 'firebase.appId'),
    },
  };
}

function createAdminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing production Firebase admin credentials. Expected FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    );
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });

  return getAuth(app);
}

function buildBrowserSnippet(config, customToken) {
  const firebaseConfig = JSON.stringify(config.firebase, null, 2);
  const encodedToken = JSON.stringify(customToken);

  return [
    'const firebaseConfig = ' + firebaseConfig + ';',
    `const customToken = ${encodedToken};`,
    "const appMod = await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js');",
    "const authMod = await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js');",
    'const app = appMod.getApps()[0] ?? appMod.initializeApp(firebaseConfig);',
    'const auth = authMod.getAuth(app);',
    'await authMod.signInWithCustomToken(auth, customToken);',
    'location.reload();',
  ].join('\n');
}

function buildResult({ email, uid, customToken, config }) {
  return {
    target: {
      email,
      uid,
      firebaseProjectId: config.firebase.projectId,
    },
    localAudit: {
      preferredLocalCommand: 'cd apps/web && npm run start -- --configuration production',
      localUrl: 'http://localhost:4200',
      productionWebUrl: config.webUrl,
      productionApiUrl: config.apiURL,
    },
    customToken,
    browserSnippet: buildBrowserSnippet(config, customToken),
    instructions: [
      '1. Start the web app locally with the production configuration.',
      '2. Open http://localhost:4200 in a fresh incognito window.',
      '3. Open browser devtools console and paste browserSnippet exactly once.',
      '4. Reload after sign-in and you will be in the target production account context.',
      '5. When done, sign out or clear site data so you do not stay in the impersonated session.',
    ],
  };
}

async function main() {
  const email = requireArg('--email');
  const config = parseProductionWebConfig(
    path.join(repoRoot, 'apps/web/src/environments/environment.prod.ts')
  );
  const adminAuth = createAdminAuth();
  const userRecord = await adminAuth.getUserByEmail(email);
  const customToken = await adminAuth.createCustomToken(userRecord.uid, {
    supportAudit: true,
    supportAuditTarget: email,
  });

  console.log(JSON.stringify(buildResult({ email, uid: userRecord.uid, customToken, config }), null, 2));
}

await main();