import { z } from 'zod';

/**
 * Input schema for the create_play_diagram tool.
 *
 * The caller describes the play in natural language; the backend currently
 * performs web research (Tavily) to find the strongest play-diagram-style
 * candidate image for the request. Agent workflows must run analyze_image on
 * the returned image before presenting it as a verified match to the user.
 */
export const CreatePlayDiagramInputSchema = z.object({
  /** Plain-language description of the play (e.g. "Post route combo, 4 receivers, man coverage"). */
  description: z.string().trim().min(1),
  /** Sport context — helps search queries stay aligned to the requested sport. */
  sport: z.string().trim().min(1).optional(),
  /** Human-readable title for the diagram and playbook entry. */
  title: z.string().trim().min(1).optional(),
  /**
   * Optional seed XML for future direct-diagram editing paths.
   * In current web-research mode this value is accepted but not applied
   * to candidate selection.
   */
  xmlTemplate: z.string().trim().min(1).optional(),
  /**
   * Compatibility field reserved for direct-generation rollouts.
   * Current behavior remains web research only.
   */
  generationMode: z.enum(['auto', 'deterministic_spec', 'legacy_layout']).optional(),
});

/**
 * The resolved result returned by PlayDiagramService.createDiagram().
 *
 * - imageUrl:    Best candidate external image URL found for the play intent; empty
 *                when no candidate clears the heuristic selection threshold.
 * - xmlContent:  Search/selection trace comments for downstream diagnostics and
 *                agent-side verification workflows.
 * - editUrl:     diagrams.net editor URL placeholder for future direct diagram editing.
 * - title:       Human-readable diagram title.
 * - storagePath: Optional storage path (unused in current fallback mode).
 */
export const PlayDiagramResultSchema = z.object({
  imageUrl: z.union([z.literal(''), z.string().url()]),
  xmlContent: z.string().min(1),
  editUrl: z.string().url(),
  title: z.string().trim().min(1),
  resultStatus: z.enum(['candidate_found', 'no_candidate_found', 'search_failed']),
  failureReason: z.string().trim().min(1).optional(),
  storagePath: z.string().optional(),
  generationMode: z.enum(['auto', 'deterministic_spec', 'legacy_layout']).optional(),
});

export type CreatePlayDiagramInput = z.infer<typeof CreatePlayDiagramInputSchema>;
export type PlayDiagramResult = z.infer<typeof PlayDiagramResultSchema>;
