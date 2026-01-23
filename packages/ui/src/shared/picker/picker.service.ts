/**
 * @fileoverview NxtPickerService - Unified Picker Service
 * @module @nxt1/ui/shared/picker
 * @version 1.0.0
 *
 * Centralized service for opening picker modals. This service provides a clean API
 * for opening sport and position pickers without needing to embed modal templates
 * in every consuming component.
 *
 * Architecture:
 * ```
 * Consumer Component (calls service)
 *         │
 *         ▼
 *   NxtPickerService.openSportPicker() / .openPositionPicker()
 *         │
 *         ▼
 *   ModalController.create()
 *         │
 *         ▼
 *   NxtPickerComponent (dynamic)
 *     ├── NxtPickerShellComponent (consistent chrome)
 *     └── Content Component (sport or position)
 * ```
 *
 * Benefits:
 * - Single modal instance created on-demand (no embedded DOM)
 * - Platform-adaptive presentation (bottom sheet vs centered modal)
 * - Consistent API across all picker types
 * - Type-safe results
 *
 * Usage:
 * ```typescript
 * // Inject the service
 * private readonly picker = inject(NxtPickerService);
 *
 * // Open sport picker
 * async addSport() {
 *   const result = await this.picker.openSportPicker({
 *     selectedSports: ['Football', 'Basketball'],
 *   });
 *   if (result.confirmed && result.sport) {
 *     this.addSportEntry(result.sport);
 *   }
 * }
 *
 * // Open position picker
 * async selectPositions() {
 *   const result = await this.picker.openPositionPicker({
 *     sport: 'Football',
 *     selectedPositions: ['QB', 'WR'],
 *     maxPositions: 5,
 *   });
 *   if (result.confirmed) {
 *     this.positions.set(result.positions);
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { DEFAULT_SPORTS, getPositionGroupsForSport } from '@nxt1/core/constants';
import { NxtPlatformService } from '../../services/platform';
import { NxtPickerComponent } from './picker.component';
import type {
  SportPickerConfig,
  SportPickerResult,
  PositionPickerConfig,
  PositionPickerResult,
} from './picker.types';

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class NxtPickerService {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Open the sport picker modal.
   *
   * @param config - Configuration options
   * @returns Promise resolving to the picker result
   *
   * @example
   * ```typescript
   * const result = await this.picker.openSportPicker({
   *   selectedSports: existingSports,
   *   maxSports: 3,
   * });
   *
   * if (result.confirmed && result.sport) {
   *   this.addSport(result.sport);
   * }
   * ```
   */
  async openSportPicker(config: SportPickerConfig = {}): Promise<SportPickerResult> {
    const modal = await this.createModal({
      mode: 'sport',
      title: config.title ?? 'Select Sport',
      showSearch: config.showSearch ?? true,
      searchPlaceholder: config.searchPlaceholder ?? 'Search sports...',
      showCount: config.showCount ?? false,
      maxCount: config.maxSports ?? 5,
      confirmText: 'Done',
      cancelText: 'Cancel',
      autoFocusSearch: true,
      // Sport-specific props
      addedSports: config.selectedSports ?? [],
      availableSports: config.availableSports ?? DEFAULT_SPORTS,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<SportPickerResult>();

    return data ?? { confirmed: false, sport: null };
  }

  /**
   * Open the position picker modal.
   *
   * @param config - Configuration options
   * @returns Promise resolving to the picker result
   *
   * @example
   * ```typescript
   * const result = await this.picker.openPositionPicker({
   *   sport: 'Football',
   *   selectedPositions: currentPositions,
   *   maxPositions: 5,
   * });
   *
   * if (result.confirmed) {
   *   this.positions.set(result.positions);
   * }
   * ```
   */
  async openPositionPicker(config: PositionPickerConfig): Promise<PositionPickerResult> {
    // Get position groups if not provided
    const positionGroups = config.positionGroups ?? getPositionGroupsForSport(config.sport);
    const maxPositions = config.maxPositions ?? 5;

    const modal = await this.createModal({
      mode: 'position',
      title: config.title ?? 'Select Positions',
      showSearch: config.showSearch ?? false,
      searchPlaceholder: config.searchPlaceholder ?? 'Search positions...',
      showCount: config.showCount ?? true,
      maxCount: maxPositions,
      confirmText: 'Done',
      cancelText: 'Cancel',
      autoFocusSearch: false,
      // Position-specific props
      positionGroups,
      initialSelectedPositions: config.selectedPositions ?? [],
      maxPositions,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<PositionPickerResult>();

    return data ?? { confirmed: false, positions: [] };
  }

  /**
   * Dismiss any open picker modal.
   *
   * @param data - Optional data to pass back
   */
  async dismiss(data?: unknown): Promise<void> {
    await this.modalCtrl.dismiss(data);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Create a modal with platform-adaptive presentation.
   *
   * Presentation Logic:
   * - Native (Capacitor): Always bottom sheet
   * - Mobile viewport (<768px): Always bottom sheet
   * - Touch device: Always bottom sheet
   * - Desktop viewport (≥768px) without touch: Centered modal
   */
  private async createModal(props: Record<string, unknown>) {
    const useBottomSheet = this.shouldUseBottomSheet();

    return this.modalCtrl.create({
      component: NxtPickerComponent,
      componentProps: props,
      // Platform-adaptive presentation
      ...(useBottomSheet
        ? {
            // Mobile/Touch: Bottom sheet with breakpoints
            breakpoints: [0, 0.5, 0.85, 1],
            initialBreakpoint: 0.85,
            handle: true,
            handleBehavior: 'cycle' as const,
            cssClass: 'nxt1-picker-modal nxt1-picker-modal--sheet',
          }
        : {
            // Desktop: Centered modal
            cssClass: 'nxt1-picker-modal nxt1-picker-modal--centered',
          }),
      // Common options
      backdropDismiss: true,
      showBackdrop: true,
    });
  }

  /**
   * Determine if bottom sheet presentation should be used.
   * Uses multiple signals for reliable detection.
   */
  private shouldUseBottomSheet(): boolean {
    // Always use bottom sheet on native apps
    if (this.platform.isNative()) {
      return true;
    }

    // Check if we're in a browser context
    if (!this.platform.isBrowser()) {
      return false; // SSR - default to centered modal
    }

    // Check viewport width - mobile/tablet breakpoint
    const viewportWidth = window.innerWidth;
    if (viewportWidth < 768) {
      return true;
    }

    // Check for touch capability (includes tablets in desktop viewport)
    // hasTouch is a computed signal, so call it as a function
    const hasTouch = this.platform.hasTouch();
    if (hasTouch && viewportWidth < 1024) {
      return true;
    }

    // Desktop with mouse/keyboard - use centered modal
    return false;
  }
}
