import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  toUniversalFileFromTeamFilmReview,
  type TeamFilmReviewDoc,
} from '@nxt1/core';
import {
  buildFilmReviewSemanticText,
  deleteUniversalFileSemanticIndex,
  scheduleUniversalFileSemanticSync,
} from './universal-file-semantic.service.js';

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews' as const;

type FirestoreLike = {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{
        exists: boolean;
        data(): Record<string, unknown> | undefined;
      }>;
      set(payload: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
      delete(): Promise<unknown>;
    };
  };
};

function attachFilmReviewToBaseFileRecord(
  fileData: Record<string, unknown> | undefined,
  review: TeamFilmReviewDoc
): Record<string, unknown> | null {
  if (!fileData) {
    return null;
  }

  if (String(fileData['teamId'] ?? '') !== review.teamId) {
    return null;
  }

  if (String(fileData['type'] ?? '') !== 'file') {
    return null;
  }

  if (String(fileData['payloadKind'] ?? 'native') === 'pointer') {
    return null;
  }

  const projectedDocument = toUniversalFileFromTeamFilmReview(review);
  const payload =
    fileData['payload'] && typeof fileData['payload'] === 'object'
      ? (fileData['payload'] as Record<string, unknown>)
      : {};
  const sourceRef =
    fileData['sourceRef'] && typeof fileData['sourceRef'] === 'object'
      ? (fileData['sourceRef'] as Record<string, unknown>)
      : {};
  const classification =
    fileData['classification'] && typeof fileData['classification'] === 'object'
      ? (fileData['classification'] as Record<string, unknown>)
      : {};
  const labels = new Set<string>(
    Array.isArray(classification['labels'])
      ? classification['labels'].filter((value): value is string => typeof value === 'string')
      : []
  );
  labels.add('film_review');
  labels.add('video_analysis');
  labels.add('team_document');
  const facets =
    classification['facets'] && typeof classification['facets'] === 'object'
      ? (classification['facets'] as Record<string, unknown>)
      : {};

  return pruneUndefinedDeep({
    ...fileData,
    status: review.status,
    sport: review.sport ?? fileData['sport'],
    summary: review.aiSummary ?? fileData['summary'],
    tags: review.tags?.length ? review.tags : fileData['tags'],
    thumbnailUrl: review.thumbnailUrl ?? fileData['thumbnailUrl'],
    updatedByUserId: review.updatedBy ?? fileData['updatedByUserId'],
    updatedAt: review.updatedAt,
    lastSeenAt: review.updatedAt,
    semanticSync: { status: 'pending' },
    sourceRef: Object.keys(sourceRef).length > 0 ? sourceRef : null,
    classification: {
      ...classification,
      primary:
        typeof classification['primary'] === 'string' && classification['primary'].trim().length > 0
          ? classification['primary']
          : 'film_review',
      route:
        typeof classification['route'] === 'string' && classification['route'].trim().length > 0
          ? classification['route']
          : 'film_review',
      labels: [...labels],
      facets: {
        ...facets,
        sourceCollection: 'TeamFilmReviews',
        uploadMode: review.uploadMode,
        perspective: review.perspective,
        opponentName: review.opponentName,
      },
    },
    payload: {
      ...payload,
      filmReview: projectedDocument.payload,
    },
  });
}

export async function upsertUniversalFileFromFilmReview(params: {
  readonly db: FirestoreLike;
  readonly review: TeamFilmReviewDoc;
}): Promise<void> {
  const { db, review } = params;
  const baseFileId = review.fileId?.trim() || null;
  if (baseFileId) {
    const baseFileRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(baseFileId);
    const baseFileSnapshot = await baseFileRef.get();
    const mergedBaseFile = attachFilmReviewToBaseFileRecord(baseFileSnapshot.data(), review);
    if (mergedBaseFile) {
      await baseFileRef.set(mergedBaseFile, { merge: true });
      if (review.id !== baseFileId) {
        await deleteUniversalFileById({ db, fileId: review.id });
      }
      scheduleUniversalFileSemanticSync({
        db: db as unknown as Firestore,
        fileId: baseFileId,
        semanticText: buildFilmReviewSemanticText(review),
      });
      return;
    }
  }

  const projectedDocument = toUniversalFileFromTeamFilmReview(review);
  const universalDoc = pruneUndefinedDeep(projectedDocument) as unknown as Record<string, unknown>;
  await db.collection(UNIVERSAL_FILES_COLLECTION).doc(review.id).set(universalDoc, { merge: true });
  scheduleUniversalFileSemanticSync({
    db: db as unknown as Firestore,
    document: projectedDocument,
    semanticText: buildFilmReviewSemanticText(review),
  });
}

export async function syncUniversalFilmReviewById(params: {
  readonly db: FirestoreLike;
  readonly reviewId: string;
}): Promise<TeamFilmReviewDoc | null> {
  const { db, reviewId } = params;
  const snapshot = await db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(reviewId).get();
  if (!snapshot.exists) {
    await deleteUniversalFileById({ db, fileId: reviewId });
    return null;
  }

  const review = snapshot.data() as unknown as TeamFilmReviewDoc;
  await upsertUniversalFileFromFilmReview({ db, review });
  return review;
}

export async function deleteUniversalFileById(params: {
  readonly db: FirestoreLike;
  readonly fileId: string;
}): Promise<void> {
  const { db, fileId } = params;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(fileId)
    .delete()
    .catch(() => undefined);
  void deleteUniversalFileSemanticIndex(db as unknown as Firestore, fileId).catch(() => undefined);
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
