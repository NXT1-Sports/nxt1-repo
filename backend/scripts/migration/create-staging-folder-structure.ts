#!/usr/bin/env npx tsx
/**
 * Creates the required folder structure in the staging v2 bucket
 * by uploading empty placeholder (.keep) files at each path.
 *
 * Mirrors the production nxt-1-v2 structure:
 *   Colleges/
 *   Conferences/
 *   Fonts/
 *   Profiles/FeedImages/
 *   Profiles/ProfileImages/
 *   Teams/TeamLogos/
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const STAGING_BUCKET =
  process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-staging-v2.firebasestorage.app';

const FOLDERS = [
  'Colleges/.keep',
  'Conferences/.keep',
  'Fonts/.keep',
  'Profiles/FeedImages/.keep',
  'Profiles/ProfileImages/.keep',
  'Teams/TeamLogos/.keep',
];

function initStaging() {
  try {
    return getApp('staging-folder');
  } catch {
    /* not yet initialised */
  }

  const email = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const key = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const pid = process.env['STAGING_FIREBASE_PROJECT_ID'];

  if (pid && email && key) {
    return initializeApp(
      {
        credential: cert({ projectId: pid, clientEmail: email, privateKey: key }),
        storageBucket: STAGING_BUCKET,
      },
      'staging-folder'
    );
  }

  // Fallback to SA file
  const saPath = resolve(
    __dirname,
    '../../../../nxt1-backend/assets/nxt-1-staging-firebase-adminsdk-etj9j-aa600cd843.json'
  );
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa), storageBucket: STAGING_BUCKET }, 'staging-folder');
}

const LEGACY_PREFIXES_TO_DELETE = ['HighLightImages/', 'TeamsLogo/', 'Users/'];

async function deleteLegacyFolders(bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>) {
  console.log('\nDeleting legacy folders…\n');
  for (const prefix of LEGACY_PREFIXES_TO_DELETE) {
    let total = 0;
    let pageToken: string | undefined;
    do {
      const query: Record<string, unknown> = { prefix, maxResults: 500 };
      if (pageToken) query['pageToken'] = pageToken;

      const [files, nextQuery] = await bucket.getFiles(
        query as Parameters<typeof bucket.getFiles>[0]
      );
      if (files.length === 0) break;
      await Promise.all(files.map((f) => f.delete()));
      total += files.length;
      process.stdout.write(`\r  deleting ${prefix} … ${total} files`);
      pageToken = (nextQuery as Record<string, string> | null | undefined)?.['pageToken'];
    } while (pageToken);

    if (total === 0) {
      console.log(`  -  ${prefix} (not found / already empty)`);
    } else {
      process.stdout.write(`\r  ✅  ${prefix} deleted (${total} files)                \n`);
    }
  }
}

async function main() {
  console.log(`\nBucket: ${STAGING_BUCKET}\n`);

  const app = initStaging();
  const bucket = getStorage(app).bucket(STAGING_BUCKET);

  await deleteLegacyFolders(bucket);

  console.log('\nEnsuring folder structure…\n');
  for (const path of FOLDERS) {
    try {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (exists) {
        console.log(`  ⏭  ${path} (already exists)`);
        continue;
      }
      await file.save('', { contentType: 'application/octet-stream' });
      console.log(`  ✅  ${path}`);
    } catch (err) {
      console.error(`  ❌  ${path}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
