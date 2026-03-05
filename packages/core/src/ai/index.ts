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
  AgentXMessage,
  AgentXMessageMetadata,
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
} from './agent-x.types';

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
} from './agent-x.constants';

// Content constants (mode-specific)
export {
  HIGHLIGHT_CATEGORIES,
  GRAPHIC_CATEGORIES,
  HIGHLIGHT_TEMPLATES,
  GRAPHIC_TEMPLATES,
  AGENT_X_BUNDLES,
  RECRUITING_TASKS,
  EVALUATION_TASKS,
  MOCK_HIGHLIGHT_DRAFTS,
  MOCK_GRAPHIC_DRAFTS,
} from './agent-x-content.constants';

// API
export { createAgentXApi, type AgentXApi } from './agent-x.api';

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
