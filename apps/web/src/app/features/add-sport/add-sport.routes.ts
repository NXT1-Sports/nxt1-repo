/**
 * @fileoverview Add Sport / Add Team Routes
 * @module @nxt1/web/features/add-sport
 *
 * Post-onboarding wizard for adding a new sport (athletes/parents/recruiters)
 * or team (coaches/directors) to an already-onboarded user's profile.
 *
 *   /add-sport  → AddSportComponent (full-page, outside shell)
 */

import { Routes } from '@angular/router';

export const ADD_SPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./add-sport.component').then((m) => m.AddSportComponent),
    title: 'Add Sport | NXT1 Sports',
  },
];

export default ADD_SPORT_ROUTES;
