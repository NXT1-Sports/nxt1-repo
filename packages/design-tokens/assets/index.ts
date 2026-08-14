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

/**
 * Product image paths relative to app's assets/shared/images/ folder.
 */
export const PRODUCT_IMAGE_PATHS = {
  agentXDesktop: 'assets/shared/images/product-images/Agent-X.png',
} as const;

/**
 * Partner team logo paths relative to app's assets/shared/images/ folder.
 */
export const PARTNER_TEAM_LOGO_PATHS = {
  aiNexxtLevelUClub: 'assets/shared/images/partner-teams/ai-nexxt-level-u-club.png',
  akronEastHs: 'assets/shared/images/partner-teams/akron-east-hs.webp',
  barbertonHs: 'assets/shared/images/partner-teams/barberton-hs.png',
  brushHs: 'assets/shared/images/partner-teams/brush-hs.webp',
  cantonMckinleyHs: 'assets/shared/images/partner-teams/canton-mckinley-hs.png',
  cantonSouthHs: 'assets/shared/images/partner-teams/canton-south-hs.png',
  carrolltonHs: 'assets/shared/images/partner-teams/carrollton-hs.png',
  centralValleyHs: 'assets/shared/images/partner-teams/central-valley-hs.png',
  crestviewHs: 'assets/shared/images/partner-teams/crestview-hs.png',
  dixieHeightsHs: 'assets/shared/images/partner-teams/dixie-heights-hs.png',
  fairbornHs: 'assets/shared/images/partner-teams/fairborn-hs.png',
  frederickDouglassHs: 'assets/shared/images/partner-teams/frederick-douglass-hs.png',
  garfieldHs: 'assets/shared/images/partner-teams/garfield-hs.png',
  georgeRogersClarkHs: 'assets/shared/images/partner-teams/george-rogers-clark-hs.webp',
  hooverHs: 'assets/shared/images/partner-teams/hoover-hs.png',
  keyserHs: 'assets/shared/images/partner-teams/keyser-hs.png',
  lakeHs: 'assets/shared/images/partner-teams/lake-hs.png',
  marlingtonHs: 'assets/shared/images/partner-teams/marlington-hs.png',
  martinCountyHs: 'assets/shared/images/partner-teams/martin-county-hs.png',
  masonCountyHs: 'assets/shared/images/partner-teams/mason-county-hs.png',
  nordoniaHs: 'assets/shared/images/partner-teams/nordonia-hs.png',
  perryPiratesHs: 'assets/shared/images/partner-teams/perry-pirates-hs.png',
  salemHs: 'assets/shared/images/partner-teams/salem-hs.png',
  sandyValleyHs: 'assets/shared/images/partner-teams/sandy-valley-hs.png',
  stVHs: 'assets/shared/images/partner-teams/st-v-hs.png',
  youngstownHs: 'assets/shared/images/partner-teams/youngstown-hs.png',
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
export type ProductImagePath = keyof typeof PRODUCT_IMAGE_PATHS;
export type PartnerTeamLogoPath = keyof typeof PARTNER_TEAM_LOGO_PATHS;
