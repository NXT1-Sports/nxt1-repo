import { z } from 'zod';

/**
 * Input schema for the create_play_diagram tool.
 *
 * The LLM describes the play in natural language; the backend generates
 * mxGraphModel XML via OpenRouter, exports a PNG via diagrams.net, and
 * stores both in Firebase so coaches can view and fine-tune later.
 */
export const CreatePlayDiagramInputSchema = z.object({
  /** Plain-language description of the play (e.g. "Post route combo, 4 receivers, man coverage"). */
  description: z.string().trim().min(1),
  /** Sport context — helps the LLM produce sport-specific shapes and terminology. */
  sport: z.string().trim().min(1).optional(),
  /** Human-readable title for the diagram and playbook entry. */
  title: z.string().trim().min(1).optional(),
  /**
   * Optional seed XML to refine rather than generate from scratch.
   * Must be valid mxGraphModel XML. When provided the LLM will modify
   * this XML rather than produce a new diagram.
   */
  xmlTemplate: z.string().trim().min(1).optional(),
});

/**
 * The resolved result returned by DrawioDiagramService.createDiagram().
 *
 * - imageUrl:    Public Firebase Storage URL for the exported PNG (rendered diagram).
 * - xmlContent:  Raw <mxGraphModel> XML — persist in Firestore so coaches can load
 *                it back into the draw.io editor for manual fine-tuning.
 * - editUrl:     draw.io editor URL pre-loaded with the diagram XML. Open in an
 *                iframe with the embed+proto=json protocol for save-back support.
 * - title:       Human-readable diagram title.
 * - storagePath: Firebase Storage path for the PNG (optional, for admin reference).
 */
export const DrawioDiagramResultSchema = z.object({
  imageUrl: z.string().url(),
  xmlContent: z.string().min(1),
  editUrl: z.string().url(),
  title: z.string().trim().min(1),
  storagePath: z.string().optional(),
});

export type CreatePlayDiagramInput = z.infer<typeof CreatePlayDiagramInputSchema>;
export type DrawioDiagramResult = z.infer<typeof DrawioDiagramResultSchema>;
