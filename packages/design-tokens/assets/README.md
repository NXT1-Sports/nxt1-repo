# NXT1 Shared Assets

This directory contains brand assets shared across all NXT1 applications (web,
mobile, etc.).

## Directory Structure

```
assets/
├── index.ts          # TypeScript exports for asset paths
└── logo/             # Logo assets
    ├── nxt1_logo.avif # Main logo (AVIF, ~10KB, modern browsers)
    └── nxt1_icon.png  # NXT1 lightning bolt icon (PNG)
└── images/           # Shared people images (athletes/coaches)
  ├── athlete-1.png
  ├── athlete-2.png
  ├── athlete-3.png
  └── coach-1.png
```

## Usage

### Option 1: Direct Path (Simple)

```html
<!-- In templates -->
<img src="assets/shared/logo/nxt1_logo.avif" alt="NXT1" class="nxt1-logo" />
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
const logoSrc = LOGO_PATHS.main; // 'assets/shared/logo/nxt1_logo.avif'
const iconSrc = LOGO_PATHS.icon; // 'assets/shared/logo/nxt1_icon.png'
const { width, height } = LOGO_DIMENSIONS.main; // { width: 600, height: 180 }
```

```typescript
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

const athleteImage = IMAGE_PATHS.athlete1; // 'assets/shared/images/athlete-1.png'
const coachImage = IMAGE_PATHS.coach1; // 'assets/shared/images/coach-1.png'
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
