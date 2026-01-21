# NXT1 Icon System

Centralized SVG icon registry for cross-platform consistency across web and
mobile apps.

## Directory Structure

```
icons/
└── index.ts          # Icon registry with inline SVG definitions
```

## Features

- **Zero Network Requests**: All icons are inline SVG (no external files)
- **Type-Safe**: TypeScript definitions for all icon names
- **Tree-Shakable**: Only bundle icons you actually use
- **Cross-Platform**: Works identically on web and mobile
- **SSR-Safe**: Pure inline SVG, no dynamic loading
- **Accessible**: Proper ARIA attributes built-in

## Icon Types

### UI Icons (Stroke-based)

Monochrome icons that inherit color from CSS:

- `mail` - Email/envelope icon
- `lock` - Password/security icon
- `eye` - Show password
- `eyeOff` - Hide password
- `alertCircle` - Error/warning icon

### Brand Icons (Multi-color)

Social login provider logos with brand colors:

- `google` - Google logo (4-color)
- `apple` - Apple logo (monochrome, inherits color)
- `microsoft` - Microsoft logo (4-color squares)

## Usage

### Option 1: Icon Component (Recommended)

```typescript
import { NxtIconComponent } from '@nxt1/ui/shared';

@Component({
  imports: [NxtIconComponent],
  template: `
    <!-- Basic usage -->
    <nxt1-icon name="mail" />

    <!-- Custom size -->
    <nxt1-icon name="lock" size="24" />

    <!-- Brand icons -->
    <nxt1-icon name="google" size="20" />
    <nxt1-icon name="apple" />

    <!-- With accessibility -->
    <nxt1-icon
      name="alertCircle"
      [ariaHidden]="false"
      ariaLabel="Error message"
    />
  `
})
```

### Option 2: Direct Registry Access

```typescript
import { ICONS, getIcon } from '@nxt1/design-tokens/assets/icons';

// Get icon definition
const mailIcon = getIcon('mail');

// Use in template
@Component({
  template: `
    <svg [attr.viewBox]="mailIcon.viewBox">
      @for (path of mailIcon.paths; track $index) {
        <path [attr.d]="path.d" [attr.fill]="path.fill" />
      }
    </svg>
  `
})
```

### Option 3: Type-Safe Icon Names

```typescript
import type { IconName, UIIconName, BrandIconName } from '@nxt1/ui/shared';

interface ButtonConfig {
  label: string;
  icon: IconName; // Type-safe icon name
}

const buttons: ButtonConfig[] = [
  { label: 'Email', icon: 'mail' },
  { label: 'Password', icon: 'lock' },
  { label: 'Google', icon: 'google' },
];
```

## CSS Styling

Icon components inherit color from their parent:

```scss
// Change icon color
.my-icon {
  color: var(--nxt1-color-primary);
}

// Custom size via component
<nxt1-icon name="mail" size="32" />

// Or via CSS
.my-icon nxt1-icon {
  width: 32px;
  height: 32px;
}
```

## Adding New Icons

### 1. Add to Icon Registry

Edit `packages/design-tokens/assets/icons/index.ts`:

```typescript
// For UI icons (stroke-based)
export const UI_ICONS = {
  // ... existing icons

  myNewIcon: {
    viewBox: '0 0 24 24',
    type: 'stroke' as const,
    strokeWidth: 2,
    paths: [
      { d: 'M...' }, // SVG path data
      { d: 'M...' }, // Multiple paths if needed
    ],
  },
} as const;

// For brand icons (filled/multi-color)
export const BRAND_ICONS = {
  // ... existing icons

  myBrand: {
    viewBox: '0 0 24 24',
    type: 'fill' as const,
    paths: [
      { d: 'M...', fill: '#FF0000' },
      { d: 'M...', fill: '#00FF00' },
    ],
  },
} as const;
```

### 2. Use Immediately

```typescript
// TypeScript will auto-complete new icon names
<nxt1-icon name="myNewIcon" />
```

## Icon Sources

All icons are open-source and properly licensed:

- **UI Icons**: Based on [Lucide Icons](https://lucide.dev/) (ISC License)
- **Brand Icons**: Official brand guidelines from:
  - [Google Brand Resource Center](https://about.google/brand-resource-center/)
  - [Apple Marketing Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
  - [Microsoft Brand Center](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)

## Best Practices

### ✅ Do

- Use icon component for consistency: `<nxt1-icon name="mail" />`
- Set `ariaHidden="true"` for decorative icons (default)
- Provide `ariaLabel` for semantic icons
- Keep icon size consistent (20px for buttons, 16-24px for UI)

### ❌ Don't

- Don't inline raw SVG in templates (use icon component)
- Don't use raster images (PNG/JPG) for icons
- Don't modify brand icon colors (Google, Microsoft have specific colors)
- Don't use dynamic icon names without type checking

## Platform Compatibility

| Platform       | Support     | Notes                                      |
| -------------- | ----------- | ------------------------------------------ |
| Web (Angular)  | ✅ Full     | Native <nxt1-icon> component               |
| Mobile (Ionic) | ✅ Full     | Same component, zero changes               |
| SSR (Server)   | ✅ Full     | Pure inline SVG, no hydration issues       |
| Functions      | ✅ Registry | Can import ICONS for email templates, etc. |

## Performance

- **Bundle Size**: ~2KB for icon registry (compressed)
- **Runtime**: Zero - icons are inline, no dynamic loading
- **Tree-Shaking**: Only icons you use are included in bundle
- **Network**: Zero requests - all icons inline

## Examples in Codebase

See these components for usage examples:

- [auth-email-form.component.ts](../../ui/src/auth/auth-email-form/auth-email-form.component.ts) -
  Form icons
- [auth-social-buttons.component.ts](../../ui/src/auth/auth-social-buttons/auth-social-buttons.component.ts) -
  Brand icons
- [auth-action-buttons.component.ts](../../ui/src/auth/auth-action-buttons/auth-action-buttons.component.ts) -
  Action icons
