/**
 * @fileoverview Shared Assets Index
 * @module @nxt1/design-tokens/assets
 *
 * Centralized asset paths for cross-platform consistency.
 * These paths are relative to each app's assets folder after build.
 *
 * Build Process:
 * 1. Apps copy from design-tokens/assets to their own assets/shared/
 * 2. Apps reference via ASSET_PATHS constants
 *
 * @example
 * ```typescript
 * import { LOGO_PATHS } from '@nxt1/design-tokens/assets';
 *
 * // In component template
 * <img [src]="LOGO_PATHS.main" alt="NXT1 Logo" />
 * ```
 */

// ============================================
// LOGO ASSETS
// ============================================

/**
 * Logo asset paths relative to app's assets/shared/ folder.
 * Apps should copy design-tokens/assets/logo to assets/shared/logo/
 */
export const LOGO_PATHS = {
  /** Main logo (AVIF) - Primary brand logo (with green accent) */
  main: 'assets/shared/logo/nxt1_logo.avif',

  /** Main logo (AVIF) - Modern format, smaller size */
  mainAvif: 'assets/shared/logo/nxt1_logo.avif',

  /** White logo (PNG) - For dark backgrounds and custom themes */
  white: 'assets/shared/logo/nxt1-whitelogo.png',

  /** Lightning bolt icon - NXT1 brand icon */
  icon: 'assets/shared/logo/nxt1_icon.png',

  /** Lightning bolt icon - small variant (alias for compatibility) */
  boltSmall: 'assets/shared/logo/nxt1_icon.png',
} as const;

/**
 * Logo dimensions for proper sizing
 */
export const LOGO_DIMENSIONS = {
  main: { width: 600, height: 180 },
  icon: { width: 32, height: 32 },
} as const;

// ============================================
// SHARED IMAGE ASSETS
// ============================================

/**
 * Shared people image paths relative to app's assets/shared/ folder.
 * Apps copy design-tokens/assets/images to assets/shared/images/
 */
export const IMAGE_PATHS = {
  athlete1: 'assets/shared/images/athlete-1.png',
  athlete2: 'assets/shared/images/athlete-2.png',
  athlete3: 'assets/shared/images/athlete-3.png',
  athlete4: 'assets/shared/images/athlete-4.png',
  athlete5: 'assets/shared/images/athlete-5.png',
  coach1: 'assets/shared/images/coach-1.png',
  coach2: 'assets/shared/images/coach-2.png',
  coach3: 'assets/shared/images/coach-3.png',
  coach4: 'assets/shared/images/coach-4.png',
  highlightPlaceholder: 'assets/shared/images/higlight-placeholder.png',
} as const;

/**
 * Programs page image paths relative to app's assets/shared/images/ folder.
 */
export const PROGRAM_PAGE_IMAGE_PATHS = {
  athleteBriefs: 'assets/shared/images/program-page-images/athlete-briefs.png',
  emailsDrafted: 'assets/shared/images/program-page-images/emails-drafted.png',
  filmPull: 'assets/shared/images/program-page-images/film-pull.png',
  graphicSet: 'assets/shared/images/program-page-images/graphic-set.png',
  highlightReels: 'assets/shared/images/program-page-images/highlight-reels.png',
  offerWatch: 'assets/shared/images/program-page-images/offer-watch.png',
  parentUpdate: 'assets/shared/images/program-page-images/parent-update.png',
  playbook: 'assets/shared/images/program-page-images/playbook.png',
  profileAnalysis: 'assets/shared/images/program-page-images/profile-analysis.png',
  rosterIntake: 'assets/shared/images/program-page-images/roster-intake.png',
  scoutReports: 'assets/shared/images/program-page-images/scout-reports.png',
  spotlightDrop: 'assets/shared/images/program-page-images/spotlight-drop.png',
} as const;

// ============================================
// ICON REGISTRY
// ============================================

/**
 * Shared inline SVG brand marks.
 */
export * from './logo/agent-x-logo.constants';

/**
 * Inline SVG icon definitions.
 * Import from @nxt1/design-tokens/assets/icons for full type definitions.
 */
export * from './icons';

// ============================================
// TYPE EXPORTS
// ============================================

export type LogoPath = keyof typeof LOGO_PATHS;
export type LogoDimension = keyof typeof LOGO_DIMENSIONS;
export type ImagePath = keyof typeof IMAGE_PATHS;
export type ProgramPageImagePath = keyof typeof PROGRAM_PAGE_IMAGE_PATHS;
