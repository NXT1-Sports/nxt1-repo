import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  getUniversalBinaryFilePayload,
  getUniversalFilmReviewPayload,
  getTeamFilmReviewSportTagDefinitions,
  resolveTeamFilmReviewSportTagSchemaKey,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
  type UniversalFileDoc,
} from '@nxt1/core';
import { toUserAccessKey } from './file-access-keys.service.js';

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

export function toUniversalFileDoc(docId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function compareByUpdatedAtDesc(left: TeamFilmReviewDoc, right: TeamFilmReviewDoc): number {
  return (
    Date.parse(toPortableTimestamp(right.updatedAt)) -
    Date.parse(toPortableTimestamp(left.updatedAt))
  );
}

export function toTeamFilmReviewDocFromUniversalFile(
  file: UniversalFileDoc
): TeamFilmReviewDoc | null {
  if ((file.type !== 'file' && file.type !== 'film_review') || file.payloadKind === 'pointer') {
    return null;
  }

  const payload = getUniversalFilmReviewPayload(file.payload);
  if (!payload) {
    return null;
  }

  const asset = file.type === 'file' ? getUniversalBinaryFilePayload(file.payload) : null;
  const primarySource = payload.sources?.[0];
  const videoUrl =
    asset?.url?.trim() || payload.videoUrl?.trim() || primarySource?.videoUrl?.trim() || '';
  if (!videoUrl) {
    return null;
  }

  return {
    id: file.id,
    teamId: file.teamId,
    organizationId: file.organizationId ?? undefined,
    fileId: file.id,
    sport: file.sport ?? 'unknown',
    title: file.title,
    status: file.status as TeamFilmReviewDoc['status'],
    uploadMode: payload.uploadMode,
    perspective: payload.perspective,
    gameDate: payload.gameDate,
    opponentName: payload.opponentName,
    playlistId: payload.playlistId,
    playlistName: payload.playlistName,
    videoUrl,
    sources: payload.sources,
    storagePath: payload.storagePath ?? asset?.storagePath,
    cloudflareVideoId: payload.cloudflareVideoId ?? asset?.cloudflareVideoId,
    cloudflareStatus: payload.cloudflareStatus ?? asset?.cloudflareStatus,
    readyToStream: payload.readyToStream ?? asset?.readyToStream,
    thumbnailUrl: payload.thumbnailUrl ?? file.thumbnailUrl ?? asset?.thumbnailUrl,
    durationSec: payload.durationSec,
    aiSummary: payload.aiSummary,
    aiTags: payload.aiTags,
    clips: payload.clips,
    annotations: payload.annotations,
    keyInsights: payload.keyInsights,
    tags: file.tags,
    source: payload.source ?? 'team_files',
    sourceUrl: payload.sourceUrl,
    schemaVersion: payload.schemaVersion ?? 2,
    reviewRevision: payload.reviewRevision ?? 0,
    readAccessKeys: file.readAccessKeys,
    writeAccessKeys: file.writeAccessKeys,
    createdBy: file.createdByUserId ?? file.ownerUserId ?? file.updatedByUserId ?? '',
    updatedBy: file.updatedByUserId ?? file.createdByUserId ?? file.ownerUserId ?? '',
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    timelineState: payload.timelineState,
    timeline: payload.timeline,
    breakdownSource: payload.breakdownSource,
    timelineGeneratedAt: payload.timelineGeneratedAt,
    timelineError: payload.timelineError,
    timelineProgress: payload.timelineProgress,
    downloadPrewarm: payload.downloadPrewarm,
    downloadExport: payload.downloadExport,
  };
}

export async function loadUniversalFilmReview(
  db: Firestore,
  reviewId: string
): Promise<TeamFilmReviewDoc | null> {
  const snapshot = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(reviewId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toTeamFilmReviewDocFromUniversalFile(
    toUniversalFileDoc(snapshot.id, snapshot.data() ?? {})
  );
}

export async function listUniversalFilmReviews(params: {
  readonly db: Firestore;
  readonly teamId: string;
  readonly limit: number;
}): Promise<readonly TeamFilmReviewDoc[]> {
  const { db, teamId, limit } = params;
  const legacyQuery = db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('type', '==', 'film_review')
    .where('teamId', '==', teamId);
  const classifiedFileQuery = db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('type', '==', 'file')
    .where('teamId', '==', teamId)
    .where('classification.primary', '==', 'film_review');

  const [legacySnapshot, classifiedFileSnapshot] = await Promise.all([
    legacyQuery.orderBy('updatedAt', 'desc').limit(limit).get(),
    classifiedFileQuery.orderBy('updatedAt', 'desc').limit(limit).get(),
  ]);

  const byId = new Map<string, TeamFilmReviewDoc>();
  for (const doc of [...legacySnapshot.docs, ...classifiedFileSnapshot.docs]) {
    const review = toTeamFilmReviewDocFromUniversalFile(
      toUniversalFileDoc(doc.id, doc.data() ?? {})
    );
    if (review) {
      byId.set(review.id, review);
    }
  }

  return [...byId.values()].sort(compareByUpdatedAtDesc).slice(0, limit);
}

export async function listUserScopedUniversalFilmReviews(params: {
  readonly db: Firestore;
  readonly userId: string;
  readonly limit: number;
}): Promise<readonly TeamFilmReviewDoc[]> {
  const { db, userId, limit } = params;
  const collection = db.collection(UNIVERSAL_FILES_COLLECTION);
  const userAccessKey = toUserAccessKey(userId);

  const [sharedSnapshot, ownerSnapshot, creatorSnapshot] = await Promise.all([
    collection
      .where('readAccessKeys', 'array-contains', userAccessKey)
      .limit(limit * 3)
      .get(),
    collection
      .where('ownerUserId', '==', userId)
      .limit(limit * 3)
      .get(),
    collection
      .where('createdByUserId', '==', userId)
      .limit(limit * 3)
      .get(),
  ]);

  const byId = new Map<string, TeamFilmReviewDoc>();
  for (const doc of [...sharedSnapshot.docs, ...ownerSnapshot.docs, ...creatorSnapshot.docs]) {
    const review = toTeamFilmReviewDocFromUniversalFile(
      toUniversalFileDoc(doc.id, doc.data() ?? {})
    );
    if (review) {
      byId.set(review.id, review);
    }
  }

  return [...byId.values()].sort(compareByUpdatedAtDesc).slice(0, limit);
}

export function summarizeFilmReview(review: TeamFilmReviewDoc): Record<string, unknown> {
  return {
    id: review.id,
    teamId: review.teamId,
    title: review.title,
    sport: review.sport,
    status: review.status,
    uploadMode: review.uploadMode,
    perspective: review.perspective,
    opponentName: review.opponentName,
    gameDate: review.gameDate,
    readyToStream: review.readyToStream,
    cloudflareVideoId: review.cloudflareVideoId,
    thumbnailUrl: review.thumbnailUrl,
    aiSummary: review.aiSummary,
    keyInsights: review.keyInsights,
    clipCount: review.clips?.length ?? 0,
    sourceCount: review.sources?.length ?? 0,
    timelineCount: review.timeline?.length ?? 0,
    updatedAt: review.updatedAt,
    createdAt: review.createdAt,
  };
}

export function getFilmReviewSourceBreakdown(params: {
  readonly review: TeamFilmReviewDoc;
  readonly sourceId: string;
}): {
  readonly source: NonNullable<TeamFilmReviewDoc['sources']>[number] | null;
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
  readonly sportTagSchemaKey: string;
  readonly sportTagSchema: readonly ReturnType<
    typeof getTeamFilmReviewSportTagDefinitions
  >[number][];
} {
  const source = params.review.sources?.find((entry) => entry.id === params.sourceId) ?? null;
  const timeline = (params.review.timeline ?? []).filter(
    (segment) => segment.sourceId === params.sourceId
  );
  const sportTagSchemaKey = resolveTeamFilmReviewSportTagSchemaKey(params.review.sport);
  const sportTagSchema = getTeamFilmReviewSportTagDefinitions(params.review.sport);

  return {
    source,
    timeline,
    sportTagSchemaKey,
    sportTagSchema,
  };
}
