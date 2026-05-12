/**
 * @fileoverview Agent X Routes - Web App
 * @module @nxt1/web/features/agent-x
 */

import { Routes } from '@angular/router';

export const AGENT_X_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agent-x.component').then((m) => m.AgentXComponent),
    title: 'NXT1 Agent X | AI Command Center for Sports',
  },
];

export default AGENT_X_ROUTES;
