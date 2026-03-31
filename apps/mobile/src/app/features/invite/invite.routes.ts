import { Routes } from '@angular/router';

export const INVITE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./invite.component').then((m) => m.InviteMobileComponent),
  },
];

export default INVITE_ROUTES;
