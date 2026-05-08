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
export { AgentXService } from './services/agent-x.service';
export {
  AgentXVideoUploadService,
  type VideoUploadProgress,
  type VideoUploadPhase,
} from './services/agent-x-video-upload.service';
export {
  AgentXJobService,
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  isEnqueueFailure,
  type EnqueueFailure,
} from './services/agent-x-job.service';
export {
  AgentXStreamRegistryService,
  type StreamSnapshot,
  type StreamListener,
} from './services/agent-x-stream-registry.service';
export {
  AgentXOperationEventService,
  FIRESTORE_ADAPTER,
  type FirestoreAdapter,
  type OperationEventCallbacks,
  type OperationEventSubscription,
} from './services/agent-x-operation-event.service';
export { LiveViewSessionService } from './services/live-view-session.service';

// Components
export {
  AgentXShellComponent,
  type AgentXConnectedAccountsSaveRequest,
  type AgentXUser,
  type ActionChip,
  type CommandCategory,
  type BriefingInsight,
} from './components/shell/agent-x-shell.component';
export {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from './components/chat/agent-x-operation-chat.component';
export {
  AgentXOperationsLogComponent,
  OPERATIONS_LOG_TEST_IDS,
} from './components/shared/agent-x-operations-log.component';
export { AgentXDashboardSkeletonComponent } from './components/shared/agent-x-dashboard-skeleton.component';
export { AgentXControlPanelComponent } from './components/shell/agent-x-control-panel.component';
export { AgentXWelcomeComponent } from './components/shell/agent-x-welcome.component';
export { AgentXGoalHistoryComponent } from './components/shared/agent-x-goal-history.component';
export {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './components/cards/agent-x-action-card.component';
export { AgentXInputComponent } from './components/inputs/agent-x-input.component';
export { AgentXPromptInputComponent } from './components/inputs/agent-x-prompt-input.component';
export { AgentXInputBarComponent } from './components/inputs/agent-x-input-bar.component';
export { ChatBubbleActionsComponent } from './components/chat/agent-x-chat-bubble-actions.component';
export { AgentXMessageEditComponent } from './components/chat/agent-x-message-edit.component';
export {
  AgentXFeedbackModalComponent,
  type AgentXFeedbackSubmitEvent,
} from './components/modals/agent-x-feedback-modal.component';
export { AgentXMessageUndoComponent } from './components/chat/agent-x-message-undo.component';
export {
  AgentXAttachmentsSheetComponent,
  type ConnectedAppSource,
  type AttachmentSheetResult,
} from './components/modals/agent-x-attachments-sheet.component';
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
} from './services/agent-x-control-panel-state.service';

// Landing Page
export { NxtAgentXLandingComponent } from './components/shell/agent-x-landing.component';
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
export { AgentXToolStepsComponent } from './components/shared/agent-x-tool-steps.component';
export {
  AgentXBillingActionCardComponent,
  type BillingActionResolvedEvent,
} from './components/cards/agent-x-billing-action-card.component';
export {
  AgentXAskUserCardComponent,
  type AskUserReplyEvent,
} from './components/cards/agent-x-ask-user-card.component';
export {
  AgentXConnectAccountCardComponent,
  type ConnectAccountCardActionEvent,
} from './components/cards/agent-x-connect-account-card.component';
