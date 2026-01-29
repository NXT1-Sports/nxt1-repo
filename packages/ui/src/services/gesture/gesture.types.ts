/**
 * @fileoverview Gesture Types - Type definitions for native gesture handling
 * @module @nxt1/ui/services/gesture
 * @version 1.0.0
 *
 * Pure TypeScript types for gesture handling.
 * Designed for 60fps native-feel interactions.
 */

/**
 * Direction of swipe gesture
 */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | 'horizontal' | 'vertical';

/**
 * Current state of a gesture
 */
export type GesturePhase = 'idle' | 'started' | 'moved' | 'ended' | 'cancelled';

/**
 * Configuration for swipe gesture handler
 */
export interface SwipeGestureConfig {
  /** Direction(s) to track */
  direction: SwipeDirection;

  /** Minimum movement (px) to commit to gesture vs tap */
  commitThreshold: number;

  /** Velocity threshold (px/ms) for quick flick detection */
  velocityThreshold: number;

  /** Edge zone width (px) for edge-only gestures. Set to large value for anywhere. */
  edgeThreshold: number;

  /** Total distance for full gesture (e.g., sidenav width) */
  maxDistance: number;

  /** Whether gesture can start from anywhere or only edge */
  allowFromAnywhere: boolean;

  /** Callback when gesture should be allowed to start */
  canStart?: (state: GestureStartState) => boolean;
}

/**
 * State passed to canStart callback
 */
export interface GestureStartState {
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
  /** Whether touch started in edge zone */
  isEdgeTouch: boolean;
  /** Screen width */
  screenWidth: number;
  /** The element that was touched (for checking interactive elements) */
  target: HTMLElement | null;
}

/**
 * Real-time gesture state during tracking
 */
export interface GestureState {
  /** Current phase of gesture */
  phase: GesturePhase;

  /** Whether gesture has committed (moved beyond threshold) */
  isCommitted: boolean;

  /** Normalized progress (0-1) based on maxDistance */
  progress: number;

  /** Raw delta X from start */
  deltaX: number;

  /** Raw delta Y from start */
  deltaY: number;

  /** Current velocity (px/ms) */
  velocityX: number;

  /** Current velocity Y (px/ms) */
  velocityY: number;

  /** Direction of movement */
  direction: SwipeDirection | null;

  /** Timestamp of gesture start */
  startTime: number;

  /** Current timestamp */
  currentTime: number;

  /** Duration of gesture (ms) */
  duration: number;
}

/**
 * Result of gesture completion
 */
export interface GestureResult {
  /** Whether gesture completed successfully (vs cancelled) */
  completed: boolean;

  /** Final progress value */
  finalProgress: number;

  /** Whether this was a quick flick (velocity-based) */
  isFlick: boolean;

  /** Velocity at end */
  finalVelocity: number;

  /** Suggested action based on progress/velocity */
  suggestedAction: 'open' | 'close' | 'none';

  /** Whether this was just a tap (no significant movement) */
  isTap: boolean;

  /** Duration of gesture */
  duration: number;
}

/**
 * Callbacks for gesture events
 */
export interface GestureCallbacks {
  /** Called when gesture starts (touch down in valid zone) */
  onStart?: (state: GestureState) => void;

  /** Called when gesture commits (moved beyond threshold) */
  onCommit?: (state: GestureState) => void;

  /** Called on each move update (60fps) */
  onMove?: (state: GestureState) => void;

  /** Called when gesture ends */
  onEnd?: (state: GestureState, result: GestureResult) => void;

  /** Called when gesture is cancelled */
  onCancel?: (state: GestureState) => void;
}

/**
 * Interface for gesture handler instance
 */
export interface GestureHandler {
  /** Attach gesture tracking to an element */
  attach(element: HTMLElement): void;

  /** Detach and cleanup */
  detach(): void;

  /** Check if currently attached */
  isAttached(): boolean;

  /** Get current state */
  getState(): GestureState;

  /** Programmatically cancel current gesture */
  cancel(): void;

  /** Update configuration */
  updateConfig(config: Partial<SwipeGestureConfig>): void;

  /** Destroy handler and cleanup */
  destroy(): void;
}

/**
 * Default gesture configuration values
 */
export const DEFAULT_GESTURE_CONFIG: SwipeGestureConfig = {
  direction: 'horizontal',
  commitThreshold: 10,
  velocityThreshold: 0.3,
  edgeThreshold: 9999,
  maxDistance: 280,
  allowFromAnywhere: true,
};

/**
 * Create gesture configuration with defaults
 */
export function createGestureConfig(
  overrides: Partial<SwipeGestureConfig> = {}
): SwipeGestureConfig {
  return {
    ...DEFAULT_GESTURE_CONFIG,
    ...overrides,
  };
}
