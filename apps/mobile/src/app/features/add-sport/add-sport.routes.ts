/**
 * @fileoverview Add Sport Routes
 * @module @nxt1/mobile/features/add-sport
 *
 * 3-step wizard for adding a new sport (+ organization + connected accounts) to an
 * already-onboarded user's profile.
 *
 *   /add-sport          → redirects to /add-sport/sport
 *   /add-sport/sport    → sport selection step
 *   /add-sport/organization → organization / program selection step
 *   /add-sport/link-sources → connected accounts step
 */

import { Routes } from '@angular/router';

export const ADD_SPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./add-sport-shell.component').then((m) => m.AddSportShellComponent),
    children: [
      { path: '', redirectTo: 'sport', pathMatch: 'full' },
      {
        path: 'sport',
        loadComponent: () => import('./steps/sport.page').then((m) => m.AddSportSportStepPage),
        title: 'Add Sport | NXT1 Sports',
      },
      {
        path: 'organization',
        loadComponent: () =>
          import('./steps/organization.page').then((m) => m.AddSportOrganizationStepPage),
        title: 'Select Organization | NXT1 Sports',
      },
      {
        path: 'link-sources',
        loadComponent: () =>
          import('./steps/link-sources.page').then((m) => m.AddSportLinkSourcesStepPage),
        title: 'Connect Accounts | NXT1 Sports',
      },
    ],
  },
];
