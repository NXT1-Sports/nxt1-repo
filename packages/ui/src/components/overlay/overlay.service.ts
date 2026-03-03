/**
 * @fileoverview NXT1 Overlay Service — Pure Angular Modal Orchestrator
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * Enterprise-grade overlay service built with pure Angular — no Ionic.
 * Dynamically creates NxtOverlayComponent + content components via
 * Angular's createComponent API, appends to document.body, and manages
 * the full lifecycle (create → animate-in → dismiss → animate-out → destroy).
 *
 * Features:
 * - Zero Ionic dependency — uses standard Angular + DOM APIs
 * - Typed `open<Result>()` API with full IntelliSense
 * - Promise-based dismissal with typed result
 * - SSR-safe (no-ops on server)
 * - Singleton guard — prevents double-opening (per overlay ID)
 * - Smooth enter/exit CSS animations
 * - Focus trap + scroll lock + Escape key
 * - Content component receives inputs via `setInput()`
 * - Content component communicates back via output events listened by the service
 *
 * @example
 * ```typescript
 * import { NxtOverlayService } from '@nxt1/ui/components/overlay';
 *
 * @Component({...})
 * export class ProfileComponent {
 *   private readonly overlay = inject(NxtOverlayService);
 *
 *   async openQrCode(): Promise<void> {
 *     const result = await this.overlay.open({
 *       component: QrCodeContentComponent,
 *       inputs: { url: '...', displayName: 'John' },
 *       size: 'lg',
 *       ariaLabel: 'QR Code',
 *     });
 *   }
 * }
 * ```
 *
 * ⭐ WEB ONLY — Mobile continues to use Ionic ModalController ⭐
 */

import {
  Injectable,
  inject,
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  PLATFORM_ID,
  type ComponentRef,
  type Type,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtOverlayComponent } from './overlay.component';
import type {
  OverlayConfig,
  OverlayRef,
  OverlayResult,
  OverlayDismissReason,
} from './overlay.types';

