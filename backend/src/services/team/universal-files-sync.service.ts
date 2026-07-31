import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  getTeamFilmReviewRevision,
  TeamFilmReviewSourceBreakdownPatchError,
  toUniversalFileFromTeamFilmReview,
  type TeamFilmReviewDoc,
} from '@nxt1/core';
import {
  buildFilmReviewSemanticText,
  deleteUniversalFileSemanticIndex,
  scheduleUniversalFileSemanticSync,
} from './universal-file-semantic.service.js';
import {
  toTeamFilmReviewDocFromUniversalFile,
  toUniversalFileDoc,
} from './universal-film-reviews.service.js';

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

export function removeFilmReviewProjectionFromUniversalFileData(params: {
  readonly fileData: Record<string, unknown>;
  readonly userId: string;
  readonly now: string;
}): Record<string, unknown> | null {
  if (String(params.fileData['type'] ?? 'file') === 'film_review') {
    return null;
  }

  const payload =
    params.fileData['payload'] && typeof params.fileData['payload'] === 'object'
      ? { ...(params.fileData['payload'] as Record<string, unknown>) }
      : {};
  delete payload['filmReview'];

  const sourceRef =
    params.fileData['sourceRef'] && typeof params.fileData['sourceRef'] === 'object'
      ? { ...(params.fileData['sourceRef'] as Record<string, unknown>) }
      : {};
  delete sourceRef['legacyCollection'];
  delete sourceRef['legacyId'];

  const classification =
    params.fileData['classification'] && typeof params.fileData['classification'] === 'object'
      ? { ...(params.fileData['classification'] as Record<string, unknown>) }
      : {};
  const labels = Array.isArray(classification['labels'])
    ? (classification['labels'] as unknown[])
        .map((label) => String(label))
        .filter((label) => !['film_review', 'video_analysis'].includes(label))
    : undefined;
  const facets =
    classification['facets'] && typeof classification['facets'] === 'object'
      ? { ...(classification['facets'] as Record<string, unknown>) }
      : {};
  delete facets['sourceCollection'];
  delete facets['uploadMode'];
  delete facets['perspective'];
  delete facets['opponentName'];

  return {
    ...params.fileData,
    payload,
    sourceRef: Object.keys(sourceRef).length > 0 ? sourceRef : null,
    classification: {
      ...classification,
      ...(classification['primary'] === 'film_review' ? { primary: 'media' } : {}),
      ...(classification['route'] === 'film_review' ? { route: 'files' } : {}),
      ...(labels ? { labels } : {}),
      facets,
    },
    semanticSync: { status: 'pending' },
    updatedByUserId: params.userId,
    updatedAt: params.now,
    lastSeenAt: params.now,
  };
}

export async function mutateUniversalFileDocumentAtomically(params: {
  readonly db: Firestore;
  readonly fileId: string;
  readonly mutate: (
    fileData: Record<string, unknown>
  ) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
}): Promise<Record<string, unknown> | null> {
  const fileRef = params.db.collection(UNIVERSAL_FILES_COLLECTION).doc(params.fileId);
  return params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(fileRef);
    if (!snapshot.exists) {
      throw new Error(`Universal file ${params.fileId} not found.`);
    }
    const nextData = await params.mutate(snapshot.data() ?? {});
    if (nextData === null) {
      transaction.delete(fileRef);
      return null;
    }
    transaction.set(fileRef, pruneUndefinedDeep(nextData) as Record<string, unknown>);
    return nextData;
  });
}

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
  readonly expectedRevision?: number;
  readonly authorize?: (review: TeamFilmReviewDoc) => Promise<boolean>;
}): Promise<void> {
  const { db, review } = params;
  if (params.expectedRevision !== undefined) {
    await updateUniversalFileFilmReviewAtomically({
      db: db as Firestore,
      reviewId: review.fileId?.trim() || review.id,
      update: async (currentReview) => {
        if (params.authorize && !(await params.authorize(currentReview))) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'ACCESS_DENIED',
            'Not authorized to update this film review.'
          );
        }
        const currentRevision = getTeamFilmReviewRevision(currentReview);
        if (currentRevision !== params.expectedRevision) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'REVISION_CONFLICT',
            `Film review revision conflict: expected ${params.expectedRevision}, found ${currentRevision}.`,
            currentRevision
          );
        }
        return {
          ...review,
          reviewRevision: currentRevision + 1,
        };
      },
    });
    return;
  }

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

export async function updateUniversalFileFilmReviewAtomically(params: {
  readonly db: Firestore;
  readonly reviewId: string;
  readonly update: (
    review: TeamFilmReviewDoc,
    fileData: Record<string, unknown>
  ) => TeamFilmReviewDoc | Promise<TeamFilmReviewDoc>;
}): Promise<TeamFilmReviewDoc> {
  const fileRef = params.db.collection(UNIVERSAL_FILES_COLLECTION).doc(params.reviewId);
  const updated = await params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(fileRef);
    if (!snapshot.exists) {
      throw new Error(`Film review ${params.reviewId} not found.`);
    }

    const fileData = snapshot.data() ?? {};
    const review = toTeamFilmReviewDocFromUniversalFile(toUniversalFileDoc(snapshot.id, fileData));
    if (!review) {
      throw new Error(`Universal file ${params.reviewId} is not a film review.`);
    }

    const nextReview = await params.update(review, fileData);
    const mergedBaseFile = attachFilmReviewToBaseFileRecord(fileData, nextReview);
    const document = mergedBaseFile ?? toUniversalFileFromTeamFilmReview(nextReview);
    transaction.set(fileRef, pruneUndefinedDeep(document) as unknown as Record<string, unknown>, {
      merge: true,
    });
    return nextReview;
  });

  scheduleUniversalFileSemanticSync({
    db: params.db,
    fileId: updated.fileId?.trim() || updated.id,
    semanticText: buildFilmReviewSemanticText(updated),
  });
  return updated;
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
