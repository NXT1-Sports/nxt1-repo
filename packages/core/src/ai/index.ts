/**
 * @fileoverview Agent X Module Index
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Barrel export for Agent X AI module.
 */

// Types
export type {
  ChatRole,
  AgentXAttachmentType,
  AgentXAttachment,
  AgentXMessage,
  AgentXMessageMetadata,
  AutoOpenPanelInstruction,
  QuickTaskCategory,
  AgentXQuickTask,
  AgentXMode,
  AgentXModeConfig,
  AgentXChatRequest,
  AgentXChatResponse,
  AgentXUserContext,
  AgentXErrorCode,
  AgentXConfig,
  AgentXState,
  // Shell content types (portable)
  ShellActionChip,
  ShellCommandCategory,
  ShellBriefingInsight,
  ShellGoalTag,
  ShellPlaybookCoordinator,
  ShellWeeklyPlaybookItem,
  ShellActiveOperation,
  ShellContentForRole,
  // Dashboard API types
  AgentDashboardGoal,
  AgentDashboardResponse,
  AgentDashboardData,
  AgentDashboardBriefing,
  AgentDashboardPlaybook,
  AgentSetGoalsRequest,
  AgentRegeneratePlaybookRequest,
  AgentPlaybookResponse,
  // Operations log types
  OperationLogStatus,
  OperationLogCategory,
  OperationLogEntry,
  OperationsLogResponse,
  // SSE streaming types
  AgentXStreamThreadEvent,
  AgentXStreamDeltaEvent,
  AgentXStreamDoneEvent,
  AgentXStreamErrorEvent,
  AgentXStreamStepEvent,
  AgentXStreamCardEvent,
  AgentXStreamCallbacks,
  // Tool step & rich card types
  AgentXToolStepStatus,
  AgentXToolStep,
  AgentXRichCardType,
  AgentXPlannerItem,
  AgentXPlannerPayload,
  AgentXRichCard,
  AgentXDataTableColumn,
  AgentXDataTablePayload,
  AgentXConfirmationAction,
  AgentXConfirmationPayload,
  AgentXCitation,
  AgentXCitationsPayload,
  AgentXParameterField,
  AgentXParameterFormPayload,
  AgentXDraftPayload,
  AgentXProfileStat,
  AgentXProfilePayload,
  AgentXFilmMarker,
  AgentXFilmTimelinePayload,
} from './agent-x.types';

// Constants
export {
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  ATHLETE_QUICK_TASKS,
  COACH_QUICK_TASKS,
  COLLEGE_QUICK_TASKS,
  ALL_QUICK_TASKS,
  AGENT_X_ENDPOINTS,
  AGENT_X_RATE_LIMITS,
  AGENT_X_CACHE_KEYS,
  AGENT_X_CACHE_TTL,
  // Attachment constants & helpers
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  resolveAttachmentType,
  // Role-specific shell content
  ATHLETE_COORDINATORS,
  TEAM_COORDINATORS,
  RECRUITER_COORDINATORS,
  getShellContentForRole,
} from './agent-x.constants';

// Content types (mode-specific)
export type {
  AgentXDraftStatus,
  AgentXDraft,
  AgentXTemplateCategory,
  AgentXTemplate,
  AgentXBundle,
  AgentXTaskPriority,
  AgentXTaskItem,
  AgentXCreativeModeContent,
  AgentXActionModeContent,
} from './agent-x-content.types';

// Content constants (mode-specific)
export {
  HIGHLIGHT_CATEGORIES,
  GRAPHIC_CATEGORIES,
  HIGHLIGHT_TEMPLATES,
  GRAPHIC_TEMPLATES,
  AGENT_X_BUNDLES,
  RECRUITING_TASKS,
  EVALUATION_TASKS,
} from './agent-x-content.constants';

// API
export { createAgentXApi, type AgentXApi, type ThreadMessagesResponse } from './agent-x.api';

