# NXT1 Design System

> **The Complete Guide** — How design tokens, Ionic, Tailwind, and shared
> components work together across web and mobile.

---

## Table of Contents

1. [Overview](#overview)
2. [The Complete Architecture](#the-complete-architecture)
3. [Design Token Flow](#design-token-flow)
4. [Platform Styling (Ionic)](#platform-styling-ionic)
5. [Tailwind Integration](#tailwind-integration)
6. [Shared UI Components](#shared-ui-components)
7. [How to Make Changes](#how-to-make-changes)
8. [File Reference](#file-reference)
9. [FAQ](#faq)

---

## Overview

The NXT1 design system provides **consistent branding** across web and mobile
while leveraging **native platform feel** through Ionic Framework.

### Key Principles

| Principle                  | Implementation                                        |
| -------------------------- | ----------------------------------------------------- |
| **Single Source of Truth** | `tokens.json/` contains all design values             |
| **Native Feel**            | Ionic components with iOS mode for premium UX         |
| **Brand Consistency**      | Same colors, typography, spacing everywhere           |
| **Developer Experience**   | Tailwind utilities + design tokens = fast development |

---

## The Complete Architecture

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
                            │   build.mjs   │  ← Run: npm run build
                            └───────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐
│  dist/css/       │    │  dist/js/        │    │  ionic/                  │
│  tokens.css      │    │  tokens.mjs      │    │  _colors.scss            │
│  themes/dark.css │    │  tokens.d.ts     │    │  _typography.scss        │
│  themes/light.css│    │                  │    │  _ionic-theme.scss       │
└──────────────────┘    └──────────────────┘    └──────────────────────────┘
         │                       │                          │
         │                       ▼                          │
         │              ┌──────────────────┐                │
         │              │ Tailwind Preset  │                │
         │              │ @nxt1/config/    │                │
         │              │ tailwind         │                │
         │              └──────────────────┘                │
         │                       │                          │
         └───────────────────────┼──────────────────────────┘
                                 │
                                 ▼
         ┌───────────────────────────────────────────────────┐
         │               RUNTIME (Browser/App)               │
         │                                                   │
         │   CSS Custom Properties    Tailwind Classes       │
         │   --nxt1-color-primary     bg-primary             │
         │   --ion-color-primary      text-surface-200       │
         │                                                   │
         └───────────────────────────────────────────────────┘
                                 │
          ┌──────────────────────┴──────────────────────┐
          ▼                                              ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│      apps/web/           │              │      apps/mobile/        │
│   Angular + Ionic + SSR  │              │   Angular + Ionic +      │
│   localhost:4200         │              │   Capacitor (iOS/Android)│
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
```

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

| Output                      | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `dist/css/tokens.css`       | CSS custom properties for runtime               |
| `dist/css/themes/dark.css`  | Dark theme variables                            |
| `dist/css/themes/light.css` | Light theme variables                           |
| `dist/js/tokens.mjs`        | JavaScript export for Tailwind config           |
| `dist/js/tokens.d.ts`       | TypeScript definitions                          |
| `ionic/_colors.scss`        | SCSS variables for Ionic theme (auto-generated) |
| `ionic/_typography.scss`    | SCSS typography for Ionic (auto-generated)      |

### 3. How Values Flow

```
tokens.json                    Runtime CSS                  Usage
─────────────────────────────────────────────────────────────────────
color.brand.volt.400    →    --nxt1-color-brand-volt-400    var(--nxt1-...)
       │
       ▼
$nxt1-primary-400       →    --ion-color-primary            Ionic components
       │
       ▼
Tailwind config         →    bg-primary, text-primary       class="bg-primary"
```

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

Your design tokens map to Ionic's CSS variables in `ionic/_ionic-theme.scss`:

```scss
// Your token         →  Ionic variable
$nxt1-primary-400    →  --ion-color-primary
$nxt1-dark-100       →  --ion-background-color
$nxt1-dark-900       →  --ion-text-color
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

| File                                             | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `packages/design-tokens/tokens.json/*.json`      | **Source of truth** for all design values |
| `packages/design-tokens/build.mjs`               | Build script that generates all outputs   |
| `packages/design-tokens/ionic/_ionic-theme.scss` | Maps tokens → Ionic variables             |
| `packages/config/tailwind/preset.js`             | Tailwind config consuming tokens          |
| `apps/mobile/src/app/app.config.ts`              | Ionic configuration (iOS mode)            |
| `apps/mobile/src/global.scss`                    | Mobile app style imports                  |
| `apps/web/src/styles.scss`                       | Web app style imports                     |

### Import Order (Apps)

```scss
// 1. SCSS modules first
@use '@nxt1/design-tokens/scss' as tokens;

// 2. CSS custom properties
@import '@nxt1/design-tokens/css';

// 3. Foundation (reset, utilities)
@import '@nxt1/design-tokens/foundation/reset';
@import '@nxt1/design-tokens/foundation/utilities';

// 4. Platform-specific
@import '@nxt1/design-tokens/platform/mobile'; // or /web

// 5. Ionic theme (maps tokens → Ionic vars)
@import '@nxt1/design-tokens/platform/ionic';

// 6. Tailwind
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## FAQ

### Why use both Ionic AND Tailwind?

**Ionic** handles platform-native behavior (scrolling, gestures, safe areas).
**Tailwind** provides fast, consistent styling utilities. Together:

- Ionic = **How it behaves**
- Tailwind = **How it looks**

### Why are there SCSS files if we use CSS variables?

Ionic requires some values at **SCSS compile time** (not runtime) for internal
calculations. The SCSS files (`ionic/_colors.scss`) provide these values, which
are then used to set Ionic's CSS variables.

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

```scss
// This DOES apply even with mode: 'ios'
.plt-android {
  // Android-specific overrides
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

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│  tokens.json  →  build.mjs  →  CSS + SCSS + JS outputs      │
│       │                              │                       │
│       └──────────────────────────────┼───────────────────────┤
│                                      ▼                       │
│              ┌─────────────────────────────────┐            │
│              │  Ionic (native behavior)        │            │
│              │  + Tailwind (styling utilities) │            │
│              │  + Your brand tokens            │            │
│              └─────────────────────────────────┘            │
│                              │                               │
│              ┌───────────────┴───────────────┐              │
│              ▼                               ▼              │
│        apps/web                        apps/mobile          │
│        (SSR + Browser)                 (iOS + Android)      │
└─────────────────────────────────────────────────────────────┘
```

**One source of truth. Native feel. Brand consistency. Fast development.**
