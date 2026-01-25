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

  /** Success/Checkmark circle icon */
  checkmarkCircle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' }, { d: 'M9 12l2 2 4-4' }],
  },

  /** Warning/Caution icon */
  warning: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
      },
      { d: 'M12 9v4' },
      { d: 'M12 17h.01' },
    ],
  },

  /** Info/Information circle icon */
  infoCircle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M12 16v-4' },
      { d: 'M12 8h.01' },
    ],
  },

  /** Checkmark icon */
  checkmark: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z' }],
  },

  /** Arrow right icon */
  arrowRight: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z' }],
  },

  /** Close/X icon */
  close: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M18 6L6 18' }, { d: 'M6 6l12 12' }],
  },

  /** Chevron down icon */
  chevronDown: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M6 9l6 6 6-6' }],
  },

  /** Chevron up icon */
  chevronUp: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M18 15l-6-6-6 6' }],
  },

  /** Chevron right icon */
  chevronRight: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M9 18l6-6-6-6' }],
  },

  /** Chevron left icon */
  chevronLeft: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M15 18l-6-6 6-6' }],
  },
} as const;

// ============================================
// ROLE ICONS (Onboarding User Type Selection)
// ============================================

/**
 * Role icons for onboarding user type selection.
 * Match the role types from @nxt1/core/api/onboarding.
 */
export const ROLE_ICONS = {
  /** Athlete - Running person icon */
  athlete: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z',
      },
    ],
  },

  /** Coach - Clipboard/strategy icon */
  coach: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm10 16H4V8h16v12z',
      },
      { d: 'M13 10h-2v3H8v2h3v3h2v-3h3v-2h-3v-3z' },
    ],
  },

  /** Parent - Family icon */
  parent: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.01 2.01 0 0 0 18.06 7h-.12a2 2 0 0 0-1.9 1.37l-.86 2.58c1.08.6 1.82 1.73 1.82 3.05v8h3zm-7.5-10.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6h1.5v7h4zm6.5 0v-4h1v-4c0-.82-.68-1.5-1.5-1.5h-2c-.82 0-1.5.68-1.5 1.5v4h1v4h3z',
      },
    ],
  },

  /** Scout - Search/magnifying glass icon */
  scout: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
      },
    ],
  },

  /** Media - Camera/video icon */
  media: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
      },
    ],
  },

  /** Fan - Megaphone/cheering icon */
  fan: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
      },
      {
        d: 'M18 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
      },
      {
        d: 'M6 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
      },
    ],
  },

  /** Service - Handshake/business icon */
  service: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12.22 19.85c-.18.18-.5.21-.71 0L3 11.41V8.59l1.77 1.77 3.54-3.54-2.83-2.83L3 6.47v-.88C3 4.71 3.71 4 4.59 4h4.23c.53 0 1.04.21 1.41.59l1.06 1.06-4.95 4.95 6.24 6.24c.97-.97 2.54-.97 3.54 0l.53-.53L21 20.59v.88c0 .88-.71 1.59-1.59 1.59h-4.23c-.53 0-1.04-.21-1.41-.59l-1.55-1.62z',
      },
      { d: 'M21 6.47l-2.48-2.48-3.54 3.54 2.83 2.83L21 7.12V6.47z' },
    ],
  },

  /** College Coach - Graduation cap with clipboard */
  'college-coach': {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
        fill: 'currentColor',
      },
    ],
  },

  /** Director - Organization/building icon */
  director: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z',
      },
    ],
  },

  /** Recruiting Service - Target with star */
  'recruiting-service': {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
      },
      {
        d: 'M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
      },
      { d: 'M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
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
 * Complete icon registry combining UI, brand, and role icons.
 * Use this for type-safe icon name references.
 */
export const ICONS = {
  ...UI_ICONS,
  ...BRAND_ICONS,
  ...ROLE_ICONS,
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

/** Role icon names only (onboarding) */
export type RoleIconName = keyof typeof ROLE_ICONS;

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
