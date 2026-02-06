/**
 * @fileoverview Messages Feature Routes - Web
 * @module @nxt1/web/features/messages
 *
 * Route configuration for the Messages feature.
 * Displays user conversations and direct messages.
 */

import { Routes } from '@angular/router';

export const MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./messages.component').then((m) => m.MessagesComponent),
    title: 'Messages | NXT1',
  },
];

export default MESSAGES_ROUTES;
