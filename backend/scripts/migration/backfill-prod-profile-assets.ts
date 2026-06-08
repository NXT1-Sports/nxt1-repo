import { db, storage } from '../../src/utils/firebase.js';

type UserDoc = Record<string, unknown> & {
  unicode?: string | null;
  profileImgs?: unknown;
  sports?: unknown;
  teamHistory?: unknown;
};

type AssetStatus =
  | {
      ok: true;
      path: string;
      url: string;
      source:
        | 'existing-prod'
        | 'staging-url'
        | 'staging-firebase'
        | 'staging-raw'
        | 'legacy-firebase'
        | 'legacy-raw';
    }
  | { ok: false; path: string; reason: string };

type AssetSource = Extract<AssetStatus, { ok: true }>['source'];

type UserRepair = {
  uid: string;
  unicode?: string | null;
  refs: Array<{ path: string; fieldPath: string }>;
  profileImgs?: unknown;
  sports?: unknown;
  teamHistory?: unknown;
};

const STAGING_BUCKET = 'nxt-1-staging-v2.firebasestorage.app';
const LEGACY_BUCKET = 'nxt-1-de054.appspot.com';
const PROD_BUCKET = process.env['FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-v2.firebasestorage.app';
const prodBucket = storage.bucket(PROD_BUCKET);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const commit = args.has('--commit');
const dropMissing = args.has('--drop-missing');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const DROP_VALUE = Symbol('drop-value');

if (!dryRun && !commit) {
  throw new Error('Pass either --dry-run or --commit');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRawProdUrl(path: string): string {
  return `https://storage.googleapis.com/${PROD_BUCKET}/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function firebaseUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function rawGcsUrl(bucket: string, path: string): string {
  return `https://storage.googleapis.com/${bucket}/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function extractStagingPath(value: string): string | null {
  if (!value.includes(STAGING_BUCKET)) return null;

  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const parts = parsed.pathname.split('/');
      const bucketIndex = parts.indexOf('b');
      const objectIndex = parts.indexOf('o');
      if (bucketIndex >= 0 && parts[bucketIndex + 1] === STAGING_BUCKET && objectIndex >= 0) {
        return decodeURIComponent(parts.slice(objectIndex + 1).join('/'));
      }
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === STAGING_BUCKET) {
        return decodeURIComponent(parts.slice(1).join('/'));
      }
    }
  } catch {
    return null;
  }

  return null;
}

function collectRefs(
  value: unknown,
  fieldPath: string,
  refs: Array<{ path: string; fieldPath: string }>
): void {
  if (typeof value === 'string') {
    const path = extractStagingPath(value);
    if (path) refs.push({ path, fieldPath });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRefs(item, `${fieldPath}[${index}]`, refs));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, item] of Object.entries(value)) {
    collectRefs(item, fieldPath ? `${fieldPath}.${key}` : key, refs);
  }
}

function rewriteValue(
  value: unknown,
  successfulPaths: Set<string>,
  missingPaths: Set<string>
): { value: unknown; changed: boolean; drop?: boolean } {
  if (typeof value === 'string') {
    const path = extractStagingPath(value);
    if (path && successfulPaths.has(path)) {
      return { value: toRawProdUrl(path), changed: true };
    }
    if (path && missingPaths.has(path) && dropMissing) {
      return { value: DROP_VALUE, changed: true, drop: true };
    }
    return { value, changed: false };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = [];
    for (const item of value) {
      const result = rewriteValue(item, successfulPaths, missingPaths);
      changed ||= result.changed;
      if (!result.drop) next.push(result.value);
    }
    return { value: changed ? next : value, changed };
  }

  if (!isPlainObject(value)) return { value, changed: false };

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const result = rewriteValue(item, successfulPaths, missingPaths);
    changed ||= result.changed;
    if (result.drop) continue;
    next[key] = result.value;
  }

  return { value: changed ? next : value, changed };
}

async function fetchBytes(
  url: string
): Promise<{ bytes: Buffer; contentType: string | undefined } | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') ?? undefined,
  };
}

async function makePublic(path: string): Promise<void> {
  await prodBucket
    .file(path)
    .makePublic()
    .catch((error: unknown) => {
      throw new Error(`makePublic failed for ${path}: ${String(error)}`);
    });
}

async function ensureAsset(path: string, originalUrls: string[]): Promise<AssetStatus> {
  const file = prodBucket.file(path);
  const [exists] = await file.exists();
  if (exists) {
    await makePublic(path);
    return { ok: true, path, url: toRawProdUrl(path), source: 'existing-prod' };
  }

  const sourceCandidates: Array<{ source: AssetSource; url: string }> = [];
  const uniqueOriginals = [...new Set(originalUrls.filter(Boolean))];
  for (const url of uniqueOriginals) {
    sourceCandidates.push({ source: 'staging-url', url });
  }
  sourceCandidates.push(
    { source: 'staging-firebase', url: firebaseUrl(STAGING_BUCKET, path) },
    { source: 'staging-raw', url: rawGcsUrl(STAGING_BUCKET, path) },
    { source: 'legacy-firebase', url: firebaseUrl(LEGACY_BUCKET, path) },
    { source: 'legacy-raw', url: rawGcsUrl(LEGACY_BUCKET, path) }
  );

  for (const candidate of sourceCandidates) {
    const fetched = await fetchBytes(candidate.url).catch(() => null);
    if (!fetched) continue;

    await file.save(fetched.bytes, {
      resumable: false,
      metadata: fetched.contentType ? { contentType: fetched.contentType } : undefined,
    });
    await makePublic(path);
    return { ok: true, path, url: toRawProdUrl(path), source: candidate.source };
  }

  return { ok: false, path, reason: 'No readable staging or legacy source found' };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}

