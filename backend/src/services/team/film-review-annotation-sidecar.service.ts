import type { CollectionReference, DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { PortableTimestamp } from '@nxt1/core';
import type {
  CreateFilmReviewDrawingRequest,
  TeamFilmReviewDrawing,
  UpdateFilmReviewDrawingRequest,
} from '@nxt1/core';

export const FILM_REVIEW_ANNOTATIONS_SUBCOLLECTION = 'filmReviewAnnotations' as const;

export class FilmReviewDrawingRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Film review drawing revision conflict: current revision is ${currentRevision}.`);
    this.name = 'FilmReviewDrawingRevisionConflictError';
  }
}

function assertFiniteNormalized(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a finite normalized value between 0 and 1.`);
  }
}

function assertDrawingRequest(request: CreateFilmReviewDrawingRequest): void {
  const bounds = request.bounds;
  assertFiniteNormalized(bounds.minX, 'bounds.minX');
  assertFiniteNormalized(bounds.minY, 'bounds.minY');
  assertFiniteNormalized(bounds.maxX, 'bounds.maxX');
  assertFiniteNormalized(bounds.maxY, 'bounds.maxY');

  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error('Drawing bounds must have ordered minimum and maximum coordinates.');
  }

  if (request.kind !== 'freehand') {
    if (request.points !== undefined || request.strokeStartIndexes !== undefined) {
      throw new Error('Only freehand drawings may include point geometry.');
    }
    if (request.kind === 'text' && !request.text?.trim()) {
      throw new Error('Text drawings require text.');
    }
    return;
  }

  const points = request.points ?? [];
  const strokeStartIndexes = request.strokeStartIndexes ?? [];
  if (!points.length || !strokeStartIndexes.length || strokeStartIndexes[0] !== 0) {
    throw new Error('Freehand drawings require points and strokeStartIndexes beginning at zero.');
  }

  let previousIndex = -1;
  for (const index of strokeStartIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= points.length || index <= previousIndex) {
      throw new Error('Freehand strokeStartIndexes must be unique valid point indexes.');
    }
    previousIndex = index;
  }

  for (const point of points) {
    assertFiniteNormalized(point.x, 'point.x');
    assertFiniteNormalized(point.y, 'point.y');
  }
}

function toDrawingDocument(params: {
  readonly id: string;
  readonly request: CreateFilmReviewDrawingRequest;
  readonly revision: number;
  readonly userId: string;
  readonly now: string;
  readonly createdBy?: string;
  readonly createdAt?: PortableTimestamp;
}): TeamFilmReviewDrawing {
  assertDrawingRequest(params.request);
  const base = {
    id: params.id,
    playId: params.request.playId,
    ...(params.request.sourceId ? { sourceId: params.request.sourceId } : {}),
    kind: params.request.kind,
    bounds: params.request.bounds,
    ...(params.request.activeFromSec !== undefined
      ? { activeFromSec: params.request.activeFromSec }
      : {}),
    ...(params.request.activeUntilSec !== undefined
      ? { activeUntilSec: params.request.activeUntilSec }
      : {}),
    revision: params.revision,
    createdBy: params.createdBy ?? params.userId,
    createdAt: params.createdAt ?? params.now,
    updatedBy: params.userId,
    updatedAt: params.now,
  } as const;

  if (params.request.kind === 'freehand') {
    return {
      ...base,
      kind: 'freehand',
      strokeCount: params.request.strokeStartIndexes?.length ?? 0,
      points: params.request.points ?? [],
      strokeStartIndexes: params.request.strokeStartIndexes ?? [],
    };
  }

  if (params.request.kind === 'text') {
    return { ...base, kind: 'text', text: params.request.text!.trim() };
  }

  return { ...base, kind: params.request.kind, strokeCount: params.request.strokeCount ?? 1 };
}

function drawingCollection(db: Firestore, fileId: string): CollectionReference {
  return db
    .collection('UniversalFiles')
    .doc(fileId)
    .collection(FILM_REVIEW_ANNOTATIONS_SUBCOLLECTION);
}

function drawingDocument(db: Firestore, fileId: string, drawingId: string): DocumentReference {
  return drawingCollection(db, fileId).doc(drawingId);
}

function toTimestampMillis(value: PortableTimestamp): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export async function listFilmReviewDrawings(params: {
  readonly db: Firestore;
  readonly fileId: string;
  readonly playId: string;
  readonly sourceId?: string;
}): Promise<readonly TeamFilmReviewDrawing[]> {
  const snapshot = await drawingCollection(params.db, params.fileId)
    .where('playId', '==', params.playId)
    .get();
  return snapshot.docs
    .map((document) => document.data() as TeamFilmReviewDrawing)
    .filter((drawing) => !params.sourceId || drawing.sourceId === params.sourceId)
    .sort(
      (left, right) =>
        toTimestampMillis(left.createdAt) - toTimestampMillis(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

export async function createFilmReviewDrawing(params: {
  readonly db: Firestore;
  readonly fileId: string;
  readonly drawingId: string;
  readonly request: CreateFilmReviewDrawingRequest;
  readonly userId: string;
  readonly now: string;
}): Promise<TeamFilmReviewDrawing> {
  const drawing = toDrawingDocument({
    id: params.drawingId,
    request: params.request,
    revision: 1,
    userId: params.userId,
    now: params.now,
  });
  await drawingDocument(params.db, params.fileId, params.drawingId).set(drawing);
  return drawing;
}

export async function updateFilmReviewDrawing(params: {
  readonly db: Firestore;
  readonly fileId: string;
  readonly drawingId: string;
  readonly request: UpdateFilmReviewDrawingRequest;
  readonly userId: string;
  readonly now: string;
}): Promise<TeamFilmReviewDrawing> {
  const reference = drawingDocument(params.db, params.fileId, params.drawingId);
  return params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new Error('Film review drawing not found.');
    }
    const current = snapshot.data() as TeamFilmReviewDrawing;
    if (current.revision !== params.request.expectedRevision) {
      throw new FilmReviewDrawingRevisionConflictError(current.revision);
    }
    const drawing = toDrawingDocument({
      id: params.drawingId,
      request: params.request,
      revision: current.revision + 1,
      userId: params.userId,
      now: params.now,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
    });
    transaction.set(reference, drawing);
    return drawing;
  });
}

export async function deleteFilmReviewDrawing(params: {
  readonly db: Firestore;
  readonly fileId: string;
  readonly drawingId: string;
  readonly expectedRevision?: number;
}): Promise<void> {
  const reference = drawingDocument(params.db, params.fileId, params.drawingId);
  await params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const current = snapshot.data() as TeamFilmReviewDrawing;
    if (params.expectedRevision !== undefined && current.revision !== params.expectedRevision) {
      throw new FilmReviewDrawingRevisionConflictError(current.revision);
    }
    transaction.delete(reference);
  });
}
