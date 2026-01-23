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
   */
  private async createModal(props: Record<string, unknown>) {
    // Determine presentation style based on platform
    const isNative = this.platform.isNative();
    const isMobileDevice = this.platform.isMobile() || this.platform.isTablet();
    const useBottomSheet = isNative || isMobileDevice;

    return this.modalCtrl.create({
      component: NxtPickerComponent,
      componentProps: props,
      // Platform-adaptive presentation
      ...(useBottomSheet
        ? {
            // Mobile: Bottom sheet with breakpoints
            breakpoints: [0, 0.5, 0.75, 1],
            initialBreakpoint: 0.75,
            handle: true,
            handleBehavior: 'cycle' as const,
          }
        : {
            // Web: Centered modal
            cssClass: 'nxt1-picker-modal-web',
          }),
      // Common options
      backdropDismiss: true,
      showBackdrop: true,
      cssClass: 'nxt1-picker-modal',
    });
  }
}
