# NxtAvatarComponent

> Professional avatar component following patterns from Instagram, Discord,
> Slack, LinkedIn, and Twitter.

## Features

- ✅ **Image loading** with skeleton placeholder animation
- ✅ **Automatic initials** generation from name/email
- ✅ **Consistent colors** per user (deterministic hash-based)
- ✅ **Status indicators** (online/idle/dnd/offline)
- ✅ **Badge support** (verified, premium, pro, count, custom)
- ✅ **Multiple sizes** (xs through 2xl)
- ✅ **Multiple shapes** (circle, rounded, square)
- ✅ **Border/ring** (Instagram stories style)
- ✅ **Clickable** with haptic feedback
- ✅ **Avatar groups** with overflow indicator
- ✅ **Full accessibility** (ARIA labels, keyboard navigation)
- ✅ **SSR-safe** implementation
- ✅ **Dark/light theme** aware

## Installation

The component is included in `@nxt1/ui`:

```typescript
import { NxtAvatarComponent, NxtAvatarGroupComponent } from '@nxt1/ui';
```

## Basic Usage

```html
<!-- Simple avatar with image -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.displayName" size="md" />

<!-- Initials fallback (no image) -->
<nxt1-avatar [name]="'John Doe'" size="lg" />
<!-- Displays "JD" on a consistent colored background -->
```

## Sizes

| Size  | Pixels | Use Case                        |
| ----- | ------ | ------------------------------- |
| `xs`  | 20px   | Inline mentions, dense lists    |
| `sm`  | 28px   | Compact lists, comments         |
| `md`  | 40px   | Standard lists, cards (default) |
| `lg`  | 56px   | Profile headers, expanded cards |
| `xl`  | 80px   | Profile pages, hero sections    |
| `2xl` | 120px  | Full profile view, edit screens |

```html
<nxt1-avatar [name]="user.name" size="xs" />
<nxt1-avatar [name]="user.name" size="sm" />
<nxt1-avatar [name]="user.name" size="md" />
<nxt1-avatar [name]="user.name" size="lg" />
<nxt1-avatar [name]="user.name" size="xl" />
<nxt1-avatar [name]="user.name" size="2xl" />

<!-- Custom size -->
<nxt1-avatar [name]="user.name" [customSize]="64" />
```

## Shapes

```html
<!-- Circle (default) - Instagram, Discord style -->
<nxt1-avatar [src]="user.photoUrl" shape="circle" />

<!-- Rounded - Slack workspace style -->
<nxt1-avatar [src]="team.logoUrl" shape="rounded" />

<!-- Square - Sharp corners -->
<nxt1-avatar [src]="brand.logoUrl" shape="square" />
```

## Status Indicators

Following Discord/Slack conventions:

```html
<!-- Online (green) -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.name" status="online" />

<!-- Idle/Away (amber) -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.name" status="idle" />

<!-- Do Not Disturb (red) -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.name" status="dnd" />

<!-- Offline (gray) -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.name" status="offline" />

<!-- No status indicator -->
<nxt1-avatar [src]="user.photoUrl" [name]="user.name" status="none" />
```

## Badges

### Simple Badge Types

```html
<!-- Verified (Twitter/Instagram blue checkmark) -->
<nxt1-avatar [src]="user.photoUrl" badge="verified" />

<!-- Premium (gold star) -->
<nxt1-avatar [src]="user.photoUrl" badge="premium" />

<!-- Pro account -->
<nxt1-avatar [src]="user.photoUrl" badge="pro" />

<!-- Coach role -->
<nxt1-avatar [src]="user.photoUrl" badge="coach" />

<!-- Athlete role -->
<nxt1-avatar [src]="user.photoUrl" badge="athlete" />

<!-- Team account -->
<nxt1-avatar [src]="user.photoUrl" badge="team" />
```

### Count Badge (Notifications)

```html
<nxt1-avatar [src]="user.photoUrl" [badge]="{ type: 'count', count: 5 }" />

<!-- With max count (shows "99+" for larger numbers) -->
<nxt1-avatar
  [src]="user.photoUrl"
  [badge]="{ type: 'count', count: 150, maxCount: 99 }"
/>
```

### Badge Positioning

```html
<nxt1-avatar
  [src]="user.photoUrl"
  [badge]="{ type: 'verified', position: 'bottom-right' }"
/>

<!-- Available positions: top-right, bottom-right, top-left, bottom-left -->
```

### Custom Badge

```html
<nxt1-avatar
  [src]="user.photoUrl"
  [badge]="{ type: 'custom', icon: 'trophy', position: 'top-right' }"
/>
```

## Border/Ring (Instagram Stories Style)

```html
<!-- Solid color ring -->
<nxt1-avatar
  [src]="user.photoUrl"
  borderColor="var(--nxt-color-primary)"
  [borderWidth]="2"
/>

<!-- Gradient ring for stories (coming soon) -->
<nxt1-avatar [src]="user.photoUrl" borderColor="gradient" [borderWidth]="3" />
```

## Clickable Avatars

```html
<nxt1-avatar
  [src]="user.photoUrl"
  [name]="user.displayName"
  [clickable]="true"
  (avatarClick)="openProfile($event)"
/>
```

```typescript
openProfile(event: AvatarClickEvent): void {
  console.log('Clicked avatar:', event.config.name);
  this.router.navigate(['/profile', this.userId]);
}
```

## Fallback Behavior

The avatar handles missing images gracefully:

