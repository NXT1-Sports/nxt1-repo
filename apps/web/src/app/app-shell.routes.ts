import { Routes } from '@angular/router';
import { provideBrowserAuthProviders } from './core/providers/browser-auth.providers';
import { provideWebShellProviders } from './core/providers/web-shell.providers';
import { matchAuthenticatedAgentXLayout } from './core/routing/agent-x-layout.matchers';

export const APP_SHELL_ROUTES: Routes = [
  {
    path: '',
    providers: [provideBrowserAuthProviders(), provideWebShellProviders()],
    loadComponent: () =>
      import('./core/layout/web-shell.component').then((m) => m.WebShellComponent),
    children: [
      {
        path: 'agent-x',
        canMatch: [matchAuthenticatedAgentXLayout],
        title: 'NXT1 Agent X | AI Command Center for Sports',
        loadComponent: () =>
          import('./features/agent-x/agent-x.component').then((m) => m.AgentXComponent),
      },
      {
        path: 'activity',
        loadChildren: () =>
          import('./features/activity/activity.routes').then((m) => m.ACTIVITY_ROUTES),
      },
      {
        path: 'profile',
        loadChildren: () =>
          import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
      {
        path: 'help-center',
        loadChildren: () =>
          import('./features/help-center/help-center.routes').then((m) => m.HELP_CENTER_ROUTES),
      },
      {
        path: 'manage-team',
        loadComponent: () =>
          import('./features/manage-team/manage-team-route.component').then(
            (m) => m.ManageTeamRouteComponent
          ),
      },
      {
        path: 'invite',
        loadChildren: () => import('./features/invite/invite.routes').then((m) => m.INVITE_ROUTES),
      },
      {
        path: 'usage',
        loadChildren: () => import('./features/usage/usage.routes').then((m) => m.USAGE_ROUTES),
      },
      {
        path: 'terms',
        loadChildren: () => import('./legal/terms/terms.routes').then((m) => m.TERMS_ROUTES),
      },
      {
        path: 'privacy',
        loadChildren: () => import('./legal/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
      },
      {
        path: 'post/:postId',
        loadChildren: () => import('./features/post/post.routes').then((m) => m.POST_ROUTES),
      },
    ],
  },
];
