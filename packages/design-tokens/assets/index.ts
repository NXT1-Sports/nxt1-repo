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
} as const;

// ============================================
// ICON REGISTRY
// ============================================

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
