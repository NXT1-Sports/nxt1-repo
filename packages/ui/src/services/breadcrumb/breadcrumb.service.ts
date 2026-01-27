/**
 * @fileoverview UI Breadcrumb Tracking Directive & Service
 * @module @nxt1/ui
 *
 * Provides automatic breadcrumb tracking for Angular components.
 * Breadcrumbs capture user actions leading up to a crash, giving
 * developers the context needed to reproduce bugs.
 *
 * @example
 * ```html
 * <!-- Track button clicks automatically -->
 * <button nxtTrackClick="Login button clicked">Login</button>
 *
 * <!-- Track with additional data -->
 * <button [nxtTrackClick]="'Upgrade clicked'" [trackData]="{ plan: selectedPlan }">
 *   Upgrade
 * </button>
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import {
  Directive,
  Injectable,
  inject,
  input,
  HostListener,
  DestroyRef,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd, NavigationError } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

import { GLOBAL_CRASHLYTICS } from '../../infrastructure/error-handling';
import type { CrashBreadcrumb } from '@nxt1/core/crashlytics';

// ============================================
// BREADCRUMB SERVICE
// ============================================

/**
 * Service for tracking UI breadcrumbs.
 *
 * Automatically tracks:
 * - Navigation events (route changes)
 * - Navigation errors
 *
 * Provides methods for manual tracking:
 * - User clicks
 * - Form submissions
 * - State changes
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class MyComponent {
 *   private readonly breadcrumbs = inject(NxtBreadcrumbService);
 *
 *   onImportantAction() {
 *     this.breadcrumbs.trackUserAction('Important action performed', {
 *       actionType: 'export',
 *       itemCount: 10,
 *     });
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NxtBreadcrumbService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly crashlytics = inject(GLOBAL_CRASHLYTICS, { optional: true });

  private _previousRoute = '';
  private _initialized = false;

  /**
   * Initialize automatic breadcrumb tracking.
   * Call this in your app initialization (app.component.ts or app.config.ts).
   */
  initialize(): void {
    if (this._initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this._initialized = true;

    // Track navigation events
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd | NavigationError =>
            event instanceof NavigationEnd || event instanceof NavigationError
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.trackNavigation(this._previousRoute || '/', event.urlAfterRedirects);
          this._previousRoute = event.urlAfterRedirects;
        } else if (event instanceof NavigationError) {
          this.trackNavigationError(event.url, event.error);
        }
      });

    // Initial route
    this._previousRoute = this.router.url;
    this.addBreadcrumb({
      type: 'navigation',
      message: `App initialized at ${this.router.url}`,
      data: { url: this.router.url },
    });
  }

  /**
   * Track a navigation event
   */
  async trackNavigation(from: string, to: string): Promise<void> {
    await this.addBreadcrumb({
      type: 'navigation',
      message: `Navigated: ${from} → ${to}`,
      data: { from, to },
    });
  }

  /**
   * Track a navigation error
   */
  async trackNavigationError(url: string, error: unknown): Promise<void> {
    await this.addBreadcrumb({
      type: 'error',
      message: `Navigation error: ${url}`,
      data: {
        url,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  /**
   * Track a user action (button click, menu selection, etc.)
   */
  async trackUserAction(action: string, data?: Record<string, unknown>): Promise<void> {
    await this.addBreadcrumb({
      type: 'ui',
      message: action,
      data,
    });
  }

  /**
   * Track a form submission
   */
  async trackFormSubmit(
    formName: string,
    success: boolean,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.addBreadcrumb({
      type: 'ui',
      message: `Form submitted: ${formName} (${success ? 'success' : 'failed'})`,
      data: { formName, success, ...data },
    });
  }

  /**
   * Track an HTTP request
   */
  async trackHttpRequest(
    method: string,
    url: string,
    status: number,
    durationMs?: number
  ): Promise<void> {
    // Mask sensitive URL params
    const safeUrl = url
      .replace(/token=[^&]+/g, 'token=[REDACTED]')
      .replace(/key=[^&]+/g, 'key=[REDACTED]')
      .replace(/password=[^&]+/g, 'password=[REDACTED]');

    await this.addBreadcrumb({
      type: 'http',
      message: `${method} ${safeUrl} → ${status}`,
      data: {
        method,
        status,
        duration_ms: durationMs,
      },
    });
  }

  /**
   * Track a state change
   */
  async trackStateChange(description: string, data?: Record<string, unknown>): Promise<void> {
    await this.addBreadcrumb({
      type: 'state',
      message: description,
      data,
    });
  }

  /**
   * Track user authentication events
   */
  async trackAuth(
    event: 'login' | 'logout' | 'signup' | 'password_reset',
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.addBreadcrumb({
      type: 'user',
      message: `Auth: ${event}`,
      data,
    });
  }

  /**
   * Track a console log (for critical logs only)
   */
  async trackLog(message: string): Promise<void> {
    await this.addBreadcrumb({
      type: 'console',
      message,
    });
  }

  /**
   * Add a raw breadcrumb
   */
  async addBreadcrumb(breadcrumb: CrashBreadcrumb): Promise<void> {
    if (!this.crashlytics) {
      // Crashlytics not available, log to console in dev
      if (
        typeof console !== 'undefined' &&
        (globalThis as unknown as { ngDevMode?: boolean }).ngDevMode
      ) {
        console.debug('[Breadcrumb]', breadcrumb.type, breadcrumb.message, breadcrumb.data);
      }
      return;
    }

    await this.crashlytics.addBreadcrumb({
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================
// CLICK TRACKING DIRECTIVE
// ============================================

/**
 * Directive for tracking button/element clicks as breadcrumbs.
 *
 * @example
 * ```html
 * <!-- Simple usage -->
 * <button nxtTrackClick="Login button clicked">Login</button>
 *
 * <!-- With additional data -->
 * <button
 *   nxtTrackClick="Item selected"
 *   [trackData]="{ itemId: item.id, itemName: item.name }"
 * >
 *   Select
 * </button>
 *
 * <!-- Conditional tracking -->
 * <button
 *   [nxtTrackClick]="isImportant ? 'Important action' : null"
 * >
 *   Maybe Track
 * </button>
 * ```
 */
@Directive({
  selector: '[nxtTrackClick]',
  standalone: true,
})
export class NxtTrackClickDirective {
  private readonly breadcrumbs = inject(NxtBreadcrumbService);

  /** The message to log when clicked */
  readonly nxtTrackClick = input<string | null>('');

  /** Additional data to include with the breadcrumb */
  readonly trackData = input<Record<string, unknown> | undefined>(undefined);

  @HostListener('click', ['$event'])
  async onClick(event: MouseEvent): Promise<void> {
    const message = this.nxtTrackClick();
    if (!message) return;

    // Get element context
    const target = event.target as HTMLElement;
    const elementData = {
      tagName: target.tagName.toLowerCase(),
      id: target.id || undefined,
      className: target.className || undefined,
      ...this.trackData(),
    };

    await this.breadcrumbs.trackUserAction(message, elementData);
  }
}

// ============================================
// FORM TRACKING DIRECTIVE
// ============================================

/**
 * Directive for tracking form submissions as breadcrumbs.
 *
 * @example
 * ```html
 * <form nxtTrackForm="Login form" (ngSubmit)="onSubmit()">
 *   ...
 * </form>
 * ```
 */
@Directive({
  selector: 'form[nxtTrackForm]',
  standalone: true,
})
export class NxtTrackFormDirective {
  private readonly breadcrumbs = inject(NxtBreadcrumbService);

  /** The form name for tracking */
  readonly nxtTrackForm = input.required<string>();

  /** Additional data to include */
  readonly trackData = input<Record<string, unknown> | undefined>(undefined);

  @HostListener('submit', ['$event'])
  async onSubmit(_event: Event): Promise<void> {
    const formName = this.nxtTrackForm();
    if (!formName) return;

    await this.breadcrumbs.trackFormSubmit(formName, true, this.trackData());
  }
}

// ============================================
// VISIBILITY TRACKING DIRECTIVE
// ============================================

/**
 * Directive for tracking when elements become visible (useful for analytics).
 *
 * @example
 * ```html
 * <section nxtTrackVisible="Pricing section viewed">
 *   ...pricing content...
 * </section>
 * ```
 */
@Directive({
  selector: '[nxtTrackVisible]',
  standalone: true,
})
export class NxtTrackVisibleDirective {
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly platformId = inject(PLATFORM_ID);
  private _hasTracked = false;

  /** The message to log when element becomes visible */
  readonly nxtTrackVisible = input.required<string>();

  /** Additional data to include */
  readonly trackData = input<Record<string, unknown> | undefined>(undefined);

  /** Whether to track only once (default: true) */
  readonly trackOnce = input(true);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Use Intersection Observer for efficient visibility tracking
    // This would need the element ref - simplified for now
  }

  /**
   * Call this method when the element becomes visible
   * (integrate with Intersection Observer or scroll events)
   */
  async onVisible(): Promise<void> {
    if (this.trackOnce() && this._hasTracked) return;

    const message = this.nxtTrackVisible();
    if (!message) return;

    this._hasTracked = true;
    await this.breadcrumbs.trackUserAction(message, this.trackData());
  }
}
