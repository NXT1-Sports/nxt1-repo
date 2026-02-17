/**
 * @fileoverview Messages Routes - Mobile
 * @module @nxt1/mobile/features/messages
 *
 * Routes:
 * - /messages          → Conversation list
 * - /messages/new      → New conversation (future)
 * - /messages/:id      → Conversation thread
 */

import { Routes } from '@angular/router';

export const MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./messages.component').then((m) => m.MessagesComponent),
  },
  {
    path: ':conversationId',
    loadComponent: () => import('./conversation.component').then((m) => m.ConversationComponent),
  },
];
