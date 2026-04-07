/**
 * @fileoverview Gesture Services - Public API
 * @module @nxt1/ui/services/gesture
 * @version 1.0.0
 *
 * Exports all gesture-related services, types, and factories.
 *
 * Architecture:
 * - gesture.types.ts: Pure TypeScript types and interfaces
 * - swipe-gesture.ts: Framework-agnostic gesture handler factory
 * - sidenav-gesture.service.ts: Angular service for sidenav-specific gestures
 *
 * Usage:
 * ```typescript
 * // For generic swipe gestures (any component)
 * import { createSwipeGestureHandler, SwipeGestureConfig } from '@nxt1/ui';
 *
 * // For sidenav-specific gestures (mobile shell)
 * import { NxtSidenavGestureService } from '@nxt1/ui';
 * ```
 */

// Types
export type {
  SwipeDirection,
  GesturePhase,
  SwipeGestureConfig,
  GestureStartState,
  GestureState,
  GestureResult,
  GestureCallbacks,
  GestureHandler,
} from './gesture.types';

// Values
export { createGestureConfig, DEFAULT_GESTURE_CONFIG } from './gesture.types';

// Generic swipe gesture factory (framework-agnostic)
export { createSwipeGestureHandler } from './swipe-gesture';
export { NxtDragDropDirective } from './drag-drop.directive';

// Angular sidenav gesture service
export { NxtSidenavGestureService } from './sidenav-gesture.service';
export type { SidenavGestureConfig } from './sidenav-gesture.service';
