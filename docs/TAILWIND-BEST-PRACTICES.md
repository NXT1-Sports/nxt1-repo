# NXT1 Tailwind CSS & Design System - Best Practices Implementation

> **Status**: ✅ COMPLETE - Enterprise-grade 2026 Architecture

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 @nxt1/config/tailwind                       │
│            (Shared Tailwind Preset)                         │
│  - Unified design tokens                                    │
│  - CSS custom properties with fallbacks                     │
│  - Colors, spacing, typography, shadows, animations         │
├──────────────────────┬──────────────────────────────────────┤
│    apps/web          │         apps/mobile                  │
│  tailwind.config.js  │       tailwind.config.js             │
│  - Uses preset       │       - Uses preset                  │
│  - preflight: true   │       - preflight: false (Ionic)     │
│                      │       - Ionic colors extension       │
├──────────────────────┴──────────────────────────────────────┤
│                   @nxt1/design-tokens                       │
│  - CSS custom properties (--nxt1-*)                         │
│  - SCSS variables for compile-time                          │
│  - Ionic theme integration                                  │
├─────────────────────────────────────────────────────────────┤
│                      @nxt1/ui                               │
│  - Shared components (auth-shell, logo, etc.)               │
│  - Uses Tailwind utility classes                            │
│  - Works on both web and mobile                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Changed

### New Files Created

| File                                 | Purpose                                       |
| ------------------------------------ | --------------------------------------------- |
| `packages/config/tailwind/preset.js` | Shared Tailwind preset with all design tokens |
| `packages/config/tailwind/index.js`  | Entry point for preset                        |

### Files Updated

| File                             | Changes                                           |
| -------------------------------- | ------------------------------------------------- |
| `packages/config/package.json`   | Added tailwind exports                            |
| `apps/web/tailwind.config.js`    | Simplified to use shared preset (~200 → 22 lines) |
| `apps/mobile/tailwind.config.js` | Updated to use shared preset + Ionic colors       |
| `tailwind.config.base.js`        | Deprecated, re-exports shared preset              |

---

## Design Token Naming Convention

All CSS custom properties use the `--nxt1-*` namespace:

```scss
// Colors
--nxt1-color-primary          // #ccff00 (Volt Green)
--nxt1-color-surface-100      // #161616
--nxt1-color-text-primary     // #ffffff
--nxt1-color-border-subtle    // rgba(255,255,255,0.08)

// Spacing
--nxt1-spacing-1              // 0.25rem (4px)
--nxt1-spacing-4              // 1rem (16px)

// Typography
--nxt1-font-family-brand      // Rajdhani
--nxt1-font-size-base         // 1rem

// Effects
--nxt1-shadow-md              // 0 6px 12px rgba(0,0,0,0.5)
--nxt1-radius-lg              // 16px
```

---

## Tailwind Class Usage

### Color Classes (with fallbacks)

```html
<!-- Background -->
<div class="bg-bg-primary">
  <!-- --nxt1-color-bg-primary, #0a0a0a -->
  <div class="bg-surface-100">
    <!-- --nxt1-color-surface-100, #161616 -->

    <!-- Text -->
    <p class="text-text-primary"><!-- --nxt1-color-text-primary, #ffffff --></p>
    <p class="text-text-secondary">
      <!-- 70% white -->

      <!-- Brand -->
      <button class="bg-primary">
        <!-- --nxt1-color-primary, #ccff00 -->
        <button class="text-primary-400">
          <!-- Specific shade -->

          <!-- Border -->
          <div class="border border-border-subtle"><!-- 8% white --></div>
        </button>
      </button>
    </p>
  </div>
</div>
```

### Spacing Classes

```html
<div class="p-md">
  <!-- 1rem -->
  <div class="mt-lg">
    <!-- 1.5rem -->
    <div class="gap-sm"><!-- 0.5rem --></div>
  </div>
</div>
```

### Typography Classes

```html
<h1 class="font-brand text-3xl font-bold">
  <p class="font-sans text-base text-text-secondary"></p>
</h1>
```

