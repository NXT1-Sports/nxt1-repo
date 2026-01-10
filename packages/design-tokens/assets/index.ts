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
  /** Main logo (PNG) - 800x240 */
  main: 'assets/shared/logo/logo.png',

  /** Main logo (AVIF) - Modern format, smaller size */
  mainAvif: 'assets/shared/logo/logo.avif',

  /** Logo with shadows effect */
  shadows: 'assets/shared/logo/logo_shadows.png',

  /** Smaller optimized version (600px width) */
  small: 'assets/shared/logo/logo_600.avif',

  /** Lightning bolt icon - standard */
  bolt: 'assets/shared/logo/lighting_bolt_new.png',

  /** Lightning bolt icon - small variant */
  boltSmall: 'assets/shared/logo/lighting_bolt_small.png',
} as const;

/**
 * Logo dimensions for proper sizing
 */
export const LOGO_DIMENSIONS = {
  main: { width: 800, height: 240 },
  small: { width: 600, height: 180 },
  bolt: { width: 64, height: 64 },
  boltSmall: { width: 32, height: 32 },
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type LogoPath = keyof typeof LOGO_PATHS;
export type LogoDimension = keyof typeof LOGO_DIMENSIONS;
