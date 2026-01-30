/**
 * @fileoverview NxtScrollService - Cross-Platform Scroll Management
 * @module @nxt1/ui/services/scroll
 * @version 1.0.0
 *
 * Enterprise-grade scroll management service for web and mobile applications.
 * Provides smooth scroll-to-top functionality with accessibility considerations.
 *
 * Features:
 * - Platform-aware: Works on web (window scroll) and Ionic (IonContent)
 * - Accessibility: Respects prefers-reduced-motion preference
 * - SSR-safe: Guards against server-side rendering
 * - Configurable: Customizable scroll behavior and duration
 * - Performance: Debounced to prevent scroll spam
 * - Haptic feedback: Integrates with HapticsService on native platforms
 *
 * Usage:
 * ```typescript
 * import { NxtScrollService } from '@nxt1/ui/services';
 *
 * export class MyComponent {
 *   private scrollService = inject(NxtScrollService);
 *
 *   scrollToTop(): void {
 *     this.scrollService.scrollToTop();
 *   }
 *
 *   // With custom options
 *   scrollToTopSmooth(): void {
 *     this.scrollService.scrollToTop({
 *       behavior: 'smooth',
 *       duration: 500,
 *       enableHaptics: true
 *     });
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HapticsService } from '../haptics';

// ============================================
// TYPES
// ============================================

/**
 * Scroll behavior type
 * - 'smooth': Animated scroll (respects prefers-reduced-motion)
 * - 'instant': Immediate scroll without animation
 * - 'auto': Let browser decide based on CSS scroll-behavior
 */
export type ScrollBehavior = 'smooth' | 'instant' | 'auto';

/**
 * Target element for scrolling
 * - 'window': Main document scroll (web)
 * - 'ionContent': Ionic IonContent element (mobile)
 * - 'custom': Custom element provided via scrollElement option
 */
export type ScrollTarget = 'window' | 'ionContent' | 'custom';

/**
 * Configuration options for scroll-to-top
 */
export interface ScrollToTopOptions {
  /** Scroll behavior - defaults to 'smooth' */
  behavior?: ScrollBehavior;

  /** Duration in ms for smooth scroll (used with custom implementation) */
  duration?: number;

  /** Whether to trigger haptic feedback on native platforms */
  enableHaptics?: boolean;

  /** Target element type - auto-detected if not specified */
  target?: ScrollTarget;

  /** Custom scroll element (when target is 'custom') */
  scrollElement?: HTMLElement | null;

  /** Offset from top to scroll to (default: 0) */
  offset?: number;

  /** Callback after scroll completes */
  onComplete?: () => void;
}

/**
 * Default scroll-to-top options
 */
export const DEFAULT_SCROLL_OPTIONS: Required<ScrollToTopOptions> = {
  behavior: 'smooth',
  duration: 300,
  enableHaptics: true,
  target: 'window',
  scrollElement: null,
  offset: 0,
  onComplete: (): void => {
    // No-op default callback - consumers can override for post-scroll actions
  },
};

/**
 * Debounce time to prevent scroll spam (ms)
 */
const SCROLL_DEBOUNCE_MS = 100;

// ============================================
// SERVICE
// ============================================

