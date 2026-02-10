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

  /** Double checkmark icon (mark all as read / done-all) */
  checkmarkDone: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z',
      },
    ],
  },

  /** Verified badge icon (checkmark in circle/shield) */
  verified: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
      },
    ],
  },

  /** Arrow right icon */
  arrowRight: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z' }],
  },

  /** Arrow forward icon (right arrow without stem) */
  arrowForward: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M5 12h14' }, { d: 'M12 5l7 7-7 7' }],
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

  /** Home icon (outline) - for navigation/tab bars */
  home: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }, { d: 'M9 22V12h6v10' }],
  },

  /** Home filled icon - for active navigation state */
  homeFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12.71 2.29a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 1.42 1.42L4 12.41V21a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-5h2v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8.59l.29.29a1 1 0 0 0 1.42-1.42l-9-9z',
      },
    ],
  },

  /** Compass/Discover icon (outline) - for exploration */
  compass: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z' },
    ],
  },

  /** Compass filled icon - for active discover state */
  compassFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.66 5.34l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
      },
      { d: 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' },
    ],
  },

  /** Trophy icon (outline) - for rankings/awards */
  trophy: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M7 8h10M6 2h12v6a6 6 0 0 1-12 0V2z' },
      { d: 'M6 8H4a2 2 0 0 0 0 4h2' },
      { d: 'M18 8h2a2 2 0 0 1 0 4h-2' },
      { d: 'M12 14v4m0 0H9l-1 4h8l-1-4h-3z' },
    ],
  },

  /** Graduation cap icon - for recruiting/colleges */
  graduationCap: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M22 10l-10-5-10 5 10 5 10-5z' }, { d: 'M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5' }],
  },

  /** Search icon (outline) - for search functionality */
  search: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' }, { d: 'M21 21l-4.35-4.35' }],
  },

  /** Search with sparkle icon - AI-powered search */
  searchSparkle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' },
      { d: 'M21 21l-4.35-4.35' },
      { d: 'M15 3l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4L15 3z' },
    ],
  },

  /** AI Search icon - magnifying glass with multiple sparkles (from ai-search-icon.svg) */
  aiSearch: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      // Magnifying glass circle (slightly smaller to accommodate sparkles)
      { d: 'M10 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z' },
      // Handle
      { d: 'M15.5 16.5l5 5' },
      // Single large sparkle (upper-right of lens)
      {
        d: 'M14.2 1.8L16.6 6.2L21 8.6L16.6 11L14.2 15.4L11.8 11L7.4 8.6L11.8 6.2Z',
        fill: 'currentColor',
        stroke: 'none',
      },
    ],
  },

  /** Search filled icon - for active search state */
  searchFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
      },
    ],
  },

  /** User/Profile icon (outline) - for profile navigation */
  user: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
      { d: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    ],
  },

  /** User/Profile filled icon - for active profile state */
  userFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      { d: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z' },
      { d: 'M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2h16z' },
    ],
  },

  /** Sparkles/AI icon (outline) - for AI features */
  sparkles: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707',
      },
      { d: 'M12 8l1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5L12 8z' },
    ],
  },

  /** Sparkles/AI filled icon - for active AI state */
  sparklesFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 16a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm10-6a1 1 0 0 1-1 1h-2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zM6 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zm13.071 5.657a1 1 0 0 1-1.414 0l-1.414-1.414a1 1 0 1 1 1.414-1.414l1.414 1.414a1 1 0 0 1 0 1.414zM7.757 7.757a1 1 0 0 1-1.414 0L4.93 6.343a1 1 0 0 1 1.414-1.414l1.414 1.414a1 1 0 0 1 0 1.414zm10.486 0a1 1 0 0 1 0-1.414l1.414-1.414a1 1 0 1 1 1.414 1.414l-1.414 1.414a1 1 0 0 1-1.414 0zM7.757 16.243a1 1 0 0 1 0 1.414l-1.414 1.414a1 1 0 0 1-1.414-1.414l1.414-1.414a1 1 0 0 1 1.414 0z',
      },
      {
        d: 'M12 7a1 1 0 0 1 .894.553l1.382 2.764 2.764 1.382a1 1 0 0 1 0 1.79l-2.764 1.382-1.382 2.764a1 1 0 0 1-1.789 0l-1.382-2.765-2.764-1.382a1 1 0 0 1 0-1.789l2.764-1.382 1.382-2.764A1 1 0 0 1 12 7z',
      },
    ],
  },

  /** Lightning bolt icon (outline) - for AI/energy features */
  bolt: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' }],
  },

  /** Lightning bolt filled icon - for active AI state */
  boltFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' }],
  },

  /** Plus icon (outline) */
  plus: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M12 5v14' }, { d: 'M5 12h14' }],
  },

  /** Plus circle icon - for action buttons */
  plusCircle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' }, { d: 'M12 8v8' }, { d: 'M8 12h8' }],
  },

  /** Plus circle filled icon */
  plusCircleFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z',
      },
    ],
  },

  /** Bell/Notification icon (outline) */
  bell: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' },
      { d: 'M13.73 21a2 2 0 0 1-3.46 0' },
    ],
  },

  /** Bell filled icon */
  bellFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2a6 6 0 0 0-6 6c0 7-3 9-3 9h18s-3-2-3-9a6 6 0 0 0-6-6z',
      },
      {
        d: 'M13.73 21a2 2 0 0 1-3.46 0',
      },
    ],
  },

  /** Settings/Gear icon (outline) */
  settings: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
      {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
      },
    ],
  },

  /** Settings filled icon */
  settingsFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
      },
    ],
  },

  /** Help/Question mark circle icon (outline) */
  help: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' },
      { d: 'M12 17h.01' },
    ],
  },

  /** Help filled icon */
  helpFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
      },
    ],
  },

  /** Logout/Sign out icon (outline) */
  logout: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
      { d: 'M16 17l5-5-5-5' },
      { d: 'M21 12H9' },
    ],
  },

  /** Logout filled icon */
  logoutFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
      },
    ],
  },

  /** Menu/Hamburger icon (outline) */
  menu: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M3 12h18' }, { d: 'M3 6h18' }, { d: 'M3 18h18' }],
  },

  /** Menu filled icon (dots) */
  menuDots: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      { d: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z' },
      { d: 'M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
      { d: 'M12 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
    ],
  },

  /** Messages/Chat icon (outline) */
  messages: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
      },
    ],
  },

  /** Messages filled icon */
  messagesFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
      },
    ],
  },

  /** Bar chart/Analytics icon (outline) */
  barChart: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M18 20V10' }, { d: 'M12 20V4' }, { d: 'M6 20v-6' }],
  },

  /** Bar chart/Analytics filled icon */
  barChartFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zM16.2 13H19v6h-2.8z' }],
  },

  /** Headset/Support icon (outline) */
  headset: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M3 18v-6a9 9 0 0 1 18 0v6' },
      { d: 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z' },
      { d: 'M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z' },
    ],
  },

  /** Phone/Contact icon (outline) */
  phone: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
      },
    ],
  },

  /** Switch/Swap icon (outline) - for profile switching */
  switchHorizontal: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M16 3l4 4-4 4' }, { d: 'M20 7H4' }, { d: 'M8 21l-4-4 4-4' }, { d: 'M4 17h16' }],
  },

  /** Users/Group icon (outline) - for teams/groups */
  users: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
      { d: 'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
      { d: 'M23 21v-2a4 4 0 0 0-3-3.87' },
      { d: 'M16 3.13a4 4 0 0 1 0 7.75' },
    ],
  },

  /** Document/File text icon (outline) - for reports/documents */
  documentText: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
      { d: 'M14 2v6h6' },
      { d: 'M16 13H8' },
      { d: 'M16 17H8' },
      { d: 'M10 9H8' },
    ],
  },

  /** Pencil/Edit icon (outline) */
  pencil: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' }],
  },

  /** More horizontal (3 dots) icon - for menus */
  moreHorizontal: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      { d: 'M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
      { d: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
      { d: 'M18 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
    ],
  },

  /** Moon icon (outline) - for dark mode toggle */
  moon: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }],
  },

  /** Sun icon (outline) - for light mode toggle */
  sun: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 1v2' },
      { d: 'M12 21v2' },
      { d: 'M4.22 4.22l1.42 1.42' },
      { d: 'M18.36 18.36l1.42 1.42' },
      { d: 'M1 12h2' },
      { d: 'M21 12h2' },
      { d: 'M4.22 19.78l1.42-1.42' },
      { d: 'M18.36 5.64l1.42-1.42' },
      { d: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z' },
    ],
  },

  /** Person icon (alias for user) - profile */
  person: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
      { d: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    ],
  },

  /** Smartphone/Device icon - for system theme option */
  smartphone: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z' },
      { d: 'M12 18h.01' },
    ],
  },

  /** Contrast icon - half circle for theme switching */
  contrast: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' }, { d: 'M12 2v20' }],
  },

  /** Color palette icon - for theme/color options */
  colorPalette: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
      },
    ],
  },

  /** Football (American) icon - for sport themes */
  football: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M6 6c0 0 2-4 6-4s6 4 6 4c0 0 4 2 4 6s-4 6-4 6c0 0-2 4-6 4s-6-4-6-4c0 0-4-2-4-6s4-6 4-6z',
      },
      { d: 'M12 8v8' },
      { d: 'M9 10l3-2 3 2' },
      { d: 'M9 14l3 2 3-2' },
    ],
  },

  /** Basketball icon - for sport themes */
  basketball: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z' },
      { d: 'M12 2c-2.5 2.6-4 5.7-4 10s1.5 7.4 4 10' },
      { d: 'M12 2c2.5 2.6 4 5.7 4 10s-1.5 7.4-4 10' },
      { d: 'M2 12c3.5-2 7-2 10 0s6.5 2 10 0' },
    ],
  },

  /** Soccer icon - for sport themes */
  soccer: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z' },
      { d: 'M12 6.5l3.2 2.3-1.2 3.8H9.9L8.6 8.8 12 6.5z' },
      { d: 'M12 6.5V2' },
      { d: 'M15.2 8.8l3.6-1.6' },
      { d: 'M8.6 8.8L5 7.2' },
      { d: 'M9.9 12.6l-1.8 3.6' },
      { d: 'M14 12.6l1.8 3.6' },
    ],
  },

  /** Volleyball icon - for sport themes */
  volleyball: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20z' },
      { d: 'M4 9c4 3 12 3 16 0' },
      { d: 'M4 15c3-2 6-3 8-3s5 1 8 3' },
      { d: 'M8 4c1.5 2.5 2.5 5 2.5 8s-1 5.5-2.5 8' },
      { d: 'M16 4c-1.5 2.5-2.5 5-2.5 8s1 5.5 2.5 8' },
    ],
  },

  /** Lacrosse icon - for sport themes */
  lacrosse: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M6 20l8-8' },
      { d: 'M14 12l3 3' },
      { d: 'M18 6a2 2 0 1 0 0-4a2 2 0 0 0 0 4z' },
      { d: 'M9 17l3 3' },
    ],
  },

  /** Track & field icon - for sport themes */
  track: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M7 4h10a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z' },
      { d: 'M9 7h6a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z' },
    ],
  },

  /** Baseball icon - for sport themes */
  baseball: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M4.93 4.93c1.53 1.53 2.5 3.53 2.5 5.57s-.97 4.04-2.5 5.57' },
      { d: 'M19.07 4.93c-1.53 1.53-2.5 3.53-2.5 5.57s.97 4.04 2.5 5.57' },
    ],
  },

  /** Flame/Fire icon - for streaks, hot items */
  flame: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 23c-4.97 0-9-4.03-9-9 0-3.53 2.04-6.58 5-8.05 0 0-.5 3.05 2 5.05 0-4 3-7 3-7s3 3 3 7c2.5-2 2-5.05 2-5.05 2.96 1.47 5 4.52 5 8.05 0 4.97-4.03 9-9 9zm0-4c1.66 0 3-1.34 3-3 0-1.12-.61-2.1-1.5-2.63 0 0 .15.88-.5 1.63-.35-.75-1-1.5-1-1.5s-1 .75-1 1.5c-.65-.75-.5-1.63-.5-1.63-.89.53-1.5 1.51-1.5 2.63 0 1.66 1.34 3 3 3z',
      },
    ],
  },

  /** Chat bubble/Comment icon - for messages */
  chatBubble: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
      },
    ],
  },

  /** Share icon - for sharing content */
  share: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' },
      { d: 'M16 6l-4-4-4 4' },
      { d: 'M12 2v13' },
    ],
  },

  /** Bookmark icon - for saving content */
  bookmark: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' }],
  },

  /** Bookmark filled icon */
  bookmarkFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M17 3H7a2 2 0 0 0-2 2v16l7-5 7 5V5a2 2 0 0 0-2-2z' }],
  },

  /** Heart icon - for likes */
  heart: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
      },
    ],
  },

  /** Heart filled icon */
  heartFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
      },
    ],
  },

  /** Play icon - for videos */
  play: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [{ d: 'M5 4l14 8-14 8V4z' }],
  },

  /** Play circle icon - for video overlays */
  playCircle: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l6 4.5-6 4.5z',
      },
    ],
  },

  /** Location/Map pin icon */
  location: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z' },
      { d: 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
    ],
  },

  /** Trash/Delete icon */
  trash: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M3 6h18' },
      { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
    ],
  },

  /** School/Education icon */
  school: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M22 10l-10-5-10 5 10 5 10-5z' },
      { d: 'M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5' },
      { d: 'M22 10v6' },
    ],
  },

  /** Ribbon/Award icon */
  ribbon: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3L12 14l-4.8 2.6.9-5.3-3.8-3.7 5.3-.8L12 2z' },
      { d: 'M8 17l-3 5 3-1.5L11 22l-1-5' },
      { d: 'M16 17l3 5-3-1.5L13 22l1-5' },
    ],
  },

  /** Star icon (outline) - for premium badges, ratings */
  star: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      {
        d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
      },
    ],
  },

  /** Star filled icon */
  starFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
      },
    ],
  },

  /** Whistle icon - for coach badges */
  whistle: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M2 8l5 5' },
      {
        d: 'M7 13a7 7 0 1 0 0-1l-5-5V4h4l5 5a7 7 0 0 0-4 9z',
      },
      { d: 'M14 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z' },
    ],
  },

  /** Trending up icon - for positive metrics */
  trendingUp: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M23 6l-9.5 9.5-5-5L1 18' }, { d: 'M17 6h6v6' }],
  },

  /** Trending down icon - for negative metrics */
  trendingDown: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M23 18l-9.5-9.5-5 5L1 6' }, { d: 'M17 18h6v-6' }],
  },

  /** Refresh icon - for reload/retry actions */
  refresh: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M23 4v6h-6' },
      { d: 'M1 20v-6h6' },
      { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
    ],
  },

  /** Video camera icon - for video content */
  videocam: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M23 7l-7 5 7 5V7z' },
      { d: 'M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
    ],
  },

  /** Download icon - for downloads/exports */
  download: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
      { d: 'M7 10l5 5 5-5' },
      { d: 'M12 15V3' },
    ],
  },

  /** Image/Photo icon - for image content */
  image: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z' },
      { d: 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
      { d: 'M21 15l-5-5L5 21' },
    ],
  },

  /** Newspaper/Article icon - for news/article content */
  newspaper: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
      { d: 'M7 9h4v4H7z' },
      { d: 'M13 9h4' },
      { d: 'M13 13h4' },
      { d: 'M7 17h10' },
    ],
  },

  /** Repeat/Repost icon - for repost/loop actions */
  repeat: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M17 1l4 4-4 4' },
      { d: 'M3 11V9a4 4 0 0 1 4-4h14' },
      { d: 'M7 23l-4-4 4-4' },
      { d: 'M21 13v2a4 4 0 0 1-4 4H3' },
    ],
  },

  /** Flag icon (outline) - for reporting/flagging */
  flag: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [{ d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }, { d: 'M4 22v-7' }],
  },

  /** Flag filled icon */
  flagFilled: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M14.4 6l-.24-1.2c-.09-.46-.5-.8-.98-.8H6c-.55 0-1 .45-1 1v15c0 .55.45 1 1 1s1-.45 1-1v-5h5.6l.24 1.2c.09.47.5.8.98.8H19c.55 0 1-.45 1-1V7c0-.55-.45-1-1-1h-4.6z',
      },
    ],
  },

  /** Business/Building icon - for organizations/companies */
  business: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M3 21h18' },
      { d: 'M5 21V7l8-4v18' },
      { d: 'M19 21V11l-6-4' },
      { d: 'M9 9v.01' },
      { d: 'M9 12v.01' },
      { d: 'M9 15v.01' },
      { d: 'M9 18v.01' },
    ],
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
  /** NXT1 lightning icon (brand) */
  nxt1: {
    viewBox: '0 0 201.134 200.97',
    type: 'fill' as const,
    paths: [
      {
        d: 'M200.884 0.25l-76.506 83.264 17.3-3.925-141.428 121.131 87.041-87.905-17.892 3.07z',
        fill: 'currentColor',
      },
    ],
  },

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

  /** X (formerly Twitter) logo */
  twitter: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
        fill: 'currentColor',
      },
    ],
  },

  /** Instagram logo */
  instagram: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
        fill: 'currentColor',
      },
    ],
  },

  /** Facebook logo */
  facebook: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
        fill: 'currentColor',
      },
    ],
  },

  /** YouTube logo */
  youtube: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
        fill: 'currentColor',
      },
    ],
  },

  /** TikTok logo */
  tiktok: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
        fill: 'currentColor',
      },
    ],
  },

  /** LinkedIn logo */
  linkedin: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      {
        d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
        fill: 'currentColor',
      },
    ],
  },
} as const;

