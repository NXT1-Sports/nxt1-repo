#!/usr/bin/env tsx
import { config as loadDotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { TeamFilmReviewDoc, TeamFilmReviewSourceVideo } from '@nxt1/core';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import type { FfmpegMcpBridgeService } from '../../src/modules/agent/tools/integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
import type { ToolExecutionContext } from '../../src/modules/agent/tools/base.tool.js';
import { AgentMediaLifecycleService } from '../../src/modules/agent/tools/media/agent-media-lifecycle.service.js';
import { getSignedUrlWithTimeout } from '../../src/utils/gcs-signed-url.js';

loadDotenv();

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..', '..');
loadDotenv({ path: resolve(backendRoot, '.env'), override: false });

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews' as const;
const DEFAULT_BATCH_SIZE = 150;
const MAX_CONCURRENCY = 6;
const DEFAULT_CONCURRENCY = 2;
const THUMBNAIL_MIME_TYPE = 'image/jpeg';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const teamId = getArgValue('--team');
const reviewId = getArgValue('--review');
const fileId = getArgValue('--file');
const limitArg = getArgValue('--limit');
const concurrencyArg = getArgValue('--concurrency');

const limit = toPositiveInteger(limitArg);
const concurrency = Math.min(
  toPositiveInteger(concurrencyArg) ?? DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY
);

interface BackfillStats {
  scanned: number;
  eligible: number;
  generated: number;
  reusedExisting: number;
  synced: number;
  skipped: number;
  failed: number;
}

interface ResolvedVideoTarget {
  readonly storagePath: string;
  readonly sourceIndex: number | null;
}

type StorageFile = {
  getSignedUrl(options: { version: 'v4'; action: 'read'; expires: number }): Promise<[string]>;
  save(
    buffer: Buffer,
    options: {
      metadata?: {
        contentType?: string;
        cacheControl?: string;
        metadata?: Record<string, string>;
      };
    }
  ): Promise<unknown>;
};

type StorageBucket = {
  name: string;
  file(storagePath: string): StorageFile;
};

type StorageServiceLike = {
  bucket(name?: string): StorageBucket;
};

let firestore: Firestore | null = null;
let storageService: StorageServiceLike | null = null;
let ffmpegBridgeFactory: (new () => FfmpegMcpBridgeService) | null = null;
let generateVideoThumbnailFn:
  | ((params: {
      readonly bridge: Pick<FfmpegMcpBridgeService, 'generateThumbnail'>;
      readonly videoUrl: string | undefined;
      readonly outputPath?: string;
      readonly fallbackBase: string;
      readonly context?: ToolExecutionContext;
      readonly logScope: string;
      readonly time?: string;
      readonly required?: boolean;
    }) => Promise<string | null>)
  | null = null;
let upsertUniversalFileFromFilmReviewFn:
  | ((params: { readonly db: Firestore; readonly review: TeamFilmReviewDoc }) => Promise<void>)
  | null = null;

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;

  const value = args[index + 1];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function createStats(): BackfillStats {
  return {
    scanned: 0,
    eligible: 0,
    generated: 0,
    reusedExisting: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
  };
}

function resolveBucketName(): string {
  const configured =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_STORAGE_BUCKET']
      : process.env['FIREBASE_STORAGE_BUCKET'];
  const normalizedConfigured = normalizeOptionalString(configured);
  if (normalizedConfigured) {
    return normalizedConfigured;
  }

  return environment === 'staging'
    ? 'nxt-1-staging-v2.firebasestorage.app'
    : 'nxt-1-v2.firebasestorage.app';
}

function resolveProjectId(): string {
  const configured =
    environment === 'staging'
      ? process.env['STAGING_FIREBASE_PROJECT_ID']
      : process.env['FIREBASE_PROJECT_ID'];
  const normalizedConfigured = normalizeOptionalString(configured);
  if (normalizedConfigured) {
    return normalizedConfigured;
  }

  return environment === 'staging' ? 'nxt-1-staging-v2' : 'nxt-1-v2';
}

async function initializeFirebaseRuntime(): Promise<void> {
  const projectId = resolveProjectId();
  process.env['GOOGLE_CLOUD_PROJECT'] ||= projectId;
  process.env['GCLOUD_PROJECT'] ||= projectId;

  if (environment === 'staging') {
    process.env['STAGING_FIREBASE_PROJECT_ID'] ||= projectId;
    const firebaseStaging = await import('../../src/utils/firebase-staging.js');
    firestore = firebaseStaging.stagingDb;
    storageService = firebaseStaging.stagingStorage as unknown as StorageServiceLike;
    return;
  }

  process.env['FIREBASE_PROJECT_ID'] ||= projectId;
  const firebaseProduction = await import('../../src/utils/firebase.js');
  firestore = firebaseProduction.db;
  storageService = firebaseProduction.storage as unknown as StorageServiceLike;
}

async function initializeFfmpegRuntime(): Promise<void> {
  if (ffmpegBridgeFactory && generateVideoThumbnailFn) {
    return;
  }

  const [ffmpegBridgeModule, ffmpegThumbnailModule] = await Promise.all([
    import('../../src/modules/agent/tools/integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js'),
    import('../../src/modules/agent/tools/integrations/ffmpeg-mcp/ffmpeg-thumbnail-helper.js'),
  ]);

  ffmpegBridgeFactory = ffmpegBridgeModule.FfmpegMcpBridgeService;
  generateVideoThumbnailFn = ffmpegThumbnailModule.generateVideoThumbnail;
}

async function initializeUniversalFileSyncRuntime(): Promise<void> {
  if (upsertUniversalFileFromFilmReviewFn) {
    return;
  }

  const universalFilesSyncModule =
    await import('../../src/services/team/universal-files-sync.service.js');
  upsertUniversalFileFromFilmReviewFn = universalFilesSyncModule.upsertUniversalFileFromFilmReview;
}

function getFirestoreDb(): Firestore {
  if (!firestore) {
    throw new Error('Firestore runtime is not initialized');
  }

  return firestore;
}

function getStorageBucket(): StorageBucket {
  const bucketName = resolveBucketName();
  if (!storageService) {
    throw new Error('Storage runtime is not initialized');
  }

  return storageService.bucket(bucketName);
}

function toPortableTimestamp(value: unknown): Date | string {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return new Date(0);
}

function toFilmReviewDoc(
  docId: string,
  data: Record<string, unknown>,
  fallbackTeamId?: string
): TeamFilmReviewDoc {
  return {
    ...(data as Omit<TeamFilmReviewDoc, 'id' | 'createdAt' | 'updatedAt'>),
    id: docId,
    teamId: normalizeOptionalString(data['teamId']) ?? fallbackTeamId,
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['timelineGeneratedAt']
      ? { timelineGeneratedAt: toPortableTimestamp(data['timelineGeneratedAt']) }
      : {}),
  } as TeamFilmReviewDoc;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeComparablePath(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function normalizePersistableThumbnailUrl(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  if (/^data:/i.test(normalized)) return null;
  if (/^blob:/i.test(normalized)) return null;
  return normalized;
}

function isDurableThumbnailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (/firebasestorage\.googleapis\.com$/i.test(url.hostname)) {
      return url.searchParams.get('alt') === 'media' && url.searchParams.has('token');
    }

    if (/storage\.googleapis\.com$/i.test(url.hostname)) {
      return !url.searchParams.has('X-Goog-Algorithm');
    }

    return true;
  } catch {
    return false;
  }
}

