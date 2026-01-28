/**
 * @fileoverview Position Picker Service
 * @module @nxt1/ui/components/position-picker
 * @version 1.0.0
 *
 * Service for programmatically opening the position picker modal.
 * This service manages modal lifecycle and provides a clean API for consumers.
 *
 * Architecture Benefits:
 * - Single modal instance in DOM (created on-demand, destroyed on dismiss)
 * - Platform-adaptive presentation (bottom sheet on mobile, modal on web)
 * - Type-safe configuration and results
 * - Clean separation between modal management and consuming components
 * - Automatic cleanup on dismiss
 *
 * Usage:
 * ```typescript
 * @Component({...})
 * export class MyComponent {
 *   private readonly positionPicker = inject(NxtPositionPickerService);
 *
 *   async openPicker() {
 *     const result = await this.positionPicker.open({
 *       sport: 'football',
 *       selectedPositions: ['QB', 'WR'],
 *       positionGroups: this.positionGroups,
 *     });
 *
 *     if (result.confirmed) {
 *       this.updatePositions(result.positions);
 *     }
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtPlatformService } from '../../services/platform';
import { NxtPositionPickerComponent } from './position-picker.component';
import type { PositionPickerConfig, PositionPickerResult } from './position-picker.types';
import { POSITION_PICKER_DEFAULTS } from './position-picker.types';

/**
 * Service for opening the position picker modal.
 *
 * This service abstracts away the modal creation and presentation logic,
 * providing a simple promise-based API for consuming components.
 */
@Injectable({
  providedIn: 'root',
})
export class NxtPositionPickerService {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Open the position picker modal.
   *
   * @param config - Configuration for the picker
   * @returns Promise resolving to the picker result
   *
   * @example
   * ```typescript
   * const result = await this.positionPicker.open({
   *   sport: 'basketball',
   *   selectedPositions: ['PG', 'SG'],
   *   positionGroups: this.groups,
   *   maxPositions: 3,
   * });
   *
   * if (result.confirmed) {
   *   console.log('Selected:', result.positions);
   * }
   * ```
   */
  async open(config: PositionPickerConfig): Promise<PositionPickerResult> {
    // Merge with defaults
    const mergedConfig = {
      maxPositions: config.maxPositions ?? POSITION_PICKER_DEFAULTS.maxPositions,
      title: config.title ?? POSITION_PICKER_DEFAULTS.title,
      showCount: config.showCount ?? POSITION_PICKER_DEFAULTS.showCount,
    };

    // Determine presentation style based on platform (using signals)
    const isNative = this.platform.isNative();
    const isMobileDevice = this.platform.isMobile() || this.platform.isTablet();
    const useBottomSheet = isNative || isMobileDevice;

    // Create the modal
    const modal = await this.modalCtrl.create({
      component: NxtPositionPickerComponent,
      componentProps: {
        sport: config.sport,
        initialPositionGroups: config.positionGroups,
        initialSelectedPositions: config.selectedPositions,
        initialMaxPositions: mergedConfig.maxPositions,
        initialTitle: mergedConfig.title,
        initialShowCount: mergedConfig.showCount,
      },
      // Platform-adaptive presentation
      ...(useBottomSheet
        ? {
            // Mobile: Bottom sheet with breakpoints
            breakpoints: [0, 0.5, 0.75, 1],
            initialBreakpoint: 0.5,
            handle: true,
            handleBehavior: 'cycle' as const,
          }
        : {
            // Web: Centered modal with backdrop
            cssClass: 'nxt1-position-picker-modal-web',
          }),
      // Common options
      backdropDismiss: true,
      showBackdrop: true,
      cssClass: 'nxt1-position-picker-modal',
    });

    // Present the modal
    await modal.present();

    // Wait for dismiss and get result
    const { data } = await modal.onDidDismiss<PositionPickerResult>();

    // Return result (default to cancelled if no data)
    return (
      data ?? {
        confirmed: false,
        positions: [],
      }
    );
  }

  /**
   * Dismiss any currently open position picker modal.
   *
   * This is useful for programmatic dismissal (e.g., on navigation).
   *
   * @returns Promise resolving to true if a modal was dismissed
   */
  async dismiss(): Promise<boolean> {
    const modal = await this.modalCtrl.getTop();
    if (modal) {
      await modal.dismiss(
        {
          confirmed: false,
          positions: [],
        } as PositionPickerResult,
        'programmatic'
      );
      return true;
    }
    return false;
  }
}
