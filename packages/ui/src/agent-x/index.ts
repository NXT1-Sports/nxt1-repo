/**
 * @fileoverview Agent X Module Index
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Barrel export for Agent X UI components and services.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// Service
export { AgentXService } from './agent-x.service';

// Components
export { AgentXShellComponent, type AgentXUser } from './agent-x-shell.component';
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

// FAB Chat Widget (Web-only, SSR-safe)
export { AgentXFabComponent } from './fab';
export { AgentXFabChatPanelComponent } from './fab';
export { AgentXFabService, type FabPanelState } from './fab';
