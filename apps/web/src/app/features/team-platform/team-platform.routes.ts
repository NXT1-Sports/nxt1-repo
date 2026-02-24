import { Routes } from '@angular/router';

export const TEAM_PLATFORM_ROUTES: Routes = [
  {
    path: '',
    title: 'Team Platform | NXT1',
    loadComponent: () => import('./team-platform.component').then((m) => m.TeamPlatformComponent),
  },
];

export default TEAM_PLATFORM_ROUTES;
