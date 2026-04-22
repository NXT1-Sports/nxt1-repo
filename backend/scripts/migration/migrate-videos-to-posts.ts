/**
 * @fileoverview Migrate Legacy Videos → Posts (type: 'highlight')
 *
 * Reads from the legacy `Videos` collection and writes to `Posts` with
 * `type: 'highlight'`, preserving all existing fields and adding the new
 * schema fields (visibility, organizationId, teamId, etc.).
 *
 * Deduplicates by normalized URL — skips any video whose URL already exists
 * in Posts as a highlight.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-videos-to-posts.ts --dry-run
 *   npx tsx scripts/migration/migrate-videos-to-posts.ts --limit=100
 *   npx tsx scripts/migration/migrate-videos-to-posts.ts              # Full migration
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { readFileSync } from 'node:fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;

const batchLimit = parseInt(getArg('limit') ?? '0', 10) || 0;
const isDryRun = args.includes('--dry-run');

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccountPath =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8')) as ServiceAccount;
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Migrate Videos → Posts (type: highlight)      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (isDryRun) console.log('  [DRY RUN MODE — no writes]');
  console.log();

  // Step 1: Build set of existing highlight URLs in Posts for dedup
  console.log('Step 1: Indexing existing highlight URLs in Posts...');
  const existingUrls = new Set<string>();
  let lastPostDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let q = db
      .collection('Posts')
      .where('type', '==', 'highlight')
      .limit(500) as FirebaseFirestore.Query;
    if (lastPostDoc) q = q.startAfter(lastPostDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data();
      const url = (data['url'] ?? data['src'] ?? data['mediaUrl'] ?? '') as string;
      if (url) existingUrls.add(url.trim().toLowerCase());
    }
    lastPostDoc = snap.docs[snap.docs.length - 1];
  }
  console.log(`  Found ${existingUrls.size} existing highlight URLs\n`);

  // Step 2: Build user lookup cache for teamId/organizationId
  const userCache = new Map<string, { teamId?: string; organizationId?: string }>();

  async function getUserRefs(
    userId: string
  ): Promise<{ teamId?: string; organizationId?: string }> {
    if (userCache.has(userId)) return userCache.get(userId)!;
    const userDoc = await db.collection('Users').doc(userId).get();
    const result: { teamId?: string; organizationId?: string } = {};
    if (userDoc.exists) {
      const data = userDoc.data()!;
      result.teamId = typeof data['teamId'] === 'string' ? data['teamId'] : undefined;
      result.organizationId =
        typeof data['organizationId'] === 'string' ? data['organizationId'] : undefined;
    }
    userCache.set(userId, result);
    return result;
  }

  // Step 3: Paginate through Videos and migrate
  console.log('Step 2: Migrating Videos → Posts...\n');
  let processed = 0;
  let migrated = 0;
  let skippedDuplicate = 0;
  let skippedMissing = 0;
  let errors = 0;
  let lastVideoDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const BATCH_SIZE = 500;

  while (true) {
    let query = db
      .collection('Videos')
      .orderBy('createdAt', 'desc')
      .limit(BATCH_SIZE) as FirebaseFirestore.Query;
    if (lastVideoDoc) query = query.startAfter(lastVideoDoc);

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      processed++;
      const data = doc.data();

      const userId = data['userId'] as string | undefined;
      const url = (data['url'] ?? data['src'] ?? data['mediaUrl'] ?? '') as string;

      if (!userId || !url) {
        skippedMissing++;
        continue;
      }

      const normalizedUrl = url.trim().toLowerCase();
      if (existingUrls.has(normalizedUrl)) {
        skippedDuplicate++;
        continue;
      }

      // Look up user for referential integrity
      const refs = await getUserRefs(userId);

      const postDoc: Record<string, unknown> = {
        // Preserve all original fields
        ...data,
        // Ensure critical fields exist
        userId,
        ownerType: data['ownerType'] ?? 'user',
        sportId: data['sportId'] ?? undefined,
        url: url.trim(),
        mediaUrl: url.trim(),
        src: url.trim(),
        type: 'highlight',
        visibility: 'PUBLIC',
        platform: data['platform'] ?? data['provider'] ?? 'other',
        provider: data['provider'] ?? data['platform'] ?? 'other',
        source: data['source'] ?? 'legacy_migration',
        isPublic: true,
        stats: data['stats'] ?? { views: 0, likes: 0, shares: 0, comments: 0 },
        // Referential integrity
        ...(refs.teamId ? { teamId: refs.teamId } : {}),
        ...(refs.organizationId ? { organizationId: refs.organizationId } : {}),
        // Data lineage
        extractedAt: data['extractedAt'] ?? data['createdAt'] ?? new Date().toISOString(),
        // Migration metadata
        _migratedFrom: 'Videos',
        _migratedAt: new Date().toISOString(),
        _originalId: doc.id,
        // Timestamps
        createdAt: data['createdAt'] ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Remove undefined values
      for (const [key, value] of Object.entries(postDoc)) {
        if (value === undefined) delete postDoc[key];
      }

      if (!isDryRun) {
        const newDocRef = db.collection('Posts').doc();
        postDoc['id'] = newDocRef.id;
        batch.set(newDocRef, postDoc);
        batchCount++;
      }

      existingUrls.add(normalizedUrl);
      migrated++;
    }

    if (!isDryRun && batchCount > 0) {
      try {
        await batch.commit();
      } catch (err) {
        console.error(`\n  ❌ Batch commit failed:`, err);
        errors += batchCount;
        migrated -= batchCount;
      }
    }

    lastVideoDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(
      `\r  Processed: ${processed} | Migrated: ${migrated} | Skipped: ${skippedDuplicate + skippedMissing}`
    );

    if (batchLimit > 0 && processed >= batchLimit) break;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  MIGRATION SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`  Total Processed:     ${processed}`);
  console.log(`  Migrated to Posts:   ${migrated}`);
  console.log(`  Skipped (duplicate): ${skippedDuplicate}`);
  console.log(`  Skipped (missing):   ${skippedMissing}`);
  console.log(`  Errors:              ${errors}`);

  if (isDryRun) {
    console.log('\n  [DRY RUN] No documents were written.\n');
  } else {
    console.log(`\n  ✅ Migration complete. ${migrated} documents written to Posts.\n`);
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