function resolveStoragePathFromValues(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
      continue;
    }

    const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(normalized);
    if (storagePath) {
      return storagePath;
    }
  }

  return null;
}

function resolveMatchingSourceIndex(
  review: TeamFilmReviewDoc,
  targetStoragePath: string
): number | null {
  const normalizedTargetPath = normalizeComparablePath(targetStoragePath);
  if (!normalizedTargetPath) {
    return null;
  }

  const sources = review.sources ?? [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const sourceStoragePath = normalizeComparablePath(
      resolveStoragePathFromValues(source.storagePath, source.videoUrl, source.downloadUrl)
    );
    if (sourceStoragePath === normalizedTargetPath) {
      return index;
    }
  }

  return sources.length === 1 ? 0 : null;
}

function resolveVideoTarget(review: TeamFilmReviewDoc): ResolvedVideoTarget | null {
  const reviewStoragePath = resolveStoragePathFromValues(review.storagePath, review.videoUrl);
  if (reviewStoragePath) {
    return {
      storagePath: reviewStoragePath,
      sourceIndex: resolveMatchingSourceIndex(review, reviewStoragePath),
    };
  }

  const sources = review.sources ?? [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const storagePath = resolveStoragePathFromValues(
      source.storagePath,
      source.videoUrl,
      source.downloadUrl
    );
    if (storagePath) {
      return {
        storagePath,
        sourceIndex: index,
      };
    }
  }

  return null;
}