// Agent Onboarding Types
export type {
  AgentOnboardingStepId,
  AgentOnboardingStep,
  AgentProgramResult,
  CoachProgramRole,
  CoachRoleOption,
  ProgramAction,
  SelectedProgramData,
  AgentGoal,
  AgentGoalCategory,
  AgentConnection,
  AgentOnboardingState,
  AgentOnboardingPayload,
} from './agent-onboarding.types';

// Agent Onboarding Constants
export {
  AGENT_ONBOARDING_STEPS,
  AGENT_MAX_GOALS,
  AGENT_MIN_GOALS,
  COACH_ROLE_OPTIONS,
  AGENT_GOAL_CATEGORIES,
  COACH_PREDEFINED_GOALS,
  ATHLETE_PREDEFINED_GOALS,
  AGENT_LOADING_MESSAGES,
  AGENT_LOADING_MESSAGE_INTERVAL,
  AGENT_LOADING_TOTAL_DURATION,
  AGENT_ONBOARDING_ENDPOINTS,
} from './agent-onboarding.constants';

// ─── Chat Persistence (Threads & Messages) ─────────────────────────────────

export type {
  AgentThread,
  AgentThreadCategory,
  AgentMessageRole,
  AgentMessage,
  AgentMessageTokenUsage,
  AgentThreadQuery,
  AgentMessageQuery,
  PaginatedResult,
} from './chat.types';

// ─── Agentic Engine (Orchestration, Tools, Memory, Guardrails) ──────────────

// Agentic types
export type {
  AgentOperationStatus,
  AgentOperationStep,
  AgentOperation,
  AgentOperationResult,
  AgentIdentifier,
  AgentDescriptor,
  AgentToolDefinition,
  AgentToolCategory,
  AgentToolCallRecord,
  AgentMemoryEntry,
  AgentMemoryCategory,
  KnowledgeCategory,
  KnowledgeSourceType,
  KnowledgeEntry,
  KnowledgeRetrievalResult,
  KnowledgeIngestionRequest,
  KnowledgeIngestionResult,
  AgentSessionContext,
  AgentSessionMessage,
  GuardrailVerdict,
  GuardrailDescriptor,
  ModelTier,
  ModelRoutingConfig,
  AgentJobPayload,
  AgentJobUpdate,
  AgentTaskStatus,
  AgentTask,
  AgentExecutionPlan,
  AgentPlannerOutput,
  AgentTaskNode,
  AgentJobOrigin,
  AgentTriggerEvent,
  AgentTriggerType,
  AgentTriggerPriority,
  AgentTriggerRule,
  AgentTriggerPreferences,
  SyncDeltaReport,
  SyncStatChange,
  SyncNewCategory,
  SyncNewScheduleEvent,
  SyncNewVideo,
  AgentApprovalRequest,
  AgentApprovalStatus,
  AgentApprovalPolicy,
  AgentYieldReason,
  AgentYieldState,
  AgentUserContext,
  AgentConnectedAccount,
  AgentLLMCallRecord,
  AgentUsageSummary,
  AgentModelUsage,
  AgentAgentUsage,
  AgentUsageLimits,
  JobEventType,
  JobEvent,
} from './agent.types';

// Agentic constants
export {
  AGENT_DESCRIPTORS,
  MODEL_ROUTING_DEFAULTS,
  GUARDRAIL_DESCRIPTORS,
  AGENT_JOB_CONFIG,
  OPERATION_STATUS_LABELS,
  AGENT_TRIGGER_RULES,
  DEFAULT_TRIGGER_PREFERENCES,
  AGENT_APPROVAL_POLICIES,
  AGENT_USAGE_LIMITS,
  AGENT_MODEL_PRICING,
  OPERATION_STATUS_LABELS_EXTENDED,
} from './agent.constants';

// Welcome graphic prompt builders
export type {
  AthleteWelcomePromptContext,
  TeamWelcomePromptContext,
} from './welcome-graphic.prompts';

export { buildAthleteWelcomePrompt, buildTeamWelcomePrompt } from './welcome-graphic.prompts';
