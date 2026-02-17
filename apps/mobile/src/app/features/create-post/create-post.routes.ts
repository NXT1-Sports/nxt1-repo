/**
 * @fileoverview Create Post Routes (Mobile)
 * @module apps/mobile/features/create-post
 * @version 1.0.0
 *
 * Route configuration for the Create Post feature on mobile.
 */

import { Routes } from '@angular/router';

export const CREATE_POST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./create-post.component').then((m) => m.CreatePostComponent),
    title: 'Create/Add',
  },
];

export default CREATE_POST_ROUTES;
