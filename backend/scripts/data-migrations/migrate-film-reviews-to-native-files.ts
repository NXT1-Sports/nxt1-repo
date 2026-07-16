/**
 * @fileoverview Film Review Native File Migration Script
 * @module @nxt1/backend/scripts
 *
 * Folds legacy TeamFilmReviews data into matching UniversalFiles video documents
 * by writing the native payload.filmReview extension onto the base file.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/migrate-film-reviews-to-native-files.ts --staging
 *   npx tsx scripts/data-migrations/migrate-film-reviews-to-native-files.ts --staging --commit
 *   npx tsx scripts/data-migrations/migrate-film-reviews-to-native-files.ts --staging --commit --team <teamId>
 */

import type { UniversalFileDoc, UniversalNativeFileDoc } from '@nxt1/core';
import {
  attachFilmReviewExtensionToUniversalFile,
  getUniversalBinaryFilePayload,
  getUniversalFilmReviewPayload,
  UNIVERSAL_FILES_COLLECTION,
  type TeamFilmReviewDoc,
} from '@nxt1/core';
import { stagingDb } from '../../src/utils/firebase-staging.js';
import {
  UniversalFileSemanticService,
  buildFilmReviewSemanticText,
} from '../../src/services/team/universal-file-semantic.service.js';

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews' as const;

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const isStaging = args.includes('--staging');
const teamId = args.includes('--team') ? args[args.indexOf('--team') + 1] : null;

interface MigrationStats {
  totalReviews: number;
  matchedBaseFiles: number;
  alreadyUnified: number;
  orphanedReviews: number;
  written: number;
}

function toPortableTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

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

function toUniversalFileDoc(
  docId: string,
  teamIdValue: string,
  data: Record<string, unknown>
): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId: teamIdValue,
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function toFilmReviewDoc(
  docId: string,
  teamIdValue: string,
  data: Record<string, unknown>
): TeamFilmReviewDoc {
  return {
    ...(data as Omit<TeamFilmReviewDoc, 'id'>),
    id: docId,
    teamId: teamIdValue,
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['timelineGeneratedAt']
      ? { timelineGeneratedAt: toPortableTimestamp(data['timelineGeneratedAt']) }
      : {}),
  } as TeamFilmReviewDoc;
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

function findMatchingBaseFile(
  files: readonly UniversalFileDoc[],
  review: TeamFilmReviewDoc
): UniversalNativeFileDoc<'file'> | null {
  const reviewFileId = review.fileId?.trim() || null;
  const reviewCloudflareVideoId = review.cloudflareVideoId?.trim() || null;
  const reviewStoragePath = review.storagePath?.trim() || null;
  const reviewVideoUrl = review.videoUrl.trim();

  for (const file of files) {
    if (file.type !== 'file' || file.payloadKind === 'pointer') {
      continue;
    }

    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    if (!binaryPayload || binaryPayload.kind !== 'video') {
      continue;
    }

    if (reviewFileId && file.id === reviewFileId) {
      return file as UniversalNativeFileDoc<'file'>;
    }

    if (
      reviewCloudflareVideoId &&
      binaryPayload.cloudflareVideoId?.trim() === reviewCloudflareVideoId
    ) {
      return file as UniversalNativeFileDoc<'file'>;
    }

    if (reviewStoragePath && binaryPayload.storagePath?.trim() === reviewStoragePath) {
      return file as UniversalNativeFileDoc<'file'>;
    }

    if (binaryPayload.url.trim() === reviewVideoUrl) {
      return file as UniversalNativeFileDoc<'file'>;
    }
  }

  return null;
}

async function main(): Promise<void> {
  if (!isStaging) {
    throw new Error('This migration is staging-only. Re-run with --staging.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Film Review Native File Migration');
  console.log('  Environment: staging');
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  if (teamId) {
    console.log(`  Scope: team ${teamId}`);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  let reviewQuery = stagingDb.collection(TEAM_FILM_REVIEWS_COLLECTION);
  let fileQuery = stagingDb.collection(UNIVERSAL_FILES_COLLECTION);
  if (teamId) {
    reviewQuery = reviewQuery.where('teamId', '==', teamId);
    fileQuery = fileQuery.where('teamId', '==', teamId);
  }

  const [reviewSnapshot, fileSnapshot] = await Promise.all([reviewQuery.get(), fileQuery.get()]);
  const semanticService = new UniversalFileSemanticService(stagingDb as never);
  const filesByTeam = new Map<string, UniversalFileDoc[]>();

  for (const doc of fileSnapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const currentTeamId = typeof data['teamId'] === 'string' ? data['teamId'] : (teamId ?? '');
    const file = toUniversalFileDoc(doc.id, currentTeamId, data);
    const list = filesByTeam.get(currentTeamId) ?? [];
    list.push(file);
    filesByTeam.set(currentTeamId, list);
  }

  const stats: MigrationStats = {
    totalReviews: reviewSnapshot.size,
    matchedBaseFiles: 0,
    alreadyUnified: 0,
    orphanedReviews: 0,
    written: 0,
  };

  for (const doc of reviewSnapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const currentTeamId = typeof data['teamId'] === 'string' ? data['teamId'] : (teamId ?? '');
    const review = toFilmReviewDoc(doc.id, currentTeamId, data);
    const teamFiles = filesByTeam.get(review.teamId) ?? [];
    const match = findMatchingBaseFile(teamFiles, review);

    if (!match) {
      stats.orphanedReviews += 1;
      continue;
    }

    stats.matchedBaseFiles += 1;

    if (getUniversalFilmReviewPayload(match.payload)) {
      stats.alreadyUnified += 1;
      continue;
    }

    if (!commit) {
      continue;
    }

    const nextDocument = attachFilmReviewExtensionToUniversalFile(match, review);
    const persistedDocument = pruneUndefinedDeep(nextDocument) as unknown as Record<
      string,
      unknown
    >;

    await stagingDb
      .collection(UNIVERSAL_FILES_COLLECTION)
      .doc(match.id)
      .set(persistedDocument, { merge: true });
    await semanticService.syncDocument(nextDocument, {
      semanticText: buildFilmReviewSemanticText(review),
    });

    const nextTeamFiles = teamFiles.map((file) => (file.id === match.id ? nextDocument : file));
    filesByTeam.set(review.teamId, nextTeamFiles);
    stats.written += 1;
  }

  console.log('Results:');
  console.log(`  totalReviews:      ${stats.totalReviews}`);
  console.log(`  matchedBaseFiles:  ${stats.matchedBaseFiles}`);
  console.log(`  alreadyUnified:    ${stats.alreadyUnified}`);
  console.log(`  orphanedReviews:   ${stats.orphanedReviews}`);
  console.log(`  written:           ${stats.written}`);
  console.log('');

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to write native filmReview extensions.');
    return;
  }

  console.log('Migration complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal migration error:', error);
    process.exit(1);
  });
