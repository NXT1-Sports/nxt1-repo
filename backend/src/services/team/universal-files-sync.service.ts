import {
  UNIVERSAL_FILES_COLLECTION,
  toUniversalFileFromTeamFilmReviewAsPointer,
  type TeamFilmReviewDoc,
} from '@nxt1/core';

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

export async function upsertUniversalFileFromFilmReview(params: {
  readonly db: FirestoreLike;
  readonly review: TeamFilmReviewDoc;
}): Promise<void> {
  const { db, review } = params;
  const universalDoc = pruneUndefinedDeep(
    toUniversalFileFromTeamFilmReviewAsPointer(review)
  ) as unknown as Record<string, unknown>;
  await db.collection(UNIVERSAL_FILES_COLLECTION).doc(review.id).set(universalDoc, { merge: true });
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
