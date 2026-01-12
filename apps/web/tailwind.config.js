/**
 * @fileoverview Tailwind CSS Configuration for NXT1 Web App
 * @module apps/web
 *
 * Uses shared @nxt1/config/tailwind preset for consistency with mobile app.
 * Web-specific customizations only where necessary.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Use shared preset for consistent design tokens
  presets: [require('@nxt1/config/tailwind')],

  content: [
    './src/**/*.{html,ts}',
    './src/index.html',
    // Shared packages
    '../../packages/ui/**/*.{ts,html}',
    '../../packages/core/src/**/*.{ts,html}',
  ],

  // Web app can use default Tailwind settings (preflight enabled)
  // All design tokens inherited from preset
};
