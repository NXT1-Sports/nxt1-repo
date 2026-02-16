import { Routes } from '@angular/router';

export const PARENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'For Parents | NXT1',
    loadComponent: () => import('./parents.component').then((m) => m.ParentsComponent),
  },
];

export default PARENTS_ROUTES;
