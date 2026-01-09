# NXT1 Design Token Architecture

## Overview

The NXT1 design token system provides a unified, professional, enterprise-grade
UI foundation that ensures visual consistency across **Ionic Angular Web** and
**Ionic Capacitor Mobile** (iOS and Android) platforms while achieving a **100%
native feel** on each platform.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         @nxt1/design-tokens                                 │
│                    packages/design-tokens/                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    FOUNDATION TOKENS                                 │   │
│  │                     tokens/_index.scss                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  _colors.scss      │ Brand colors, Ionic color system, dark mode    │   │
│  │  _typography.scss  │ Font families, sizes, weights, text styles     │   │
│  │  _spacing.scss     │ 4px base unit scale, safe areas, semantic      │   │
│  │  _elevation.scss   │ Shadows (iOS/Material), z-index scale          │   │
│  │  _radius.scss      │ Border radius scale, platform-adaptive         │   │
│  │  _motion.scss      │ Durations, easings (iOS/Material)              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    COMPONENT STYLES                                  │   │
│  │                  components/_index.scss                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  auth/                                                               │   │
│  │  ├── _auth-base.scss     │ Page layout, containers, headers         │   │
│  │  ├── _auth-form.scss     │ Inputs, validation, form groups          │   │
│  │  ├── _auth-buttons.scss  │ Primary, secondary, social buttons       │   │
│  │  ├── _auth-links.scss    │ Footer, links, terms, messages           │   │
│  │  └── _auth-platform.scss │ iOS/Android/Web native adaptations       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │      apps/web/            │   │      apps/mobile/         │
    │   src/styles.scss         │   │   src/theme/variables.scss│
    │                           │   │   src/global.scss         │
    ├───────────────────────────┤   ├───────────────────────────┤
    │  @use 'tokens'            │   │  @use 'tokens'            │
    │  @use 'components/auth'   │   │  @use 'components/auth'   │
    │                           │   │                           │
    │  + Web-specific vars      │   │  + Ionic Core CSS         │
    │  + Dark theme defaults    │   │  + Platform classes       │
    └───────────────────────────┘   └───────────────────────────┘
```

## File Structure

```
packages/design-tokens/
├── package.json
├── index.scss                    # Main entry point
│
├── tokens/                       # Foundation tokens
│   ├── _index.scss              # Barrel export
│   ├── _colors.scss             # Color system
│   ├── _typography.scss         # Typography system
│   ├── _spacing.scss            # Spacing system
│   ├── _elevation.scss          # Shadows & z-index
│   ├── _radius.scss             # Border radius
│   └── _motion.scss             # Animations
│
└── components/                   # Component patterns
    ├── _index.scss              # Barrel export
    └── auth/                    # Auth component styles
        ├── _index.scss
        ├── _auth-base.scss
        ├── _auth-form.scss
        ├── _auth-buttons.scss
        ├── _auth-links.scss
        └── _auth-platform.scss
```

## How Platform Adaptation Works

### Ionic Platform Classes

Ionic automatically adds platform classes to the `<body>` element:

- `.ios` - iOS devices and iOS-style web
- `.md` - Android/Material Design devices
- `.plt-desktop` - Desktop browsers

### Platform-Specific Overrides

```scss
// Base styles (all platforms)
.nxt1-auth-button {
  --border-radius: var(--nxt1-radius-button);
  height: 48px;
}

// iOS-specific (more rounded, spring animations)
.ios .nxt1-auth-button {
  --border-radius: 12px;
}

// Android/Material (subtle radius, ripple effects)
.md .nxt1-auth-button {
  --border-radius: 4px;
}
```

### What Each Platform Gets

| Feature       | iOS              | Android            | Web          |
| ------------- | ---------------- | ------------------ | ------------ |
| Border Radius | Large (12px)     | Small (4px)        | Medium (8px) |
| Shadows       | Subtle, diffused | Material elevation | Card shadows |
| Animations    | Spring-based     | Standard easing    | Hover states |
| Social Order  | Apple first      | Google first       | Both equal   |
| Safe Areas    | Native handling  | Native handling    | None         |

## CSS Custom Properties

### Color Tokens

```css
/* Brand/Ionic Colors (for Ionic components) */
--ion-color-primary: #3949ab;
--ion-color-primary-contrast: #ffffff;

