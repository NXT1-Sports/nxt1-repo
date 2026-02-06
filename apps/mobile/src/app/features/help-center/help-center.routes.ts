/**
 * @fileoverview Help Center Feature Routes (Mobile)
 * @version 2.0.0
 * @description Clean, minimal route configuration.
 */

import { Routes } from '@angular/router';

export const HELP_CENTER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
  },
  {
    path: 'category/:categoryId',
    loadComponent: () =>
      import('./help-center-category.component').then((m) => m.HelpCenterCategoryComponent),
  },
  {
    path: 'article/:slug',
    loadComponent: () =>
      import('./help-center-article.component').then((m) => m.HelpCenterArticleComponent),
  },
  {
    path: 'video/:id',
    loadComponent: () =>
      import('./help-center-article.component').then((m) => m.HelpCenterArticleComponent),
  },
  {
    path: 'search',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
  },
  {
    path: 'contact',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
  },
];

export default HELP_CENTER_ROUTES;
