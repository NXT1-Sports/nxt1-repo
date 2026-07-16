/**
 * @fileoverview Zod schemas for all board-diagram platform tools.
 */

import { z } from 'zod';

// ─── Kind discriminator ───────────────────────────────────────────────────────

export const BoardDiagramKindSchema = z.enum(['sport_play', 'sport_drill']);
export const CreateBoardDiagramKindSchema = z.literal('sport_drill');

// ─── create_board_diagram ─────────────────────────────────────────────────────

/**
 * Input for the create_board_diagram tool.
 *
 * Drill-only entry point for board-diagram generation.
 *
 * The broader board-diagram system still understands both legacy `sport_play`
 * and `sport_drill` assets, but new create_board_diagram requests must be
 * explicit drills so play requests stay on create_play_diagram.
 */
export const CreateBoardDiagramInputSchema = z.object({
  /** Natural-language description of the drill. */
  description: z.string().trim().min(1),
  /** Sport context — drives sport-specific rendering and LLM prompt. */
  sport: z.string().trim().min(1).optional(),
  /** Human-readable title for the diagram. Defaults to a drill-oriented title when omitted. */
  title: z.string().trim().min(1).optional(),
  /**
   * Diagram subtype (MANDATORY and drill-only).
   * - 'sport_drill' — training drill movement pattern
   *
   * NOTE: This field is REQUIRED. There is no default. The orchestrator must always specify kind.
   */
  kind: CreateBoardDiagramKindSchema,
  /**
   * Optional seed JSON layout to refine rather than generate from scratch.
   * When provided, the LLM will adapt this layout rather than produce a new one.
   */
  xmlTemplate: z.string().trim().min(1).optional(),
});

// ─── update_board_diagram ─────────────────────────────────────────────────────

/**
 * Input for the update_board_diagram tool.
 *
 * Regenerates the diagram PNG from an updated description or title while
 * preserving the existing asset ID and all unchanged metadata.
 */
export const UpdateBoardDiagramInputSchema = z.object({
  /** Stable asset ID returned by create_board_diagram. */
  assetId: z.string().trim().min(1),
  /** Updated description. When omitted, the existing description is reused. */
  description: z.string().trim().min(1).optional(),
  /** Updated title. When omitted, the existing title is reused. */
  title: z.string().trim().min(1).optional(),
  /**
   * Owner's Firebase UID — used for authorization.
   * Automatically populated from execution context when available.
   */
  userId: z.string().trim().min(1),
});

// ─── delete_board_diagram ─────────────────────────────────────────────────────

/**
 * Input for the delete_board_diagram tool.
 *
 * Soft-deletes the Firestore asset record and removes the backing PNG
 * from Firebase Storage. This action is irreversible.
 */
export const DeleteBoardDiagramInputSchema = z.object({
  /** Stable asset ID returned by create_board_diagram. */
  assetId: z.string().trim().min(1),
  /**
   * Owner's Firebase UID — used for authorization.
   * Automatically populated from execution context when available.
   */
  userId: z.string().trim().min(1),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateBoardDiagramInput = z.infer<typeof CreateBoardDiagramInputSchema>;
export type UpdateBoardDiagramInput = z.infer<typeof UpdateBoardDiagramInputSchema>;
export type DeleteBoardDiagramInput = z.infer<typeof DeleteBoardDiagramInputSchema>;
