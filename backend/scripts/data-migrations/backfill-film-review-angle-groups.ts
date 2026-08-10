#!/usr/bin/env tsx
/**
 * Backfills legacy Film Review timelines so paired wide/tight source clips share
 * one grouped play row with `sourceIds`.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-film-review-angle-groups.ts --staging
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-film-review-angle-groups.ts --staging --commit
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-film-review-angle-groups.ts --commit --team <teamId>
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-film-review-angle-groups.ts --commit --review <reviewId>
 */

import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  getTeamFilmReviewRevision,
  getUniversalFilmReviewPayload,
  normalizeTeamFilmReviewGroupedTimeline,
  toUniversalFileFromTeamFilmReview,
  type TeamFilmReviewDoc,
  type UniversalFileDoc,
} from '@nxt1/core';
import {
  toTeamFilmReviewDocFromUniversalFile,
  toUniversalFileDoc,
} from '../../src/services/team/universal-film-reviews.service.js';

loadDotenv();

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..', '..');
loadDotenv({ path: resolve(backendRoot, '.env'), override: false });

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews' as const;
const DEFAULT_LIMIT = 500;

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const teamId = getArgValue('--team');
const reviewId = getArgValue('--review');
const fileId = getArgValue('--file');
const limit = toPositiveInteger(getArgValue('--limit')) ?? DEFAULT_LIMIT;

interface BackfillStats {
  readonly scannedTeamReviews: number;
  readonly scannedUniversalFiles: number;
  readonly eligibleTeamReviews: number;
  readonly eligibleUniversalFiles: number;
  readonly changedTeamReviews: number;
  readonly changedUniversalFiles: number;
  readonly writtenTeamReviews: number;
  readonly writtenUniversalFiles: number;
  readonly failed: number;
}

interface MutableBackfillStats {
  scannedTeamReviews: number;
  scannedUniversalFiles: number;
  eligibleTeamReviews: number;
  eligibleUniversalFiles: number;
  changedTeamReviews: number;
  changedUniversalFiles: number;
  writtenTeamReviews: number;
  writtenUniversalFiles: number;
  failed: number;
}

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;

  const value = args[index + 1];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function toPortableTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return new Date(0).toISOString();
}

function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefinedDeep(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function toFilmReviewDoc(docId: string, data: Record<string, unknown>): TeamFilmReviewDoc | null {
  const videoUrl = typeof data['videoUrl'] === 'string' ? data['videoUrl'].trim() : '';
  const sources = Array.isArray(data['sources']) ? data['sources'] : [];
  if (!videoUrl && sources.length === 0) return null;

  return {
    ...(data as Omit<TeamFilmReviewDoc, 'id'>),
    id: docId,
    sport: typeof data['sport'] === 'string' ? data['sport'] : 'unknown',
    title: typeof data['title'] === 'string' ? data['title'] : docId,
    status: (typeof data['status'] === 'string'
      ? data['status']
      : 'ready') as TeamFilmReviewDoc['status'],
    videoUrl:
      videoUrl || String((sources[0] as { videoUrl?: unknown } | undefined)?.videoUrl ?? ''),
    source: typeof data['source'] === 'string' ? data['source'] : 'team_files',
    schemaVersion: typeof data['schemaVersion'] === 'number' ? data['schemaVersion'] : 2,
    createdBy: typeof data['createdBy'] === 'string' ? data['createdBy'] : '',
    updatedBy: typeof data['updatedBy'] === 'string' ? data['updatedBy'] : '',
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['timelineGeneratedAt']
      ? { timelineGeneratedAt: toPortableTimestamp(data['timelineGeneratedAt']) }
      : {}),
  } as TeamFilmReviewDoc;
}

async function initializeFirestore(): Promise<Firestore> {
  const projectId = environment === 'staging' ? 'nxt-1-staging-v2' : 'nxt-1-v2';
  process.env['GOOGLE_CLOUD_PROJECT'] ||= projectId;
  process.env['GCLOUD_PROJECT'] ||= projectId;

  if (environment === 'staging') {
    process.env['STAGING_FIREBASE_PROJECT_ID'] ||= projectId;
    const firebaseStaging = await import('../../src/utils/firebase-staging.js');
    return firebaseStaging.stagingDb;
  }

  process.env['FIREBASE_PROJECT_ID'] ||= projectId;
  const firebaseProduction = await import('../../src/utils/firebase.js');
  return firebaseProduction.db;
}

function buildTeamReviewsQuery(db: Firestore): Query {
  let query: Query = db
    .collection(TEAM_FILM_REVIEWS_COLLECTION)
    .where('uploadMode', '==', 'batch_clips');
  if (teamId) query = query.where('teamId', '==', teamId);
  return query.limit(limit);
}

function buildNestedUniversalFilesQuery(db: Firestore): Query {
  let query: Query = db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('payload.filmReview.uploadMode', '==', 'batch_clips');
  if (teamId) query = query.where('teamId', '==', teamId);
  return query.limit(limit);
}

function buildDirectUniversalFilesQuery(db: Firestore): Query {
  let query: Query = db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('payload.uploadMode', '==', 'batch_clips');
  if (teamId) query = query.where('teamId', '==', teamId);
  return query.limit(limit);
}

async function collectUniversalFileDocs(db: Firestore): Promise<readonly UniversalFileDoc[]> {
  if (fileId || reviewId) {
    const id = fileId ?? reviewId;
    if (!id) return [];
    const snapshot = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(id).get();
    if (!snapshot.exists) return [];
    return [toUniversalFileDoc(snapshot.id, snapshot.data() ?? {})];
  }

  const [nestedSnapshot, directSnapshot] = await Promise.all([
    buildNestedUniversalFilesQuery(db).get(),
    buildDirectUniversalFilesQuery(db).get(),
  ]);

  const byId = new Map<string, UniversalFileDoc>();
  for (const doc of [...nestedSnapshot.docs, ...directSnapshot.docs]) {
    byId.set(doc.id, toUniversalFileDoc(doc.id, doc.data() ?? {}));
  }

  return [...byId.values()];
}

