/**
 * @fileoverview Sidenav Gesture Service - Angular service wrapper for sidenav gestures
 * @module @nxt1/ui/services/gesture
 * @version 1.0.0
 *
 * Angular service that wraps the swipe gesture handler specifically for sidenav use.
 * Handles the DOM manipulation for sidenav, shell, backdrop, and footer elements.
 *
 * This service provides:
 * - Automatic element caching for 60fps manipulation
 * - CSS class management for drag states
 * - Transform application during gesture
 * - Integration with NxtSidenavService for state management
 *
 * @example
 * ```typescript
 * export class MobileShellComponent implements OnInit, OnDestroy {
 *   private readonly gestureService = inject(NxtSidenavGestureService);
 *
 *   ngOnInit(): void {
 *     this.gestureService.initialize({
 *       shellElement: this.elementRef.nativeElement.querySelector('.mobile-shell'),
 *       footerSlideDistance: 140,
 *     });
 *   }
 *
 *   ngOnDestroy(): void {
 *     this.gestureService.destroy();
 *   }
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SIDENAV_WIDTHS, SIDENAV_GESTURE } from '@nxt1/core';
import { NxtSidenavService } from '../../components/sidenav/sidenav.service';
import { HapticsService } from '../haptics/haptics.service';
import { createSwipeGestureHandler } from './swipe-gesture';
import { GestureHandler, GestureState, GestureResult } from './gesture.types';

/**
 * Configuration for sidenav gesture initialization
 */
export interface SidenavGestureConfig {
  /** The shell element that gets translated */
  shellElement: HTMLElement;

  /** Optional: Footer slide distance (defaults to SIDENAV_GESTURE.footerSlideDistance) */
  footerSlideDistance?: number;

  /** Optional: Sidenav width (defaults to SIDENAV_WIDTHS.default) */
  sidenavWidth?: number;

  /** Optional: Called when gesture commits (for adding dragging classes) */
  onDragStart?: () => void;

  /** Optional: Called when gesture ends (for cleanup) */
  onDragEnd?: (isOpen: boolean) => void;
}

/**
 * Service for managing sidenav swipe gestures
 *
 * Provides native-feel gesture handling for sidenav open/close.
 * Integrates with NxtSidenavService for state management.
 */
