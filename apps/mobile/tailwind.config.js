/**
 * @fileoverview Tailwind CSS Configuration for NXT1 Mobile App
 * @module apps/mobile
 *
 * Uses shared @nxt1/config/tailwind preset for consistency with web app.
 * Adds mobile-specific customizations for Ionic integration.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Use shared preset for consistent design tokens
  presets: [require('@nxt1/config/tailwind')],

  content: [
    './src/**/*.{html,ts,scss}',
    './src/index.html',
    // Shared packages
    '../../packages/ui/**/*.{ts,html}',
    '../../packages/core/src/**/*.{ts,html}',
  ],

  theme: {
    extend: {
      colors: {
        // Ionic platform colors (mobile-specific)
        ionic: {
          primary: 'var(--ion-color-primary)',
          secondary: 'var(--ion-color-secondary)',
          tertiary: 'var(--ion-color-tertiary)',
          success: 'var(--ion-color-success)',
          warning: 'var(--ion-color-warning)',
          danger: 'var(--ion-color-danger)',
          light: 'var(--ion-color-light)',
          medium: 'var(--ion-color-medium)',
          dark: 'var(--ion-color-dark)',
        },
      },
    },
  },

  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],

  // Critical for Ionic: disable Tailwind's base styles to avoid conflicts
  corePlugins: {
    preflight: false,
  },
};
