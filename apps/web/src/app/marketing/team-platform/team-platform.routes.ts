import { Routes } from '@angular/router';

export const TEAM_PLATFORM_ROUTES: Routes = [
  {
    path: '',
    title: 'NXT1 Programs | The Digital Athletic Department for Sports Programs',
    loadComponent: () => import('./team-platform.component').then((m) => m.TeamPlatformComponent),
  },
];

export default TEAM_PLATFORM_ROUTES;
