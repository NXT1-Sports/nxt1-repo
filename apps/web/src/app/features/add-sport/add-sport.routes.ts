/**
 * @fileoverview Add Sport / Add Team Routes
 * @module @nxt1/web/features/add-sport
 *
 * Post-onboarding wizard for adding a new sport (athletes)
 * or team (coaches/directors) to an already-onboarded user's profile.
 *
 *   /add-sport  → AddSportComponent (full-page, outside shell)
 */

import { Routes } from '@angular/router';
import { provideBrowserAuthProviders } from '../../core/providers/browser-auth.providers';

export const ADD_SPORT_ROUTES: Routes = [
  {
    path: '',
    providers: [provideBrowserAuthProviders()],
    loadComponent: () => import('./add-sport.component').then((m) => m.AddSportComponent),
    title: 'Add Sport | NXT1 Sports',
  },
];