/* Semantic Colors (for custom components) */
--nxt1-background-primary: #ffffff;
--nxt1-text-primary: #212121;
--nxt1-border-default: #e0e0e0;
```

### Spacing Tokens

```css
--nxt1-spacing-1: 4px;
--nxt1-spacing-2: 8px;
--nxt1-spacing-4: 16px;
--nxt1-page-padding-x: 16px;
--nxt1-form-gap: 16px;
```

### Typography Tokens

```css
--nxt1-heading-2-size: 1.875rem;
--nxt1-body-size: 1rem;
--nxt1-label-size: 0.875rem;
--nxt1-font-weight-semibold: 600;
```

## Usage in Components

### Mobile (Ionic)

```typescript
@Component({
  template: `
    <ion-content class="nxt1-auth-page">
      <div class="nxt1-auth-content">
        <div class="nxt1-auth-card">
          <form class="nxt1-auth-form">
            <div class="nxt1-form-group">
              <label class="nxt1-form-label">Email</label>
              <ion-input class="nxt1-auth-input"></ion-input>
            </div>
            <ion-button class="nxt1-auth-button">Sign In</ion-button>
          </form>
        </div>
      </div>
    </ion-content>
  `
})
```

### Web (Angular)

```typescript
@Component({
  template: `
    <div class="nxt1-auth-page">
      <div class="nxt1-auth-content">
        <div class="nxt1-auth-card">
          <form class="nxt1-auth-form">
            <div class="nxt1-form-group">
              <label class="nxt1-form-label">Email</label>
              <input class="nxt1-auth-input" />
            </div>
            <button class="nxt1-auth-button">Sign In</button>
          </form>
        </div>
      </div>
    </div>
  `
})
```

## Adding New Component Styles

1. Create a new folder in `packages/design-tokens/components/`
2. Add SCSS files with `_` prefix
3. Create `_index.scss` barrel export
4. Add to `components/_index.scss`

Example:

```scss
// packages/design-tokens/components/cards/_card-base.scss
.nxt1-card {
  background: var(--nxt1-background-elevated);
  border-radius: var(--nxt1-radius-card);
  padding: var(--nxt1-card-padding);
  box-shadow: var(--nxt1-shadow-card);
}

.ios .nxt1-card {
  border-radius: var(--nxt1-radius-xl);
}

.md .nxt1-card {
  border-radius: var(--nxt1-radius-lg);
}
```

## Dark Mode

Dark mode is handled automatically via:

1. `@media (prefers-color-scheme: dark)` - System preference
2. `.dark` class on root - Manual toggle

```scss
:root {
  --nxt1-background-primary: #ffffff;
  --nxt1-text-primary: #212121;
}

@media (prefers-color-scheme: dark) {
  :root {
    --nxt1-background-primary: #212121;
    --nxt1-text-primary: #ffffff;
  }
}

.dark {
  --nxt1-background-primary: #212121;
  --nxt1-text-primary: #ffffff;
}
```

## Accessibility

The design tokens include:

- **High contrast mode** support via `@media (prefers-contrast: high)`
- **Reduced motion** support via `@media (prefers-reduced-motion: reduce)`
- Focus visible states for keyboard navigation
- Minimum touch target sizes (48px)
- Color contrast ratios meeting WCAG AA

## Best Practices

1. **Use CSS Custom Properties** - Not SCSS variables directly
2. **Use Semantic Tokens** - `--nxt1-text-primary` not `#212121`
3. **Platform Classes** - Let Ionic add them automatically
4. **Component Classes** - Use `nxt1-` prefix consistently
5. **Minimal Overrides** - Platform styles in `_auth-platform.scss`