@Injectable({ providedIn: 'root' })
export class NxtSidenavGestureService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly haptics = inject(HapticsService);

  /** Gesture handler instance */
  private gestureHandler: GestureHandler | null = null;

  /** Cached DOM elements for 60fps manipulation */
  private shellEl: HTMLElement | null = null;
  private sidenavPanelEl: HTMLElement | null = null;
  private sidenavBackdropEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;

  /** Configuration values */
  private sidenavWidth = SIDENAV_WIDTHS.default as number;
  private footerSlideDistance = SIDENAV_GESTURE.footerSlideDistance as number;
  private cachedEffectiveWidth = 0;

  /** Custom callbacks */
  private onDragStartCallback?: () => void;
  private onDragEndCallback?: (isOpen: boolean) => void;

  /** Whether gesture is initialized */
  private isInitialized = false;

  /**
   * Initialize sidenav gesture handling
   *
   * @param config - Configuration with shell element and options
   */
  initialize(config: SidenavGestureConfig): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.isInitialized) {
      this.destroy();
    }

    // Store configuration
    this.shellEl = config.shellElement;
    this.sidenavWidth = config.sidenavWidth ?? SIDENAV_WIDTHS.default;
    this.footerSlideDistance = config.footerSlideDistance ?? SIDENAV_GESTURE.footerSlideDistance;
    this.onDragStartCallback = config.onDragStart;
    this.onDragEndCallback = config.onDragEnd;

    // Create gesture handler
    this.gestureHandler = createSwipeGestureHandler(
      {
        direction: 'horizontal',
        maxDistance: this.sidenavWidth,
        commitThreshold: SIDENAV_GESTURE.dragCommitThreshold,
        velocityThreshold: SIDENAV_GESTURE.velocityThreshold,
        edgeThreshold: SIDENAV_GESTURE.edgeThreshold,
        allowFromAnywhere: true,
        canStart: (state) => this.canStartGesture(state),
      },
      {
        onCommit: (state) => this.handleGestureCommit(state),
        onMove: (state) => this.handleGestureMove(state),
        onEnd: (state, result) => this.handleGestureEnd(state, result),
        onCancel: () => this.handleGestureCancel(),
      }
    );

    // Attach to document body for full-screen gesture capture
    this.zone.runOutsideAngular(() => {
      this.gestureHandler?.attach(document.body);
    });

    this.isInitialized = true;
  }

  /**
   * Destroy gesture handling and cleanup
   */
  destroy(): void {
    this.gestureHandler?.destroy();
    this.gestureHandler = null;
    this.shellEl = null;
    this.sidenavPanelEl = null;
    this.sidenavBackdropEl = null;
    this.footerEl = null;
    this.isInitialized = false;
  }

  /**
   * Interactive element selectors that should NOT trigger gesture
   * Taps on these elements should behave normally (clicks, not swipes)
   */
  private static readonly INTERACTIVE_SELECTORS = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'ion-button',
    'ion-item',
    'ion-toggle',
    'ion-checkbox',
    'ion-radio',
    'ion-select',
    'ion-segment-button',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '.theme-option', // Theme selector options
    '.sidenav-item', // Sidenav menu items
    '.sidenav-user-header', // User header (clickable)
    '.social-link', // Social links
  ].join(',');

  /**
   * Check if an element or its ancestors match interactive selectors
   */
  private isInteractiveElement(element: HTMLElement | null): boolean {
    if (!element) return false;

    // Check the element itself and its ancestors up to sidenav panel
    let current: HTMLElement | null = element;
    while (current) {
      // Stop at sidenav panel boundary
      if (current.classList.contains('sidenav-panel')) {
        return false;
      }

      // Check if current element is interactive
      if (current.matches(NxtSidenavGestureService.INTERACTIVE_SELECTORS)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  /**
   * Check if touch is inside the sidenav panel
   */
  private isTouchInsideSidenavPanel(target: HTMLElement | null): boolean {
    if (!target) return false;
    return !!target.closest('.sidenav-panel');
  }

  /**
   * Check if gesture should be allowed to start
   */
  private canStartGesture(state: {
    startX: number;
    isEdgeTouch: boolean;
    target?: HTMLElement | null;
  }): boolean {
    const isOpen = this.sidenavService.isOpen();

    // When closed: allow from edge zone only (for opening)
    if (!isOpen) {
      return state.isEdgeTouch || state.startX <= SIDENAV_GESTURE.edgeThreshold;
    }

    // When open: check if touch is on interactive element inside sidenav
    // If so, don't start gesture - let the tap/click through
    if (state.target && this.isTouchInsideSidenavPanel(state.target)) {
      if (this.isInteractiveElement(state.target)) {
        // Let interactive elements handle their own events
        return false;
      }
    }

    return true;
  }

  /**
   * Handle gesture commit - notify service and add dragging classes.
   */
  private handleGestureCommit(_state: GestureState): void {
    this.cacheElements();

    // Notify service to set isDragging signal (enables --dragging CSS class on panel)
    this.zone.run(() => this.sidenavService.startDrag());

    // Add dragging classes to shell/footer
    this.shellEl?.classList.add('dragging');
    this.footerEl?.classList.add('dragging');

    this.onDragStartCallback?.();
  }

  /**
   * Cache DOM elements and effective width for consistent drag calculations.
   */
  private cacheElements(): void {
    if (!this.shellEl) return;

    this.sidenavPanelEl = document.querySelector('nxt1-sidenav .sidenav-panel') as HTMLElement;
    this.sidenavBackdropEl = document.querySelector(
      'nxt1-sidenav .sidenav-backdrop'
    ) as HTMLElement;
    this.footerEl = this.shellEl.querySelector('nxt1-mobile-footer') as HTMLElement;
    this.cachedEffectiveWidth = this.getEffectiveSidenavWidth();
  }

  /**
   * Handle gesture move - calculate progress and apply transforms at 60fps.
   */
  private handleGestureMove(state: GestureState): void {
    const isOpen = this.sidenavService.isOpen();

    // Calculate effective progress based on current state
    let effectiveProgress: number;
    if (isOpen) {
      // Closing: 1 → 0
      effectiveProgress = 1 + state.progress * (state.direction === 'left' ? -1 : 0);
      effectiveProgress = Math.max(0, Math.min(1, effectiveProgress));
    } else {
      // Opening: 0 → 1
      effectiveProgress = state.progress;
    }

    this.sidenavService.updateDragProgress(effectiveProgress);
    this.applyDragTransform(effectiveProgress);
  }

  /**
   * Calculate effective sidenav width respecting CSS max-width: calc(100vw - 56px)
   */
  private getEffectiveSidenavWidth(): number {
    const viewportWidth = window.innerWidth;
    return Math.min(this.sidenavWidth, viewportWidth - 56);
  }

  /**
   * Apply transforms to all elements for smooth drag tracking.
   * Shell and panel use identical pixel calculations to stay perfectly aligned.
   */
  private applyDragTransform(progress: number): void {
    const effectiveWidth = this.cachedEffectiveWidth || this.getEffectiveSidenavWidth();
    const translatePx = progress * effectiveWidth;

    // Shell: 0 → +effectiveWidth
    if (this.shellEl) {
      this.shellEl.style.transform = `translateX(${translatePx}px)`;
    }

    // Panel: -effectiveWidth → 0
    if (this.sidenavPanelEl) {
      this.sidenavPanelEl.style.transform = `translateX(${-effectiveWidth + translatePx}px)`;
    }

    // Backdrop
    if (this.sidenavBackdropEl) {
      this.sidenavBackdropEl.style.opacity = `${progress * 0.5}`;
      this.sidenavBackdropEl.style.pointerEvents = progress > 0 ? 'auto' : 'none';
    }

    // Footer
    if (this.footerEl) {
      const footerTranslate = progress * this.footerSlideDistance;
      this.footerEl.style.transform = `translateY(${footerTranslate}px)`;
      this.footerEl.style.opacity = `${1 - progress}`;
    }
  }

  /**
   * Handle gesture end - determine final state
   */
  private handleGestureEnd(state: GestureState, result: GestureResult): void {
    const wasOpen = this.sidenavService.isOpen();

    // Handle tap on backdrop
    if (result.isTap && wasOpen) {
      this.cleanupDragState(false);
      this.zone.run(() => this.sidenavService.endDrag(false));
      return;
    }

    // If no drag committed, ignore
    if (!state.isCommitted) {
      this.cleanupDragState(wasOpen);
      // Still need to end drag state if it was started
      if (this.sidenavService.isDragging()) {
        this.zone.run(() => this.sidenavService.endDrag(wasOpen));
      }
      return;
    }

    // Determine final state based on result
    let shouldOpen: boolean;

    if (wasOpen) {
      // Was open - check if should close
      shouldOpen = result.suggestedAction !== 'close';
    } else {
      // Was closed - check if should open
      shouldOpen = result.suggestedAction === 'open';
    }

    // Cleanup and update state
    this.cleanupDragState(shouldOpen);

    // Use endDrag to properly transition state (sets isDragging=false, isOpen=shouldOpen)
    this.zone.run(() => {
      this.sidenavService.endDrag(shouldOpen);
      if (!shouldOpen && wasOpen) {
        this.haptics.impact('light');
      }
    });

    this.onDragEndCallback?.(shouldOpen);
  }

  /**
   * Handle gesture cancel
   */
  private handleGestureCancel(): void {
    const isOpen = this.sidenavService.isOpen();
    this.cleanupDragState(isOpen);
  }

  /**
   * Clean up after drag - remove inline styles and let CSS transitions take over
   */
  private cleanupDragState(_isOpen: boolean): void {
    // Remove dragging classes
    this.shellEl?.classList.remove('dragging');
    this.footerEl?.classList.remove('dragging');

    // Clear inline styles - CSS will handle the final position with transition
    if (this.shellEl) {
      this.shellEl.style.transform = '';
    }

    if (this.sidenavPanelEl) {
      this.sidenavPanelEl.style.transform = '';
    }

    if (this.sidenavBackdropEl) {
      this.sidenavBackdropEl.style.opacity = '';
      this.sidenavBackdropEl.style.pointerEvents = '';
    }

    if (this.footerEl) {
      this.footerEl.style.transform = '';
      this.footerEl.style.opacity = '';
    }
  }
}
