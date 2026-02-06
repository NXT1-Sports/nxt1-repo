/**
 * @fileoverview Team Page Routes
 * @module @nxt1/mobile/features/team
 */

import { Routes } from '@angular/router';

export const TEAM_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./team.page').then((m) => m.TeamPage),
  },
];
