/**
 * @fileoverview NxtAppDownloadBarService - Global Download Bar Visibility Manager
 * @module @nxt1/ui/components/app-download-bar
 * @version 1.0.0
 *
 * Manages the visibility state of the app download promotion bar.
 * Listens to scroll events and reveals the bar when the user scrolls down,
 * hides it when scrolling back to the top.
 *
 * Features:
 * - Scroll-direction detection with configurable threshold
 * - Dismiss persistence via localStorage (user can permanently hide)
 * - SSR-safe with platform guards
 * - Signal-based reactive state
 * - Debounced scroll listener for performance
 * - Auto-hides on native/capacitor (only shows on web)
 *
 * Usage:
 * ```typescript
 * const downloadBar = inject(NxtAppDownloadBarService);
 *
 * // In template
 * @if (downloadBar.isVisible()) {
 *   <nxt1-app-download-bar (dismissed)="downloadBar.dismiss()" />
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Injectable,
  inject,
  signal,
  computed,
  PLATFORM_ID,
  NgZone,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtPlatformService } from '../../services/platform';

/** Configuration options for the download bar */
export interface AppDownloadBarConfig {
  /** Minimum scroll distance (px) before the bar appears */
  readonly scrollThreshold: number;
  /** localStorage key for dismissed state persistence */
  readonly storageKey: string;
  /** Whether to auto-hide when scrolling back to top (within threshold) */
  readonly hideOnScrollTop: boolean;
  /** Delay (ms) before first showing the bar after page load */
  readonly initialDelay: number;
}

/** Default configuration */
const DEFAULT_CONFIG: AppDownloadBarConfig = {
  scrollThreshold: 200,
  storageKey: 'nxt1:download-bar-dismissed',
  hideOnScrollTop: true,
  initialDelay: 1500,
};

