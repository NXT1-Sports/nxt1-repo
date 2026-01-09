/**
 * @fileoverview Mobile App Routes
 * @module @nxt1/mobile
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs',
    pathMatch: 'full',
  },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((m) => m.routes),
  },
  {
    path: 'profile/:id',
    loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage),
  },
];
