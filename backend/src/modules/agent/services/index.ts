/**
 * @fileoverview Agent Services — Barrel Export
 * @module @nxt1/backend/modules/agent/services
 */

export { ApprovalGateService } from './approval-gate.service.js';
export { AgentChatService } from './agent-chat.service.js';
export { AgentGenerationService } from './generation.service.js';
export type { PlaybookGenerationResult, BriefingGenerationResult } from './generation.service.js';
export { IntelGenerationService } from './intel.service.js';
export {
  ExportService,
  type ExportColumn,
  type ExportRow,
  type CsvExportOptions,
  type PdfExportOptions,
} from './export.service.js';
export {
  buildEliteContext,
  getSeasonInfo,
  getRecurringHabitsPrompt,
  resolvePrimarySport,
} from '../memory/context-builder.js';
