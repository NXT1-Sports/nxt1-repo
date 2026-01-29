# NXT1 Gesture Services

> Professional gesture handling for native-feel mobile interactions.

## Overview

The `@nxt1/ui/services/gesture` module provides reusable gesture handling for
native-feel touch interactions. It's designed for 60fps responsiveness with
proper separation of concerns.

## Architecture

```
packages/ui/src/services/gesture/
├── gesture.types.ts       # Pure TypeScript types and interfaces
├── swipe-gesture.ts       # Framework-agnostic gesture handler factory
├── sidenav-gesture.service.ts  # Angular service for sidenav gestures
└── index.ts               # Public API exports
```

## Key Features

- **60fps tracking**: Direct DOM manipulation for instant responsiveness
- **Lazy drag commitment**: Distinguishes taps from drags
- **Velocity-based flicks**: Quick swipes trigger actions based on velocity
- **Direction locking**: Prevents accidental triggers during vertical scrolling
- **Configurable thresholds**: All values from `@nxt1/core` constants

## Usage

### Generic Swipe Gesture (Framework-agnostic)

Use `createSwipeGestureHandler` for custom gesture needs:

```typescript
import { createSwipeGestureHandler } from '@nxt1/ui';

const handler = createSwipeGestureHandler(
  {
    direction: 'horizontal',
    maxDistance: 280,
    commitThreshold: 10,
    velocityThreshold: 0.3,
  },
  {
    onCommit: (state) => {
      // User started dragging (moved beyond threshold)
      element.classList.add('dragging');
    },
    onMove: (state) => {
      // Update UI based on progress (0-1)
      element.style.transform = `translateX(${state.progress * 280}px)`;
    },
    onEnd: (state, result) => {
      // Gesture completed
      if (result.suggestedAction === 'open') {
        // Open the drawer
      }
      element.classList.remove('dragging');
    },
  }
);

// Attach to element
handler.attach(document.body);

// Later, cleanup
handler.destroy();
```

### Sidenav Gesture Service (Angular)

For sidenav/drawer gestures, use the specialized service:

```typescript
import {
  Component,
  inject,
  ElementRef,
  afterNextRender,
  OnDestroy,
} from '@angular/core';
import { NxtSidenavGestureService } from '@nxt1/ui';

@Component({
  selector: 'app-mobile-shell',
  template: `
    <div class="mobile-shell">
      <!-- content -->
    </div>
  `,
})
export class MobileShellComponent implements OnDestroy {
  private readonly gestureService = inject(NxtSidenavGestureService);
  private readonly elementRef = inject(ElementRef);

  constructor() {
    afterNextRender(() => {
      const shellElement =
        this.elementRef.nativeElement.querySelector('.mobile-shell');

      this.gestureService.initialize({
        shellElement,
        onDragStart: () => {
          // Shell-specific drag start logic
        },
        onDragEnd: (isOpen) => {
          // Shell-specific drag end logic
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.gestureService.destroy();
  }
}
```

## Configuration Constants

All gesture thresholds are defined in `@nxt1/core`:

```typescript
import { SIDENAV_GESTURE } from '@nxt1/core';

// Available constants:
SIDENAV_GESTURE.dragCommitThreshold; // 10px - Movement before drag commits
SIDENAV_GESTURE.minSwipeDistance; // 50px - Minimum for swipe recognition
SIDENAV_GESTURE.velocityThreshold; // 0.3 px/ms - Quick flick threshold
SIDENAV_GESTURE.edgeThreshold; // 9999px - Allows swipe from anywhere
SIDENAV_GESTURE.footerSlideDistance; // 140px - Footer slide down distance
```

## Types

### GestureState

Current state during gesture tracking:

```typescript
interface GestureState {
  phase: GesturePhase; // 'idle' | 'started' | 'moved' | 'ended' | 'cancelled'
  isCommitted: boolean; // True after drag commitment threshold
  progress: number; // Normalized progress (0-1)
  deltaX: number; // Raw delta from start
  deltaY: number;
  velocityX: number; // Current velocity (px/ms)
  velocityY: number;
  direction: SwipeDirection | null; // 'left' | 'right' | 'up' | 'down'
  duration: number; // Gesture duration (ms)
}
```

### GestureResult

Result returned when gesture ends:

```typescript
interface GestureResult {
  completed: boolean; // True if gesture completed (vs cancelled)
  finalProgress: number; // Progress at end
  isFlick: boolean; // True if velocity exceeded threshold
  finalVelocity: number; // Velocity at end
  suggestedAction: 'open' | 'close' | 'none'; // Recommended action
  isTap: boolean; // True if no significant movement
  duration: number;
}
```

## CSS Requirements

For the gesture service to work correctly, elements must have these CSS
properties:

```css
/* Shell element */
.mobile-shell {
  transition: transform 300ms ease-out;
  will-change: transform;
}

/* Disable transition during drag */
.mobile-shell.dragging {
  transition: none !important;
}
```

## Best Practices

1. **Initialize after render**: Use `afterNextRender()` to ensure DOM is ready
2. **Cleanup on destroy**: Always call `destroy()` in `ngOnDestroy()`
3. **Use constants**: Import thresholds from `@nxt1/core` for consistency
4. **CSS transitions**: Disable transitions during drag, enable for animations
5. **Haptic feedback**: Provide subtle haptics on gesture completion

## Integration with NxtSidenavService

The gesture service automatically integrates with `NxtSidenavService`:

- Updates `isOpen()` state on gesture completion
- Respects current open/close state for drag direction
- Handles backdrop tap detection (taps on backdrop close sidenav)

```typescript
// The gesture service handles:
// - Opening: swipe right from edge
// - Closing: swipe left or tap backdrop
// - Quick flicks: velocity-based open/close
```