async function main(): Promise<void> {
  console.log(
    '[profile-assets-backfill] Starting',
    JSON.stringify({ dryRun, commit, dropMissing, limit, PROD_BUCKET })
  );

  const snapshot = await db.collection('Users').get();
  const repairs: UserRepair[] = [];
  const pathToOriginalUrls = new Map<string, Set<string>>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as UserDoc;
    const refs: Array<{ path: string; fieldPath: string }> = [];
    collectRefs(data.profileImgs, 'profileImgs', refs);
    collectRefs(data.sports, 'sports', refs);
    collectRefs(data.teamHistory, 'teamHistory', refs);

    if (refs.length === 0) continue;

    for (const field of [data.profileImgs, data.sports, data.teamHistory]) {
      const collectUrls = (value: unknown): void => {
        if (typeof value === 'string') {
          const path = extractStagingPath(value);
          if (path) {
            if (!pathToOriginalUrls.has(path)) pathToOriginalUrls.set(path, new Set());
            pathToOriginalUrls.get(path)!.add(value);
          }
          return;
        }
        if (Array.isArray(value)) return value.forEach(collectUrls);
        if (isPlainObject(value)) Object.values(value).forEach(collectUrls);
      };
      collectUrls(field);
    }

    repairs.push({
      uid: doc.id,
      unicode: data.unicode ?? null,
      refs,
      profileImgs: data.profileImgs,
      sports: data.sports,
      teamHistory: data.teamHistory,
    });

    if (limit && repairs.length >= limit) break;
  }

  const uniquePaths = [...pathToOriginalUrls.keys()].sort();
  console.log(
    '[profile-assets-backfill] Scan complete',
    JSON.stringify({
      totalUsers: snapshot.size,
      affectedUsers: repairs.length,
      uniquePaths: uniquePaths.length,
      totalRefs: repairs.reduce((sum, repair) => sum + repair.refs.length, 0),
    })
  );

  if (dryRun) {
    const fieldCounts = new Map<string, number>();
    for (const repair of repairs) {
      for (const ref of repair.refs)
        fieldCounts.set(ref.fieldPath, (fieldCounts.get(ref.fieldPath) ?? 0) + 1);
    }
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          affectedUsers: repairs.length,
          uniquePaths: uniquePaths.length,
          totalRefs: repairs.reduce((sum, repair) => sum + repair.refs.length, 0),
          topFields: [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
          sampleUsers: repairs.slice(0, 10).map((repair) => ({
            uid: repair.uid,
            unicode: repair.unicode,
            refs: repair.refs.slice(0, 5),
          })),
        },
        null,
        2
      )
    );
    return;
  }

  const statuses = await mapWithConcurrency(uniquePaths, 8, async (path, index) => {
    if (index > 0 && index % 100 === 0) {
      console.log(
        '[profile-assets-backfill] Asset progress',
        JSON.stringify({ checked: index, total: uniquePaths.length })
      );
    }
    return ensureAsset(path, [...(pathToOriginalUrls.get(path) ?? new Set())]);
  });

  const successfulPaths = new Set(
    statuses
      .filter((status): status is Extract<AssetStatus, { ok: true }> => status.ok)
      .map((status) => status.path)
  );
  const failed = statuses.filter(
    (status): status is Extract<AssetStatus, { ok: false }> => !status.ok
  );
  const missingPaths = new Set(failed.map((status) => status.path));
  const bySource = statuses.reduce<Record<string, number>>((acc, status) => {
    const key = status.ok ? status.source : 'failed';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    '[profile-assets-backfill] Asset repair complete',
    JSON.stringify({ successful: successfulPaths.size, failed: failed.length, bySource })
  );

  let updatedUsers = 0;
  let skippedUsers = 0;
  let batch = db.batch();
  let batchOps = 0;

  async function flush(): Promise<void> {
    if (batchOps === 0) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  }

  for (const repair of repairs) {
    const update: Record<string, unknown> = {};
    const profileResult = rewriteValue(repair.profileImgs, successfulPaths, missingPaths);
    const sportsResult = rewriteValue(repair.sports, successfulPaths, missingPaths);
    const teamHistoryResult = rewriteValue(repair.teamHistory, successfulPaths, missingPaths);

    if (profileResult.changed) update['profileImgs'] = profileResult.value;
    if (sportsResult.changed) update['sports'] = sportsResult.value;
    if (teamHistoryResult.changed) update['teamHistory'] = teamHistoryResult.value;

    if (Object.keys(update).length === 0) {
      skippedUsers++;
      continue;
    }

    batch.set(db.collection('Users').doc(repair.uid), update, { merge: true });
    batchOps++;
    updatedUsers++;

    if (batchOps >= 400) await flush();
  }

  await flush();

  console.log(
    JSON.stringify(
      {
        mode: 'commit',
        affectedUsers: repairs.length,
        updatedUsers,
        skippedUsers,
        uniquePaths: uniquePaths.length,
        successfulAssets: successfulPaths.size,
        failedAssets: failed.length,
        dropMissing,
        bySource,
        failedSample: failed.slice(0, 50),
      },
      null,
      2
    )
  );
}

await main();
