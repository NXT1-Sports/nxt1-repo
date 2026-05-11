/**
 * @fileoverview Agent X Routes - Web App
 * @module @nxt1/web/features/agent-x
 */

import { Routes } from '@angular/router';

export const AGENT_X_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agent-x.component').then((m) => m.AgentXComponent),
    title: 'Agent X - Sports Intelligence Command Center | NXT1 Sports',
  },
];

export default AGENT_X_ROUTES;