function buildTeamReviewUpdate(review: TeamFilmReviewDoc): Record<string, unknown> {
  return pruneUndefinedDeep({
    timeline: review.timeline,
    reviewRevision: getTeamFilmReviewRevision(review) + 1,
  });
}

function buildUniversalFileUpdate(
  file: UniversalFileDoc,
  review: TeamFilmReviewDoc
): Record<string, unknown> | null {
  if (file.payloadKind === 'pointer') return null;

  const projected = toUniversalFileFromTeamFilmReview(review);
  if (file.type === 'film_review') {
    return pruneUndefinedDeep({
      payload: projected.payload,
      semanticSync: { status: 'pending' },
    });
  }

  const payload = file.payload && typeof file.payload === 'object' ? file.payload : {};
  if (!getUniversalFilmReviewPayload(payload)) return null;

  return pruneUndefinedDeep({
    payload: {
      ...(payload as Record<string, unknown>),
      filmReview: projected.payload,
    },
    semanticSync: { status: 'pending' },
  });
}

async function backfillTeamReviews(db: Firestore, stats: MutableBackfillStats): Promise<void> {
  const snapshots = reviewId
    ? [await db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(reviewId).get()]
    : (await buildTeamReviewsQuery(db).get()).docs;

  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    stats.scannedTeamReviews += 1;

    try {
      const review = toFilmReviewDoc(snapshot.id, snapshot.data() ?? {});
      if (!review) continue;
      stats.eligibleTeamReviews += 1;

      const normalized = normalizeTeamFilmReviewGroupedTimeline(review);
      if (!normalized.changed) continue;

      stats.changedTeamReviews += 1;
      console.log(
        `[TeamFilmReviews] ${review.id}: ${review.timeline?.length ?? 0} rows -> ${normalized.review.timeline?.length ?? 0} grouped rows`
      );

      if (commit) {
        await db
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .doc(snapshot.id)
          .set(buildTeamReviewUpdate(normalized.review), { merge: true });
        stats.writtenTeamReviews += 1;
      }
    } catch (error) {
      stats.failed += 1;
      console.error(`[TeamFilmReviews] ${snapshot.id}: failed`, error);
    }
  }
}

async function backfillUniversalFiles(db: Firestore, stats: MutableBackfillStats): Promise<void> {
  const files = await collectUniversalFileDocs(db);

  for (const file of files) {
    stats.scannedUniversalFiles += 1;

    try {
      const review = toTeamFilmReviewDocFromUniversalFile(file);
      if (!review) continue;
      stats.eligibleUniversalFiles += 1;

      const normalized = normalizeTeamFilmReviewGroupedTimeline(review);
      if (!normalized.changed) continue;

      const update = buildUniversalFileUpdate(file, {
        ...normalized.review,
        reviewRevision: getTeamFilmReviewRevision(review) + 1,
      });
      if (!update) continue;

      stats.changedUniversalFiles += 1;
      console.log(
        `[UniversalFiles] ${file.id}: ${review.timeline?.length ?? 0} rows -> ${normalized.review.timeline?.length ?? 0} grouped rows`
      );

      if (commit) {
        await db.collection(UNIVERSAL_FILES_COLLECTION).doc(file.id).set(update, { merge: true });
        stats.writtenUniversalFiles += 1;
      }
    } catch (error) {
      stats.failed += 1;
      console.error(`[UniversalFiles] ${file.id}: failed`, error);
    }
  }
}

function logSummary(stats: BackfillStats): void {
  console.log('');
  console.log('Results:');
  console.log(`  scannedTeamReviews:      ${stats.scannedTeamReviews}`);
  console.log(`  eligibleTeamReviews:     ${stats.eligibleTeamReviews}`);
  console.log(`  changedTeamReviews:      ${stats.changedTeamReviews}`);
  console.log(`  writtenTeamReviews:      ${stats.writtenTeamReviews}`);
  console.log(`  scannedUniversalFiles:   ${stats.scannedUniversalFiles}`);
  console.log(`  eligibleUniversalFiles:  ${stats.eligibleUniversalFiles}`);
  console.log(`  changedUniversalFiles:   ${stats.changedUniversalFiles}`);
  console.log(`  writtenUniversalFiles:   ${stats.writtenUniversalFiles}`);
  console.log(`  failed:                  ${stats.failed}`);
  console.log('');
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Film Review Wide/Tight Timeline Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Limit: ${limit}`);
  if (teamId) console.log(`  Scope: team ${teamId}`);
  if (reviewId) console.log(`  Scope: review ${reviewId}`);
  if (fileId) console.log(`  Scope: universal file ${fileId}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const db = await initializeFirestore();
  const stats: MutableBackfillStats = {
    scannedTeamReviews: 0,
    scannedUniversalFiles: 0,
    eligibleTeamReviews: 0,
    eligibleUniversalFiles: 0,
    changedTeamReviews: 0,
    changedUniversalFiles: 0,
    writtenTeamReviews: 0,
    writtenUniversalFiles: 0,
    failed: 0,
  };

  await backfillTeamReviews(db, stats);
  await backfillUniversalFiles(db, stats);
  logSummary(stats);

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to persist grouped timelines.');
    return;
  }

  console.log('Backfill complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal backfill error:', error);
    process.exit(1);
  });
