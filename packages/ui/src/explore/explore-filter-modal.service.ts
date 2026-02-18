/**
 * @fileoverview Explore Filter Modal Service
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Opens Explore filters with adaptive presentation:
 * - Mobile/native/touch: bottom sheet
 * - Web desktop: centered modal
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtPlatformService } from '../services/platform';
import { NxtBottomSheetService } from '../components/bottom-sheet';
import type { ExploreFilters, ExploreTabId } from '@nxt1/core';
import { ExploreFilterModalComponent } from './explore-filter-modal.component';

export interface ExploreFilterModalConfig {
  readonly tab: ExploreTabId;
  readonly currentFilters: ExploreFilters;
}

export interface ExploreFilterModalResult {
  readonly applied: boolean;
  readonly filters: ExploreFilters;
}

@Injectable({ providedIn: 'root' })
export class ExploreFilterModalService {
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly platform = inject(NxtPlatformService);

  async open(config: ExploreFilterModalConfig): Promise<ExploreFilterModalResult> {
    const useBottomSheet = this.shouldUseBottomSheet();

    const { data, role } = useBottomSheet
      ? await this.openBottomSheet(config)
      : await this.openWebModal(config);

    return {
      applied: role === 'apply' && data?.confirmed === true,
      filters: data?.filters ?? config.currentFilters,
    };
  }

  private async openBottomSheet(config: ExploreFilterModalConfig): Promise<{
    data?: { confirmed?: boolean; filters?: ExploreFilters };
    role?: string;
  }> {
    const result = await this.bottomSheet.openSheet<{
      confirmed?: boolean;
      filters?: ExploreFilters;
    }>({
      component: ExploreFilterModalComponent,
      componentProps: {
        activeTab: config.tab,
        initialFilters: config.currentFilters,
      },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      backdropDismiss: true,
      cssClass: ['nxt1-picker-modal', 'nxt1-picker-modal--sheet'],
    });

    return {
      data: result.data,
      role: result.role,
    };
  }

  private async openWebModal(config: ExploreFilterModalConfig): Promise<{
    data?: { confirmed?: boolean; filters?: ExploreFilters };
    role?: string;
  }> {
    const modal = await this.modalCtrl.create({
      component: ExploreFilterModalComponent,
      componentProps: {
        activeTab: config.tab,
        initialFilters: config.currentFilters,
      },
      cssClass: 'nxt1-picker-modal nxt1-picker-modal--centered',
      backdropDismiss: true,
      showBackdrop: true,
    });

    await modal.present();

    const result = await modal.onDidDismiss<{
      confirmed?: boolean;
      filters?: ExploreFilters;
    }>();

    return {
      data: result.data,
      role: result.role,
    };
  }

  private shouldUseBottomSheet(): boolean {
    if (this.platform.isNative()) {
      return true;
    }

    if (!this.platform.isBrowser()) {
      return false;
    }

    const viewportWidth = window.innerWidth;
    if (viewportWidth < 768) {
      return true;
    }

    const hasTouch = this.platform.hasTouch();
    if (hasTouch && viewportWidth < 1024) {
      return true;
    }

    return false;
  }
}
