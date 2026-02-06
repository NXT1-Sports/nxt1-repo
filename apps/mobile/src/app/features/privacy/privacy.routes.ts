/**
 * @fileoverview Privacy Routes - Mobile
 * @module @nxt1/mobile/features/privacy
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const PRIVACY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./privacy.page').then((m) => m.PrivacyPage),
  },
];
