/**
 * @fileoverview Tabs Routes
 * @module @nxt1/mobile
 */

import { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadComponent: () => import('../home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'discover',
        loadComponent: () => import('../discover/discover.page').then((m) => m.DiscoverPage),
      },
      {
        path: 'rankings',
        loadComponent: () => import('../rankings/rankings.page').then((m) => m.RankingsPage),
      },
      {
        path: 'messages',
        loadComponent: () => import('../messages/messages.page').then((m) => m.MessagesPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('../profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
];
