/**
 * @fileoverview Swipe Gesture Handler - Native-feel gesture tracking
 * @module @nxt1/ui/services/gesture
 * @version 1.0.0
 *
 * Factory function for creating swipe gesture handlers.
 * Uses raw touch events for zero-latency, 60fps tracking.
 *
 * Key features:
 * - Lazy drag commitment (tap vs drag detection)
 * - Velocity-based flick detection
 * - Direction locking
 * - Edge detection
 * - Normalized progress output
 *
 * @example
 * ```typescript
 * const handler = createSwipeGestureHandler({
 *   direction: 'horizontal',
 *   maxDistance: 280,
 *   commitThreshold: 10,
 * }, {
 *   onCommit: (state) => addDraggingClass(),
 *   onMove: (state) => updatePosition(state.progress),
 *   onEnd: (state, result) => finishGesture(result.suggestedAction),
 * });
 *
 * handler.attach(document.body);
 * // Later...
 * handler.destroy();
 * ```
 */

import {
  GestureCallbacks,
  GestureHandler,
  GestureResult,
  GestureState,
  SwipeGestureConfig,
  createGestureConfig,
} from './gesture.types';

/**
 * Create initial gesture state
 */
function createInitialState(): GestureState {
  return {
    phase: 'idle',
    isCommitted: false,
    progress: 0,
    deltaX: 0,
    deltaY: 0,
    velocityX: 0,
    velocityY: 0,
    direction: null,
    startTime: 0,
    currentTime: 0,
    duration: 0,
  };
}

/**
 * Create a swipe gesture handler with native-feel responsiveness
 *
 * @param configOverrides - Configuration options
 * @param callbacks - Event callbacks for gesture lifecycle
 * @returns GestureHandler instance
 */
