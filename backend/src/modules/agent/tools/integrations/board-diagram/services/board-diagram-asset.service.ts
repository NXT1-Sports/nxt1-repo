/**
 * @fileoverview BoardDiagramAssetService — Firestore CRUD for diagram assets.
 *
 * Collection: `diagramAssets/{assetId}`
 *
 * Design notes:
 *   - The `userId` is stored as a document field (not a path segment) so that
 *     cloud admin queries and cross-user operations remain straightforward.
 *   - Authorization is enforced at the service layer: all read/write operations
 *     verify that the requesting userId matches the stored owner before returning data.
 *   - Soft-delete semantics: assets are never hard-deleted from Firestore — the
 *     `deleted` flag is set to true and `deletedAt` is recorded. Storage PNG
 *     cleanup is the caller's responsibility (see BoardDiagramService).
 */

import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../../../../../../utils/logger.js';
import type { BoardDiagramAsset, BoardDiagramAssetPatch } from '../shared/board-diagram.types.js';
import type { DiagramLayout, DiagramRoute } from '../../play-diagram/shared/diagram.types.js';

const COLLECTION = 'diagramAssets';

type FirestoreDiagramPoint = {
  readonly x: number;
  readonly y: number;
};

type FirestoreDiagramRoute = Omit<DiagramRoute, 'points'> & {
  readonly points: FirestoreDiagramPoint[];
};

type FirestoreDiagramLayout = Omit<DiagramLayout, 'routes'> & {
  readonly routes: FirestoreDiagramRoute[];
};

function serializeLayoutForFirestore(layout: DiagramLayout): FirestoreDiagramLayout {
  return {
    ...layout,
    routes: layout.routes.map((route) => ({
      ...route,
      points: route.points.map(([x, y]) => ({ x, y })),
    })),
  };
}

function deserializeLayoutFromFirestore(layout: unknown): DiagramLayout {
  const parsed = layout as DiagramLayout | FirestoreDiagramLayout;

  return {
    ...parsed,
    routes: parsed.routes.map((route) => ({
      ...route,
      points: route.points.map((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          return [point[0], point[1]] as [number, number];
        }

        const candidate = point as Partial<FirestoreDiagramPoint>;
        return [Number(candidate.x ?? 0), Number(candidate.y ?? 0)] as [number, number];
      }),
    })),
  };
}

function serializeAssetForFirestore(asset: BoardDiagramAsset): Record<string, unknown> {
  return {
    ...asset,
    sourceLayout: serializeLayoutForFirestore(asset.sourceLayout),
  };
}

function deserializeAssetFromFirestore(
  data: BoardDiagramAsset | Record<string, unknown>
): BoardDiagramAsset {
  const asset = data as BoardDiagramAsset;

  return {
    ...asset,
    sourceLayout: deserializeLayoutFromFirestore(asset.sourceLayout),
  };
}

function serializePatchForFirestore(patch: BoardDiagramAssetPatch): Record<string, unknown> {
  if (!patch.sourceLayout) {
    return patch as Record<string, unknown>;
  }

  return {
    ...patch,
    sourceLayout: serializeLayoutForFirestore(patch.sourceLayout),
  };
}

export class BoardDiagramAssetService {
  constructor(private readonly db: Firestore) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  /**
   * Persist a new diagram asset document.
   * Generates a stable UUID as the Firestore document ID.
   */
  async create(asset: Omit<BoardDiagramAsset, 'id'>): Promise<BoardDiagramAsset> {
    const id = randomUUID();
    const doc: BoardDiagramAsset = { ...asset, id };

    await this.db.collection(COLLECTION).doc(id).set(serializeAssetForFirestore(doc));

    logger.info('[BoardDiagramAssetService] Asset created', {
      id,
      kind: asset.kind,
      sport: asset.sport,
      userId: asset.userId,
    });

    return doc;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve an active (non-deleted) asset by ID.
   *
   * Returns `null` when:
   *   - The document does not exist.
   *   - The asset belongs to a different user (authorization failure).
   *   - The asset has been soft-deleted.
   *
   * A `null` return is deliberately indistinguishable from "not found" to
   * avoid leaking asset existence to unauthorized callers.
   */
  async getById(assetId: string, userId: string): Promise<BoardDiagramAsset | null> {
    const snap = await this.db.collection(COLLECTION).doc(assetId).get();

    if (!snap.exists) {
      return null;
    }

    const data = deserializeAssetFromFirestore(snap.data() as Record<string, unknown>);

    if (data.userId !== userId) {
      logger.warn('[BoardDiagramAssetService] Unauthorized asset access attempt', {
        assetId,
        requestingUserId: userId,
      });
      return null;
    }

    if (data.deleted) {
      return null;
    }

    return data;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  /**
   * Apply a partial patch to an existing asset document.
   *
   * Automatically sets `updatedAt` to the current timestamp regardless of
   * whether it is included in the caller-supplied patch.
   *
   * Returns the merged asset on success, or `null` if the asset is not found
   * or the userId does not match.
   */
  async patch(
    assetId: string,
    userId: string,
    patch: BoardDiagramAssetPatch
  ): Promise<BoardDiagramAsset | null> {
    const existing = await this.getById(assetId, userId);

    if (!existing) {
      logger.warn('[BoardDiagramAssetService] Patch target not found', { assetId, userId });
      return null;
    }

    const update: BoardDiagramAssetPatch = { ...patch, updatedAt: Date.now() };

    await this.db.collection(COLLECTION).doc(assetId).update(serializePatchForFirestore(update));

    logger.info('[BoardDiagramAssetService] Asset patched', {
      assetId,
      fields: Object.keys(patch),
    });

    return { ...existing, ...update } as BoardDiagramAsset;
  }

  // ─── Soft-delete ──────────────────────────────────────────────────────────

  /**
   * Soft-delete an asset by setting `deleted = true` and recording `deletedAt`.
   *
   * Storage PNG cleanup is the caller's responsibility — this method only
   * tombstones the Firestore record.
   *
   * Returns `true` on success, `false` if the asset was not found.
   */
  async softDelete(assetId: string, userId: string): Promise<boolean> {
    const existing = await this.getById(assetId, userId);

    if (!existing) {
      logger.warn('[BoardDiagramAssetService] Delete target not found', { assetId, userId });
      return false;
    }

    const now = Date.now();

    await this.db.collection(COLLECTION).doc(assetId).update({
      deleted: true,
      deletedAt: now,
      updatedAt: now,
    });

    logger.info('[BoardDiagramAssetService] Asset soft-deleted', { assetId, userId });

    return true;
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  /**
   * List non-deleted assets for a user, ordered by creation time descending.
   * Capped at `limit` results (default 50) to prevent oversized reads.
   *
   * NOTE: This query requires a Firestore composite index on
   *   (userId ASC, deleted ASC, createdAt DESC).
   */
  async listByUser(userId: string, limit = 50): Promise<BoardDiagramAsset[]> {
    const snap = await this.db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('deleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => deserializeAssetFromFirestore(d.data() as Record<string, unknown>));
  }
}
