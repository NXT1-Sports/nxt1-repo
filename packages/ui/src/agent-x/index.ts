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
export { AgentXJobService, AGENT_X_API_BASE_URL } from './agent-x-job.service';

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
  type OperationLogEntry,
  type OperationStatus,
  type OperationCategory,
} from './agent-x-operations-log.component';
export { AgentXWelcomeComponent } from './agent-x-welcome.component';
export { AgentXChatComponent } from './agent-x-chat.component';
export { AgentXInputComponent } from './agent-x-input.component';

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
