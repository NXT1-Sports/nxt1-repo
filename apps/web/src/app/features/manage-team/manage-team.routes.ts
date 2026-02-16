/**
 * @fileoverview Manage Team Routes
 * @module @nxt1/web/features/manage-team
 * @version 1.0.0
 *
 * Routes for team management feature.
 */

import { Routes } from '@angular/router';

export const MANAGE_TEAM_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./manage-team.component').then((m) => m.ManageTeamComponent),
    title: 'Manage Team | NXT1',
  },
  {
    path: ':teamId',
    loadComponent: () => import('./manage-team.component').then((m) => m.ManageTeamComponent),
    title: 'Manage Team | NXT1',
  },
];

export default MANAGE_TEAM_ROUTES;