@Injectable({ providedIn: 'root' })
export class NxtAppDownloadBarService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly platform = inject(NxtPlatformService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // PRIVATE STATE
  // ============================================

  private readonly _scrolledPastThreshold = signal(false);
  private readonly _dismissed = signal(false);
  private readonly _initialized = signal(false);
  private config: AppDownloadBarConfig = DEFAULT_CONFIG;
  private scrollCleanup: (() => void) | null = null;
  private lastScrollY = -1;
  private rafId: number | null = null;
  private mutationTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly _hasFooter = signal(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  /** Whether the bar has been scrolled into view (past threshold) */
  readonly scrolledPastThreshold = computed(() => this._scrolledPastThreshold());

  /** Whether the user has permanently dismissed the bar */
  readonly dismissed = computed(() => this._dismissed());

  /**
   * Whether the download bar DOM should be mounted.
   * Keeps the element in the DOM so CSS transitions can play on hide.
   * Conditions: initialized, not dismissed, not native, browser.
   */
  readonly shouldRender = computed(
    () => this._initialized() && !this._dismissed() && !this.platform.isNative() && this.isBrowser
  );

  /**
   * Whether the download bar should be in the visible (slid-up) state.
   * Used as CSS class binding for smooth bidirectional transitions.
   */
  readonly isVisible = computed(() => this.shouldRender() && this._scrolledPastThreshold());

  /**
   * Bottom offset in pixels for the download bar.
   * Accounts for mobile footer when present.
   * 16px default, 80px when mobile footer is visible (72px footer + 8px gap).
   */
  readonly bottomOffset = computed(() => (this._hasFooter() ? 80 : 16));

  /** Whether the service is running in a browser context */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize the download bar service.
   * Call this once from the root component's afterNextRender.
   *
   * @param config - Optional partial configuration override
   */
  initialize(config?: Partial<AppDownloadBarConfig>): void {
    if (!this.isBrowser) return;

    this.config = { ...DEFAULT_CONFIG, ...config };

    // Check if user previously dismissed
    this.loadDismissedState();

    // Don't set up scroll listeners if already dismissed
    if (this._dismissed()) return;

    // Set up scroll listener
    this.setupScrollListener();

    // Introduce initial delay so the bar doesn't flash on page load
    setTimeout(() => {
      this._initialized.set(true);
    }, this.config.initialDelay);

    // Clean up on destroy
    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  /**
   * Permanently dismiss the download bar for this user.
   * Stores preference in localStorage for persistence across sessions.
   */
  dismiss(): void {
    this._dismissed.set(true);
    this.persistDismissedState();
    this.cleanup();
  }

  /**
   * Reset the dismissed state (for testing or admin override).
   */
  reset(): void {
    this._dismissed.set(false);

    if (this.isBrowser) {
      try {
        localStorage.removeItem(this.config.storageKey);
      } catch {
        // Storage access may fail in private browsing
      }
    }

    // Re-initialize scroll listener
    this.setupScrollListener();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Resolves the actual scrollable element.
   *
   * The web shell uses `.shell__content` with `overflow-y: auto` as
   * the scroll container (not window scroll). Pages outside the shell
   * (e.g. /welcome, /auth) fall back to window scroll.
   *
   * Uses a MutationObserver to re-attach if the shell mounts after
   * the service initializes (lazy-loaded shell route).
   */
  private setupScrollListener(): void {
    if (!this.isBrowser) return;
    this.cleanup();

    this.ngZone.runOutsideAngular(() => {
      this.detectFooter();

      /**
       * Universal scroll handler — captures scroll events from ANY element.
       *
       * Reads scrollTop directly from event.target (the element that
       * actually scrolled) instead of guessing which element to read.
       * This works on all pages regardless of which container scrolls
       * (.shell__content, .ion-page, body, documentElement, etc.).
       */
      const scrollHandler = (event: Event): void => {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
        }

        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;

          // Read scroll position from the element that actually scrolled
          const target = event.target;
          let scrollY: number;

          if (target === document || target === document.documentElement) {
            scrollY = document.documentElement.scrollTop || window.scrollY;
          } else if (target instanceof Element) {
            scrollY = target.scrollTop;
          } else {
            return;
          }

          // Seed on first read
          if (this.lastScrollY < 0) {
            this.lastScrollY = scrollY;
            return;
          }

          const delta = scrollY - this.lastScrollY;

          // Scroll DOWN past threshold → show bar
          if (delta > 3 && scrollY > this.config.scrollThreshold) {
            if (!this._scrolledPastThreshold()) {
              this.ngZone.run(() => this._scrolledPastThreshold.set(true));
            }
          }

          // Scroll UP → hide bar
          if (delta < -3) {
            if (this._scrolledPastThreshold()) {
              this.ngZone.run(() => this._scrolledPastThreshold.set(false));
            }
          }

          this.lastScrollY = scrollY;
        });
      };

      // Capture-phase listener catches scroll from ALL elements
      document.addEventListener('scroll', scrollHandler, {
        capture: true,
        passive: true,
      });

      // Observe DOM for footer changes (throttled)
      const observer = new MutationObserver(() => {
        if (this.mutationTimeout) return;
        this.mutationTimeout = setTimeout(() => {
          this.mutationTimeout = null;
          this.detectFooter();
        }, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      this.scrollCleanup = () => {
        document.removeEventListener('scroll', scrollHandler, {
          capture: true,
        });
        observer.disconnect();
      };
    });
  }

  /**
   * Detect whether the mobile footer is currently visible.
   * Uses offsetHeight > 0 to verify the element is rendered (not display:none).
   */
  private detectFooter(): void {
    const footer = document.querySelector('nxt1-mobile-footer');
    const isVisible = footer ? (footer as HTMLElement).offsetHeight > 0 : false;
    if (this._hasFooter() !== isVisible) {
      this.ngZone.run(() => this._hasFooter.set(isVisible));
    }
  }

  private loadDismissedState(): void {
    if (!this.isBrowser) return;

    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored === 'true') {
        this._dismissed.set(true);
      }
    } catch {
      // localStorage may be unavailable in private browsing
    }
  }

  private persistDismissedState(): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(this.config.storageKey, 'true');
    } catch {
      // localStorage may be unavailable in private browsing
    }
  }

  private cleanup(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mutationTimeout) {
      clearTimeout(this.mutationTimeout);
      this.mutationTimeout = null;
    }
    if (this.scrollCleanup) {
      this.scrollCleanup();
      this.scrollCleanup = null;
    }
    this.lastScrollY = -1;
  }
}
