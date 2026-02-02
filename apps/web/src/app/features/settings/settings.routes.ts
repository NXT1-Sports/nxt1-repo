/**
 * @fileoverview Settings Feature Routes - Web
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Route configuration for the Settings feature.
 */

import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
  // Sub-routes for settings pages
  // {
  //   path: 'profile',
  //   loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileSettingsComponent),
  // },
  // {
  //   path: 'security',
  //   loadComponent: () => import('./pages/security/security.component').then((m) => m.SecuritySettingsComponent),
  // },
  // {
  //   path: 'subscription',
  //   loadComponent: () => import('./pages/subscription/subscription.component').then((m) => m.SubscriptionComponent),
  // },
];

export default SETTINGS_ROUTES;
