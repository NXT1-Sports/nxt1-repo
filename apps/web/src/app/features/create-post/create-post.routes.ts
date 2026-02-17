/**
 * @fileoverview Create Post Routes
 * @module apps/web/features/create-post
 * @version 1.0.0
 *
 * Route configuration for the Create Post feature.
 */

import { Routes } from '@angular/router';

export const CREATE_POST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./create-post.component').then((m) => m.CreatePostComponent),
    title: 'Create/Add | NXT1',
  },
];

export default CREATE_POST_ROUTES;