---

## Component Example (Best Practice)

```typescript
// auth-shell.component.ts - @nxt1/ui
@Component({
  selector: 'nxt1-auth-shell',
  standalone: true,
  template: `
    <ion-content class="bg-transparent min-h-screen flex flex-col">
      <!-- Background Effects -->
      <div class="fixed inset-0 z-0 pointer-events-none">
        <div
          class="absolute inset-0 bg-gradient-to-b from-bg-primary to-black"
        ></div>
        <div
          class="absolute top-[-200px] left-1/2 w-[600px] h-[600px] 
          -translate-x-1/2 bg-glow blur-[60px] opacity-60 animate-pulse-glow"
        ></div>
      </div>

      <!-- Content Card -->
      <div
        class="w-full bg-surface-100 border border-border-subtle rounded-2xl p-6 md:p-8"
      >
        <ng-content></ng-content>
      </div>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {}
```

---

## How to Add New Tokens

### 1. Add to Design Tokens Package

```scss
// packages/design-tokens/tokens/_colors.scss
:root {
  --nxt1-color-new-token: #value;
}
```

### 2. Add to Tailwind Preset (with fallback)

```javascript
// packages/config/tailwind/preset.js
colors: {
  newToken: 'var(--nxt1-color-new-token, #fallback)',
}
```

### 3. Use in Components

```html
<div class="bg-newToken">...</div>
```

---

## Mobile-Specific (Ionic)

The mobile app extends the preset with Ionic platform colors:

```javascript
// apps/mobile/tailwind.config.js
theme: {
  extend: {
    colors: {
      ionic: {
        primary: 'var(--ion-color-primary)',
        danger: 'var(--ion-color-danger)',
        // ... mapped from Ionic
      }
    }
  }
}
```

Usage in mobile components:

```html
<ion-button class="bg-ionic-primary">Save</ion-button>
```

---

## Build Performance

### Content Paths (Critical)

Both apps include shared packages for proper tree-shaking:

```javascript
content: [
  './src/**/*.{html,ts}',
  '../../packages/ui/**/*.{ts,html}', // ← Shared UI components
  '../../packages/core/src/**/*.{ts,html}', // ← Core package
];
```

### CSS Size Optimization

- Tailwind automatically purges unused classes in production
- Fallback values ensure styles work even without design tokens loaded
- No duplicate CSS - shared preset eliminates redundancy

---

## Migration Checklist

- [x] Created shared Tailwind preset (`@nxt1/config/tailwind`)
- [x] Updated web app to use preset
- [x] Updated mobile app to use preset + Ionic colors
- [x] Deprecated root `tailwind.config.base.js`
- [x] Verified design tokens use `--nxt1-*` naming
- [x] Added packages/ui to content paths
- [x] Verified UI components use correct Tailwind classes

---

## Next Steps (Optional Enhancements)

1. **Add IntelliSense**: Create VS Code extension settings for Tailwind class
   completion
2. **Documentation Site**: Generate live design token documentation
3. **Visual Regression Tests**: Add Chromatic or Percy for UI component testing
4. **Dark/Light Toggle**: Implement runtime theme switching
5. **CSS Custom Property IDE Plugin**: For better --nxt1-\* autocomplete

---

## Quick Reference

| What You Need         | Use This                           |
| --------------------- | ---------------------------------- |
| Primary brand color   | `bg-primary`, `text-primary`       |
| Page background       | `bg-bg-primary`                    |
| Card/modal background | `bg-surface-100`, `bg-surface-200` |
| Primary text          | `text-text-primary`                |
| Secondary text        | `text-text-secondary`              |
| Subtle border         | `border-border-subtle`             |
| Brand font            | `font-brand`                       |
| Spacing (8px)         | `p-sm`, `m-2`, `gap-sm`            |
| Rounded corners       | `rounded-lg`, `rounded-xl`         |
| Glow effect           | `shadow-glow`                      |
