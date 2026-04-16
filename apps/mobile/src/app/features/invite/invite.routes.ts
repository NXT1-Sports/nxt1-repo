import { Routes } from '@angular/router';

export const INVITE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./invite.component').then((m) => m.InviteMobileComponent),
  },
  {
    path: 'team/:teamId',
    loadComponent: () => import('./invite.component').then((m) => m.InviteMobileComponent),
    data: {
      inviteType: 'team',
    },
  },
];

export default INVITE_ROUTES;
