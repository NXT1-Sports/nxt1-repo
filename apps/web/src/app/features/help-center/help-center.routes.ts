/**
 * @fileoverview Help Center Feature Routes (Web)
 * @version 2.0.0
 * @description Clean, minimal route configuration.
 */

import { Routes } from '@angular/router';

export const HELP_CENTER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
    title: 'Help Center | NXT1',
  },
  {
    path: 'category/:categoryId',
    loadComponent: () =>
      import('./help-center-category.component').then((m) => m.HelpCenterCategoryComponent),
    title: 'Help Center | NXT1',
  },
  {
    path: 'article/:slug',
    loadComponent: () =>
      import('./help-center-article.component').then((m) => m.HelpCenterArticleComponent),
    title: 'Help Article | NXT1',
  },
];

export default HELP_CENTER_ROUTES;
