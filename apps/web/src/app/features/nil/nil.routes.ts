import { Routes } from '@angular/router';

export const NIL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./nil.component').then((m) => m.NilComponent),
    title: 'NIL & Monetization | NXT1',
  },
];

export default NIL_ROUTES;
