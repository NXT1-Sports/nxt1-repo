/**
 * @fileoverview Team Page Routes
 * @module @nxt1/web/features/team
 */

import { Routes } from '@angular/router';

export const TEAM_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./team.component').then((m) => m.TeamComponent),
  },
];
