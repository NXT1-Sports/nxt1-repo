# NXT1 Design Token System v2.0

## Overview

The NXT1 Design Token System v2.0 is an enterprise-grade, framework-agnostic
design system that replaces the previous Ionic CSS foundation with a custom
cascading token architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      @nxt1/design-tokens v2.0                        │
├─────────────────────────────────────────────────────────────────────┤
│  tokens.json/                  │  DTCG JSON Token Source Files      │
│  ├── primitive.tokens.json     │  Raw values (colors, spacing, etc) │
│  ├── semantic.tokens.json      │  Theme-aware aliases               │
│  └── component.tokens.json     │  Component-specific tokens         │
├─────────────────────────────────────────────────────────────────────┤
│  foundation/                   │  CSS Foundation Layer              │
│  ├── foundation.css            │  Reset/normalize                   │
│  ├── app-shell.css             │  App structure (header/content)    │
│  ├── utilities.css             │  Utility classes                   │
│  └── index.css                 │  Combined import                   │
├─────────────────────────────────────────────────────────────────────┤
│  platform/                     │  Platform Adaptation Layer         │
│  ├── web.css                   │  Desktop hover, scrollbar, focus   │
│  ├── mobile.css                │  Touch, safe areas, momentum       │
│  └── ionic-adapter.css         │  Ionic CSS variable mapping        │
├─────────────────────────────────────────────────────────────────────┤
│  js/                           │  JavaScript/TypeScript Exports     │
│  ├── tokens.mjs                │  ES Module token values            │
│  └── tokens.d.ts               │  TypeScript definitions            │
├─────────────────────────────────────────────────────────────────────┤
│  tokens/                       │  Legacy SCSS (backwards compat)    │
│  ├── _index.scss               │  Main entry point                  │
│  ├── _bridge.scss              │  Legacy → v2.0 bridge              │
│  └── ...                       │  Individual token files            │
└─────────────────────────────────────────────────────────────────────┘
```

## Token Cascade Flow

```
PRIMITIVE TOKENS (raw values)
         ↓
SEMANTIC TOKENS (theme-aware aliases)
         ↓
COMPONENT TOKENS (UI component defaults)
         ↓
PLATFORM TOKENS (web/mobile overrides)
         ↓
APPLICATION CSS CUSTOM PROPERTIES
```

## Usage

### Web Application

```scss
/* apps/web/src/styles.scss */

/* 1. Foundation - reset, app shell, utilities */
@import '@nxt1/design-tokens/css/foundation';

/* 2. Platform adaptation - hover states, scrollbar */
@import '@nxt1/design-tokens/css/platform/web';

/* 3. SCSS variables (optional) */
@use '@nxt1/design-tokens/scss' as tokens;

/* 4. Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Mobile Application (with Ionic)

```scss
/* apps/mobile/src/global.scss */

/* 1. Foundation - reset, app shell, utilities */
@import '@nxt1/design-tokens/css/foundation';

/* 2. Platform adaptation - touch, safe areas */
@import '@nxt1/design-tokens/css/platform/mobile';

/* 3. Ionic adapter - maps NXT1 tokens → Ionic CSS vars */
@import '@nxt1/design-tokens/css/platform/ionic-adapter';

/* 4. SCSS variables (optional) */
@use '@nxt1/design-tokens/scss' as tokens;

/* 5. Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 6. Ionic component CSS (visual only) */
@import '@ionic/angular/css/core.css';
```

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  presets: [require('@nxt1/config/tailwind')],
  content: ['./src/**/*.{html,ts}'],
};
```

### JavaScript/TypeScript

```typescript
import { colors, spacing, typography } from '@nxt1/design-tokens/js';

// Access token values
console.log(colors.primary.DEFAULT); // 'var(--nxt1-color-primary, #ccff00)'
console.log(spacing[4]); // 'var(--nxt1-spacing-4, 16px)'
```

## Token Categories

### Primitive Tokens

Raw design values without context.

| Category      | Examples                               |
| ------------- | -------------------------------------- |
| Colors        | `--nxt1-color-brand-volt-400: #ccff00` |
| Spacing       | `--nxt1-spacing-4: 16px`               |
| Typography    | `--nxt1-font-size-base: 16px`          |
| Border Radius | `--nxt1-border-radius-md: 8px`         |
| Motion        | `--nxt1-motion-duration-fast: 150ms`   |

