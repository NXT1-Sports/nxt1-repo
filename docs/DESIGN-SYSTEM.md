# NXT1 Design System

> **The Complete Guide v5.0** — How design tokens, Ionic, Tailwind, and shared
> components work together across web and mobile. **CSS-only architecture** for
> 2026+ best practices.

---

## Table of Contents

1. [Overview](#overview)
2. [Styling Strategy](#styling-strategy)
3. [The Complete Architecture](#the-complete-architecture)
4. [Design Token Flow](#design-token-flow)
5. [Platform Styling (Ionic)](#platform-styling-ionic)
6. [Tailwind Integration](#tailwind-integration)
7. [Shared UI Components](#shared-ui-components)
8. [How to Make Changes](#how-to-make-changes)
9. [File Reference](#file-reference)
10. [FAQ](#faq)

---

## Overview

The NXT1 design system provides **consistent branding** across web and mobile
while leveraging **native platform feel** through Ionic Framework.

### Key Principles

| Principle                  | Implementation                                        |
| -------------------------- | ----------------------------------------------------- |
| **Single Source of Truth** | `tokens.json/` contains all design values             |
| **CSS-Only**               | No SCSS required - pure CSS custom properties         |
| **Native Feel**            | Ionic components with iOS mode for premium UX         |
| **Brand Consistency**      | Same colors, typography, spacing everywhere           |
| **Developer Experience**   | Tailwind utilities + design tokens = fast development |

### Version 5.0 - Professional CSS Architecture (2026+)

- ✅ **No SCSS** - Zero SCSS files in the entire monorepo
- ✅ **Pure CSS imports** - Simple `@import` syntax
- ✅ **Clear separation** - Tailwind for layout, CSS variables for theming
- ✅ **Component styles with components** - Styles live in `@nxt1/ui`

---

## Styling Strategy

### The Official Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WHEN TO USE WHAT                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  TAILWIND CLASSES                                                    │   │
│  │  ═══════════════                                                     │   │
│  │  Use for: Layout, spacing, flexbox, grid, responsive breakpoints     │   │
│  │                                                                      │   │
│  │  ✓ flex items-center justify-between                                │   │
│  │  ✓ p-4 md:p-6 lg:p-8                                                │   │
│  │  ✓ grid grid-cols-2 gap-4                                           │   │
│  │  ✓ w-full max-w-md mx-auto                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CSS CUSTOM PROPERTIES (--nxt1-*)                                    │   │
│  │  ═══════════════════════════════                                     │   │
│  │  Use for: Colors, theming, typography, animations                    │   │
│  │                                                                      │   │
│  │  ✓ var(--nxt1-color-primary)                                        │   │
│  │  ✓ var(--nxt1-font-family-brand)                                    │   │
│  │  ✓ var(--nxt1-radius-lg)                                            │   │
│  │  ✓ var(--nxt1-duration-fast)                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  TAILWIND + TOKENS (Semantic Classes)                                │   │
│  │  ════════════════════════════════════                                │   │
│  │  Use for: Brand colors through Tailwind preset                       │   │
│  │                                                                      │   │
│  │  ✓ bg-primary text-black (maps to --nxt1-color-primary)             │   │
│  │  ✓ bg-surface-200 border-border                                     │   │
│  │  ✓ text-text-primary text-text-secondary                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  COMPONENT CSS (@nxt1/ui/styles/*)                                   │   │
│  │  ══════════════════════════════════                                  │   │
│  │  Use for: Complex component states, keyframe animations              │   │
│  │                                                                      │   │
│  │  ✓ Component has 5+ visual states                                   │   │
│  │  ✓ Keyframe animations                                              │   │
│  │  ✓ Overriding Ionic component internals                             │   │
│  │  ✓ Shared styles across multiple related components                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  QUICK REFERENCE:                                                           │
│                                                                             │
│  Is it layout/spacing? ──────────────────────────> Tailwind class          │
│  Is it a color/theme value? ─────────────────────> CSS Variable             │
│  Is it a brand color class? ─────────────────────> Tailwind semantic        │
│  Is it complex state/animation? ─────────────────> @nxt1/ui/styles/*        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Example: Auth Button

```html
<!-- CORRECT: Tailwind for layout, semantic classes for colors -->
<button
  class="border-border bg-surface-200 text-text-primary hover:bg-surface-300 flex h-12 w-full items-center justify-center gap-3 rounded-xl border px-4 transition-all"
>
  Sign In
</button>
```

```css
/* When you need more complex styling, use @nxt1/ui/styles */
.nxt1-social-btn--google:hover {
  background-color: rgba(66, 133, 244, 0.1);
  border-color: rgba(66, 133, 244, 0.4);
}
```

---

## The Complete Architecture

````
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
                            │   build.mjs   │  ← Run: npm run build
                            └───────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌────────────────────────┐                    ┌──────────────────────────────┐
│  @nxt1/design-tokens   │                    │  @nxt1/ui                    │
│  ────────────────────  │                    │  ────────────────────────    │
│  dist/css/tokens.css   │                    │  src/auth/* (components)     │
│  foundation/*.css      │◄───────────────────│  src/styles/auth/auth.css    │
│  ionic/ionic-theme.css │    imports from    │  src/shared/* (components)   │
│  platform/*.css        │                    │                              │
└────────────────────────┘                    └──────────────────────────────┘
          │                                                   │
          └───────────────────────┬───────────────────────────┘
                                  ▼
         ┌───────────────────────────────────────────────────┐
         │                   apps/web                         │
         │                   apps/mobile                      │
         │  ─────────────────────────────────────────────    │
         │  @import "@nxt1/design-tokens/css";               │
         │  @import "@nxt1/design-tokens/foundation";        │
         │  @import "@nxt1/design-tokens/ionic";             │
         │  @import "@nxt1/ui/styles/auth";                  │
         │  @tailwind base; components; utilities;           │
         └───────────────────────────────────────────────────┘
```│
│   localhost:4200         │              │   global.css             │
│                          │              │   localhost:4300         │
└──────────────────────────┘              └──────────────────────────┘
                    │                                │
                    └────────────┬───────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │     packages/ui/         │
                    │  Shared Components       │
                    │  AuthShell, Logo, etc.   │
                    └──────────────────────────┘
````

---

## Design Token Flow

### 1. JSON Source (DTCG Format)

All design values live in `packages/design-tokens/tokens.json/`:

```json
// primitive.tokens.json
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

### 2. Build Process

Running `npm run build` in `packages/design-tokens/` executes `build.mjs`:

```bash
cd packages/design-tokens && npm run build
```

**Outputs generated:**

| Output                      | Purpose                               |
| --------------------------- | ------------------------------------- |
| `dist/css/tokens.css`       | CSS custom properties for runtime     |
| `dist/css/themes/dark.css`  | Dark theme variables                  |
| `dist/css/themes/light.css` | Light theme variables                 |
| `dist/js/tokens.mjs`        | JavaScript export for Tailwind config |
| `dist/js/tokens.d.ts`       | TypeScript definitions                |
| `ionic/ionic-theme.css`     | CSS mapping tokens → Ionic variables  |
| `components/auth/auth.css`  | Auth component styles (CSS-only)      |

### 3. How Values Flow (CSS-Only)

```
tokens.json                    Runtime CSS                  Usage
─────────────────────────────────────────────────────────────────────
color.brand.volt.400    →    --nxt1-color-primary-400       var(--nxt1-...)
       │
       ▼
ionic-theme.css         →    --ion-color-primary            Ionic components
       │
       ▼
Tailwind config         →    bg-primary, text-primary       class="bg-primary"
```

**No SCSS compilation required!** Everything flows through CSS custom
properties.

---

## Platform Styling (Ionic)

### Why Ionic?

Ionic provides **native-feeling UI components** that automatically adapt to each
platform:

- **iOS**: Rounded corners, slide transitions, swipe-back navigation
- **Android**: Material Design ripples, FAB buttons, different animations

### Current Configuration

```typescript
// apps/mobile/src/app/app.config.ts
provideIonicAngular({
  mode: 'ios', // Forces iOS styling on ALL platforms
});
```

**Why force iOS mode?**

| Reason             | Explanation                          |
| ------------------ | ------------------------------------ |
| Brand consistency  | Same look on iPhone and Android      |
| Premium feel       | iOS design language is polished      |
| Easier maintenance | One UI to design and test            |
| Industry standard  | Instagram, Spotify, Uber do the same |

### What Ionic Handles

| Feature            | How It Works                                          |
| ------------------ | ----------------------------------------------------- |
| **Scrolling**      | `IonContent` — iOS momentum scrolling, rubber-banding |
| **Safe Areas**     | Auto-handles iPhone notch, home indicator             |
| **Navigation**     | iOS-style slide transitions between pages             |
| **Touch Feedback** | Native press states, haptic feedback                  |
| **Back Button**    | iOS chevron with swipe-back gesture                   |

### Ionic Theme Integration

Your design tokens map to Ionic's CSS variables in `ionic/ionic-theme.css`:

```css
/* CSS Custom Properties - No SCSS required! */
:root {
  --ion-color-primary: var(--nxt1-color-primary);
  --ion-background-color: var(--nxt1-color-bg-primary);
  --ion-text-color: var(--nxt1-color-text-primary);
}
```

---

## Tailwind Integration

### How Tailwind Consumes Tokens

The Tailwind preset (`packages/config/tailwind/preset.js`) reads the generated
tokens:

```javascript
// packages/config/tailwind/preset.js
const tokens = require('@nxt1/design-tokens');

module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--nxt1-color-primary, #ccff00)',
          400: 'var(--nxt1-color-primary-400, #ccff00)',
          // ...
        },
        surface: {
          100: 'var(--nxt1-color-surface-100, #161616)',
          200: 'var(--nxt1-color-surface-200, #1a1a1a)',
          // ...
        },
      },
    },
  },
};
```

### Using Tailwind Classes

```html
<!-- These classes reference your design tokens -->
<button class="bg-primary hover:bg-primary-500 text-black">Sign In</button>

<div class="bg-surface-200 border-border rounded-xl p-4">Card content</div>
```

### Token-to-Tailwind Mapping

| Token                    | CSS Variable                | Tailwind Class               |
| ------------------------ | --------------------------- | ---------------------------- |
| `color.brand.volt.400`   | `--nxt1-color-primary`      | `bg-primary`, `text-primary` |
| `color.neutral.dark.200` | `--nxt1-color-surface-200`  | `bg-surface-200`             |
| `color.neutral.dark.800` | `--nxt1-color-text-primary` | `text-text-primary`          |

---

## Shared UI Components

### Package Structure

```
packages/ui/
├── src/
│   ├── auth/                    # Auth components
│   │   ├── auth-shell/          # Layout wrapper
│   │   ├── auth-email-form/     # Email/password form
│   │   ├── auth-social-buttons/ # Google, Apple, Microsoft
│   │   └── auth-divider/        # "or continue with" divider
│   ├── shared/                  # Common components
│   │   └── nxt-logo/            # Brand logo
│   └── services/                # Platform services
│       └── platform.service.ts  # Device detection
```

### Component Design Pattern

Components use **Ionic for native behavior** + **Tailwind for styling**:

```typescript
// auth-shell.component.ts
@Component({
  imports: [
    IonContent,    // ← Ionic: native scrolling, safe areas
    IonHeader,     // ← Ionic: native header
    IonToolbar,    // ← Ionic: native toolbar
    IonButton,     // ← Ionic: native button with haptics
  ],
  template: `
    <ion-content>
      <!-- Tailwind for layout and custom styling -->
      <div class="flex flex-col items-center bg-surface-100 p-6">
        <ng-content></ng-content>
      </div>
    </ion-content>
  `
})
```

### Why This Pattern?

| Layer                | Responsibility                  | Technology         |
| -------------------- | ------------------------------- | ------------------ |
| **Native behavior**  | Scrolling, gestures, safe areas | Ionic components   |
| **Layout & spacing** | Flexbox, grid, padding          | Tailwind utilities |
| **Brand colors**     | Primary, surface, text          | Design tokens      |

---

## How to Make Changes

### Changing a Color

1. **Edit the source:**

   ```bash
   # Edit packages/design-tokens/tokens.json/primitive.tokens.json
   "volt": {
     "400": { "$value": "#ccff00", "$type": "color" }  # ← Change this
   }
   ```

2. **Rebuild tokens:**

   ```bash
   cd packages/design-tokens && npm run build
   ```

3. **Verify:**
   - `dist/css/tokens.css` updated
   - `ionic/_colors.scss` updated
   - All apps will use new color on next build/refresh

### Adding a New Color

1. **Add to `primitive.tokens.json`:**

   ```json
   "brand": {
     "volt": { ... },
     "newColor": {
       "400": { "$value": "#ff0000", "$type": "color" }
     }
   }
   ```

2. **Run build:**

   ```bash
   cd packages/design-tokens && npm run build
   ```

3. **Add to Tailwind preset** (if needed):
   ```javascript
   // packages/config/tailwind/preset.js
   colors: {
     newColor: 'var(--nxt1-color-brand-newColor-400)',
   }
   ```

### Adding a New Component to @nxt1/ui

1. **Create component folder:**

   ```
   packages/ui/src/shared/my-component/
   ├── my-component.component.ts
   └── index.ts
   ```

2. **Export from entry point:**

   ```typescript
   // packages/ui/src/shared/index.ts
   export * from './my-component';
   ```

3. **Rebuild:**
   ```bash
   npm run build:ui
   ```

---

## File Reference

### Key Files

| File                                              | Purpose                                   |
| ------------------------------------------------- | ----------------------------------------- |
| `packages/design-tokens/tokens.json/*.json`       | **Source of truth** for all design values |
| `packages/design-tokens/build.mjs`                | Build script that generates all outputs   |
| `packages/design-tokens/ionic/ionic-theme.css`    | Maps tokens → Ionic variables (CSS-only)  |
| `packages/design-tokens/components/auth/auth.css` | Auth component styles (CSS-only)          |
| `packages/config/tailwind/preset.js`              | Tailwind config consuming tokens          |
| `apps/mobile/src/app/app.config.ts`               | Ionic configuration (iOS mode)            |
| `apps/mobile/src/global.css`                      | Mobile app style imports                  |
| `apps/web/src/styles.css`                         | Web app style imports                     |

### Import Order (Apps) - CSS-Only

```css
/* 1. Design Tokens - CSS custom properties */
@import '@nxt1/design-tokens/css';

/* 2. Foundation (reset, app-shell, utilities) */
@import '@nxt1/design-tokens/foundation/reset';
@import '@nxt1/design-tokens/foundation/app-shell';
@import '@nxt1/design-tokens/foundation/utilities';

/* 3. Platform-specific adaptation */
@import '@nxt1/design-tokens/platform/mobile'; /* or /web */

/* 4. Ionic theme (maps tokens → Ionic vars) */
@import '@nxt1/design-tokens/ionic';

/* 5. Component styles */
@import '@nxt1/design-tokens/components/auth';

/* 6. Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Note:** No `@use` SCSS imports required! Everything is pure CSS.

---

## FAQ

### Why use both Ionic AND Tailwind?

**Ionic** handles platform-native behavior (scrolling, gestures, safe areas).
**Tailwind** provides fast, consistent styling utilities. Together:

- Ionic = **How it behaves**
- Tailwind = **How it looks**

### Why CSS-only instead of SCSS? (v4.0+)

**Performance & Simplicity.** SCSS was only needed historically for:

1. Variable declarations → Now handled by CSS Custom Properties
2. Ionic compile-time values → Now using CSS variable fallbacks
3. Mixins/functions → Replaced by Tailwind utilities

Benefits of CSS-only:

- ✅ Faster builds (no SCSS compilation)
- ✅ Smaller tooling footprint
- ✅ Native browser dev tools support
- ✅ Runtime theming with CSS variables
- ✅ 2026+ industry best practice

### Why force iOS mode instead of auto-detecting?

Brand consistency. Major apps (Instagram, Spotify, Uber) use one design language
across platforms. iOS mode provides a premium, polished feel that works well on
both iPhone and Android.

### How do I add dark/light theme support?

The system already supports it:

- Dark theme: `:root` or `[data-theme="dark"]`
- Light theme: `[data-theme="light"]`

Toggle by setting `data-theme` attribute on `<html>` or `<body>`.

### What if I need Android-specific styling?

While iOS mode is forced, you can still add Android-specific overrides:

```css
/* This DOES apply even with mode: 'ios' */
.plt-android {
  /* Android-specific overrides */
}
```

### How do I test changes quickly?

```bash
# Terminal 1: Watch token changes
cd packages/design-tokens && npm run build -- --watch

# Terminal 2: Run web app
npm run dev:web

# Terminal 3: Run mobile app
npm run dev:mobile
```

### What about legacy SCSS imports?

For backwards compatibility during migration, legacy paths are available:

- `@nxt1/design-tokens/scss` - Generated SCSS variables
- `@nxt1/design-tokens/ionic-legacy` - SCSS Ionic theme

These will be deprecated in a future version. Migrate to CSS imports.

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│  tokens.json  →  build.mjs  →  CSS + JS outputs (no SCSS!)  │
│       │                              │                       │
│       └──────────────────────────────┼───────────────────────┤
│                                      ▼                       │
│              ┌─────────────────────────────────┐            │
│              │  Ionic (native behavior)        │            │
│              │  + Tailwind (styling utilities) │            │
│              │  + CSS Custom Properties        │            │
│              └─────────────────────────────────┘            │
│                              │                               │
│              ┌───────────────┴───────────────┐              │
│              ▼                               ▼              │
│        apps/web                        apps/mobile          │
│        styles.css                      global.css           │
│        (SSR + Browser)                 (iOS + Android)      │
└─────────────────────────────────────────────────────────────┘
```

**One source of truth. Native feel. Brand consistency. CSS-only. 2026+ ready.**
