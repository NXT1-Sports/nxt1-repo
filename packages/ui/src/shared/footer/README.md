# NxtMobileFooter Component

A professional, cross-platform mobile footer/tab bar component following iOS 18+
and Material Design 3 (2026) best practices.

## Architecture

This component follows the NXT1 monorepo architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     @nxt1/core (100% Portable)              │
│  Pure TypeScript types, constants, helper functions         │
│  FooterTabItem, FooterConfig, DEFAULT_FOOTER_TABS, etc.     │
├─────────────────────────────────────────────────────────────┤
│                      @nxt1/ui (Angular)                      │
│  NxtMobileFooterComponent - Angular component with styling   │
│  Re-exports types from @nxt1/core for convenience           │
└─────────────────────────────────────────────────────────────┘
```

## Features

✅ **Platform-Adaptive Design**

- iOS 18+ styling with SF Symbols, subtle blur, refined haptics
- Material Design 3 with dynamic color, elevation, ripple effects
- Automatic platform detection and styling

✅ **Design Token Integration**

- 100% uses NXT1 design token system
- Supports all app themes (dark/light)
- CSS custom properties for easy customization

✅ **Native UX Patterns**

- Haptic feedback on tab selection
- Active state animations (scale, color transitions)
- Safe area handling for notched devices
- Badge support with animated notifications
- Center action button variant (floating FAB style)

✅ **Accessibility**

- Full ARIA support (tabs, tablist, navigation)
- Keyboard navigation (Arrow keys, Home, End)
- Focus visible states
- Screen reader friendly

✅ **Cross-Platform**

- Works on Web, iOS (Capacitor), and Android
- SSR-safe with proper browser guards
- Route-based active state detection

## Installation

### From @nxt1/ui (Angular apps)

```typescript
import {
  NxtMobileFooterComponent,
  DEFAULT_FOOTER_TABS,
  type FooterTabItem,
  type FooterConfig,
  findTabById,
  createFooterConfig,
} from '@nxt1/ui';
```

### From @nxt1/core (Pure TypeScript - Backend, Mobile, etc.)

```typescript
import {
  type FooterTabItem,
  type FooterConfig,
  DEFAULT_FOOTER_TABS,
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
} from '@nxt1/core';
```

## Basic Usage

```html
<!-- Using default tabs -->
<nxt1-mobile-footer />

<!-- With custom tabs -->
<nxt1-mobile-footer
  [tabs]="myTabs"
  [activeTabId]="currentTab"
  (tabSelect)="onTabSelect($event)"
/>
```

## Configuration

### Tab Item Structure

```typescript
interface FooterTabItem {
  id: string; // Unique identifier
  label: string; // Display label
  icon: NavIconName; // Outline icon (inactive)
  iconActive?: NavIconName; // Filled icon (active)
  route: string; // Navigation route
  routeExact?: boolean; // Exact route matching
  badge?: number; // Notification badge
  ariaLabel?: string; // Accessibility label
  disabled?: boolean; // Disable tab
  isActionButton?: boolean; // Center action button
  actionButtonColor?: string; // Custom action button color
}
```

### Footer Configuration

```typescript
interface FooterConfig {
  showLabels?: boolean; // Show/hide labels
  enableHaptics?: boolean; // Enable haptic feedback
  variant?: FooterVariant; // Visual variant
  hidden?: boolean; // Hide footer
  translucent?: boolean; // Blur background
  indicatorStyle?: 'pill' | 'underline' | 'none';
}
```

## Variants

### Default (with blur)

```html
<nxt1-mobile-footer [config]="{ variant: 'default', translucent: true }" />
```

### Elevated (Material style)

```html
<nxt1-mobile-footer [config]="{ variant: 'elevated' }" />
```

### Floating (pill style)

```html
<nxt1-mobile-footer [config]="{ variant: 'floating' }" />
```

### Transparent

```html
<nxt1-mobile-footer [config]="{ variant: 'transparent' }" />
```

## Custom Tabs Example

```typescript
import type { FooterTabItem } from '@nxt1/ui';

export const MY_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'home',
    iconActive: 'homeFilled',
    route: '/home',
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/discover',
  },
  {
    id: 'create',
    label: 'Create',
    icon: 'sparkles',
    iconActive: 'sparklesFilled',
    route: '/create',
    isActionButton: true, // Center floating button
  },
  {
    id: 'search',
    label: 'Search',
    icon: 'search',
    iconActive: 'searchFilled',
    route: '/search',
    badge: 3, // Show notification badge
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'user',
    iconActive: 'userFilled',
    route: '/profile',
  },
];
```

## Handling Tab Selection

```typescript
import type { FooterTabSelectEvent } from '@nxt1/ui';

@Component({
  // ...
})
export class AppComponent {
  onTabSelect(event: FooterTabSelectEvent): void {
    console.log('Selected tab:', event.tab.id);
    console.log('Previous tab:', event.previousTab?.id);

    // Custom navigation or logic
    if (event.tab.id === 'create') {
      this.openCreateModal();
    }
  }
}
```

## CSS Custom Properties

Override these CSS variables to customize the footer:

```scss
:root {
  // Layout
  --footer-height: 56px;
  --footer-padding-x: 8px;

  // Colors
  --footer-bg: #0a0a0a;
  --footer-border: rgba(255, 255, 255, 0.08);
  --tab-color-inactive: rgba(255, 255, 255, 0.5);
  --tab-color-active: #ccff00;

  // Action button
  --action-button-bg: #ccff00;
  --action-button-color: #000000;
  --action-button-size: 52px;

  // Typography
  --tab-font-size: 10px;
  --tab-font-weight: 500;

  // Animation
  --transition-duration: 150ms;
  --spring-easing: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
```

## Available Icons

Navigation icons available in the design token system:

| Icon Name                         | Description       |
| --------------------------------- | ----------------- |
| `home` / `homeFilled`             | Home navigation   |
| `compass` / `compassFilled`       | Discover/explore  |
| `search` / `searchFilled`         | Search            |
| `user` / `userFilled`             | Profile           |
| `sparkles` / `sparklesFilled`     | AI/Agent features |
| `bell` / `bellFilled`             | Notifications     |
| `plusCircle` / `plusCircleFilled` | Create/add        |

## Responsive Behavior

- **Mobile (<768px)**: Full width, 56px height, labels shown
- **Tablet (≥768px)**: Centered, max 480px width, 64px height
- **Desktop (≥1024px)**: Floating variant recommended

## Accessibility

The component implements ARIA best practices:

- `role="navigation"` on the nav element
- `role="tablist"` on the tabs container
- `role="tab"` on each tab button
- `aria-selected` on the active tab
- `aria-current="page"` on the current route
- Full keyboard navigation support

## Performance Notes

- Uses `ChangeDetectionStrategy.OnPush` for optimal performance
- SSR-safe with `afterNextRender` for browser-only operations
- Minimal DOM updates with signal-based state
- Hardware-accelerated animations with `transform` and `opacity`
