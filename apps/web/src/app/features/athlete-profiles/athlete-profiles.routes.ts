/**
 * @fileoverview Athlete Profiles Routes
 * @module @nxt1/web/features/athlete-profiles
 */

import { Routes } from '@angular/router';

export const ATHLETE_PROFILES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./athlete-profiles.component').then((m) => m.AthleteProfilesComponent),
    title: 'Athlete Profiles | NXT1',
  },
];

export default ATHLETE_PROFILES_ROUTES;