### Semantic Tokens

Theme-aware aliases referencing primitives.

| Category   | Dark Theme                                            | Light Theme        |
| ---------- | ----------------------------------------------------- | ------------------ |
| Background | `--nxt1-color-background-primary: #0a0a0a`            | `#ffffff`          |
| Text       | `--nxt1-color-text-primary: #ffffff`                  | `#212121`          |
| Primary    | `--nxt1-color-primary: #ccff00`                       | `#a3cc00`          |
| Border     | `--nxt1-color-border-default: rgba(255,255,255,0.12)` | `rgba(0,0,0,0.12)` |

### Component Tokens

UI component-specific defaults.

| Component | Token                        | Value  |
| --------- | ---------------------------- | ------ |
| Button    | `--nxt1-button-height`       | `44px` |
| Input     | `--nxt1-input-height`        | `44px` |
| Card      | `--nxt1-card-padding`        | `16px` |
| Modal     | `--nxt1-modal-border-radius` | `16px` |

## Platform Adaptation

### Web (`platform/web.css`)

- Hover states with transitions
- Custom scrollbar styling
- Focus visible rings
- Print styles
- Large screen optimizations

### Mobile (`platform/mobile.css`)

- Touch target sizing (44px minimum)
- Safe area inset handling
- Native momentum scrolling
- Hidden scrollbars
- Reduced motion support
- Keyboard handling
- Haptic feedback hints

### Ionic Adapter (`platform/ionic-adapter.css`)

- Maps all NXT1 tokens to Ionic CSS custom properties
- Platform-specific overrides (iOS/MD)
- Component defaults (ion-card, ion-toolbar, etc.)
- **Optional** - only needed if using Ionic components

## Theme System

### Dark Theme (Default)

```html
<html data-theme="dark"></html>
```

### Light Theme

```html
<html data-theme="light"></html>
```

### System Preference

```css
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    /* Light theme tokens applied automatically */
  }
}
```

## Migration from v1.0

### Before (v1.0)

```scss
/* Tightly coupled to Ionic */
@import '@ionic/angular/css/normalize.css';
@import '@ionic/angular/css/structure.css';
@use '@nxt1/design-tokens/tokens' as *;
```

### After (v2.0)

```scss
/* Framework-agnostic foundation */
@import '@nxt1/design-tokens/css/foundation';
@import '@nxt1/design-tokens/css/platform/mobile';
@import '@nxt1/design-tokens/css/platform/ionic-adapter'; /* Only if using Ionic */
```

## Key Benefits

1. **Framework-Agnostic**: Works without Ionic or any specific framework
2. **Mobile-Ready**: Designed for code sharing with React Native, Flutter, etc.
3. **DTCG Compliant**: Follows Design Tokens Community Group specification
4. **Theme Support**: Dark/light themes with system preference detection
5. **Type-Safe**: Full TypeScript definitions for JavaScript consumers
6. **Performant**: CSS custom properties with fallback values
7. **Scalable**: Three-tier token architecture for enterprise applications
8. **Backwards Compatible**: Legacy SCSS imports still work

## Package Exports

```json
{
  "@nxt1/design-tokens": "./js/tokens.mjs",
  "@nxt1/design-tokens/css": "./foundation/index.css",
  "@nxt1/design-tokens/css/foundation": "./foundation/index.css",
  "@nxt1/design-tokens/css/platform/web": "./platform/web.css",
  "@nxt1/design-tokens/css/platform/mobile": "./platform/mobile.css",
  "@nxt1/design-tokens/css/platform/ionic-adapter": "./platform/ionic-adapter.css",
  "@nxt1/design-tokens/scss": "./tokens/_index.scss",
  "@nxt1/design-tokens/js": "./js/tokens.mjs",
  "@nxt1/design-tokens/legacy": "./index.scss"
}
```

## Version History

- **v2.0.0** - Enterprise design token system with DTCG compliance
- **v1.0.0** - Initial SCSS-based token system with Ionic integration

---

## Legacy Documentation (v1.0)

The original documentation is preserved below for reference during migration.

---
