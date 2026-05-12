/**
 * @fileoverview Zod schemas for all board-diagram platform tools.
 *
 * Three tools are exposed:
 *   create_board_diagram — generate a new play or drill diagram
 *   update_board_diagram — regenerate an existing asset with new description/title
 *   delete_board_diagram — soft-delete an asset and remove its storage PNG
 */

import { z } from 'zod';

// ─── Kind discriminator ───────────────────────────────────────────────────────

export const BoardDiagramKindSchema = z.enum(['sport_play', 'sport_drill']);

// ─── create_board_diagram ─────────────────────────────────────────────────────

/**
 * Input for the create_board_diagram tool.
 *
 * Extends the original play-diagram input with a `kind` discriminator so the
 * orchestrator can route to the correct prompt, validation, and concept enhancer.
 */
export const CreateBoardDiagramInputSchema = z.object({
  /** Natural-language description of the play or drill. */
  description: z.string().trim().min(1),
  /** Sport context — drives sport-specific rendering and LLM prompt. */
  sport: z.string().trim().min(1).optional(),
  /** Human-readable title for the diagram. Defaults to "<sport> Play/Drill" when omitted. */
  title: z.string().trim().min(1).optional(),
  /**
   * Diagram subtype.
   * - 'sport_play' (default) — competitive play/formation diagram
   * - 'sport_drill' — training drill movement pattern
   */
  kind: BoardDiagramKindSchema.default('sport_play'),
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