export function createSwipeGestureHandler(
  configOverrides: Partial<SwipeGestureConfig> = {},
  callbacks: GestureCallbacks = {}
): GestureHandler {
  // Configuration
  let config = createGestureConfig(configOverrides);

  // State
  let state = createInitialState();
  let element: HTMLElement | null = null;
  let isAttached = false;

  // Touch tracking
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let lastTouchTime = 0;

  // Bound handlers for cleanup
  let boundTouchStart: ((e: TouchEvent) => void) | null = null;
  let boundTouchMove: ((e: TouchEvent) => void) | null = null;
  let boundTouchEnd: ((e: TouchEvent) => void) | null = null;

  /**
   * Handle touch start - detect gesture initiation
   */
  function handleTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const target = e.target as HTMLElement | null;
    const screenWidth = window.innerWidth;
    const isEdgeTouch = touch.clientX <= config.edgeThreshold;

    // Check if we should start tracking
    const startState = {
      startX: touch.clientX,
      startY: touch.clientY,
      isEdgeTouch,
      screenWidth,
      target, // Pass target element to canStart
    };

    // Custom can-start check
    if (config.canStart && !config.canStart(startState)) {
      return;
    }

    // Default edge check
    if (!config.allowFromAnywhere && !isEdgeTouch) {
      return;
    }

    // Initialize tracking state
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    lastTouchTime = performance.now();

    // Update state
    state = {
      ...createInitialState(),
      phase: 'started',
      startTime: lastTouchTime,
      currentTime: lastTouchTime,
    };

    callbacks.onStart?.(state);
  }

  /**
   * Handle touch move - real-time finger tracking
   */
  function handleTouchMove(e: TouchEvent): void {
    if (state.phase === 'idle' || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const now = performance.now();

    // Calculate deltas
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Check for commit threshold
    if (!state.isCommitted) {
      // For horizontal gestures, require horizontal movement to exceed vertical
      if (
        config.direction === 'horizontal' ||
        config.direction === 'left' ||
        config.direction === 'right'
      ) {
        // Not enough movement yet
        if (absDeltaX < config.commitThreshold && absDeltaY < config.commitThreshold) {
          return;
        }

        // Wrong direction - cancel
        if (absDeltaY > absDeltaX) {
          cancelGesture();
          return;
        }
      }

      // For vertical gestures
      if (
        config.direction === 'vertical' ||
        config.direction === 'up' ||
        config.direction === 'down'
      ) {
        if (absDeltaX < config.commitThreshold && absDeltaY < config.commitThreshold) {
          return;
        }

        if (absDeltaX > absDeltaY) {
          cancelGesture();
          return;
        }
      }

      // Commit to drag
      state.isCommitted = true;
      state.phase = 'moved';
      callbacks.onCommit?.(state);
    }

    // Prevent default to stop scrolling during drag
    e.preventDefault();

    // Calculate velocity
    const timeDelta = now - lastTouchTime;
    if (timeDelta > 0) {
      state.velocityX = (touch.clientX - lastTouchX) / timeDelta;
      state.velocityY = (touch.clientY - lastTouchY) / timeDelta;
    }

    // Update last values
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    lastTouchTime = now;

    // Determine direction
    if (absDeltaX > absDeltaY) {
      state.direction = deltaX > 0 ? 'right' : 'left';
    } else {
      state.direction = deltaY > 0 ? 'down' : 'up';
    }

    // Calculate progress (0-1)
    let progress = 0;
    if (config.direction === 'horizontal' || config.direction === 'right') {
      progress = Math.max(0, Math.min(1, deltaX / config.maxDistance));
    } else if (config.direction === 'left') {
      progress = Math.max(0, Math.min(1, -deltaX / config.maxDistance));
    } else if (config.direction === 'vertical' || config.direction === 'down') {
      progress = Math.max(0, Math.min(1, deltaY / config.maxDistance));
    } else if (config.direction === 'up') {
      progress = Math.max(0, Math.min(1, -deltaY / config.maxDistance));
    }

    // Update state
    state.deltaX = deltaX;
    state.deltaY = deltaY;
    state.progress = progress;
    state.currentTime = now;
    state.duration = now - state.startTime;

    callbacks.onMove?.(state);
  }

  /**
   * Handle touch end - determine final action
   */
  function handleTouchEnd(_e: TouchEvent): void {
    if (state.phase === 'idle') return;

    const now = performance.now();
    state.currentTime = now;
    state.duration = now - state.startTime;
    state.phase = 'ended';

    // Calculate result
    const absVelocity = Math.abs(state.velocityX);
    const isFlick = absVelocity > config.velocityThreshold;
    const isTap = !state.isCommitted;

    // Determine suggested action
    let suggestedAction: 'open' | 'close' | 'none';

    if (isTap) {
      suggestedAction = 'none';
    } else if (isFlick) {
      // Velocity-based decision
      if (config.direction === 'horizontal' || config.direction === 'right') {
        suggestedAction = state.velocityX > 0 ? 'open' : 'close';
      } else if (config.direction === 'left') {
        suggestedAction = state.velocityX < 0 ? 'open' : 'close';
      } else {
        suggestedAction = state.progress > 0.5 ? 'open' : 'close';
      }
    } else {
      // Position-based decision (threshold at 50%)
      suggestedAction = state.progress > 0.5 ? 'open' : 'close';
    }

    const result: GestureResult = {
      completed: true,
      finalProgress: state.progress,
      isFlick,
      finalVelocity: state.velocityX,
      suggestedAction,
      isTap,
      duration: state.duration,
    };

    callbacks.onEnd?.(state, result);

    // Reset state
    state = createInitialState();
  }

  /**
   * Cancel current gesture
   */
  function cancelGesture(): void {
    if (state.phase === 'idle') return;

    state.phase = 'cancelled';
    callbacks.onCancel?.(state);
    state = createInitialState();
  }

  /**
   * Attach gesture tracking to element
   */
  function attach(el: HTMLElement): void {
    if (isAttached) {
      detach();
    }

    element = el;

    // Create bound handlers
    boundTouchStart = handleTouchStart.bind(null);
    boundTouchMove = handleTouchMove.bind(null);
    boundTouchEnd = handleTouchEnd.bind(null);

    // Attach with passive: false for touchmove to allow preventDefault
    element.addEventListener('touchstart', boundTouchStart, { passive: true });
    element.addEventListener('touchmove', boundTouchMove, { passive: false });
    element.addEventListener('touchend', boundTouchEnd, { passive: true });
    element.addEventListener('touchcancel', boundTouchEnd, { passive: true });

    isAttached = true;
  }

  /**
   * Detach from element
   */
  function detach(): void {
    if (!element || !isAttached) return;

    if (boundTouchStart) {
      element.removeEventListener('touchstart', boundTouchStart);
    }
    if (boundTouchMove) {
      element.removeEventListener('touchmove', boundTouchMove);
    }
    if (boundTouchEnd) {
      element.removeEventListener('touchend', boundTouchEnd);
      element.removeEventListener('touchcancel', boundTouchEnd);
    }

    element = null;
    boundTouchStart = null;
    boundTouchMove = null;
    boundTouchEnd = null;
    isAttached = false;
  }

  /**
   * Update configuration
   */
  function updateConfig(newConfig: Partial<SwipeGestureConfig>): void {
    config = { ...config, ...newConfig };
  }

  /**
   * Destroy handler
   */
  function destroy(): void {
    detach();
    state = createInitialState();
  }

  // Return handler interface
  return {
    attach,
    detach,
    isAttached: () => isAttached,
    getState: () => ({ ...state }),
    cancel: cancelGesture,
    updateConfig,
    destroy,
  };
}