function resolveExistingThumbnailUrl(
  review: TeamFilmReviewDoc,
  sourceIndex: number | null
): string | null {
  const reviewThumbnailUrl = normalizePersistableThumbnailUrl(review.thumbnailUrl);
  if (reviewThumbnailUrl && isDurableThumbnailUrl(reviewThumbnailUrl)) {
    return reviewThumbnailUrl;
  }

  if (sourceIndex !== null) {
    const sourceThumbnailUrl = normalizePersistableThumbnailUrl(
      review.sources?.[sourceIndex]?.thumbnailUrl
    );
    if (sourceThumbnailUrl && isDurableThumbnailUrl(sourceThumbnailUrl)) {
      return sourceThumbnailUrl;
    }
  }

  for (const source of review.sources ?? []) {
    const sourceThumbnailUrl = normalizePersistableThumbnailUrl(source.thumbnailUrl);
    if (sourceThumbnailUrl && isDurableThumbnailUrl(sourceThumbnailUrl)) {
      return sourceThumbnailUrl;
    }
  }

  return null;
}

function buildUpdatedSources(
  review: TeamFilmReviewDoc,
  sourceIndex: number | null,
  thumbnailUrl: string
): readonly TeamFilmReviewSourceVideo[] | undefined {
  if (sourceIndex === null) {
    return review.sources;
  }

  const sources = review.sources ?? [];
  if (!sources[sourceIndex]) {
    return review.sources;
  }

  return sources.map((source, index) =>
    index === sourceIndex ? { ...source, thumbnailUrl } : source
  );
}

function buildThumbnailFileName(review: TeamFilmReviewDoc, target: ResolvedVideoTarget): string {
  const sourceTitle =
    target.sourceIndex !== null
      ? normalizeOptionalString(review.sources?.[target.sourceIndex]?.title)
      : null;
  const pathBaseName =
    target.storagePath
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/u, '') ?? review.id;
  const preferredBaseName =
    sourceTitle ?? normalizeOptionalString(review.title)?.replace(/\.[^.]+$/u, '') ?? pathBaseName;

  return `${preferredBaseName}-thumbnail.jpg`;
}

function needsRepair(
  review: TeamFilmReviewDoc,
  sourceIndex: number | null,
  thumbnailUrl: string
): boolean {
  const normalizedThumbnailUrl = normalizePersistableThumbnailUrl(thumbnailUrl);
  if (!normalizedThumbnailUrl) {
    return false;
  }

  const reviewThumbnailUrl = normalizePersistableThumbnailUrl(review.thumbnailUrl);
  if (reviewThumbnailUrl !== normalizedThumbnailUrl) {
    return true;
  }

  if (sourceIndex !== null) {
    const sourceThumbnailUrl = normalizePersistableThumbnailUrl(
      review.sources?.[sourceIndex]?.thumbnailUrl
    );
    if (sourceThumbnailUrl !== normalizedThumbnailUrl) {
      return true;
    }
  }

  return false;
}

