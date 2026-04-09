import { Routes } from '@angular/router';

export const AI_ATHLETES_ROUTES: Routes = [
  {
    path: '',
    title: 'AI for Athletes | NXT1',
    loadComponent: () => import('./ai-athletes.component').then((m) => m.AiAthletesComponent),
  },
];

export default AI_ATHLETES_ROUTES;
