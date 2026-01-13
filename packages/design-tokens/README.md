# @nxt1/design-tokens

> **CSS-Only Design Token System** — Enterprise-grade tokens for web and mobile
> with Tailwind integration. No SCSS required.

---

## Overview

The NXT1 design token system provides a **single source of truth** for all
design values across web and mobile platforms using **pure CSS custom
properties** and **Tailwind CSS**.

### Key Principles

| Principle                  | Implementation                                   |
| -------------------------- | ------------------------------------------------ |
| **Single Source of Truth** | `tokens.json/` contains all design values (DTCG) |
| **CSS-Only**               | Pure CSS custom properties - no SCSS compilation |
| **Tailwind Integration**   | Preset maps tokens to Tailwind utility classes   |
| **Native Feel**            | Ionic theme integration for platform-adaptive UX |
| **Brand Consistency**      | Same colors, typography, spacing everywhere      |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SOURCE OF TRUTH                                    │
│                     packages/design-tokens/tokens.json/                      │
│  ┌─────────────────┬──────────────────────┬─────────────────────────────┐   │
│  │ primitive.json  │   semantic.json      │   component.json            │   │
│  │ (colors, fonts) │   (themes, aliases)  │   (button, input sizes)     │   │
│  └─────────────────┴──────────────────────┴─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │   build.mjs   │  ← npm run build
                            └───────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌────────────────────────┐                    ┌──────────────────────────────┐
│  Generated Outputs     │                    │  Tailwind Preset             │
│  ────────────────────  │                    │  ────────────────────────    │
│  dist/css/tokens.css   │                    │  packages/config/tailwind/   │
│  dist/css/themes/*.css │◄───────────────────│  preset.js                   │
│  dist/js/tokens.mjs    │    consumes        │                              │
│  ionic/ionic-theme.css │                    │  bg-primary, text-text-primary│
└────────────────────────┘                    └──────────────────────────────┘
          │                                                   │
          └───────────────────────┬───────────────────────────┘
                                  ▼
         ┌───────────────────────────────────────────────────┐
         │              apps/web  &  apps/mobile             │
         │  ─────────────────────────────────────────────    │
         │  @import "@nxt1/design-tokens/css";               │
         │  @import "@nxt1/design-tokens/ionic";             │
         │  @tailwind base; components; utilities;           │
         └───────────────────────────────────────────────────┘
```

---

## File Structure

```
packages/design-tokens/
├── package.json
├── build.mjs                     # Build script (tokens → CSS/JS)
│
├── tokens.json/                  # 🎯 SOURCE OF TRUTH (DTCG format)
│   ├── primitive.tokens.json    # Raw values: colors, fonts, spacing
│   ├── semantic.tokens.json     # Theme aliases: dark/light modes
│   └── component.tokens.json    # Component-specific tokens
│
├── dist/                         # Generated outputs
│   ├── css/
│   │   ├── tokens.css           # All CSS custom properties
│   │   └── themes/
│   │       ├── dark.css         # Dark theme overrides
│   │       └── light.css        # Light theme overrides
│   └── js/
│       ├── tokens.mjs           # ES module export
│       └── tokens.d.ts          # TypeScript definitions
│
├── ionic/                        # Ionic Framework integration
│   ├── index.css                # Entry point
│   └── ionic-theme.css          # Maps --nxt1-* → --ion-*
│
├── foundation/                   # Base CSS utilities
│   ├── reset.css                # CSS reset
│   ├── app-shell.css            # App layout defaults
│   └── utilities.css            # Helper classes
│
└── platform/                     # Platform-specific adaptations
    ├── web.css
    └── mobile.css
```

---

## Token Flow

### 1. Define in JSON (DTCG Format)

```json
// tokens.json/primitive.tokens.json
{
  "color": {
    "brand": {
      "volt": {
        "400": { "$value": "#ccff00", "$type": "color" }
      }
    }
  }
}
```

### 2. Build generates CSS Custom Properties

```bash
cd packages/design-tokens && npm run build
```

```css
/* dist/css/tokens.css */
:root {
  --nxt1-color-primary-400: #ccff00;
  --nxt1-color-primary: var(--nxt1-color-primary-400);
}
```

### 3. Tailwind Preset maps to utility classes

```javascript
// packages/config/tailwind/preset.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--nxt1-color-primary)',
          400: 'var(--nxt1-color-primary-400)',
        },
      },
    },
  },
};
```

### 4. Use in Components

```html
<!-- Tailwind classes powered by design tokens -->
<button class="bg-primary hover:bg-primary-500 rounded-lg px-4 py-3 text-black">
  Sign In
