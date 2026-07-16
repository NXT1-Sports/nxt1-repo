/**
 * @fileoverview Board Diagram Platform — shared types.
 *
 * These types extend the play-diagram primitives with the additional concepts
 * required for the full board-diagram platform:
 *   - A `BoardDiagramKind` discriminator separating play and drill diagrams.
 *   - A `BoardDiagramAsset` — the first-class Firestore-persisted record that
 *     carries identity, metadata, storage refs, and editable XML for CRUD ops.
 */

import type { DiagramLayout, NormalizedSport } from '../../play-diagram/shared/diagram.types.js';

// ─── Discriminator ────────────────────────────────────────────────────────────

/**
 * The two subtypes supported by the Board Diagram Platform.
 *
 * - `sport_play`  — competitive play/formation diagram (e.g. route trees, blitz)
 * - `sport_drill` — training drill movement pattern (e.g. cone drill, PnR drill)
 */
export type BoardDiagramKind = 'sport_play' | 'sport_drill';

// ─── Asset ────────────────────────────────────────────────────────────────────

/**
 * First-class diagram asset persisted to Firestore after every successful render.
 *
 * Both `sport_play` and `sport_drill` diagrams share this shape so that update,
 * delete, and reference operations (playbooks, drill libraries, chat artifacts)
 * work identically regardless of subtype.
 *
 * Firestore collection: `DiagramAssets/{id}` (legacy reads also support `diagramAssets/{id}`).
 * Security: `userId === auth.uid` enforced at the service layer.
 */
export interface BoardDiagramAsset {
  /** Firestore document ID — stable identifier for update/delete/reference. */
  readonly id: string;
  /** Diagram subtype: 'sport_play' or 'sport_drill'. */
  readonly kind: BoardDiagramKind;
  /** Normalized sport identifier. */
  readonly sport: NormalizedSport;
  /** Human-readable title displayed in the diagram and playbook. */
  readonly title: string;
  /** Natural-language description used for the LLM generation prompt. */
  readonly description: string;
  /** Public Firebase Storage URL for the rendered PNG (suitable for display). */
  readonly imageUrl: string;
  /** Firebase Storage path for the PNG — used for deletion and re-upload on update. */
  readonly storagePath?: string;
  /** Public Firebase Storage URL for the rendered SVG source asset. */
  readonly svgUrl?: string;
  /** Firebase Storage path for the SVG — used for deletion and re-upload on update. */
  readonly svgStoragePath?: string;
  /** Raw <mxGraphModel> XML for diagrams.net editor rehydration. */
  readonly xmlContent?: string;
  /** diagrams.net editor URL pre-loaded with this diagram's XML (open-in-editor). */
  readonly editUrl?: string;
  /** Where this asset came from. External images are display-only in Diagrams Lab. */
  readonly assetSource?: 'board_diagram' | 'external_image';
  /**
   * The fully resolved, enhanced DiagramLayout that produced this render.
   * Stored so the diagram can be re-rendered without another LLM round-trip
   * (e.g. for minor adjustments or format changes).
   */
  readonly sourceLayout?: DiagramLayout;
  /** Owner's Firebase UID. */
  readonly userId: string;
  /** Thread the diagram was created in, or null if created outside a conversation. */
  readonly threadId: string | null;
  /** Soft-delete flag — true means the asset is tombstoned and invisible to callers. */
  readonly deleted: boolean;
  /** Unix timestamp (ms) of soft-delete, or null if the asset is active. */
  readonly deletedAt: number | null;
  /** Unix timestamp (ms) when the asset was first created. */
  readonly createdAt: number;
  /** Unix timestamp (ms) of the last mutation. */
  readonly updatedAt: number;
}

// ─── Patch ────────────────────────────────────────────────────────────────────

/**
 * Partial update shape applied to a `BoardDiagramAsset` Firestore document.
 * Only supplied fields are written; `id`, `kind`, `sport`, `userId`, and `createdAt`
 * are immutable and excluded from the patch surface.
 */
export type BoardDiagramAssetPatch = Partial<
  Pick<
    BoardDiagramAsset,
    | 'title'
    | 'description'
    | 'imageUrl'
    | 'storagePath'
    | 'svgUrl'
    | 'svgStoragePath'
    | 'xmlContent'
    | 'editUrl'
    | 'assetSource'
    | 'sourceLayout'
    | 'deleted'
    | 'deletedAt'
    | 'updatedAt'
  >
>;
