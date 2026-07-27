import { Routes } from '@angular/router';
import { provideBrowserAuthProviders } from '../../core/providers/browser-auth.providers';

export const JOIN_ROUTES: Routes = [
  {
    path: ':code',
    providers: [provideBrowserAuthProviders()],
    loadComponent: () => import('./join.component').then((m) => m.JoinComponent),
  },
];
