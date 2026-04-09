/**
 * @fileoverview Agent X Web Module Index
 * @module @nxt1/ui/agent-x/web
 * @version 1.0.0
 *
 * Barrel export for web-specific Agent X components.
 * Zero Ionic dependencies — SSR-safe, design token CSS.
 *
 * ⭐ WEB ONLY — Use agent-x/index.ts for mobile (Ionic) ⭐
 */

export {
  AgentXShellWebComponent,
  type AgentXUser,
  type ExpandedSidePanelContent,
} from './agent-x-shell-web.component';
export { AgentXWelcomeWebComponent } from './agent-x-welcome-web.component';
export {
  LiveViewLauncherComponent,
  type LiveViewLaunchEvent,
  type LauncherPlatform,
} from './live-view-launcher.component';
