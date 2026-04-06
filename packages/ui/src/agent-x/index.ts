/**
 * @fileoverview Agent X Module Index
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Barrel export for Agent X UI components and services.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// Services
export { AgentXService } from './agent-x.service';
export {
  AgentXJobService,
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from './agent-x-job.service';
export {
  AgentXOperationEventService,
  FIRESTORE_ADAPTER,
  type FirestoreAdapter,
  type OperationEventCallbacks,
  type OperationEventSubscription,
} from './agent-x-operation-event.service';

// Components
export {
  AgentXShellComponent,
  type AgentXUser,
  type ActiveOperation,
  type ActionChip,
  type CommandCategory,
  type BriefingInsight,
} from './agent-x-shell.component';
export {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from './agent-x-operation-chat.component';
export {
  AgentXOperationsLogComponent,
  OPERATIONS_LOG_TEST_IDS,
} from './agent-x-operations-log.component';
export { AgentXDashboardSkeletonComponent } from './agent-x-dashboard-skeleton.component';
export { AgentXControlPanelComponent } from './agent-x-control-panel.component';
export { AgentXWelcomeComponent } from './agent-x-welcome.component';
export { AgentXChatComponent } from './agent-x-chat.component';
export {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';
export { AgentXInputComponent } from './agent-x-input.component';
export {
  AgentXControlPanelStateService,
  AGENT_X_STATUS_DEFINITIONS,
  AGENT_X_GOAL_OPTIONS,
  type AgentXControlPanelKind,
  type AgentXControlPanelPresentation,
  type AgentXSystemStatus,
  type AgentXSystemStatusTone,
  type AgentXStatusDefinition,
  type AgentXGoalOption,
  type AgentXBudgetSettings,
} from './agent-x-control-panel-state.service';

// Mode Content (shared between web & mobile)
export {
  AgentXModeContentComponent,
  AgentXDraftsComponent,
  AgentXTemplateGridComponent,
  AgentXBundlesComponent,
  AgentXTaskListComponent,
} from './modes';

// Landing Page
export { NxtAgentXLandingComponent } from './agent-x-landing.component';
export {
  NxtAgentXIdentitySectionComponent,
  type IdentityTreeInput,
} from '../components/agent-x-identity-section';

// Onboarding Flow
export {
  AgentOnboardingService,
  AgentOnboardingShellComponent,
  AgentOnboardingShellMobileComponent,
  AgentOnboardingWelcomeComponent,
  AgentOnboardingProgramComponent,
  AgentOnboardingGoalsComponent,
  AgentOnboardingConnectionsComponent,
  AgentOnboardingLoadingComponent,
} from './onboarding';

// FAB Chat Widget (Web-only, SSR-safe)
export { AgentXFabComponent } from './fab';
export { AgentXFabChatPanelComponent } from './fab';
export { AgentXFabService, type FabPanelState } from './fab';

// Rich card components
export { AgentXToolStepsComponent } from './agent-x-tool-steps.component';
export { AgentXPlannerCardComponent } from './agent-x-planner-card.component';
export { AgentXDataTableCardComponent } from './agent-x-data-table-card.component';
export {
  AgentXConfirmationCardComponent,
  type ConfirmationActionEvent,
} from './agent-x-confirmation-card.component';
export { AgentXCitationsCardComponent } from './agent-x-citations-card.component';
export {
  AgentXParameterFormCardComponent,
  type ParameterFormSubmitEvent,
} from './agent-x-parameter-form-card.component';
export { AgentXDraftCardComponent, type DraftSubmittedEvent } from './agent-x-draft-card.component';
export { AgentXProfileCardComponent } from './agent-x-profile-card.component';
export { AgentXFilmTimelineCardComponent } from './agent-x-film-timeline-card.component';