</button>
```

---

## Styling Strategy

### When to Use What

| Need                     | Solution                    | Example                            |
| ------------------------ | --------------------------- | ---------------------------------- |
| Layout & spacing         | Tailwind utilities          | `flex p-4 gap-3`                   |
| Brand colors             | Tailwind semantic classes   | `bg-primary text-text-primary`     |
| Surface colors           | Tailwind semantic classes   | `bg-surface-200 border-border`     |
| Direct token access      | CSS custom properties       | `var(--nxt1-color-primary)`        |
| Ionic component theming  | Ionic CSS variables         | `--ion-color-primary`              |
| Complex states/animation | Component CSS in `@nxt1/ui` | Keyframes, multi-state transitions |

### Example: Social Auth Button

```html
<button
  class="border-border bg-surface-200 text-text-primary hover:bg-surface-300 hover:border-border-strong flex h-12 w-full items-center justify-center gap-3 rounded-lg border px-4 text-[15px] font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
>
  <svg class="h-5 w-5"><!-- icon --></svg>
  Continue with Google
</button>
```

---

## Ionic Integration

The `ionic/ionic-theme.css` maps NXT1 tokens to Ionic's CSS variables:

```css
/* ionic/ionic-theme.css */
:root {
  --ion-color-primary: var(--nxt1-color-primary-400, #ccff00);
  --ion-background-color: var(--nxt1-color-dark-50, #0a0a0a);
  --ion-text-color: #ffffff;
  --ion-toolbar-background: var(--nxt1-color-dark-100, #121212);
}
```

This enables NXT1 branding while maintaining Ionic's platform-adaptive behavior
(iOS momentum scrolling, safe areas, native transitions).

---

## Usage in Apps

### Import Order (CSS-only)

```css
/* apps/mobile/src/global.css or apps/web/src/styles.css */

/* 1. Design tokens (CSS custom properties) */
@import '@nxt1/design-tokens/css';

/* 2. Foundation (reset, app-shell, utilities) */
@import '@nxt1/design-tokens/foundation/reset';
@import '@nxt1/design-tokens/foundation/app-shell';

/* 3. Platform adaptation */
@import '@nxt1/design-tokens/platform/mobile'; /* or /web */

/* 4. Ionic theme (maps tokens → Ionic vars) */
@import '@nxt1/design-tokens/ionic';

/* 5. Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Available Tokens

### Colors

| Token                 | CSS Variable               | Tailwind Class      |
| --------------------- | -------------------------- | ------------------- |
| Primary (Neon Volt)   | `--nxt1-color-primary-400` | `bg-primary`        |
| Surface backgrounds   | `--nxt1-color-surface-*`   | `bg-surface-200`    |
| Text colors           | `--nxt1-color-text-*`      | `text-text-primary` |
| Border colors         | `--nxt1-color-border`      | `border-border`     |
| Success/Warning/Error | `--nxt1-color-success`     | `bg-success`        |

### Typography

| Token        | CSS Variable               | Tailwind Class  |
| ------------ | -------------------------- | --------------- |
| Brand font   | `--nxt1-font-family-brand` | `font-brand`    |
| Font sizes   | `--nxt1-font-size-*`       | `text-sm`, etc. |
| Font weights | `--nxt1-font-weight-*`     | `font-medium`   |

### Spacing & Radius

| Token         | CSS Variable       | Tailwind Class |
| ------------- | ------------------ | -------------- |
| Spacing scale | `--nxt1-spacing-*` | `p-4`, `gap-3` |
| Border radius | `--nxt1-radius-*`  | `rounded-lg`   |

---

## Dark Mode

Dark mode is the default. Light mode support via:

```css
/* Automatic via system preference */
@media (prefers-color-scheme: light) {
  :root {
    /* light theme vars */
  }
}

/* Manual toggle via data attribute */
[data-theme='light'] {
  /* light theme vars */
}
```

---

## Making Changes

### Change a Color

1. Edit `tokens.json/primitive.tokens.json`
2. Run `npm run build`
3. All apps receive the update on next build/refresh

### Add a New Token

1. Add to appropriate `tokens.json/*.json` file
2. Run `npm run build`
3. Add to Tailwind preset if needed (`packages/config/tailwind/preset.js`)

---

## Best Practices

1. **Use Tailwind classes** for layout, spacing, and semantic colors
2. **Use CSS variables** when Tailwind doesn't cover your need
3. **Never hardcode colors** — always reference tokens
4. **Let Ionic handle** platform behavior (scrolling, gestures, safe areas)
5. **Keep component styles** in `@nxt1/ui` package for shared components

---

## Accessibility

Built-in support for:

- `@media (prefers-contrast: high)` — High contrast mode
- `@media (prefers-reduced-motion: reduce)` — Reduced motion
- Focus-visible states for keyboard navigation
- Minimum 48px touch targets
- WCAG AA color contrast ratios