@Injectable({ providedIn: 'root' })
export class NxtOverlayService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly platformId = inject(PLATFORM_ID);

  /** Currently active overlay (singleton guard) */
  private activeOverlay: {
    hostRef: ComponentRef<NxtOverlayComponent>;
    contentRef: ComponentRef<unknown>;
    resolve: (result: OverlayResult<unknown>) => void;
  } | null = null;

  /** Guard: prevents concurrent animate-and-destroy calls (e.g., escape + backdrop at the same time) */
  private isAnimating = false;

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Open an overlay with the given content component.
   *
   * Returns an `OverlayRef` with:
   * - `dismiss(data?)` — programmatic dismissal
   * - `closed` — Promise resolving to the result when dismissed
   *
   * The content component can dismiss itself by emitting a `close` output
   * event with optional data: `close = output<R>()`.
   *
   * @typeParam T - Content component type
   * @typeParam R - Result data type
   */
  open<T, R = unknown>(config: OverlayConfig<T>): OverlayRef<R> {
    // SSR guard
    if (!isPlatformBrowser(this.platformId)) {
      return {
        dismiss: () => {
          /* SSR no-op */
        },
        closed: Promise.resolve({ reason: 'programmatic' as const }),
      };
    }

    // Singleton guard — dismiss existing before opening new
    if (this.activeOverlay) {
      this.destroyOverlay('programmatic');
    }

    // Create resolver for the closed promise
    let resolveResult!: (result: OverlayResult<R>) => void;
    const closedPromise = new Promise<OverlayResult<R>>((resolve) => {
      resolveResult = resolve;
    });

    // 1. Create the host overlay component
    const hostRef = createComponent(NxtOverlayComponent, {
      environmentInjector: this.injector,
    });

    // 2. Configure the host
    const host = hostRef.instance;
    host.size.set(config.size ?? 'md');
    host.backdropDismiss.set(config.backdropDismiss ?? true);
    host.escDismiss.set(config.escDismiss ?? true);
    host.ariaLabel.set(config.ariaLabel);
    host.showCloseButton.set(config.showCloseButton ?? false);
    if (config.maxWidth) {
      host.customMaxWidth.set(config.maxWidth);
    }

    // 3. Create the content component inside the host's ng-content projection
    const contentRef = createComponent(config.component as Type<unknown>, {
      environmentInjector: this.injector,
      hostElement: undefined,
    });

    // 4. Set inputs on the content component
    if (config.inputs) {
      for (const [key, value] of Object.entries(config.inputs)) {
        contentRef.setInput(key, value);
      }
    }

    // 5. Project content into overlay's scrollable content area
    const contentAreaEl = hostRef.location.nativeElement.querySelector('.nxt1-overlay-content');
    if (contentAreaEl) {
      contentAreaEl.appendChild(contentRef.location.nativeElement);
    } else {
      // Fallback: append to panel
      const panelEl = hostRef.location.nativeElement.querySelector('.nxt1-overlay-panel');
      (panelEl ?? hostRef.location.nativeElement).appendChild(contentRef.location.nativeElement);
    }

    // 6. Attach both to Angular's change detection
    this.appRef.attachView(hostRef.hostView);
    this.appRef.attachView(contentRef.hostView);

    // 7. Append overlay to document body
    document.body.appendChild(hostRef.location.nativeElement);

    // 7b. Apply custom panel classes to the panel element
    if (config.panelClass) {
      const classes = Array.isArray(config.panelClass) ? config.panelClass : [config.panelClass];
      const panelEl = hostRef.location.nativeElement.querySelector(
        '.nxt1-overlay-panel'
      ) as HTMLElement | null;
      if (panelEl) {
        classes.forEach((cls) => panelEl.classList.add(cls));
      }
    }

    // 8. Store active overlay
    this.activeOverlay = {
      hostRef,
      contentRef,
      resolve: resolveResult as (result: OverlayResult<unknown>) => void,
    };

    // 9. Listen for dismiss events from the host
    host.dismissed.subscribe((reason: OverlayDismissReason) => {
      this.animateAndDestroy(reason);
    });

    // 10. Listen for 'close'/'dismiss' output from content component (if it has one)
    this.listenForContentClose(contentRef);

    // Return the OverlayRef
    return {
      dismiss: (data?: R) => {
        this.animateAndDestroy('programmatic', data);
      },
      closed: closedPromise,
    };
  }

  /**
   * Dismiss the currently active overlay programmatically.
   */
  async dismiss(): Promise<void> {
    if (this.activeOverlay) {
      await this.animateAndDestroy('programmatic');
    }
  }

  /**
   * Whether an overlay is currently open.
   */
  isOpen(): boolean {
    return this.activeOverlay !== null;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Animate out, then destroy the overlay.
   */
  private async animateAndDestroy(reason: OverlayDismissReason, data?: unknown): Promise<void> {
    if (!this.activeOverlay || this.isAnimating) return;

    this.isAnimating = true;

    try {
      const { hostRef } = this.activeOverlay;

      // Animate out
      await hostRef.instance.animateOut();

      // Destroy with result
      this.destroyOverlay(reason, data);
    } finally {
      this.isAnimating = false;
    }
  }

  /**
   * Immediately destroy the overlay and resolve the promise.
   */
  private destroyOverlay(reason: OverlayDismissReason, data?: unknown): void {
    if (!this.activeOverlay) return;

    const { hostRef, contentRef, resolve } = this.activeOverlay;

    // Resolve the closed promise
    resolve({ reason, data });

    // Detach from change detection
    this.appRef.detachView(contentRef.hostView);
    this.appRef.detachView(hostRef.hostView);

    // Remove from DOM
    const hostEl = hostRef.location.nativeElement as HTMLElement;
    hostEl.parentElement?.removeChild(hostEl);

    // Destroy component refs
    contentRef.destroy();
    hostRef.destroy();

    this.activeOverlay = null;
  }

  /**
   * Listen for a 'close' OutputEmitterRef on the content component.
   * This allows content components to self-dismiss by emitting `close.emit(data)`.
   */
  private listenForContentClose(contentRef: ComponentRef<unknown>): void {
    const instance = contentRef.instance as Record<string, unknown>;

    // Check if the content component has a 'close' output
    // OutputEmitterRef exposes a `subscribe` method
    const closeOutput = instance['close'];
    if (closeOutput && typeof (closeOutput as { subscribe?: unknown }).subscribe === 'function') {
      (closeOutput as { subscribe: (fn: (data: unknown) => void) => void }).subscribe(
        (data: unknown) => {
          this.animateAndDestroy('close', data);
        }
      );
    }

    // Also check for 'dismiss' output (alternative naming)
    const dismissOutput = instance['dismiss'];
    if (
      dismissOutput &&
      typeof (dismissOutput as { subscribe?: unknown }).subscribe === 'function'
    ) {
      (dismissOutput as { subscribe: (fn: (data: unknown) => void) => void }).subscribe(
        (data: unknown) => {
          this.animateAndDestroy('close', data);
        }
      );
    }
  }
}
