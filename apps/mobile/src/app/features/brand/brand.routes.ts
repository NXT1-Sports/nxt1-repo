/**
 * @fileoverview Brand Feature Routes — Mobile
 * @module @nxt1/mobile/features/brand
 * @version 1.0.0
 *
 * Route configuration for the Brand Vault feature.
 */

import { Routes } from '@angular/router';

export const BRAND_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./brand.component').then((m) => m.BrandComponent),
  },
];

export default BRAND_ROUTES;