// ============================================
// ALIAS ICONS (Compatibility with legacy names)
// ============================================

/**
 * Alias names for compatibility with Ionicons-style identifiers.
 * Maps kebab-case and `-outline` suffixed names to NXT1 icon definitions.
 * Keeps legacy templates and constants working while using the design token registry.
 *
 * Naming convention:
 *   - Ionicons format: `icon-name-outline` → maps to camelCase UI icon
 *   - Kebab-case format: `icon-name` → maps to camelCase UI icon
 */
export const ALIAS_ICONS = {
  // ---- Alert / Status ----
  'alert-circle-outline': UI_ICONS.alertCircle,
  'checkmark-circle-outline': UI_ICONS.checkmarkCircle,

  // ---- Navigation / Arrows ----
  'arrow-back-outline': UI_ICONS.chevronLeft,
  'trending-up': UI_ICONS.trendingUp,
  'trending-down': UI_ICONS.trendingDown,
  'trending-up-outline': UI_ICONS.trendingUp,

  // ---- Home / Places ----
  'home-outline': UI_ICONS.home,
  'school-outline': UI_ICONS.school,
  'business-outline': UI_ICONS.business,
  'location-outline': UI_ICONS.location,

  // ---- Media ----
  'play-circle-outline': UI_ICONS.playCircle,
  'videocam-outline': UI_ICONS.videocam,
  'image-outline': UI_ICONS.image,

  // ---- Content ----
  'document-text-outline': UI_ICONS.documentText,
  'newspaper-outline': UI_ICONS.newspaper,
  'flag-outline': UI_ICONS.flag,
  'bookmark-outline': UI_ICONS.bookmark,

  // ---- Social / People ----
  'people-outline': UI_ICONS.users,
  'chatbubble-outline': UI_ICONS.chatBubble,
  'share-outline': UI_ICONS.share,
  'heart-outline': UI_ICONS.heart,

  // ---- Metrics / Analytics ----
  'analytics-outline': UI_ICONS.barChart,
  'bar-chart-outline': UI_ICONS.barChart,
  'eye-outline': UI_ICONS.eye,
  'star-outline': UI_ICONS.star,

  // ---- Actions ----
  'refresh-outline': UI_ICONS.refresh,
  'download-outline': UI_ICONS.download,
  'flash-outline': UI_ICONS.bolt,
  'repeat-outline': UI_ICONS.repeat,

  // ---- Awards ----
  'trophy-outline': UI_ICONS.trophy,
  'ribbon-outline': UI_ICONS.ribbon,

  // ---- Sports / Themes ----
  'sparkles-outline': UI_ICONS.sparkles,
  'football-outline': UI_ICONS.football,

  // ---- Semantic aliases (camelCase alternatives) ----
  /** Sports icon → athlete role icon (for avatar badges) */
  sports: ROLE_ICONS.athlete,
  /** People icon → users UI icon (for avatar badges) */
  people: UI_ICONS.users,
  /** Analytics icon → barChart UI icon */
  analytics: UI_ICONS.barChart,
  /** Flash icon → bolt UI icon */
  flash: UI_ICONS.bolt,
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
  ...ALIAS_ICONS,
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

/** Navigation tab bar icon names */
export type NavIconName =
  | 'home'
  | 'homeFilled'
  | 'compass'
  | 'compassFilled'
  | 'search'
  | 'searchFilled'
  | 'user'
  | 'userFilled'
  | 'sparkles'
  | 'sparklesFilled'
  | 'bolt'
  | 'boltFilled'
  | 'bell'
  | 'bellFilled'
  | 'plusCircle'
  | 'plusCircleFilled';

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
