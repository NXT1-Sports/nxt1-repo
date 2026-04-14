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
  // NOTE: path param must match profile.routes.ts where it's defined as ':param'
  {
    path: 'profile/:sport/:name/:unicode',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile/:param',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile',
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
    path: 'pulse',
    renderMode: RenderMode.Server,
  },
  {
    path: 'pulse/**',
    renderMode: RenderMode.Server,
  },
  // Legacy /news redirect
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
  /**
   * Team profile routes — Server-rendered for SEO (Open Graph, rich snippets).
   * Hydration mismatch fixed via slug-aware guard in TeamProfileService.
   */
  {
    path: 'team/:slug/:teamCode',
    renderMode: RenderMode.Server,
  },
  {
    path: 'team/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'team/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'team-platform',
    renderMode: RenderMode.Server,
  },
  {
    path: 'team-platform/**',
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
    path: 'content-creation-athletes',
    renderMode: RenderMode.Server,
  },
  {
    path: 'content-creation-athletes/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'media-coverage',
    renderMode: RenderMode.Server,
  },
  {
    path: 'media-coverage/**',
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

  // Add Sport / Add Team wizard
  {
    path: 'add-sport',
    renderMode: RenderMode.Server,
  },

  // Invite link landing — client-side only (immediate redirect, no SSR content)
  {
    path: 'join/:code',
    renderMode: RenderMode.Client,
  },

  // Catch-all
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
