import { Routes } from '@angular/router';
import { matchLoggedOutAgentXLayout } from '../core/routing/agent-x-layout.matchers';

export const PUBLIC_MARKETING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./public-marketing-shell.component').then((m) => m.PublicMarketingShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'NXT1 Sports | The Sports Intelligence Platform',
        loadComponent: () => import('./landing/landing.component').then((m) => m.LandingComponent),
      },
      {
        path: 'programs',
        loadChildren: () =>
          import('./team-platform/team-platform.routes').then((m) => m.TEAM_PLATFORM_ROUTES),
      },
      {
        path: 'agent-x',
        canMatch: [matchLoggedOutAgentXLayout],
        title: 'NXT1 Agent X | AI Command Center for Sports',
        loadComponent: () =>
          import('./agent-x-marketing/agent-x-marketing.component').then(
            (m) => m.AgentXMarketingComponent
          ),
      },
    ],
  },
];
