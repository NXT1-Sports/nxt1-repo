/**
 * @fileoverview Invite Feature Routes - Web
 * @module @nxt1/web/features/invite
 * @version 1.0.0
 *
 * Route configuration for the Invite feature.
 * Supports both direct page navigation and bottom sheet modal.
 */

import { Routes } from '@angular/router';

export const INVITE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./invite.component').then((m) => m.InviteComponent),
    data: {
      title: 'Invite Friends',
      description: 'Share NXT1 with friends and earn rewards',
      // Animation metadata for route transitions
      animation: 'invite',
    },
  },
  {
    path: 'team/:teamId',
    loadComponent: () => import('./invite.component').then((m) => m.InviteComponent),
    data: {
      title: 'Invite to Team',
      description: 'Invite athletes to join your team',
      inviteType: 'team',
      animation: 'invite-team',
    },
  },
];

export default INVITE_ROUTES;
