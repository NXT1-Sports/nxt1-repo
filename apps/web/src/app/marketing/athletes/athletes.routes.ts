import { Routes } from '@angular/router';

export const ATHLETES_ROUTES: Routes = [
  {
    path: '',
    title: 'For Athletes | NXT1',
    loadComponent: () => import('./athletes.component').then((m) => m.AthletesComponent),
  },
];

export default ATHLETES_ROUTES;
