#!/usr/bin/env npx tsx
/**
 * Repairs staging UniversalFiles owned by a target seed user when nested payload
 * media still points at another user's Users/... storage path.
 *
 * Default mode is dry-run. Pass --commit to write changes.
 *
 * Examples:
 *   npx tsx backend/scripts/data-migrations/repair-staging-seed-universal-file-storage.ts
 *   npx tsx backend/scripts/data-migrations/repair-staging-seed-universal-file-storage.ts --commit
 *   npx tsx backend/scripts/data-migrations/repair-staging-seed-universal-file-storage.ts --doc=seedcopy_tight-clip-18-clips_1784523654623_1 --commit
 *   npx tsx backend/scripts/data-migrations/repair-staging-seed-universal-file-storage.ts --owner=seed_director_01 --limit=10
 */

import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import type { Bucket, File } from '@google-cloud/storage';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import { AgentMediaLifecycleService } from '../../src/modules/agent/tools/media/agent-media-lifecycle.service.js';
import { stagingDb, stagingStorage } from '../../src/utils/firebase-staging.js';

type JsonRecord = Record<string, unknown>;

interface StorageRefMatch {
  readonly sourcePath: string;
  readonly fieldPath: string;
  readonly rawValue: string;
}

interface RepairedAsset {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly destinationUrl: string;
  readonly mimeType: string;
  readonly strategy:
    'existing' | 'planned_upload' | 'uploaded_with_token' | 'uploaded_with_signed_url';
}

interface FailedAsset {
  readonly sourcePath: string;
  readonly reason: string;
}

interface ThumbnailRepair {
  readonly sourcePath: string;
  readonly thumbnailUrl: string | null;
  readonly strategy: 'planned_generate' | 'generated_persisted';
}

interface DocumentPlan {
  readonly docId: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly refs: readonly StorageRefMatch[];
  readonly nextPayload: unknown;
  readonly nextTopLevelThumbnailUrl: string | null;
  readonly rewrittenFields: readonly string[];
  readonly repairedAssets: readonly RepairedAsset[];
  readonly failedAssets: readonly FailedAsset[];
  readonly thumbnailRepair: ThumbnailRepair | null;
}

interface RepairStats {
  docsScanned: number;
  docsNeedingRepair: number;
  docsUpdated: number;
  refsFound: number;
  assetsCopied: number;
  assetsReused: number;
  thumbnailsGenerated: number;
  assetFailures: number;
  docFailures: number;
}

type FfmpegThumbnailBridge = {
  generateThumbnail: (...args: unknown[]) => Promise<unknown>;
};

type FfmpegGenerateThumbnailResult = {
  readonly outputUrl?: string;
  readonly output_path?: string;
};

let ffmpegBridgeFactory: (new () => FfmpegThumbnailBridge) | null = null;

const THUMBNAIL_MIME_TYPE = 'image/jpeg';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const ownerUserId = getArg('owner') ?? 'seed_director_01';
const docId = getArg('doc');
const limit = parsePositiveInt(getArg('limit'));
const verbose = args.includes('--verbose');
const signedUrlHours = parsePositiveInt(getArg('signed-url-hours')) ?? 24;
const signedUrlTtlMs = Math.min(signedUrlHours, 24 * 7) * 60 * 60 * 1000;

const bucket = stagingStorage.bucket() as Bucket;
const repairedAssetCache = new Map<string, Promise<RepairedAsset>>();

const stats: RepairStats = {
  docsScanned: 0,
  docsNeedingRepair: 0,
  docsUpdated: 0,
  refsFound: 0,
  assetsCopied: 0,
  assetsReused: 0,
  thumbnailsGenerated: 0,
  assetFailures: 0,
  docFailures: 0,
};

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = args.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTitle(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function collectForeignStorageRefs(
  value: unknown,
  fieldPath: string,
  expectedOwnerUserId: string,
  refs: StorageRefMatch[]
): void {
  if (typeof value === 'string') {
    const sourcePath = AgentMediaLifecycleService.extractStoragePathFromUrl(value);
    if (!sourcePath?.startsWith('Users/')) {
      return;
    }

    if (sourcePath.startsWith(`Users/${expectedOwnerUserId}/`)) {
      return;
    }

    refs.push({ sourcePath, fieldPath, rawValue: value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectForeignStorageRefs(entry, `${fieldPath}[${index}]`, expectedOwnerUserId, refs);
    });
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectForeignStorageRefs(
      nestedValue,
      fieldPath ? `${fieldPath}.${key}` : key,
      expectedOwnerUserId,
      refs
    );
  }
}

function inferMimeTypeFromPath(storagePath: string): string {
  const extension = storagePath.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'webm':
      return 'video/webm';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    default:
      return 'application/octet-stream';
  }
}

