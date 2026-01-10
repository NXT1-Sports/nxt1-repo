# NXT1 Shared Assets

This directory contains brand assets shared across all NXT1 applications (web,
mobile, etc.).

## Directory Structure

```
assets/
├── index.ts          # TypeScript exports for asset paths
└── logo/             # Logo assets
    ├── logo.png      # Main logo (PNG, ~50KB)
    ├── logo.avif     # Main logo (AVIF, ~10KB, modern browsers)
    ├── logo_600.avif # Smaller optimized version
    ├── logo_shadows.png # Logo with shadow effects
    ├── lighting_bolt_new.png # Lightning bolt icon
    └── lighting_bolt_small.png # Small lightning bolt
```

## Usage

### Option 1: Direct Path (Simple)

```html
<!-- In templates -->
<img src="assets/shared/logo/logo.png" alt="NXT1" class="nxt1-logo" />

<!-- With AVIF for modern browsers -->
<picture>
  <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
  <img src="assets/shared/logo/logo.png" alt="NXT1" class="nxt1-logo" />
</picture>
```

### Option 2: NxtLogoComponent (Recommended)

```typescript
import { NxtLogoComponent } from '@nxt1/core';

@Component({
  imports: [NxtLogoComponent],
  template: `
    <!-- Basic -->
    <nxt1-logo />

    <!-- With size -->
    <nxt1-logo size="lg" />

    <!-- Auth page variant -->
    <nxt1-logo variant="auth" />
  `
})
```

### Option 3: TypeScript Constants

```typescript
import { LOGO_PATHS, LOGO_DIMENSIONS } from '@nxt1/design-tokens/assets';

// Use in component
const logoSrc = LOGO_PATHS.main; // 'assets/shared/logo/logo.png'
const { width, height } = LOGO_DIMENSIONS.main; // { width: 800, height: 240 }
```

## CSS Classes

The `@nxt1/design-tokens` package provides logo styling classes:

```scss
// Import in your global styles
@use '@nxt1/design-tokens/components/logo';
```

Available classes:

| Class                  | Description               |
| ---------------------- | ------------------------- |
| `.nxt1-logo`           | Base logo styles          |
| `.nxt1-logo--xs`       | Extra small (80px)        |
| `.nxt1-logo--sm`       | Small (120px)             |
| `.nxt1-logo--md`       | Medium (160px, default)   |
| `.nxt1-logo--lg`       | Large (200px)             |
| `.nxt1-logo--xl`       | Extra large (280px)       |
| `.nxt1-logo--xxl`      | XXL (400px)               |
| `.nxt1-logo--header`   | Header context            |
| `.nxt1-logo--auth`     | Auth pages (centered)     |
| `.nxt1-logo--footer`   | Footer context            |
| `.nxt1-logo--splash`   | Splash screen (animated)  |
| `.nxt1-logo--link`     | Clickable logo with hover |
| `.nxt1-bolt`           | Lightning bolt icon       |
| `.nxt1-bolt--animated` | Animated bolt             |

## Build Integration

Assets are automatically copied during build via `angular.json`:

```json
{
  "assets": [
    {
      "glob": "**/*",
      "input": "../../packages/design-tokens/assets/logo",
      "output": "/assets/shared/logo"
    }
  ]
}
```

Both mobile and web apps have this configured.

## Adding New Assets

1. Add files to the appropriate folder in `packages/design-tokens/assets/`
2. Update `assets/index.ts` with path constants
3. Update `angular.json` in each app if needed (for new asset folders)
4. Create SCSS classes in `components/` if needed
