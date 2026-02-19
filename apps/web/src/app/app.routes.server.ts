import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration — 2026 Professional Pattern
 * @module @nxt1/web
 *
 * ⭐ ALL ROUTES SERVER-RENDERED — No Client-Side Auth Gating ⭐
 *
 * Professional Pattern (Twitter, Instagram, LinkedIn):
 * - 100% SSR for all pages
 * - No auth guards on routes
 * - UI components adapt to auth state
 * - Backend enforces authorization at API level
 *
 * Benefits:
 * - Full SEO for all pages
 * - No hydration mismatches
 * - No flash redirects
 * - Faster initial paint
 * - Better Core Web Vitals
 *
 * @see https://angular.dev/guide/ssr
 */
export const serverRoutes: ServerRoute[] = [
  // ============================================
  // PUBLIC LANDING PAGE — SERVER RENDERED (SEO-Critical)
  // ============================================

  // Landing/Welcome Page - Main marketing page
  {
    path: 'welcome',
    renderMode: RenderMode.Server,
  },

  // ============================================
  // ALL ROUTES — SERVER RENDERED
  // ============================================

  // Profile Pages - Individual athlete profiles
  {
    path: 'profile/:unicode',
    renderMode: RenderMode.Server,
  },

  // Explore/Discovery
  {
    path: 'explore',
    renderMode: RenderMode.Server,
  },

  // Help Center - All pages
  {
    path: 'help-center',
    renderMode: RenderMode.Server,
  },
  {
    path: 'help-center/**',
    renderMode: RenderMode.Server,
  },

  // Auth Pages
  {
    path: 'auth',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/**',
    renderMode: RenderMode.Server,
  },

  // Main App Routes (wrapped in shell)
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  // Home redirects to /explore (backward compat — no dedicated render mode needed)
  {
    path: 'explore',
    renderMode: RenderMode.Server,
  },
  {
    path: 'explore/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'rankings',
    renderMode: RenderMode.Server,
  },
  {
    path: 'rankings/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'colleges',
    renderMode: RenderMode.Server,
  },
  {
    path: 'colleges/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'messages',
    renderMode: RenderMode.Server,
  },
  {
    path: 'messages/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'activity',
    renderMode: RenderMode.Server,
  },
  {
    path: 'activity/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'analytics',
    renderMode: RenderMode.Server,
  },
  {
    path: 'analytics/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'settings',
    renderMode: RenderMode.Server,
  },
  {
    path: 'settings/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent-x',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent-x/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'xp',
    renderMode: RenderMode.Server,
  },
  {
    path: 'xp/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile',
    renderMode: RenderMode.Server,
  },
  {
    path: 'scout-reports',
    renderMode: RenderMode.Server,
  },
  {
    path: 'scout-reports/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'news',
    renderMode: RenderMode.Server,
  },
  {
    path: 'news/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'invite',
    renderMode: RenderMode.Server,
  },
  {
    path: 'invite/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'usage',
    renderMode: RenderMode.Server,
  },
  {
    path: 'usage/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'nil',
    renderMode: RenderMode.Server,
  },
  {
    path: 'nil/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'manage-team',
    renderMode: RenderMode.Server,
  },
  {
    path: 'manage-team/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'super-profiles',
    renderMode: RenderMode.Server,
  },
  {
    path: 'super-profiles/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'recruiting-scouts-colleges',
    renderMode: RenderMode.Server,
  },
  {
    path: 'recruiting-scouts-colleges/**',
    renderMode: RenderMode.Server,
  },

  // Persona-Specific Marketing Pages
  {
    path: 'athletes',
    renderMode: RenderMode.Server,
  },
  {
    path: 'athletes/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'recruiting-athletes',
    renderMode: RenderMode.Server,
  },
  {
    path: 'recruiting-athletes/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'ai-athletes',
    renderMode: RenderMode.Server,
  },
  {
    path: 'ai-athletes/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'coaches',
    renderMode: RenderMode.Server,
  },
  {
    path: 'coaches/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'college-coaches',
    renderMode: RenderMode.Server,
  },
  {
    path: 'college-coaches/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'parents',
    renderMode: RenderMode.Server,
  },
  {
    path: 'parents/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'scouts',
    renderMode: RenderMode.Server,
  },
  {
    path: 'scouts/**',
    renderMode: RenderMode.Server,
  },

  // Sport-Vertical Marketing Pages
  {
    path: 'football',
    renderMode: RenderMode.Server,
  },
  {
    path: 'football/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'basketball',
    renderMode: RenderMode.Server,
  },
  {
    path: 'basketball/**',
    renderMode: RenderMode.Server,
  },

  {
    path: 'create',
    renderMode: RenderMode.Server,
  },
  {
    path: 'create/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'create-post',
    renderMode: RenderMode.Server,
  },
  {
    path: 'create-post/**',
    renderMode: RenderMode.Server,
  },

  // Catch-all
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
