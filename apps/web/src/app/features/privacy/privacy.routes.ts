/**
 * @fileoverview Privacy Routes - Web
 * @module @nxt1/web/features/privacy
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const PRIVACY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./privacy.component').then((m) => m.PrivacyComponent),
  },
];
