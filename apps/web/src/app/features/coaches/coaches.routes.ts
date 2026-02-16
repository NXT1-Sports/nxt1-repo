import { Routes } from '@angular/router';

export const COACHES_ROUTES: Routes = [
  {
    path: '',
    title: 'For College Coaches | NXT1',
    loadComponent: () => import('./coaches.component').then((m) => m.CoachesComponent),
  },
];

export default COACHES_ROUTES;
