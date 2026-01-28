/**
 * @fileoverview Agent X Routes
 * @module @nxt1/mobile/features/agent-x
 *
 * Routes for the AI Agent X feature.
 */

import { Routes } from '@angular/router';

export const AGENT_X_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agent-x.component').then((m) => m.AgentXComponent),
  },
];

export default AGENT_X_ROUTES;
