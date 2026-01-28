# NXT1 Sidenav Component

Modern, Twitter/X-inspired sidenav/drawer component for the NXT1 platform.

## Features

- 🎨 **Twitter/X-inspired design** - Smooth animations, glassmorphism effects
- 📱 **Cross-platform** - Works on Web, iOS, and Android
- ♿ **Accessible** - Full ARIA support, keyboard navigation
- 🎯 **Route-aware** - Automatic active state detection
- 📦 **Collapsible sections** - Expandable menu groups
- 🔗 **Social links footer** - Built-in social media links
- 📛 **Badge support** - Notification badges on menu items
- 📳 **Haptic feedback** - Native haptic feedback on interactions
- 🌙 **SSR-safe** - Works with server-side rendering

## Installation

The component is part of `@nxt1/ui`:

```typescript
import { NxtSidenavComponent, NxtSidenavService } from '@nxt1/ui';
```

## Usage

### Basic Usage

```html
<nxt1-sidenav
  [sections]="menuSections"
  [user]="currentUser"
  [config]="sidenavConfig"
  (itemSelect)="onItemSelect($event)"
  (toggle)="onToggle($event)"
/>
```

### With Service Control

```typescript
import { Component, inject } from '@angular/core';
import { NxtSidenavService, NxtSidenavComponent } from '@nxt1/ui';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [NxtSidenavComponent],
  template: `
    <button (click)="openSidenav()">Open Menu</button>
    <nxt1-sidenav [sections]="sections" [user]="user" />
  `,
})
export class AppShellComponent {
  private readonly sidenav = inject(NxtSidenavService);

  openSidenav(): void {
    this.sidenav.open();
  }
}
```

### Configuration

```typescript
import { createSidenavConfig, type SidenavConfig } from '@nxt1/ui';

const config: SidenavConfig = createSidenavConfig({
  variant: 'blur', // 'default' | 'blur' | 'elevated' | 'minimal'
  position: 'left', // 'left' | 'right'
  width: 280, // number or CSS string
  showUserHeader: true,
  showSocialLinks: true,
  enableHaptics: true,
  backdropDismiss: true,
  showCloseButton: true,
});
```

### Menu Structure

```typescript
import type { SidenavSection, SidenavUserData } from '@nxt1/ui';

const menuSections: SidenavSection[] = [
  {
    id: 'main',
    items: [
      { id: 'home', label: 'Home', icon: 'home', route: '/home' },
      { id: 'profile', label: 'Profile', icon: 'user', route: '/profile' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    collapsible: true,
    expanded: false,
    items: [
      { id: 'account', label: 'Account', icon: 'settings', route: '/settings' },
      {
        id: 'logout',
        label: 'Sign Out',
        icon: 'logout',
        action: 'logout',
        variant: 'danger',
      },
    ],
  },
];

const user: SidenavUserData = {
  name: 'John Smith',
  subtitle: 'QB | Class of 2026',
  avatarUrl: 'https://...',
  verified: true,
  isPremium: true,
};
```

## API Reference

### Inputs

| Input         | Type               | Default                 | Description              |
| ------------- | ------------------ | ----------------------- | ------------------------ |
| `sections`    | `SidenavSection[]` | `DEFAULT_SIDENAV_ITEMS` | Menu sections to display |
| `user`        | `SidenavUserData`  | `undefined`             | User data for header     |
| `socialLinks` | `SocialLink[]`     | `DEFAULT_SOCIAL_LINKS`  | Social links for footer  |
| `config`      | `SidenavConfig`    | `createSidenavConfig()` | Configuration options    |

### Outputs

| Output         | Type                     | Description                        |
| -------------- | ------------------------ | ---------------------------------- |
| `itemSelect`   | `SidenavItemSelectEvent` | Emits when menu item is selected   |
| `toggle`       | `SidenavToggleEvent`     | Emits when sidenav opens/closes    |
| `profileClick` | `Event`                  | Emits when user profile is clicked |
| `socialClick`  | `{ social, event }`      | Emits when social link is clicked  |

### Service Methods

```typescript
const sidenav = inject(NxtSidenavService);

sidenav.open(); // Open sidenav
sidenav.close(); // Close sidenav
sidenav.toggle(); // Toggle state
sidenav.isOpen(); // Signal: current state
```

## Design Tokens

The component uses these CSS custom properties:

```css
--sidenav-width: 280px;
--sidenav-bg: var(--nxt1-color-surface-secondary);
--sidenav-text-primary: var(--nxt1-color-text-primary);
--sidenav-item-hover: var(--nxt1-color-surface-hover);
--sidenav-accent: var(--nxt1-color-primary);
```

## Architecture

- **Types**: Pure TypeScript types in `@nxt1/core` (100% portable)
- **Component**: Angular standalone component in `@nxt1/ui`
- **Service**: Injectable service for programmatic control
- **Styling**: CSS custom properties from design tokens
