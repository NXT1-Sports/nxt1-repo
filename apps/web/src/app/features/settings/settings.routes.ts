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
  {
    path: 'account-information',
    loadComponent: () =>
      import('./account-information.component').then((m) => m.AccountInformationComponent),
  },
  {
    path: 'connected-accounts',
    loadComponent: () =>
      import('./connected-accounts.component').then((m) => m.ConnectedAccountsComponent),
  },
  {
    path: 'notification-preferences',
    loadComponent: () =>
      import('./notification-preferences.component').then(
        (m) => m.NotificationPreferencesComponent
      ),
  },
];

export default SETTINGS_ROUTES;
