/**
 * @fileoverview NXT1 Icon Registry
 * @module @nxt1/design-tokens/assets/icons
 *
 * Centralized SVG icon definitions for cross-platform consistency.
 * All icons are inline SVG paths for zero network requests and tree-shaking.
 *
 * Icon Types:
 * - UI Icons: Stroke-based, monochrome (mail, lock, eye)
 * - Brand Icons: Multi-color, filled (Google, Apple, Microsoft)
 *
 * @example
 * ```typescript
 * import { ICONS } from '@nxt1/design-tokens/assets/icons';
 *
 * // Get icon definition
 * const mailIcon = ICONS.mail;
 *
 * // Render in template
 * <svg viewBox="0 0 24 24">
 *   <path [attr.d]="mailIcon.path" />
 * </svg>
 * ```
 */

// ============================================
// ICON TYPE DEFINITIONS
// ============================================

/**
 * Base icon definition with viewBox and paths
 */
export interface IconDefinition {
  /** SVG viewBox attribute */
  viewBox: string;
  /** Stroke width for stroke-based icons */
  strokeWidth?: number;
  /** Whether icon uses fill (default) or stroke */
  type?: 'fill' | 'stroke';
  /** Multi-color paths with fill colors */
  paths: ReadonlyArray<{ readonly d: string; readonly fill?: string; readonly stroke?: string }>;
}

// ============================================
// UI ICONS (Stroke-based, Monochrome)
// ============================================

/**
 * UI icons for forms, navigation, and interface elements.
 * All icons use stroke rendering with customizable color.
 */
export const UI_ICONS = {
  /** Email/Mail icon */
  mail: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z' },
      { d: 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' },
    ],
  },

  /** Lock/Password icon */
  lock: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6z' },
      { d: 'M7 11V7a5 5 0 0 1 10 0v4' },
    ],
  },

  /** Eye icon (show password) */
  eye: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' },
      { d: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
    ],
  },

  /** Eye-off icon (hide password) */
  eyeOff: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24',
      },
      { d: 'M1 1l22 22' },
    ],
  },

  /** Alert/Error icon */
  alertCircle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M12 8v4' },
      { d: 'M12 16h.01' },
    ],
  },
} as const;

// ============================================
// BRAND ICONS (Multi-color, Filled)
// ============================================

/**
 * Brand icons for social login providers.
 * These icons use specific brand colors and filled rendering.
 */
export const BRAND_ICONS = {
  /** Google logo (4-color) */
  google: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z',
        fill: '#4285F4',
      },
      {
        d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z',
        fill: '#34A853',
      },
      {
        d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z',
        fill: '#FBBC05',
      },
      {
        d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z',
        fill: '#EA4335',
      },
    ],
  },

  /** Apple logo (monochrome) */
  apple: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z',
        fill: 'currentColor',
      },
    ],
  },

  /** Microsoft logo (4-color squares) */
  microsoft: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      { d: 'M1 1h10v10H1z', fill: '#F25022' },
      { d: 'M1 13h10v10H1z', fill: '#00A4EF' },
      { d: 'M13 1h10v10H13z', fill: '#7FBA00' },
      { d: 'M13 13h10v10H13z', fill: '#FFB900' },
    ],
  },
} as const;

// ============================================
// COMBINED REGISTRY
// ============================================

/**
 * Complete icon registry combining UI and brand icons.
 * Use this for type-safe icon name references.
 */
export const ICONS = {
  ...UI_ICONS,
  ...BRAND_ICONS,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

/** Valid icon names from the registry */
export type IconName = keyof typeof ICONS;

/** UI icon names only */
export type UIIconName = keyof typeof UI_ICONS;

/** Brand icon names only */
export type BrandIconName = keyof typeof BRAND_ICONS;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get icon definition by name
 * @param name Icon name from registry
 * @returns Icon definition with paths and metadata
 */
export function getIcon(name: IconName): IconDefinition {
  return ICONS[name] as IconDefinition;
}

/**
 * Check if icon is a stroke-based icon
 * @param name Icon name
 * @returns True if icon should be rendered with stroke
 */
export function isStrokeIcon(name: IconName): boolean {
  const icon = ICONS[name] as IconDefinition;
  return icon.type === 'stroke';
}

/**
 * Check if icon is a filled/brand icon
 * @param name Icon name
 * @returns True if icon should be rendered with fill
 */
export function isFillIcon(name: IconName): boolean {
  const icon = ICONS[name] as IconDefinition;
  return icon.type === 'fill' || icon.type === undefined;
}
