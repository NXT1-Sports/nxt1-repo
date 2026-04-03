/**
 * @fileoverview Agent Services — Barrel Export
 * @module @nxt1/backend/modules/agent/services
 */

export { ApprovalGateService } from './approval-gate.service.js';
export { TelemetryService } from './telemetry.service.js';
export { AgentChatService } from './agent-chat.service.js';
export { AgentGenerationService } from './generation.service.js';
export type { PlaybookGenerationResult, BriefingGenerationResult } from './generation.service.js';
export { buildEliteContext, getSeasonInfo } from './elite-context.js';
