/**
 * @fileoverview Agent Services — Barrel Export
 * @module @nxt1/backend/modules/agent/services
 */

export { ApprovalGateService } from './approval-gate.service.js';
export {
  logAgentTaskCompletion,
  logAgentTaskFailure,
  type AgentActivityInput,
  type AgentFailureInput,
} from './agent-activity.service.js';
export { dispatchAgentPush, toDispatchInput } from './agent-push-adapter.service.js';
export { AgentChatService } from './agent-chat.service.js';
export {
  enqueueLinkedAccountScrape,
  setScrapeDependencies,
  type LinkedAccount,
  type ScrapeLinkedAccountsInput,
  type ScrapeLinkedAccountsResult,
} from './agent-scrape.service.js';
export { AgentGenerationService } from './generation.service.js';
export type { PlaybookGenerationResult, BriefingGenerationResult } from './generation.service.js';
export { IntelGenerationService } from './intel.service.js';
export {
  enqueueWelcomeGraphic,
  enqueueWelcomeGraphicIfReady,
  setWelcomeDependencies,
  type WelcomeGraphicGateResult,
  type WelcomeGraphicInput,
} from './agent-welcome.service.js';
export {
  ExportService,
  type ExportColumn,
  type ExportRow,
  type CsvExportOptions,
  type PdfExportOptions,
} from './export.service.js';
export * from './analytics/index.js';
export {
  buildEliteContext,
  getSeasonInfo,
  getRecurringHabitsPrompt,
  resolvePrimarySport,
} from '../memory/context-builder.js';
