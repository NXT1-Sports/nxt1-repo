/**
 * @fileoverview Help Center Feature Routes (Web)
 * @version 4.0.0
 * @description Route configuration for help center feature.
 * API adapter is provided at app.config.ts root level so the shared
 * HelpCenterService (providedIn: 'root') can resolve HELP_CENTER_API.
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
  {
    path: 'video/:id',
    loadComponent: () =>
      import('./help-center-article.component').then((m) => m.HelpCenterArticleComponent),
    title: 'Help Video | NXT1',
  },
  {
    path: 'search',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
    title: 'Search Help | NXT1',
  },
  {
    path: 'contact',
    loadComponent: () => import('./help-center.component').then((m) => m.HelpCenterComponent),
    title: 'Contact Support | NXT1',
  },
];

export default HELP_CENTER_ROUTES;