1. **Has image URL** → Shows image with skeleton while loading
2. **Image fails** → Falls back to `fallbackSrc` if provided
3. **No image, has name** → Shows initials on colored background
4. **No image, no name** → Shows generic person icon

```html
<!-- With explicit fallback image -->
<nxt1-avatar
  [src]="user.photoUrl"
  [fallbackSrc]="'/assets/default-avatar.png'"
  [name]="user.displayName"
/>
```

## Avatar Groups

Display multiple avatars in a stacked layout:

```html
<nxt1-avatar-group
  [users]="teamMembers"
  [max]="4"
  size="sm"
  (viewAll)="showAllMembers($event)"
/>
```

```typescript
interface User {
  id: string;
  name: string;
  photoUrl: string | null;
}

teamMembers: User[] = [
  { id: '1', name: 'John Doe', photoUrl: 'https://...' },
  { id: '2', name: 'Jane Smith', photoUrl: null },
  { id: '3', name: 'Bob Wilson', photoUrl: 'https://...' },
  // ...more users
];

showAllMembers(event: AvatarGroupOverflowEvent): void {
  console.log(`Showing all ${event.total} members (${event.hidden} hidden)`);
  this.openMembersModal(event.users);
}
```

### Group Options

```html
<!-- Reverse order (newest first on left) -->
<nxt1-avatar-group [users]="users" [reverse]="true" />

<!-- Custom overlap (default: 25%) -->
<nxt1-avatar-group [users]="users" [overlap]="30" />

<!-- Clickable individual avatars -->
<nxt1-avatar-group
  [users]="users"
  [clickable]="true"
  (avatarClick)="onUserClick($event)"
/>
```

## Utility Functions

Pure functions available for custom implementations:

```typescript
import {
  extractInitials,
  getInitialsColor,
  getContrastingTextColor,
  formatBadgeCount,
  sanitizeImageUrl,
} from '@nxt1/ui';

// Extract initials from name
extractInitials('John Doe'); // "JD"
extractInitials('john.doe@email.com'); // "JD"
extractInitials('John'); // "JO"

// Get consistent color for a name
getInitialsColor('John Doe'); // "#3b82f6" (always same for same input)

// Get readable text color
getContrastingTextColor('#3b82f6'); // "white"
getContrastingTextColor('#ffd700'); // "rgba(0, 0, 0, 0.87)"

// Format badge count
formatBadgeCount(5); // "5"
formatBadgeCount(150, 99); // "99+"

// Validate image URL
sanitizeImageUrl('https://...'); // "https://..."
sanitizeImageUrl(null); // null
```

## Accessibility

- Uses appropriate `role="img"` or `role="button"` based on `clickable` state
- Includes comprehensive `aria-label` with name, status, and badge info
- Keyboard navigable when clickable (Enter/Space to activate)
- Focus ring for visibility
- Respects `prefers-reduced-motion` for animations

## API Reference

### NxtAvatarComponent

| Input          | Type                                   | Default    | Description                     |
| -------------- | -------------------------------------- | ---------- | ------------------------------- |
| `src`          | `string \| null`                       | -          | Image source URL                |
| `alt`          | `string`                               | -          | Alt text for image              |
| `name`         | `string`                               | -          | Full name (for initials)        |
| `initials`     | `string`                               | -          | Explicit initials (max 2 chars) |
| `size`         | `AvatarSize`                           | `'md'`     | Preset size                     |
| `customSize`   | `number`                               | -          | Custom size in pixels           |
| `shape`        | `AvatarShape`                          | `'circle'` | Shape variant                   |
| `status`       | `AvatarStatus`                         | -          | Online status                   |
| `badge`        | `AvatarBadgeConfig \| AvatarBadgeType` | -          | Badge config                    |
| `fallbackSrc`  | `string`                               | -          | Fallback image URL              |
| `clickable`    | `boolean`                              | `false`    | Enable click handler            |
| `showSkeleton` | `boolean`                              | `true`     | Show loading skeleton           |
| `borderColor`  | `string`                               | -          | Ring/border color               |
| `borderWidth`  | `number`                               | -          | Ring/border width               |
| `cssClass`     | `string`                               | -          | Custom CSS class                |

| Output        | Type               | Description                         |
| ------------- | ------------------ | ----------------------------------- |
| `avatarClick` | `AvatarClickEvent` | Emitted when clicked (if clickable) |
| `imageLoad`   | `void`             | Emitted when image loads            |
| `imageError`  | `void`             | Emitted when image fails            |

### NxtAvatarGroupComponent

| Input          | Type                | Default    | Description              |
| -------------- | ------------------- | ---------- | ------------------------ |
| `users`        | `AvatarGroupUser[]` | Required   | Array of users           |
| `max`          | `number`            | `4`        | Max visible avatars      |
| `size`         | `AvatarSize`        | `'md'`     | Avatar size              |
| `shape`        | `AvatarShape`       | `'circle'` | Avatar shape             |
| `clickable`    | `boolean`           | `false`    | Enable individual clicks |
| `showSkeleton` | `boolean`           | `true`     | Show loading skeletons   |
| `reverse`      | `boolean`           | `false`    | Reverse stack order      |
| `overlap`      | `number`            | `25`       | Overlap percentage       |

| Output        | Type                       | Description                |
| ------------- | -------------------------- | -------------------------- |
| `avatarClick` | `{ user, event }`          | Individual avatar clicked  |
| `viewAll`     | `AvatarGroupOverflowEvent` | Overflow indicator clicked |
