/**
 * @fileoverview Terms Routes - Mobile
 * @module @nxt1/mobile/features/terms
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const TERMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./terms.page').then((m) => m.TermsPage),
  },
];
