/**
 * @fileoverview NXT1 Shared Tailwind CSS Preset
 * @module @nxt1/config/tailwind
 *
 * Enterprise-grade Tailwind preset consuming design tokens from @nxt1/design-tokens.
 * Provides consistent styling across web, mobile, and shared packages.
 *
 * Architecture:
 * - Consumes design tokens from @nxt1/design-tokens (generated from JSON source)
 * - All values reference CSS custom properties with fallbacks
 * - Dark-mode first (matches NXT1 brand aesthetic)
 * - Framework-agnostic (works with Angular, React, vanilla)
 *
 * Token Cascade:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  tokens.json → build.mjs → dist/js/tokens.mjs              │
 * │                    ↓                                        │
 * │  Tailwind Config → References CSS vars with fallbacks      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```js
 * // apps/web/tailwind.config.js
 * module.exports = {
 *   presets: [require('@nxt1/config/tailwind')],
 *   content: ['./src/** /*.{html,ts}'],
 * }
 * ```
 */

// Import design tokens (generated from tokens.json)
let tokens;
try {
  // ESM dynamic import for generated tokens
  tokens = require('@nxt1/design-tokens');
} catch {
  // Fallback for environments that can't resolve the package
  tokens = {};
}

const {
  colors = {},
  spacing = {},
  typography = {},
  borderRadius = {},
  boxShadow = {},
  motion = {},
  zIndex = {},
} = tokens;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // ============================================
      // COLORS
      // Using imported tokens with fallback structure
      // ============================================
      colors: {
        // Primary brand colors - Volt Green (#ccff00)
        primary: colors.primary || {
          50: 'var(--nxt1-color-primary-50, #f4ffe0)',
          100: 'var(--nxt1-color-primary-100, #e8ffb3)',
          200: 'var(--nxt1-color-primary-200, #dcff80)',
          300: 'var(--nxt1-color-primary-300, #d4ff4d)',
          400: 'var(--nxt1-color-primary-400, #ccff00)',
          500: 'var(--nxt1-color-primary-500, #b8e600)',
          600: 'var(--nxt1-color-primary-600, #a3cc00)',
          700: 'var(--nxt1-color-primary-700, #8fb300)',
          800: 'var(--nxt1-color-primary-800, #7a9900)',
          900: 'var(--nxt1-color-primary-900, #668000)',
          DEFAULT: 'var(--nxt1-color-primary, #ccff00)',
        },

        // Secondary colors - Gold (#ffed00)
        secondary: colors.secondary || {
          50: 'var(--nxt1-color-secondary-50, #fffde0)',
          100: 'var(--nxt1-color-secondary-100, #fff9b3)',
          200: 'var(--nxt1-color-secondary-200, #fff580)',
          300: 'var(--nxt1-color-secondary-300, #fff14d)',
          400: 'var(--nxt1-color-secondary-400, #ffed00)',
          500: 'var(--nxt1-color-secondary-500, #e6d600)',
          600: 'var(--nxt1-color-secondary-600, #ccbe00)',
          700: 'var(--nxt1-color-secondary-700, #b3a600)',
          800: 'var(--nxt1-color-secondary-800, #998f00)',
          900: 'var(--nxt1-color-secondary-900, #807700)',
          DEFAULT: 'var(--nxt1-color-secondary, #e6d600)',
        },

        // Semantic status colors
        success: 'var(--nxt1-color-success, #22c55e)',
        warning: 'var(--nxt1-color-warning, #f59e0b)',
        error: 'var(--nxt1-color-error, #ef4444)',
        info: 'var(--nxt1-color-info, #3b82f6)',

        // Surface colors (cards, modals, containers)
        surface: {
          100: 'var(--nxt1-color-surface-100, #161616)',
          200: 'var(--nxt1-color-surface-200, #1a1a1a)',
          300: 'var(--nxt1-color-surface-300, #222222)',
          400: 'var(--nxt1-color-surface-400, #2a2a2a)',
          500: 'var(--nxt1-color-surface-500, #333333)',
          primary: 'var(--nxt1-color-surface-100, #161616)',
          secondary: 'var(--nxt1-color-surface-200, #1a1a1a)',
          tertiary: 'var(--nxt1-color-surface-300, #222222)',
        },

        // Background colors (page-level)
        bg: {
          primary: 'var(--nxt1-color-bg-primary, #0a0a0a)',
          secondary: 'var(--nxt1-color-bg-secondary, #121212)',
          tertiary: 'var(--nxt1-color-bg-tertiary, #1a1a1a)',
        },

        // Text colors
        text: {
          primary: 'var(--nxt1-color-text-primary, #ffffff)',
          secondary: 'var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7))',
          tertiary: 'var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5))',
          inverse: 'var(--nxt1-color-text-inverse, #0a0a0a)',
          disabled: 'var(--nxt1-color-text-disabled, rgba(255, 255, 255, 0.3))',
        },

        // Border colors
        border: {
          subtle: 'var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08))',
          DEFAULT: 'var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12))',
          primary: 'var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3))',
          strong: 'var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2))',
          // Backward compatibility
          secondary: 'var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2))',
        },

        // Glow effect color (for backgrounds) - uses theme-aware alpha primary
        glow: 'var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.15))',

        // Alpha transparency colors (theme-aware)
        alpha: {
          primary5: 'var(--nxt1-color-alpha-primary5, rgba(204, 255, 0, 0.05))',
          primary10: 'var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1))',
          primary20: 'var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2))',
          primary30: 'var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.3))',
          primary50: 'var(--nxt1-color-alpha-primary50, rgba(204, 255, 0, 0.5))',
        },
      },

      // ============================================
      // SPACING
      // ============================================
      spacing: {
        xs: 'var(--nxt1-spacing-1, 0.25rem)',
        sm: 'var(--nxt1-spacing-2, 0.5rem)',
        md: 'var(--nxt1-spacing-4, 1rem)',
        lg: 'var(--nxt1-spacing-6, 1.5rem)',
        xl: 'var(--nxt1-spacing-8, 2rem)',
        '2xl': 'var(--nxt1-spacing-12, 3rem)',
        '3xl': 'var(--nxt1-spacing-16, 4rem)',
      },

      // ============================================
      // BORDER RADIUS
      // ============================================
      borderRadius: {
        xs: 'var(--nxt1-radius-xs, 2px)',
        sm: 'var(--nxt1-radius-sm, 4px)',
        md: 'var(--nxt1-radius-default, 8px)',
        lg: 'var(--nxt1-radius-md, 12px)',
        xl: 'var(--nxt1-radius-lg, 16px)',
        '2xl': 'var(--nxt1-radius-xl, 24px)',
        full: 'var(--nxt1-radius-full, 9999px)',
      },

      // ============================================
      // TYPOGRAPHY
      // ============================================
      fontFamily: {
        sans: ['var(--nxt1-fontFamily-system, system-ui)', 'system-ui', 'sans-serif'],
        brand: ['var(--nxt1-fontFamily-brand, system-ui)', 'system-ui', 'sans-serif'],
        display: ['var(--nxt1-fontFamily-display, system-ui)', 'system-ui', 'sans-serif'],
        mono: ['var(--nxt1-fontFamily-mono, ui-monospace)', 'monospace'],
      },
      fontSize: {
        '2xs': ['var(--nxt1-fontSize-2xs, 0.625rem)', { lineHeight: '1.25' }],
        xs: ['var(--nxt1-fontSize-xs, 0.75rem)', { lineHeight: '1.25' }],
        sm: ['var(--nxt1-fontSize-sm, 0.875rem)', { lineHeight: '1.25' }],
        base: ['var(--nxt1-fontSize-base, 1rem)', { lineHeight: '1.5' }],
        lg: ['var(--nxt1-fontSize-lg, 1.25rem)', { lineHeight: '1.5' }],
        xl: ['var(--nxt1-fontSize-xl, 1.5rem)', { lineHeight: '1.5' }],
        '2xl': ['var(--nxt1-fontSize-2xl, 1.875rem)', { lineHeight: '1.375' }],
        '3xl': ['var(--nxt1-fontSize-3xl, 2.25rem)', { lineHeight: '1.375' }],
        '4xl': ['var(--nxt1-fontSize-4xl, 3rem)', { lineHeight: '1.25' }],
        '5xl': ['var(--nxt1-fontSize-5xl, 3.75rem)', { lineHeight: '1' }],
      },

      // ============================================
      // SHADOWS & EFFECTS
      // ============================================
      boxShadow: {
        sm: 'var(--nxt1-shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.5))',
        DEFAULT: 'var(--nxt1-shadow-default, 0 4px 6px rgba(0, 0, 0, 0.5))',
        md: 'var(--nxt1-shadow-md, 0 6px 12px rgba(0, 0, 0, 0.5))',
        lg: 'var(--nxt1-shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.5))',
        xl: 'var(--nxt1-shadow-xl, 0 16px 32px rgba(0, 0, 0, 0.5))',
        glow: 'var(--nxt1-glow-md, 0 0 16px var(--nxt1-color-alpha-primary50, rgba(204, 255, 0, 0.4)))',
        'glow-lg':
          'var(--nxt1-glow-lg, 0 0 24px var(--nxt1-color-alpha-primary50, rgba(204, 255, 0, 0.5)))',
        none: 'none',
      },

      // ============================================
      // TRANSITIONS & ANIMATIONS
      // ============================================
      transitionDuration: {
        fast: 'var(--nxt1-duration-fast, 100ms)',
        normal: 'var(--nxt1-duration-normal, 200ms)',
        slow: 'var(--nxt1-duration-slow, 300ms)',
      },
      transitionTimingFunction: {
        'ease-nxt1': 'var(--nxt1-ease-in-out, cubic-bezier(0.4, 0, 0.2, 1))',
        'ease-bounce': 'var(--nxt1-ease-bounce, cubic-bezier(0.68, -0.55, 0.265, 1.55))',
      },

      // ============================================
      // Z-INDEX LAYERS
      // ============================================
      zIndex: {
        dropdown: 'var(--nxt1-z-dropdown, 1000)',
        sticky: 'var(--nxt1-z-sticky, 1020)',
        fixed: 'var(--nxt1-z-fixed, 1030)',
        'modal-backdrop': 'var(--nxt1-z-modal-backdrop, 1040)',
        modal: 'var(--nxt1-z-modal, 1050)',
        popover: 'var(--nxt1-z-popover, 1060)',
        tooltip: 'var(--nxt1-z-tooltip, 1070)',
        toast: 'var(--nxt1-z-toast, 1080)',
      },

      // ============================================
      // ANIMATIONS
      // ============================================
      animation: {
        'spin-slow': 'spin 1s linear infinite',
        'pulse-glow': 'pulse-glow 8s ease-in-out infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-out': 'fadeOut 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', transform: 'translateX(-50%) scale(1)' },
          '50%': { opacity: '1', transform: 'translateX(-50%) scale(1.1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },

      // ============================================
      // UTILITY SCALES
      // ============================================
      scale: {
        98: '0.98',
        102: '1.02',
      },
      opacity: {
        8: '0.08',
        12: '0.12',
        15: '0.15',
      },
    },
  },
  plugins: [],
};
