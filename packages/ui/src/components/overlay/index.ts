/**
 * @fileoverview NXT1 Overlay — Barrel Export
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * Shared overlay system for the NXT1 web app.
 * Pure Angular implementation — no Ionic dependency.
 *
 * Usage:
 * ```typescript
 * import { NxtOverlayService } from '@nxt1/ui/components/overlay';
 *
 * const ref = this.overlay.open({
 *   component: MyContentComponent,
 *   inputs: { title: 'Hello' },
 *   size: 'md',
 * });
 *
 * const result = await ref.closed;
 * ```
 */

// Component
export { NxtOverlayComponent } from './overlay.component';

// Service
export { NxtOverlayService } from './overlay.service';

// Types
export type {
  OverlayConfig,
  OverlayRef,
  OverlayResult,
  OverlayDismissReason,
  OverlaySize,
} from './overlay.types';
