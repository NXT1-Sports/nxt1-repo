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
  AgentXAttachmentStub,
  AgentXMessage,
  AgentXMessagePart,
  AgentXMessageMetadata,
  AutoOpenPanelInstruction,
  LiveViewDestinationTier,
  LiveViewAuthStatus,
  LiveViewSessionCapabilities,
  LiveViewSession,
  QuickTaskCategory,
  AgentXQuickTask,
  AgentXMode,
  AgentXModeConfig,
  AgentXChatRequest,
  AgentXSelectedAction,
  AgentXSelectedActionSurface,
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
  // Goal completion types
  CompletedGoalRecord,
  AgentCompleteGoalRequest,
  AgentCompleteGoalResponse,
  AgentGoalHistoryResponse,
  // Weekly recap types
  AgentWeeklyRecap,
  // Operations log types
  OperationLogStatus,
  OperationLogCategory,
  OperationLogEntry,
  OperationsLogResponse,
  // SSE streaming types
  AgentXStreamThreadEvent,
  AgentXStreamTitleUpdatedEvent,
  AgentXStreamDeltaEvent,
  AgentXStreamThinkingEvent,
  AgentXStreamDoneEvent,
  AgentXStreamErrorEvent,
  AgentXStreamStepEvent,
  AgentXStreamCardEvent,
  AgentXStreamMediaEvent,
  AgentXStreamOperationEvent,
  AgentXStreamProgressEvent,
  AgentXStreamReplacedEvent,
  AgentXStreamWaitingForAttachmentsEvent,
  AgentXOperationLifecycleStatus,
  AgentXStreamCallbacks,
  // Tool step & rich card types
  AgentXToolStepStatus,
  AgentXToolStepIcon,
  AgentXToolStep,
  AgentXRichCardType,
  AgentXPlannerItem,
  AgentXPlannerPayload,
  AgentXRichCard,
  AgentXDataTableColumn,
  AgentXDataTablePayload,
  AgentXConfirmationAction,
  AgentXConfirmationPayload,
  AgentXConfirmationVariant,
  AgentXConfirmationEmailData,
  AgentXConfirmationTimelinePostData,
  AgentXGenericApprovalCategory,
  AgentXGenericApprovalData,
  SeasonStatsPreview,
  CoreIdentityPreview,
  RosterPreview,
  ApprovalRichPreview,
  AgentXAskUserPayload,
  AgentXCitation,
  AgentXCitationsPayload,
  AgentXParameterField,
  AgentXParameterFormPayload,
  AgentXDraftPayload,
  AgentXProfileStat,
  AgentXProfilePayload,
  AgentXFilmMarker,
  AgentXFilmTimelinePayload,
  AgentXBillingActionReason,
  AgentXBillingActionPayload,
  AgentXDocumentPayload,
} from './agent-x.types';

// Constants
export {
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  AGENT_X_ENDPOINTS,
  AGENT_X_RATE_LIMITS,
  AGENT_X_CACHE_KEYS,
  AGENT_X_CACHE_TTL,
  // Attachment constants & helpers
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  resolveAttachmentType,
} from './agent-x.constants';

export { AGENT_X_RUNTIME_CONFIG } from './agent-x-runtime.constants';

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

// Shared copy resolvers
export {
  resolveAgentApprovalCopy,
  resolveAgentApprovalPrompt,
  resolveAgentYieldCopy,
  resolveAgentSuccessNotificationCopy,
  resolveAgentFailureNotificationCopy,
  resolveApprovalSuccessText,
  type AgentApprovalCopy,
  type AgentNotificationCopy,
} from './agent-copy';

export {
  AGENT_PUSH_INTENT_KINDS,
  type AgentPushIntentKind,
  type AgentPushIntent,
  type AgentTaskCompletedIntent,
  type AgentTaskFailedIntent,
  type AgentNeedsInputIntent,
  type AgentNeedsApprovalIntent,
  type AgentPlaybookReadyIntent,
  type AgentBriefingReadyIntent,
  type AgentWeeklyRecapReadyIntent,
  type AgentPlaybookNudgeIntent,
  type AgentScheduledExecutionCompletedIntent,
  type AgentScheduledExecutionFailedIntent,
  type AgentApprovalExpiringSoonIntent,
} from './agent-push-intents.types';

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
  ORG_TYPE_OPTIONS,
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
  AgentMessageSemanticPhase,
  AgentMessageActionType,
  AgentMessageFeedback,
  AgentMessageActionRecord,
  AgentMessageEditRecord,
  AgentMessage,
  AgentMessageTokenUsage,
  AgentThreadQuery,
  AgentMessageQuery,
  PaginatedResult,
} from './chat.types';

export { SEMANTIC_PHASE_PRIORITY } from './chat.types';

// ─── Agentic Engine (Orchestration, Tools, Memory, Guardrails) ──────────────

// Agentic types
export type {
  AgentOperationStatus,
  AgentProgressStageType,
  AgentRouterStage,
  ToolStage,
  AgentProgressStage,
  OperationOutcomeCode,
  AgentProgressMetadata,
  AgentOperationStep,
  AgentOperation,
  AgentOperationResult,
  AgentArtifactHandoff,
  AgentIdentifier,
  AgentDescriptor,
  AgentToolDefinition,
  AgentToolCategory,
  AgentToolEntityGroup,
  AgentToolAccessContext,
  AgentToolCallRecord,
  AgentMemoryTarget,
  AgentMemoryEntry,
  AgentMemoryRecallOptions,
  AgentRetrievedMemories,
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
  AgentApprovalReasonCode,
  AgentApprovalRequest,
  AgentApprovalStatus,
  AgentApprovalPolicy,
  AgentSessionTrustGrant,
  AgentNotificationOutcomeCode,
  AgentYieldReason,
  AgentYieldState,
  AgentUserContext,
  AgentPromptContext,
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
  COORDINATOR_AGENT_IDS,
  COORDINATOR_DESCRIPTORS,
  MODEL_ROUTING_DEFAULTS,
  GUARDRAIL_DESCRIPTORS,
  AGENT_JOB_CONFIG,
  OPERATION_STATUS_LABELS,
  AGENT_TRIGGER_RULES,
  DEFAULT_TRIGGER_PREFERENCES,
  AGENT_APPROVAL_POLICIES,
  AGENT_APPROVAL_TOOL_GROUPS,
  AGENT_USAGE_LIMITS,
  AGENT_MODEL_PRICING,
  OPERATION_STATUS_LABELS_EXTENDED,
} from './agent.constants';

// Agent X identity (single source of truth for system prompts)
export type { AgentIdentitySnapshot } from './agent-identity';
export {
  AGENT_X_IDENTITY,
  buildSystemPrompt,
  getModeAddendum,
  hashIdentitySnapshot,
} from './agent-identity';

// Welcome graphic prompt builders
export type {
  AthleteWelcomePromptContext,
  TeamWelcomePromptContext,
} from './welcome-graphic.prompts';

export { buildAthleteWelcomePrompt, buildTeamWelcomePrompt } from './welcome-graphic.prompts';

// Approval preview formatters
export {
  formatSeasonStatsPreview,
  formatCoreIdentityPreview,
  formatRosterPreview,
  formatApprovalRichPreview,
} from './agent-approval-formatters';
