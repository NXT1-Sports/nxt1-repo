/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts,scss}',
    './src/index.html',
    '../../packages/core/src/**/*.{ts,html}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
          DEFAULT: 'var(--color-primary-600)',
        },
        // Secondary colors
        secondary: {
          50: 'var(--color-secondary-50)',
          100: 'var(--color-secondary-100)',
          200: 'var(--color-secondary-200)',
          300: 'var(--color-secondary-300)',
          400: 'var(--color-secondary-400)',
          500: 'var(--color-secondary-500)',
          600: 'var(--color-secondary-600)',
          700: 'var(--color-secondary-700)',
          800: 'var(--color-secondary-800)',
          900: 'var(--color-secondary-900)',
          DEFAULT: 'var(--color-secondary-600)',
        },
        // Semantic colors
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        // Surface colors
        surface: {
          100: 'var(--color-surface-100, #161616)',
          200: 'var(--color-surface-200, #1a1a1a)',
          primary: 'var(--color-surface-primary)',
          secondary: 'var(--color-surface-secondary)',
          tertiary: 'var(--color-surface-tertiary)',
        },
        // Text colors
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          inverse: 'var(--color-text-inverse)',
        },
        // Border colors
        border: {
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
        },
        // Ionic colors for mobile
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
      spacing: {
        xs: 'var(--spacing-xs)',
        sm: 'var(--spacing-sm)',
        md: 'var(--spacing-md)',
        lg: 'var(--spacing-lg)',
        xl: 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      fontFamily: {
        sans: ['var(--font-family-primary)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-family-mono)', 'monospace'],
        brand: ['var(--font-family-brand, system-ui)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['var(--font-size-xs)', { lineHeight: 'var(--line-height-tight)' }],
        sm: ['var(--font-size-sm)', { lineHeight: 'var(--line-height-tight)' }],
        base: ['var(--font-size-base)', { lineHeight: 'var(--line-height-normal)' }],
        lg: ['var(--font-size-lg)', { lineHeight: 'var(--line-height-normal)' }],
        xl: ['var(--font-size-xl)', { lineHeight: 'var(--line-height-normal)' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: 'var(--line-height-snug)' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: 'var(--line-height-snug)' }],
        '4xl': ['var(--font-size-4xl)', { lineHeight: 'var(--line-height-tight)' }],
      },
      boxShadow: {
        sm: 'var(--elevation-sm)',
        md: 'var(--elevation-md)',
        lg: 'var(--elevation-lg)',
        xl: 'var(--elevation-xl)',
      },
      transitionDuration: {
        fast: 'var(--motion-duration-fast)',
        normal: 'var(--motion-duration-normal)',
        slow: 'var(--motion-duration-slow)',
      },
      scale: {
        98: '0.98',
      },
    },
  },
  plugins: [
    // Add Tailwind plugins as needed
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
  // Important for Ionic components
  corePlugins: {
    preflight: false, // Disable Tailwind's base styles to avoid conflicts with Ionic
  },
};
