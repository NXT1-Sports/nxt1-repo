/**
 * @fileoverview Agent Onboarding Module Index
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Barrel export for Agent X onboarding flow components and service.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Usage (web — granular sub-path):
 *   import { AgentOnboardingShellComponent } from '@nxt1/ui/agent-x/onboarding';
 *
 * Usage (mobile — root barrel):
 *   import { AgentOnboardingShellComponent } from '@nxt1/ui';
 */

// Service
export { AgentOnboardingService } from './agent-onboarding.service';

// Shell (orchestrator — web)
export { AgentOnboardingShellComponent } from './agent-onboarding-shell.component';

// Shell (orchestrator — mobile, Ionic)
export { AgentOnboardingShellMobileComponent } from './agent-onboarding-shell-mobile.component';

// Step Components
export { AgentOnboardingWelcomeComponent } from './agent-onboarding-welcome.component';
export { AgentOnboardingProgramComponent } from './agent-onboarding-program.component';
export { AgentOnboardingGoalsComponent } from './agent-onboarding-goals.component';
export { AgentOnboardingConnectionsComponent } from './agent-onboarding-connections.component';
export { AgentOnboardingLoadingComponent } from './agent-onboarding-loading.component';
export { AgentOnboardingOrbComponent } from './agent-onboarding-orb.component';
