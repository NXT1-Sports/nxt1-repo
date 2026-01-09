import { Routes } from '@angular/router';

/**
 * Application Routes
 *
 * Architecture:
 * - All feature routes lazy-loaded for optimal bundle splitting
 * - Public routes accessible without authentication
 * - Protected routes require auth guard
 * - Shell/layout component wraps all authenticated routes
 *
 * Route Structure:
 * - '' -> MainLayout (shell) containing router-outlet
 *   - 'explore' -> Main feed (public)
 *   - 'profile/:unicode' -> User profiles (public)
 *   - 'home' -> User home (protected)
 *   - 'auth/*' -> Authentication flows
 */
export const routes: Routes = [
  // Redirect root to explore (main feed)
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'explore',
  },

  // ============================================
  // PUBLIC ROUTES - No Authentication Required
  // ============================================

  // Main Feed / Explore
  {
    path: 'explore',
    loadComponent: () =>
      import('./features/explore/explore.component').then((m) => m.ExploreComponent),
    data: { page: 'Explore' },
  },

  // User Profile (Public View)
  {
    path: 'profile/:unicode',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    data: { page: 'Profile' },
  },

  // ============================================
  // AUTHENTICATION ROUTES
  // ============================================
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ============================================
  // PROTECTED ROUTES - Require Authentication
  // ============================================

  // User Home / Dashboard
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
    // TODO: Add auth guard
    // canActivate: [authGuard],
    data: { page: 'Home' },
  },

  // Settings
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
    // TODO: Add auth guard
    data: { page: 'Settings' },
  },

  // ============================================
  // FALLBACK / ERROR ROUTES
  // ============================================

  // 404 - Not Found
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
