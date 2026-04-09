import { Routes } from '@angular/router';

export const RECRUITING_ATHLETES_ROUTES: Routes = [
  {
    path: '',
    title: 'Recruiting | NXT1',
    loadComponent: () =>
      import('./recruiting-athletes.component').then((m) => m.RecruitingAthletesComponent),
  },
];

export default RECRUITING_ATHLETES_ROUTES;
