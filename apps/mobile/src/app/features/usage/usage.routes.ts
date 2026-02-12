import { Routes } from '@angular/router';

export const USAGE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./usage.component').then((m) => m.UsageComponent),
  },
];

export default USAGE_ROUTES;