async function collectReviewDocuments(): Promise<QueryDocumentSnapshot[]> {
  const firestoreDb = getFirestoreDb();
  if (reviewId) {
    const snapshot = await firestoreDb.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(reviewId).get();
    return snapshot.exists ? [snapshot as QueryDocumentSnapshot] : [];
  }

  if (teamId || fileId) {
    const snapshot = teamId
      ? await firestoreDb
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .where('teamId', '==', teamId)
          .get()
      : await firestoreDb
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .where('fileId', '==', fileId)
          .get();

    const filteredDocs = snapshot.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (fileId && normalizeOptionalString(data['fileId']) !== fileId) {
        return false;
      }
      return true;
    });

    return limit ? filteredDocs.slice(0, limit) : filteredDocs;
  }

  const collected: QueryDocumentSnapshot[] = [];
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore
      ? getFirestoreDb()
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .orderBy('updatedAt', 'desc')
          .limit(DEFAULT_BATCH_SIZE)
      : getFirestoreDb()
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .orderBy('updatedAt', 'desc')
          .limit(DEFAULT_BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const doc of snapshot.docs) {
      collected.push(doc);
      if (limit && collected.length >= limit) {
        return collected;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return collected;
}

async function runWithConcurrency(
  docs: readonly QueryDocumentSnapshot[],
  worker: (doc: QueryDocumentSnapshot, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < docs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(docs[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, () => runWorker()));
}

async function createFreshReadUrl(storagePath: string): Promise<string> {
  const bucket = getStorageBucket();
  const expiresAt = Date.now() + AgentMediaLifecycleService.DEFAULT_SIGNED_URL_TTL_MS;
  const [signedUrl] = await getSignedUrlWithTimeout(() =>
    bucket.file(storagePath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    })
  );

  return signedUrl;
}

async function downloadThumbnailBuffer(thumbnailUrl: string): Promise<Buffer> {
  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    throw new Error(`Generated thumbnail is not readable (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('Generated thumbnail is empty');
  }

  return buffer;
}

async function persistThumbnailBuffer(params: {
  readonly review: TeamFilmReviewDoc;
  readonly target: ResolvedVideoTarget;
  readonly buffer: Buffer;
}): Promise<string> {
  const bucket = getStorageBucket();
  const storagePath = AgentMediaLifecycleService.buildStoragePath({
    userId: params.review.createdBy,
    mimeType: THUMBNAIL_MIME_TYPE,
    fileName: buildThumbnailFileName(params.review, params.target),
    zone: 'media',
  });
  const downloadToken = randomUUID();

  await bucket.file(storagePath).save(params.buffer, {
    metadata: {
      contentType: THUMBNAIL_MIME_TYPE,
      cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  return AgentMediaLifecycleService.buildFirebaseDownloadUrl(
    bucket.name,
    storagePath,
    downloadToken
  );
}

async function generateDurableThumbnailUrl(params: {
  readonly review: TeamFilmReviewDoc;
  readonly target: ResolvedVideoTarget;
  readonly bridge: FfmpegMcpBridgeService;
}): Promise<string> {
  const videoUrl = await createFreshReadUrl(params.target.storagePath);
  const executionContext: ToolExecutionContext = {
    userId: params.review.createdBy,
    environment,
    threadId: 'film-review-thumbnail-backfill',
    operationId: `film-review-thumbnail-backfill:${params.review.id}`,
  };

  if (!generateVideoThumbnailFn) {
    throw new Error('FFmpeg runtime is not initialized');
  }

  const generatedThumbnailUrl = await generateVideoThumbnailFn({
    bridge: params.bridge,
    videoUrl,
    fallbackBase: `film-review-${params.review.id}`,
    context: executionContext,
    logScope: 'film-review-thumbnail-backfill',
    required: true,
  });

  if (!generatedThumbnailUrl) {
    throw new Error('Thumbnail generation completed without a thumbnail URL');
  }

  const thumbnailBuffer = await downloadThumbnailBuffer(generatedThumbnailUrl);
  return persistThumbnailBuffer({
    review: params.review,
    target: params.target,
    buffer: thumbnailBuffer,
  });
}

async function repairReview(params: {
  readonly review: TeamFilmReviewDoc;
  readonly bridge: FfmpegMcpBridgeService | null;
  readonly stats: BackfillStats;
}): Promise<void> {
  const target = resolveVideoTarget(params.review);
  if (!target) {
    params.stats.skipped += 1;
    return;
  }

  const existingThumbnailUrl = resolveExistingThumbnailUrl(params.review, target.sourceIndex);
  const nextThumbnailUrl = existingThumbnailUrl
    ? existingThumbnailUrl
    : commit
      ? await generateDurableThumbnailUrl({
          review: params.review,
          target,
          bridge: params.bridge as FfmpegMcpBridgeService,
        })
      : '__dry_run_generate__';

  if (!needsRepair(params.review, target.sourceIndex, nextThumbnailUrl)) {
    params.stats.skipped += 1;
    return;
  }

  params.stats.eligible += 1;

  if (!commit) {
    return;
  }

  const finalizedThumbnailUrl = nextThumbnailUrl;
  const nextSources = buildUpdatedSources(params.review, target.sourceIndex, finalizedThumbnailUrl);
  const now = new Date();
  const firestoreDb = getFirestoreDb();

  await firestoreDb
    .collection(TEAM_FILM_REVIEWS_COLLECTION)
    .doc(params.review.id)
    .set(
      {
        thumbnailUrl: finalizedThumbnailUrl,
        ...(nextSources ? { sources: nextSources } : {}),
        updatedAt: now,
      },
      { merge: true }
    );

  const nextReview: TeamFilmReviewDoc = {
    ...params.review,
    thumbnailUrl: finalizedThumbnailUrl,
    ...(nextSources ? { sources: nextSources } : {}),
    updatedAt: now,
  };

  if (!upsertUniversalFileFromFilmReviewFn) {
    throw new Error('Universal file sync runtime is not initialized');
  }

  await upsertUniversalFileFromFilmReviewFn({
    db: firestoreDb,
    review: nextReview,
  });

  if (existingThumbnailUrl) {
    params.stats.reusedExisting += 1;
  } else {
    params.stats.generated += 1;
  }
  params.stats.synced += 1;
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Film Review Firebase Thumbnail Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Concurrency: ${concurrency}`);
  if (teamId) {
    console.log(`  Scope: team ${teamId}`);
  }
  if (reviewId) {
    console.log(`  Scope: review ${reviewId}`);
  }
  if (fileId) {
    console.log(`  Scope: file ${fileId}`);
  }
  if (limit) {
    console.log(`  Limit: ${limit}`);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  await initializeFirebaseRuntime();
  const docs = await collectReviewDocuments();
  const stats = createStats();

  console.log(`reviews_in_scope: ${docs.length}`);

  if (docs.length === 0) {
    console.log('No matching TeamFilmReviews documents found.');
    return;
  }

  if (commit) {
    await connectToMongoDB();
    await initializeFfmpegRuntime();
    await initializeUniversalFileSyncRuntime();
  }

  const bridge = commit
    ? ffmpegBridgeFactory
      ? new ffmpegBridgeFactory()
      : (() => {
          throw new Error('FFmpeg runtime is not initialized');
        })()
    : null;

  await runWithConcurrency(docs, async (doc, index) => {
    stats.scanned += 1;

    try {
      const review = toFilmReviewDoc(doc.id, doc.data() as Record<string, unknown>, teamId);
      await repairReview({ review, bridge, stats });
    } catch (error) {
      stats.failed += 1;
      console.error(
        'film_review_thumbnail_backfill_failed',
        JSON.stringify({
          reviewId: doc.id,
          index: index + 1,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }

    if ((index + 1) % 10 === 0 || index === docs.length - 1) {
      console.log(`processed: ${index + 1}/${docs.length}`);
    }
  });

  console.log('');
  console.log(`scanned:         ${stats.scanned}`);
  console.log(`eligible:        ${stats.eligible}`);
  console.log(`generated:       ${stats.generated}`);
  console.log(`reused_existing: ${stats.reusedExisting}`);
  console.log(`synced:          ${stats.synced}`);
  console.log(`skipped:         ${stats.skipped}`);
  console.log(`failed:          ${stats.failed}`);
  console.log('');

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to persist missing Firebase thumbnails.');
    return;
  }

  console.log('Backfill complete.');
}

main()
  .catch((error) => {
    console.error(
      'backfill_film_review_firebase_thumbnails_failed',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromMongoDB().catch(() => undefined);
  });
