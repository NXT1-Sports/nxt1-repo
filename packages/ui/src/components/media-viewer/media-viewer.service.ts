/**
 * @fileoverview NxtMediaViewerService — Shared full-screen media viewer
 * @module @nxt1/ui/components/media-viewer
 *
 * Adaptive presentation based on platform:
 * - **Web Desktop**: Pure Angular overlay (NxtOverlayService) — fullscreen
 * - **Mobile/Native**: Native bottom sheet (NxtBottomSheetService) — fullscreen
 *
 * Usage:
 * ```typescript
 * import { NxtMediaViewerService } from '@nxt1/ui/components/media-viewer';
 *
 * @Component({...})
 * export class GalleryComponent {
 *   private readonly mediaViewer = inject(NxtMediaViewerService);
 *
 *   async openImage(url: string): Promise<void> {
 *     await this.mediaViewer.open({
 *       items: [{ url, type: 'image', alt: 'Photo' }],
 *       source: 'gallery',
 *     });
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtLoggingService } from '../../services/logging';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import { NxtBreadcrumbService } from '../../services/breadcrumb';
import { NxtPlatformService } from '../../services/platform';
import { NxtBottomSheetService } from '../bottom-sheet/bottom-sheet.service';
import { NxtOverlayService } from '../overlay';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtMediaViewerContentComponent } from './media-viewer-content.component';
import type { MediaViewerConfig, MediaViewerItem, MediaViewerResult } from './media-viewer.types';

@Injectable({ providedIn: 'root' })
export class NxtMediaViewerService {
  // ── Dependencies ───────────────────────────────────────
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);

  // ── Observability ──────────────────────────────────────
  private readonly logger = inject(NxtLoggingService).child('NxtMediaViewerService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ── Public API ─────────────────────────────────────────

  /**
   * Opens the full-screen media viewer with adaptive presentation:
   * - Web desktop: NxtOverlayService (pure Angular)
   * - Mobile/native: NxtBottomSheetService (Ionic)
   *
   * @param config - Items to display, initial index, and options.
   * @returns The result indicating how the viewer was dismissed.
   */
  async open(config: MediaViewerConfig): Promise<MediaViewerResult | null> {
    if (!config.items?.length) {
      this.logger.warn('open() called with empty items array');
      return null;
    }

    const initialIndex = Math.max(0, Math.min(config.initialIndex ?? 0, config.items.length - 1));
    const showCounter = config.showCounter ?? config.items.length > 1;
    const forceOverlay = config.presentation === 'overlay';
    const forceBottomSheet = config.presentation === 'bottom-sheet';
    const useOverlay = forceOverlay || (!forceBottomSheet && this.shouldUseOverlay());
    const presentation = useOverlay ? 'web-overlay' : 'bottom-sheet';

    this.logger.info('Opening media viewer', {
      count: config.items.length,
      initialIndex,
      source: config.source,
      presentation,
    });
    this.breadcrumb.trackStateChange('media-viewer:opening', {
      count: config.items.length,
      source: config.source,
    });
    this.analytics?.trackEvent(APP_EVENTS.MEDIA_VIEWED, {
      count: config.items.length,
      initialIndex,
      type: config.items[initialIndex]?.type,
      source: config.source ?? 'unknown',
    });

    const prepared = { ...config, initialIndex, showCounter };

    if (useOverlay) {
      return this.openWebOverlay(prepared);
    }

    return this.openBottomSheet(prepared);
  }

  /**
   * Programmatically dismisses the active viewer (if open).
   */
  async dismiss(): Promise<void> {
    if (this.overlay.isOpen()) {
      await this.overlay.dismiss();
    } else {
      await this.bottomSheet.dismiss();
    }
  }

  // ============================================
  // WEB OVERLAY (Desktop — Pure Angular)
  // ============================================

  private async openWebOverlay(
    config: MediaViewerConfig & { initialIndex: number; showCounter: boolean }
  ): Promise<MediaViewerResult> {
    const ref = this.overlay.open<
      NxtMediaViewerContentComponent,
      { lastIndex: number; item: MediaViewerItem | null }
    >({
      component: NxtMediaViewerContentComponent,
      inputs: {
        items: config.items,
        initialIndex: config.initialIndex,
        showShare: config.showShare ?? true,
        showCounter: config.showCounter,
        source: config.source ?? '',
      },
      size: 'full',
      panelClass: 'nxt1-media-viewer-overlay',
      showCloseButton: false,
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Media viewer',
    });

    const overlayResult = await ref.closed;

    const result: MediaViewerResult = {
      role: 'dismiss',
      lastIndex: overlayResult.data?.lastIndex ?? config.initialIndex,
      item: overlayResult.data?.item ?? config.items[config.initialIndex],
    };

    this.logger.info('Media viewer dismissed', {
      role: result.role,
      lastIndex: result.lastIndex,
    });
    this.breadcrumb.trackStateChange('media-viewer:closed', {
      role: result.role,
      lastIndex: result.lastIndex,
    });

    return result;
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Native — Ionic)
  // ============================================

  private async openBottomSheet(
    config: MediaViewerConfig & { initialIndex: number; showCounter: boolean }
  ): Promise<MediaViewerResult> {
    const { data, role } = await this.bottomSheet.openSheet<{
      lastIndex: number;
      item: MediaViewerItem;
    }>({
      component: NxtMediaViewerContentComponent,
      componentProps: {
        items: config.items,
        initialIndex: config.initialIndex,
        showShare: config.showShare ?? true,
        showCounter: config.showCounter,
        source: config.source ?? '',
      },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      showHandle: false,
      backdropDismiss: true,
      cssClass: 'nxt1-media-viewer-modal',
    });

    const result: MediaViewerResult = {
      role: (role as 'dismiss' | 'share') ?? 'dismiss',
      lastIndex: data?.lastIndex ?? config.initialIndex,
      item: data?.item ?? config.items[config.initialIndex],
    };

    this.logger.info('Media viewer dismissed', {
      role: result.role,
      lastIndex: result.lastIndex,
    });
    this.breadcrumb.trackStateChange('media-viewer:closed', {
      role: result.role,
      lastIndex: result.lastIndex,
    });

    return result;
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /**
   * Determines if the web overlay should be used.
   * Same logic as QrCodeService / ExploreFilterModalService.
   */
  private shouldUseOverlay(): boolean {
    // Native apps always use bottom sheet
    if (this.platform.isNative()) {
      return false;
    }

    // SSR: no overlay
    if (!this.platform.isBrowser()) {
      return false;
    }

    // Mobile viewport: bottom sheet
    const viewportWidth = this.platform.viewport().width;
    if (viewportWidth < 768) {
      return false;
    }

    // Touch device under 1024px: bottom sheet
    const hasTouch = this.platform.hasTouch();
    if (hasTouch && viewportWidth < 1024) {
      return false;
    }

    // Desktop web: overlay
    return true;
  }
}
