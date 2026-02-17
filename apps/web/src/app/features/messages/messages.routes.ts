/**
 * @fileoverview Messages Feature Routes - Web
 * @module @nxt1/web/features/messages
 *
 * Route configuration for the Messages feature.
 * - /messages          → Conversation list
 * - /messages/new      → New conversation (future)
 * - /messages/:conversationId → Conversation thread
 */

import { Routes } from '@angular/router';

export const MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./messages.component').then((m) => m.MessagesComponent),
    title: 'Messages | NXT1',
  },
  {
    path: ':conversationId',
    loadComponent: () => import('./conversation.component').then((m) => m.ConversationComponent),
    title: 'Conversation | NXT1',
  },
];

export default MESSAGES_ROUTES;