/**
 * NxtScrollService
 *
 * Cross-platform scroll management service with accessibility support.
 * Provides scroll-to-top functionality for both web and Ionic mobile apps.
 *
 * Key Features:
 * - Auto-detects platform and uses appropriate scroll method
 * - Respects prefers-reduced-motion for accessibility
 * - Integrates with HapticsService for native feedback
 * - Debounces rapid scroll requests
 * - SSR-safe implementation
 *
 * @example
 * ```typescript
 * // Basic scroll to top
 * await this.scrollService.scrollToTop();
 *
 * // With custom options
 * await this.scrollService.scrollToTop({
 *   behavior: 'smooth',
 *   duration: 400,
 *   enableHaptics: true
 * });
 *
 * // Scroll within IonContent
 * await this.scrollService.scrollToTop({
 *   target: 'ionContent'
 * });
 *
 * // Scroll custom element
 * await this.scrollService.scrollToTop({
 *   target: 'custom',
 *   scrollElement: this.myScrollContainer.nativeElement
 * });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NxtScrollService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);

  /** Whether we're in a browser environment */
  private readonly isBrowser: boolean = isPlatformBrowser(this.platformId);

  /** Last scroll request timestamp for debouncing */
  private lastScrollTime: number = 0;

  /** Current scroll position signal (for reactive tracking) */
  private readonly _scrollPosition = signal<number>(0);

  /** Track if currently scrolling */
  private readonly _isScrolling = signal<boolean>(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  /** Readonly scroll position */
  readonly scrollPosition = computed(() => this._scrollPosition());

  /** Whether scroll is currently in progress */
  readonly isScrolling = computed(() => this._isScrolling());

  /** Whether user prefers reduced motion */
  readonly prefersReducedMotion = computed(() => this.checkPrefersReducedMotion());

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Scroll to the top of the page or container.
   *
   * Automatically handles:
   * - Platform detection (web vs Ionic)
   * - Prefers-reduced-motion accessibility preference
   * - Debouncing rapid requests
   * - Haptic feedback on native platforms
   *
   * @param options - Optional scroll configuration
   * @returns Promise that resolves when scroll completes
   *
   * @example
   * ```typescript
   * // Default smooth scroll
   * await scrollService.scrollToTop();
   *
   * // Instant scroll
   * await scrollService.scrollToTop({ behavior: 'instant' });
   *
   * // Scroll IonContent on mobile
   * await scrollService.scrollToTop({ target: 'ionContent' });
   * ```
   */
  async scrollToTop(options: ScrollToTopOptions = {}): Promise<void> {
    // Guard: SSR safety
    if (!this.isBrowser) {
      return;
    }

    // Guard: Debounce rapid scroll requests
    const now = Date.now();
    if (now - this.lastScrollTime < SCROLL_DEBOUNCE_MS) {
      return;
    }
    this.lastScrollTime = now;

    // Merge with defaults
    const config = { ...DEFAULT_SCROLL_OPTIONS, ...options };

    // Respect prefers-reduced-motion
    const behavior = this.prefersReducedMotion() ? 'instant' : config.behavior;

    // Trigger haptic feedback
    if (config.enableHaptics) {
      await this.haptics.impact('light');
    }

    // Mark as scrolling
    this._isScrolling.set(true);

    try {
      // Execute scroll based on target
      await this.executeScroll(config, behavior);

      // Call completion callback safely
      if (typeof config.onComplete === 'function') {
        config.onComplete();
      }
    } catch (error) {
      // Log but don't throw - scroll failures shouldn't crash the app
      console.warn('[NxtScrollService] Scroll failed:', error);
    } finally {
      // Mark scrolling complete
      this._isScrolling.set(false);
    }
  }

  /**
   * Scroll to a specific element by selector or element reference.
   *
   * @param target - CSS selector string or HTMLElement
   * @param options - Optional scroll configuration
   * @returns Promise that resolves when scroll completes
   *
   * @example
   * ```typescript
   * // Scroll to element by selector
   * await scrollService.scrollToElement('#section-2');
   *
   * // Scroll to element reference
   * await scrollService.scrollToElement(this.targetElement.nativeElement);
   * ```
   */
  async scrollToElement(
    target: string | HTMLElement,
    options: Omit<ScrollToTopOptions, 'offset'> & { offset?: number } = {}
  ): Promise<void> {
    if (!this.isBrowser) return;

    try {
      const element = typeof target === 'string' ? document.querySelector(target) : target;

      if (!element) {
        console.warn('[NxtScrollService] Target element not found:', target);
        return;
      }

      const behavior = this.prefersReducedMotion() ? 'instant' : (options.behavior ?? 'smooth');

      if (options.enableHaptics !== false) {
        await this.haptics.impact('light');
      }

      element.scrollIntoView({
        behavior: behavior === 'instant' ? 'instant' : 'smooth',
        block: 'start',
      });

      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
    } catch (error) {
      console.warn('[NxtScrollService] scrollToElement failed:', error);
    }
  }

  /**
   * Update the tracked scroll position.
   * Call this from scroll event listeners to keep the signal in sync.
   *
   * @param position - Current scroll position in pixels (must be non-negative)
   */
  updateScrollPosition(position: number): void {
    // Guard: Ensure position is a valid non-negative number
    const safePosition = Math.max(0, Math.floor(position));
    this._scrollPosition.set(safePosition);
  }

  /**
   * Find and scroll the nearest IonContent element to top.
   * Useful when called from within an Ionic page.
   *
   * @param element - Starting element to search from (default: document body)
   * @param options - Optional scroll configuration
   * @returns Promise that resolves when scroll completes, or false if no IonContent found
   */
  async scrollIonContentToTop(
    element?: HTMLElement,
    options: ScrollToTopOptions = {}
  ): Promise<boolean> {
    if (!this.isBrowser) return false;

    try {
      const ionContent = this.findIonContent(element);
      if (!ionContent) {
        console.debug('[NxtScrollService] No IonContent found, falling back to window scroll');
        await this.scrollToTop({ ...options, target: 'window' });
        return false;
      }

      const behavior = this.prefersReducedMotion() ? 'instant' : (options.behavior ?? 'smooth');
      const duration =
        behavior === 'instant' ? 0 : (options.duration ?? DEFAULT_SCROLL_OPTIONS.duration);

      if (options.enableHaptics !== false) {
        await this.haptics.impact('light');
      }

      // IonContent has a scrollToTop method
      const ionContentEl = ionContent as HTMLElement & {
        scrollToTop: (duration?: number) => Promise<void>;
      };

      if (typeof ionContentEl.scrollToTop === 'function') {
        await ionContentEl.scrollToTop(duration);
        if (typeof options.onComplete === 'function') {
          options.onComplete();
        }
        return true;
      }

      // Fallback: Use native scroll
      ionContent.scrollTo?.({
        top: options.offset ?? 0,
        behavior: behavior === 'instant' ? 'instant' : 'smooth',
      });

      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return true;
    } catch (error) {
      console.warn('[NxtScrollService] scrollIonContentToTop failed:', error);
      return false;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Execute the scroll based on configuration
   */
  private async executeScroll(
    config: Required<ScrollToTopOptions>,
    behavior: ScrollBehavior
  ): Promise<void> {
    switch (config.target) {
      case 'ionContent':
        await this.scrollIonContentToTop(undefined, { ...config, behavior });
        break;

      case 'custom':
        if (config.scrollElement) {
          this.scrollElementToTop(config.scrollElement, behavior, config.offset);
        }
        break;

      case 'window':
      default:
        this.scrollWindowToTop(behavior, config.offset);
        break;
    }
  }

  /**
   * Scroll the main window to top
   */
  private scrollWindowToTop(behavior: ScrollBehavior, offset: number): void {
    if (typeof window === 'undefined') return;

    window.scrollTo({
      top: offset,
      behavior: behavior === 'instant' ? 'instant' : 'smooth',
    });

    this._scrollPosition.set(offset);
  }

  /**
   * Scroll a custom element to top
   */
  private scrollElementToTop(element: HTMLElement, behavior: ScrollBehavior, offset: number): void {
    element.scrollTo({
      top: offset,
      behavior: behavior === 'instant' ? 'instant' : 'smooth',
    });
  }

  /**
   * Find the nearest IonContent element from a starting point
   */
  private findIonContent(startElement?: HTMLElement): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    // If starting element provided, search up the DOM tree
    if (startElement) {
      let current: HTMLElement | null = startElement;
      while (current) {
        if (current.tagName?.toLowerCase() === 'ion-content') {
          return current;
        }
        current = current.parentElement;
      }
    }

    // Fallback: Find first IonContent in document
    return document.querySelector('ion-content');
  }

  /**
   * Check if user prefers reduced motion
   */
  private checkPrefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
