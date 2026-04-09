/**
 * @fileoverview Terms Routes - Web
 * @module @nxt1/web/features/terms
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const TERMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./terms.component').then((m) => m.TermsComponent),
  },
];
