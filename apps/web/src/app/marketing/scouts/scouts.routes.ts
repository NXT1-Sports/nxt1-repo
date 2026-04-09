import { Routes } from '@angular/router';

export const SCOUTS_ROUTES: Routes = [
  {
    path: '',
    title: 'For Scouts | NXT1',
    loadComponent: () => import('./scouts.component').then((m) => m.ScoutsComponent),
  },
];

export default SCOUTS_ROUTES;