function buildOwnedDestinationPath(
  sourcePath: string,
  targetUserId: string,
  mimeType: string
): string {
  const originalName = sourcePath.split('/').pop() ?? 'file';
  const safeName = AgentMediaLifecycleService.sanitizeFileName(originalName);
  const subfolder = AgentMediaLifecycleService.resolveSubfolder(mimeType);
  const hash = createHash('sha256').update(sourcePath).digest('hex').slice(0, 12);
  return `Users/${targetUserId}/uploads/${subfolder}/unbound/rehomed_${hash}_${safeName}`;
}

function normalizeStringValue(value: string): string {
  return value.trim().replace(/^\/+/, '');
}

function buildPreviewStorageUrl(storagePath: string): string {
  return `https://storage.googleapis.com/${bucket.name}/${storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function uniqueSourcePaths(refs: readonly StorageRefMatch[]): string[] {
  return [...new Set(refs.map((ref) => ref.sourcePath))];
}

function trimToNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveVideoThumbnailTarget(data: JsonRecord): { sourcePath: string } | null {
  const payload = data['payload'];
  if (!isPlainObject(payload)) {
    return null;
  }

  const asset = isPlainObject(payload['asset']) ? (payload['asset'] as JsonRecord) : payload;
  if (asset['kind'] !== 'video') {
    return null;
  }

  const storagePath =
    trimToNull(asset['storagePath']) ??
    AgentMediaLifecycleService.extractStoragePathFromUrl(trimToNull(asset['url']));

  return storagePath ? { sourcePath: storagePath } : null;
}

function hasPersistedThumbnail(data: JsonRecord): boolean {
  if (trimToNull(data['thumbnailUrl'])) {
    return true;
  }

  const payload = data['payload'];
  if (!isPlainObject(payload)) {
    return false;
  }

  const asset = isPlainObject(payload['asset']) ? (payload['asset'] as JsonRecord) : payload;
  if (trimToNull(asset['thumbnailUrl'])) {
    return true;
  }

  const filmReview = isPlainObject(payload['filmReview'])
    ? (payload['filmReview'] as JsonRecord)
    : data['type'] === 'film_review'
      ? payload
      : null;

  return !!filmReview && !!trimToNull(filmReview['thumbnailUrl']);
}

function applyThumbnailUrlToPayload(
  payload: unknown,
  thumbnailUrl: string
): { value: unknown; rewrittenFields: string[] } {
  if (!isPlainObject(payload)) {
    return { value: payload, rewrittenFields: [] };
  }

  const nextPayload: JsonRecord = { ...payload };
  const rewrittenFields: string[] = [];

  if (isPlainObject(payload['asset'])) {
    const asset = payload['asset'] as JsonRecord;
    if (trimToNull(asset['thumbnailUrl']) !== thumbnailUrl) {
      nextPayload['asset'] = {
        ...asset,
        thumbnailUrl,
      };
      rewrittenFields.push('payload.asset.thumbnailUrl');
    }
  } else if (trimToNull(payload['url']) && trimToNull(payload['kind'])) {
    if (trimToNull(payload['thumbnailUrl']) !== thumbnailUrl) {
      nextPayload['thumbnailUrl'] = thumbnailUrl;
      rewrittenFields.push('payload.thumbnailUrl');
    }
  }

  if (isPlainObject(payload['filmReview'])) {
    const filmReview = payload['filmReview'] as JsonRecord;
    let filmReviewChanged = trimToNull(filmReview['thumbnailUrl']) !== thumbnailUrl;
    const nextFilmReview: JsonRecord = {
      ...filmReview,
      thumbnailUrl,
    };

    if (Array.isArray(filmReview['sources']) && filmReview['sources'].length > 0) {
      nextFilmReview['sources'] = filmReview['sources'].map((source, index) => {
        if (index !== 0 || !isPlainObject(source)) {
          return source;
        }

        const sourceThumb = trimToNull((source as JsonRecord)['thumbnailUrl']);
        if (sourceThumb !== thumbnailUrl) {
          filmReviewChanged = true;
        }

        return {
          ...(source as JsonRecord),
          thumbnailUrl,
        };
      });
      rewrittenFields.push('payload.filmReview.sources[0].thumbnailUrl');
    }

    if (filmReviewChanged) {
      nextPayload['filmReview'] = nextFilmReview;
      rewrittenFields.push('payload.filmReview.thumbnailUrl');
    }
  }

  return rewrittenFields.length > 0
    ? { value: nextPayload, rewrittenFields: [...new Set(rewrittenFields)] }
    : { value: payload, rewrittenFields: [] };
}

function buildGeneratedThumbnailFileName(docId: string, title: string, sourcePath: string): string {
  const sourceName =
    sourcePath
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? docId;
  const safeStem = AgentMediaLifecycleService.sanitizeFileName(
    title.trim().length > 0 ? title : sourceName
  ).replace(/\.[^.]+$/, '');
  return `${safeStem || sourceName || docId}-thumbnail.jpg`;
}

async function initializeThumbnailRuntime(): Promise<void> {
  if (ffmpegBridgeFactory) {
    return;
  }

  ensureDefaultFirebaseAppForStaging();

  const [ffmpegBridgeModule] = await Promise.all([
    import('../../src/modules/agent/tools/integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js'),
  ]);

  ffmpegBridgeFactory =
    ffmpegBridgeModule.FfmpegMcpBridgeService as new () => FfmpegThumbnailBridge;
}

function ensureDefaultFirebaseAppForStaging(): void {
  if (getApps().some((app) => app.name === '[DEFAULT]')) {
    getApp();
    return;
  }

  const projectId = process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = process.env['STAGING_FIREBASE_STORAGE_BUCKET'];

  initializeApp({
    credential:
      projectId && clientEmail && privateKey
        ? cert({ projectId, clientEmail, privateKey })
        : applicationDefault(),
    storageBucket,
  });
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

async function persistGeneratedThumbnail(params: {
  readonly docId: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly sourcePath: string;
  readonly buffer: Buffer;
}): Promise<string> {
  const storagePath = AgentMediaLifecycleService.buildStoragePath({
    userId: params.ownerUserId,
    mimeType: THUMBNAIL_MIME_TYPE,
    fileName: buildGeneratedThumbnailFileName(params.docId, params.title, params.sourcePath),
    zone: 'media',
  });
  const destinationFile = bucket.file(storagePath);
  const saved = await AgentMediaLifecycleService.saveBufferAndSignRead({
    bucket,
    storagePath,
    buffer: params.buffer,
    mimeType: THUMBNAIL_MIME_TYPE,
    cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
    signedUrlTtlMs,
  });

  try {
    return await buildStableReadUrl(destinationFile, storagePath);
  } catch {
    return saved.url;
  }
}

async function generateDurableThumbnail(params: {
  readonly docId: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly sourcePath: string;
}): Promise<string> {
  await initializeThumbnailRuntime();

  if (!ffmpegBridgeFactory) {
    throw new Error('FFmpeg runtime is not initialized');
  }

  const sourceFile = bucket.file(params.sourcePath);
  const [exists] = await sourceFile.exists();
  if (!exists) {
    throw new Error('Video storage object not found for thumbnail generation');
  }

  const bridge = new ffmpegBridgeFactory();
  const videoUrl = await buildReadonlySignedUrl(sourceFile);
  const thumbnailResult = (await bridge.generateThumbnail(
    {
      inputPath: videoUrl,
      outputPath: `seed-universal-file-${params.docId}-thumbnail.jpg`,
      time: '0',
    },
    {
      userId: params.ownerUserId,
      environment: 'staging',
      threadId: 'repair-staging-seed-universal-file-storage',
      operationId: `repair-staging-seed-universal-file-storage:${params.docId}`,
    }
  )) as FfmpegGenerateThumbnailResult;
  const generatedThumbnailUrl = thumbnailResult.outputUrl ?? thumbnailResult.output_path ?? null;

  if (!generatedThumbnailUrl) {
    throw new Error('Thumbnail generation completed without a thumbnail URL');
  }

  const thumbnailBuffer = await downloadThumbnailBuffer(generatedThumbnailUrl);
  const durableThumbnailUrl = await persistGeneratedThumbnail({
    docId: params.docId,
    ownerUserId: params.ownerUserId,
    title: params.title,
    sourcePath: params.sourcePath,
    buffer: thumbnailBuffer,
  });

  stats.thumbnailsGenerated += 1;
  return durableThumbnailUrl;
}

async function buildStableReadUrl(storageFile: File, storagePath: string): Promise<string> {
  try {
    const token = randomUUID();
    await storageFile.setMetadata({
      cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    });
    return AgentMediaLifecycleService.buildFirebaseDownloadUrl(bucket.name, storagePath, token);
  } catch {
    const expiresAt = Date.now() + signedUrlTtlMs;
    const [signedUrl] = await storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });
    return signedUrl;
  }
}

async function buildReadonlySignedUrl(storageFile: File): Promise<string> {
  const expiresAt = Date.now() + signedUrlTtlMs;
  const [signedUrl] = await storageFile.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt,
  });
  return signedUrl;
}

async function repairAsset(sourcePath: string, targetUserId: string): Promise<RepairedAsset> {
  const existing = repairedAssetCache.get(sourcePath);
  if (existing) {
    return existing;
  }

  const repairPromise = (async (): Promise<RepairedAsset> => {
    const sourceFile = bucket.file(sourcePath);
    const [exists] = await sourceFile.exists();
    if (!exists) {
      throw new Error('Source storage object not found in staging bucket');
    }

    const [metadata] = await sourceFile.getMetadata();
    const mimeType =
      typeof metadata.contentType === 'string' && metadata.contentType.trim().length > 0
        ? metadata.contentType
        : inferMimeTypeFromPath(sourcePath);
    const destinationPath = buildOwnedDestinationPath(sourcePath, targetUserId, mimeType);
    const destinationFile = bucket.file(destinationPath);
    const [destinationExists] = await destinationFile.exists();

    if (destinationExists) {
      const destinationUrl = commit
        ? await buildStableReadUrl(destinationFile, destinationPath)
        : await buildReadonlySignedUrl(destinationFile);
      stats.assetsReused += 1;
      return {
        sourcePath,
        destinationPath,
        destinationUrl,
        mimeType,
        strategy: 'existing',
      };
    }

    if (!commit) {
      return {
        sourcePath,
        destinationPath,
        destinationUrl: buildPreviewStorageUrl(destinationPath),
        mimeType,
        strategy: 'planned_upload',
      };
    }

    const [sourceBuffer] = await sourceFile.download();
    const saved = await AgentMediaLifecycleService.saveBufferAndSignRead({
      bucket,
      storagePath: destinationPath,
      buffer: sourceBuffer,
      mimeType,
      cacheControl: AgentMediaLifecycleService.POST_MEDIA_CACHE_CONTROL,
      signedUrlTtlMs,
    });

    stats.assetsCopied += 1;

    try {
      const destinationUrl = await buildStableReadUrl(destinationFile, destinationPath);
      return {
        sourcePath,
        destinationPath,
        destinationUrl,
        mimeType,
        strategy: 'uploaded_with_token',
      };
    } catch {
      return {
        sourcePath,
        destinationPath,
        destinationUrl: saved.url,
        mimeType,
        strategy: 'uploaded_with_signed_url',
      };
    }
  })();

  repairedAssetCache.set(sourcePath, repairPromise);
  return repairPromise;
}

function rewritePayloadReferences(
  value: unknown,
  replacements: ReadonlyMap<string, RepairedAsset>,
  fieldPath = 'payload'
): { value: unknown; changed: boolean; rewrittenFields: string[] } {
  if (typeof value === 'string') {
    const sourcePath = AgentMediaLifecycleService.extractStoragePathFromUrl(value);
    if (!sourcePath) {
      return { value, changed: false, rewrittenFields: [] };
    }

    const replacement = replacements.get(sourcePath);
    if (!replacement) {
      return { value, changed: false, rewrittenFields: [] };
    }

    const normalizedValue = normalizeStringValue(value);
    const nextValue = normalizedValue.startsWith('Users/')
      ? replacement.destinationPath
      : replacement.destinationUrl;

    if (nextValue === value) {
      return { value, changed: false, rewrittenFields: [] };
    }

    return { value: nextValue, changed: true, rewrittenFields: [fieldPath] };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const rewrittenFields: string[] = [];
    const nextValue = value.map((entry, index) => {
      const result = rewritePayloadReferences(entry, replacements, `${fieldPath}[${index}]`);
      changed ||= result.changed;
      rewrittenFields.push(...result.rewrittenFields);
      return result.value;
    });

    return { value: changed ? nextValue : value, changed, rewrittenFields };
  }

  if (!isPlainObject(value)) {
    return { value, changed: false, rewrittenFields: [] };
  }

  let changed = false;
  const rewrittenFields: string[] = [];
  const nextValue: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    const result = rewritePayloadReferences(entry, replacements, `${fieldPath}.${key}`);
    changed ||= result.changed;
    rewrittenFields.push(...result.rewrittenFields);
    nextValue[key] = result.value;
  }

  return { value: changed ? nextValue : value, changed, rewrittenFields };
}

async function planDocumentRepair(
  docSnapshot: FirebaseFirestore.QueryDocumentSnapshot
): Promise<DocumentPlan | null> {
  const data = docSnapshot.data() as JsonRecord;
  const resolvedOwnerUserId =
    typeof data['ownerUserId'] === 'string' && data['ownerUserId'].trim().length > 0
      ? data['ownerUserId'].trim()
      : ownerUserId;
  const refs: StorageRefMatch[] = [];
  const videoThumbnailTarget = resolveVideoThumbnailTarget(data);
  const needsThumbnailRepair = !!videoThumbnailTarget && !hasPersistedThumbnail(data);

  collectForeignStorageRefs(data['payload'], 'payload', resolvedOwnerUserId, refs);
  if (refs.length === 0 && !needsThumbnailRepair) {
    return null;
  }

  stats.refsFound += refs.length;
  const uniquePaths = uniqueSourcePaths(refs);
  const repairedAssets: RepairedAsset[] = [];
  const failedAssets: FailedAsset[] = [];

  for (const sourcePath of uniquePaths) {
    try {
      repairedAssets.push(await repairAsset(sourcePath, resolvedOwnerUserId));
    } catch (error) {
      stats.assetFailures += 1;
      failedAssets.push({
        sourcePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const replacements = new Map(repairedAssets.map((asset) => [asset.sourcePath, asset]));
  const rewritten = rewritePayloadReferences(data['payload'], replacements);
  let nextPayload = rewritten.value;
  let nextTopLevelThumbnailUrl: string | null = null;
  let thumbnailRepair: ThumbnailRepair | null = null;
  const rewrittenFields = [...new Set(rewritten.rewrittenFields)];

  if (needsThumbnailRepair && videoThumbnailTarget) {
    const thumbnailUrl = commit
      ? await generateDurableThumbnail({
          docId: docSnapshot.id,
          ownerUserId: resolvedOwnerUserId,
          title: sanitizeTitle(data['title'], docSnapshot.id),
          sourcePath: videoThumbnailTarget.sourcePath,
        })
      : null;
    const thumbnailRewrite = thumbnailUrl
      ? applyThumbnailUrlToPayload(nextPayload, thumbnailUrl)
      : { value: nextPayload, rewrittenFields: ['payload.thumbnailUrl', 'thumbnailUrl'] };

    nextPayload = thumbnailRewrite.value;
    rewrittenFields.push(...thumbnailRewrite.rewrittenFields);
    nextTopLevelThumbnailUrl = thumbnailUrl;
    thumbnailRepair = {
      sourcePath: videoThumbnailTarget.sourcePath,
      thumbnailUrl,
      strategy: commit ? 'generated_persisted' : 'planned_generate',
    };

    if (thumbnailUrl) {
      rewrittenFields.push('thumbnailUrl');
    }
  }

  return {
    docId: docSnapshot.id,
    ownerUserId: resolvedOwnerUserId,
    title: sanitizeTitle(
      data['title'] ?? (data['payload'] as JsonRecord | undefined)?.['title'],
      docSnapshot.id
    ),
    refs,
    nextPayload,
    nextTopLevelThumbnailUrl,
    rewrittenFields: [...new Set(rewrittenFields)],
    repairedAssets,
    failedAssets,
    thumbnailRepair,
  };
}

function printPlan(plan: DocumentPlan): void {
  console.log(`- ${plan.docId}`);
  console.log(`  title: ${plan.title}`);
  console.log(`  owner: ${plan.ownerUserId}`);
  console.log(`  refs: ${plan.refs.length}`);
  console.log(`  assets repaired: ${plan.repairedAssets.length}`);
  console.log(`  assets failed: ${plan.failedAssets.length}`);
  if (plan.thumbnailRepair) {
    console.log(`  thumbnail: ${plan.thumbnailRepair.strategy}`);
    console.log(`    source: ${plan.thumbnailRepair.sourcePath}`);
    if (plan.thumbnailRepair.thumbnailUrl) {
      console.log(`    url: ${plan.thumbnailRepair.thumbnailUrl}`);
    }
  }

  if (verbose) {
    for (const asset of plan.repairedAssets) {
      console.log(`    repaired ${asset.sourcePath}`);
      console.log(`      -> ${asset.destinationPath} (${asset.strategy})`);
    }
    for (const failed of plan.failedAssets) {
      console.log(`    failed ${failed.sourcePath}`);
      console.log(`      reason: ${failed.reason}`);
    }
    for (const fieldPath of plan.rewrittenFields) {
      console.log(`    rewrite ${fieldPath}`);
    }
  }
}

async function fetchTargetDocuments(): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (docId) {
    const docSnapshot = await stagingDb.collection(UNIVERSAL_FILES_COLLECTION).doc(docId).get();
    if (!docSnapshot.exists) {
      throw new Error(`UniversalFiles/${docId} was not found in staging`);
    }
    return [docSnapshot as FirebaseFirestore.QueryDocumentSnapshot];
  }

  let query: FirebaseFirestore.Query = stagingDb
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('ownerUserId', '==', ownerUserId);

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();
  return snapshot.docs;
}

async function commitPlan(plan: DocumentPlan): Promise<void> {
  if (
    plan.repairedAssets.length === 0 &&
    !plan.thumbnailRepair &&
    plan.rewrittenFields.length === 0 &&
    !plan.nextTopLevelThumbnailUrl
  ) {
    return;
  }

  await stagingDb
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(plan.docId)
    .set(
      {
        payload: plan.nextPayload,
        ...(plan.nextTopLevelThumbnailUrl ? { thumbnailUrl: plan.nextTopLevelThumbnailUrl } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  stats.docsUpdated += 1;
}

async function main(): Promise<void> {
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Repair Staging Seed Universal File Storage');
  console.log(`  Environment: staging (${bucket.name})`);
  console.log(`  Owner: ${ownerUserId}`);
  console.log(`  Mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  if (docId) {
    console.log(`  Scope: UniversalFiles/${docId}`);
  } else if (limit) {
    console.log(`  Limit: ${limit}`);
  }
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  const docs = await fetchTargetDocuments();
  const plans: DocumentPlan[] = [];
  stats.docsScanned = docs.length;

  for (const docSnapshot of docs) {
    try {
      const plan = await planDocumentRepair(docSnapshot);
      if (!plan) {
        continue;
      }

      stats.docsNeedingRepair += 1;
      plans.push(plan);
      printPlan(plan);

      if (commit) {
        await commitPlan(plan);
      }
    } catch (error) {
      stats.docFailures += 1;
      console.error(`- ${docSnapshot.id}`);
      console.error(`  failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('');
  console.log('Summary');
  console.log(`  docsScanned:        ${stats.docsScanned}`);
  console.log(`  docsNeedingRepair:  ${stats.docsNeedingRepair}`);
  console.log(`  docsUpdated:        ${stats.docsUpdated}`);
  console.log(`  refsFound:          ${stats.refsFound}`);
  console.log(`  assetsCopied:       ${stats.assetsCopied}`);
  console.log(`  assetsReused:       ${stats.assetsReused}`);
  console.log(`  thumbnailsGenerated:${stats.thumbnailsGenerated}`);
  console.log(`  assetFailures:      ${stats.assetFailures}`);
  console.log(`  docFailures:        ${stats.docFailures}`);
  console.log('');

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to persist the rewritten payloads.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal repair error:', error);
    process.exit(1);
  });
