import { Routes } from '@angular/router';

export const SUPER_PROFILES_ROUTES: Routes = [
  {
    path: '',
    title: 'Super Profiles | NXT1',
    loadComponent: () => import('./super-profiles.component').then((m) => m.SuperProfilesComponent),
  },
];

export default SUPER_PROFILES_ROUTES;
