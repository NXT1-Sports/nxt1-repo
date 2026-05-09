/**
 * @fileoverview Board Diagram Platform — barrel export.
 *
 * Public surface for the board-diagram integration module.
 * All agent bootstrap, tool registration, and external consumers import from here.
 */

// ── Services ─────────────────────────────────────────────────────────────────
export { BoardDiagramService } from './board-diagram.service.js';
export { BoardDiagramAssetService } from './services/board-diagram-asset.service.js';

// ── Tools ─────────────────────────────────────────────────────────────────────
export { CreateBoardDiagramTool } from './tools/create-board-diagram.tool.js';
export { UpdateBoardDiagramTool } from './tools/update-board-diagram.tool.js';
export { DeleteBoardDiagramTool } from './tools/delete-board-diagram.tool.js';

// ── Schemas ───────────────────────────────────────────────────────────────────
export {
  BoardDiagramKindSchema,
  CreateBoardDiagramInputSchema,
  UpdateBoardDiagramInputSchema,
  DeleteBoardDiagramInputSchema,
  type CreateBoardDiagramInput,
  type UpdateBoardDiagramInput,
  type DeleteBoardDiagramInput,
} from './schemas.js';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  BoardDiagramAsset,
  BoardDiagramKind,
  BoardDiagramAssetPatch,
} from './shared/board-diagram.types.js';
