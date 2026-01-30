# NxtScrollService

Cross-platform scroll management service for NXT1 applications. Provides smooth
scroll-to-top functionality with accessibility support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @nxt1/ui/services/scroll                 │
│   NxtScrollService - Cross-Platform Scroll Management       │
│   ⚡ Platform-aware (Web + Ionic)                           │
│   ♿ Accessibility-first (prefers-reduced-motion)           │
│   📱 Haptic feedback integration                            │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Platform-aware**: Automatically detects web (window scroll) vs Ionic
  (IonContent)
- **Accessibility**: Respects `prefers-reduced-motion` user preference
- **SSR-safe**: Guards against server-side rendering
- **Configurable**: Customizable behavior, duration, and callbacks
- **Debounced**: Prevents scroll spam with built-in debouncing
- **Haptic feedback**: Integrates with `HapticsService` on native platforms

## Usage

### Basic Scroll to Top

```typescript
import { Component, inject } from '@angular/core';
import { NxtScrollService } from '@nxt1/ui';

@Component({...})
export class MyComponent {
  private readonly scrollService = inject(NxtScrollService);

  async scrollToTop(): Promise<void> {
    await this.scrollService.scrollToTop();
  }
}
```

### With Custom Options

```typescript
await this.scrollService.scrollToTop({
  behavior: 'smooth', // 'smooth' | 'instant' | 'auto'
  duration: 500, // Animation duration in ms
  enableHaptics: true, // Trigger haptic feedback
  offset: 100, // Scroll to 100px from top
  onComplete: () => {
    console.log('Scroll complete!');
  },
});
```

### Scroll IonContent (Mobile)

```typescript
// In mobile shell or page component
const scrolled = await this.scrollService.scrollIonContentToTop(
  this.elementRef.nativeElement,
  {
    behavior: 'smooth',
    duration: 300,
  }
);

if (!scrolled) {
  // No IonContent found, fallback to window scroll
  await this.scrollService.scrollToTop({ target: 'window' });
}
```

### Scroll to Element

```typescript
// By selector
await this.scrollService.scrollToElement('#section-2');

// By element reference
await this.scrollService.scrollToElement(this.targetElement.nativeElement);
```

### Reactive Scroll Position Tracking

```typescript
// In template
@if (scrollService.isScrolling()) {
  <div class="scroll-indicator">Scrolling...</div>
}

// In component
readonly scrollPosition = this.scrollService.scrollPosition;
readonly prefersReducedMotion = this.scrollService.prefersReducedMotion;
```

## Integration with Footer Component

The `NxtMobileFooterComponent` emits a `scrollToTop` event when users tap the
currently active tab (Instagram/Twitter pattern).

### Shell Component Integration

```typescript
// mobile-shell.component.ts
import { NxtScrollService, type FooterScrollToTopEvent } from '@nxt1/ui';

@Component({
  template: `
    <nxt1-mobile-footer
      [tabs]="tabs"
      [config]="footerConfig"
      (tabSelect)="onTabSelect($event)"
      (scrollToTop)="onScrollToTop($event)"
    />
  `,
})
export class MobileShellComponent {
  private readonly scrollService = inject(NxtScrollService);

  async onScrollToTop(event: FooterScrollToTopEvent): Promise<void> {
    await this.scrollService.scrollIonContentToTop(
      this.elementRef.nativeElement,
      { behavior: 'smooth', duration: 300 }
    );
  }
}
```

### Footer Configuration

Enable/disable scroll-to-top on same tab tap:

```typescript
readonly footerConfig: FooterConfig = {
  scrollToTopOnSameTap: true,  // Default: true
  // ... other config
};
```

## Accessibility

The service automatically respects the `prefers-reduced-motion` media query:

- When **enabled**: Uses `instant` scroll behavior (no animation)
- When **disabled**: Uses configured scroll behavior (default: `smooth`)

```typescript
// Check if user prefers reduced motion
if (this.scrollService.prefersReducedMotion()) {
  // Avoid other animations too
}
```

## API Reference

### ScrollToTopOptions

| Property        | Type                                   | Default    | Description                              |
| --------------- | -------------------------------------- | ---------- | ---------------------------------------- |
| `behavior`      | `'smooth' \| 'instant' \| 'auto'`      | `'smooth'` | Scroll animation behavior                |
| `duration`      | `number`                               | `300`      | Animation duration in ms                 |
| `enableHaptics` | `boolean`                              | `true`     | Trigger haptic feedback                  |
| `target`        | `'window' \| 'ionContent' \| 'custom'` | `'window'` | Scroll target element                    |
| `scrollElement` | `HTMLElement \| null`                  | `null`     | Custom element (when target is 'custom') |
| `offset`        | `number`                               | `0`        | Offset from top in pixels                |
| `onComplete`    | `() => void`                           | `noop`     | Callback after scroll completes          |

### Methods

| Method                                      | Returns            | Description                     |
| ------------------------------------------- | ------------------ | ------------------------------- |
| `scrollToTop(options?)`                     | `Promise<void>`    | Scroll to top of page/container |
| `scrollToElement(target, options?)`         | `Promise<void>`    | Scroll to specific element      |
| `scrollIonContentToTop(element?, options?)` | `Promise<boolean>` | Scroll Ionic content to top     |
| `updateScrollPosition(position)`            | `void`             | Update tracked scroll position  |

### Computed Signals

| Signal                 | Type              | Description                   |
| ---------------------- | ----------------- | ----------------------------- |
| `scrollPosition`       | `Signal<number>`  | Current scroll position       |
| `isScrolling`          | `Signal<boolean>` | Whether scroll is in progress |
| `prefersReducedMotion` | `Signal<boolean>` | User's motion preference      |

## Best Practices

1. **Always handle fallback**: When using `scrollIonContentToTop`, handle the
   case where no IonContent is found
2. **Respect reduced motion**: Don't add extra animations that bypass the
   service
3. **Use haptics appropriately**: Disable on web where haptics aren't available
4. **Debounce external calls**: If calling from rapid events, the service
   handles internal debouncing
