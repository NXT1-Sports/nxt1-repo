/**
 * @fileoverview Archived Marketing Routes — MVP Bundle Optimization
 * @module @nxt1/web/routes/archived
 *
 * These routes are intentionally disabled to reduce bundle size during MVP phase.
 * They are fully functional and can be re-enabled by copying the appropriate
 * route object(s) back to app.routes.ts.
 *
 * Re-enabling Routes:
 * 1. Find the desired route(s) in this file
 * 2. Copy the entire route object (including the comment)
 * 3. Paste into app.routes.ts at the appropriate location
 * 4. The route will be automatically bundled by Angular's lazy-loading system
 *
 * Module dependencies are preserved — just add the route and it works.
 */

/**
 * ============================================
 * PUBLIC SEO PAGES (Disabled for MVP)
 * ============================================
 * These are public pages optimized for search engines.
 * Enable when you want public-facing content available.
 */
export const PUBLIC_SEO_ROUTES = [
  // The former /team/:slug web route depended on a retired shell wrapper.
  // Keep the rest of this archive file intact, but do not re-enable that route
  // without rebuilding its web entry point.
];

/**
 * ============================================
 * ATHLETE MARKETING ROUTES
 * ============================================
 * Enable when launching athlete-focused features.
 * This section includes all athlete discovery, profile, and content features.
 */
export const ATHLETE_ROUTES = [
  // Athletes - Student-Athlete Intelligence & Discovery
  {
    path: 'athletes',
    loadChildren: () => import('./marketing/athletes/athletes.routes'),
  },

  // Super Profiles - Interactive Profile Breakdown + Athlete Landing
  {
    path: 'super-profiles',
    loadChildren: () => import('./marketing/super-profiles/super-profiles.routes'),
  },

  // Recruiting Athletes - Recruiting Radar & Signals
  {
    path: 'recruiting-athletes',
    loadChildren: () => import('./marketing/recruiting-athletes/recruiting-athletes.routes'),
  },

  // Content Creation for Athletes
  {
    path: 'content-creation-athletes',
    loadChildren: () =>
      import('./marketing/content-creation-athletes/content-creation-athletes.routes'),
  },

  // Media & Coverage for Athletes
  {
    path: 'media-coverage',
    loadChildren: () => import('./marketing/media-coverage/media-coverage.routes'),
  },

  // AI for Athletes - Intelligent Outreach & Profile Distribution
  {
    path: 'ai-athletes',
    loadChildren: () => import('./marketing/ai-athletes/ai-athletes.routes'),
  },

  // NIL - NIL & Monetization campaign page
  {
    path: 'nil',
    loadChildren: () => import('./marketing/nil/nil.routes'),
  },
];

/**
 * ============================================
 * COACH/PROGRAM MARKETING ROUTES
 * ============================================
 * Enable when expanding coach/program features beyond team-platform.
 */
export const COACH_ROUTES = [
  // College Coaches - Prospect Discovery & Management Tools (canonical)
  {
    path: 'college-coaches',
    loadChildren: () => import('./marketing/coaches/coaches.routes'),
  },

  // Legacy alias — redirects to /college-coaches
  {
    path: 'coaches',
    pathMatch: 'full',
    redirectTo: 'college-coaches',
  },
];

/**
 * ============================================
 * FAMILY/SUPPORTER MARKETING ROUTES
 * ============================================
 * Enable when launching family/parent/supporter features.
 */
export const FAMILY_ROUTES = [
  // Parents - Family Recruiting Dashboard
  {
    path: 'parents',
    loadChildren: () => import('./marketing/parents/parents.routes'),
  },
];

/**
 * ============================================
 * SCOUT/EVALUATOR MARKETING ROUTES
 * ============================================
 * Enable when launching scout/evaluator tools.
 */
export const SCOUT_ROUTES = [
  // Scouts - Scouting & Evaluation Tools
  {
    path: 'scouts',
    loadChildren: () => import('./marketing/scouts/scouts.routes'),
  },
];

/**
 * ============================================
 * SPORT-VERTICAL MARKETING ROUTES
 * ============================================
 * Enable when launching sport-specific landing pages.
 * Single component (sport-landing.component.ts), config-driven via route data.
 *
 * Pattern: `/football`, `/basketball`, `/soccer`, etc.
 * Add new sports by copying one of these entries and changing:
 * - path: 'sport-name'
 * - data: { sport: 'sport-name' }
 */
export const SPORT_LANDING_ROUTES = [
  {
    path: 'football',
    data: { sport: 'football' },
    loadChildren: () => import('./marketing/sport-landing/sport-landing.routes'),
  },
  {
    path: 'basketball',
    data: { sport: 'basketball' },
    loadChildren: () => import('./marketing/sport-landing/sport-landing.routes'),
  },
];

/**
 * ============================================
 * DEPRECATED/LEGACY ROUTES
 * ============================================
 * Kept for reference but generally should not be re-enabled.
 * These were superseded by the new MVP routing strategy.
 */
export const DEPRECATED_ROUTES = [
  // Team Profile - Public Team Pages (strict canonical route)
  // Canonical URL: /team/:slug/:teamCode (e.g. /team/akron-buchtel/57L791)
  // DEPRECATED: Redirects to /agent-x. Consider removing entirely if not needed for SEO.
  {
    path: 'team/:slug/:teamCode',
    redirectTo: 'agent-x',
  },
];

/**
 * ============================================
 * COMPLETE LEGACY MARKETING CONFIG
 * ============================================
 * If you need to restore all previous marketing routes at once,
 * uncomment this and merge with app.routes.ts children array:
 */

/*
// Full legacy configuration (all routes combined):
export const LEGACY_MARKETING_ROUTES: Routes = [
  ...PUBLIC_SEO_ROUTES,
  ...ATHLETE_ROUTES,
  ...COACH_ROUTES,
  ...FAMILY_ROUTES,
  ...SCOUT_ROUTES,
  ...SPORT_LANDING_ROUTES,
  ...DEPRECATED_ROUTES,
];
*/
