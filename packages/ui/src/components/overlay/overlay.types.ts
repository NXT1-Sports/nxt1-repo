/**
 * @fileoverview NXT1 Overlay Types — Pure Angular Modal System
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * Type definitions for the shared overlay system.
 * This replaces Ionic ModalController with a pure Angular implementation
 * that uses standard web APIs and Angular's component creation system.
 *
 * ⭐ WEB ONLY — Mobile continues to use Ionic ModalController ⭐
 */

import type { Type } from '@angular/core';

// ============================================
// OVERLAY HEADER CONFIG
// ============================================

/**
 * Optional structured header config passed to `NxtOverlayService.open()`.
 * When provided alongside a content component, use `NxtModalHeaderComponent`
 * directly inside the content template for full slot/action support.
 *
 * These types are exported for teams building generic overlay wrappers.
 */
export interface OverlayHeaderConfig {
  /** Title displayed in the modal header. */
  readonly title: string;
  /** Optional small-caps label above the title. */
  readonly subtitle?: string;
  /** Optional icon name. Requires `showIcon: true` to render. */
  readonly icon?: string;
  /** Whether to show the icon. Default false. */
  readonly showIcon?: boolean;
  /** Whether to show the Agent X brand mark. Default false. */
  readonly showAgentXIcon?: boolean;
  /** Shape of the icon container. Default 'circle'. */
  readonly iconShape?: 'circle' | 'rounded';
  /** Position of the close button. Default 'right'. */
  readonly closePosition?: 'left' | 'right' | 'none';
  /** Whether to show a bottom border. Default true. */
  readonly showBorder?: boolean;
}

/**
 * Optional structured footer config for `NxtOverlayService.open()`.
 * For full slot/event support, use `NxtModalFooterComponent` directly
 * inside the content template.
 */
export interface OverlayFooterConfig {
  /** CTA button label. */
  readonly label: string;
  /** Optional icon name. */
  readonly icon?: string;
  /** Visual variant of the CTA button. Default 'primary'. */
  readonly variant?: 'primary' | 'secondary' | 'destructive';
}

// ============================================
// OVERLAY CONFIG
// ============================================

/**
 * Size presets for overlay panels.
 *
 * - `sm` — Narrow dialog (400px) — Alerts, confirmations, auth
 * - `md` — Standard dialog (520px) — Forms, settings
 * - `lg` — Wide dialog (640px) — QR codes, previews
 * - `xl` — Extra wide (800px) — Wizards, multi-step
 * - `full` — Nearly full screen (90vw, 90vh)
 */
export type OverlaySize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Configuration for creating an overlay.
 *
 * @typeParam T - The component type to render inside the overlay
 * @typeParam R - The result type returned when the overlay dismisses
 */
export interface OverlayConfig<T = unknown> {
  /** The Angular component to render inside the overlay panel */
  readonly component: Type<T>;

  /**
   * Input values to set on the component instance.
   * Keys must match `@Input()` property names on the component.
   */
  readonly inputs?: Record<string, unknown>;

  /** Panel size preset (default: 'md') */
  readonly size?: OverlaySize;

  /** Custom CSS class(es) applied to the overlay panel */
  readonly panelClass?: string | string[];

  /** Whether clicking the backdrop dismisses the overlay (default: true) */
  readonly backdropDismiss?: boolean;

  /** Whether pressing Escape dismisses the overlay (default: true) */
  readonly escDismiss?: boolean;

  /**
   * Optional async guard called before backdrop-click or Escape dismissal.
   * Return `true` to allow dismissal, `false` to block it.
   * Use this to show an "unsaved changes?" confirmation.
   *
   * Not called for programmatic `dismiss()` or content `close` output —
   * those paths are already controlled by the caller.
   */
  readonly canDismiss?: () => boolean | Promise<boolean>;

  /** ARIA label for the overlay dialog */
  readonly ariaLabel?: string;

  /** Whether to show a close button in the top-right corner (default: false — content handles its own close) */
  readonly showCloseButton?: boolean;

  /**
   * Custom max-width override (CSS value).
   * Only used when `size` is not set, or to override a preset.
   */
  readonly maxWidth?: string;
}

// ============================================
// OVERLAY RESULT
// ============================================

/**
 * Result returned when an overlay is dismissed.
 *
 * @typeParam R - The data type carried in the result
 */
export interface OverlayResult<R = unknown> {
  /** How the overlay was dismissed */
  readonly reason: OverlayDismissReason;

  /** Data returned by the content component (if any) */
  readonly data?: R;
}

/** Why the overlay was dismissed */
export type OverlayDismissReason =
  | 'close' // Content component requested close
  | 'backdrop' // User clicked backdrop
  | 'escape' // User pressed Escape
  | 'programmatic'; // Service.dismiss() called externally

// ============================================
// OVERLAY REF
// ============================================

/**
 * Handle to a currently-open overlay.
 * Returned by `NxtOverlayService.open()` for external control.
 *
 * @typeParam R - The result data type
 */
export interface OverlayRef<R = unknown> {
  /** Programmatically dismiss the overlay */
  dismiss(data?: R): void;

  /** Promise that resolves when the overlay is fully closed */
  readonly closed: Promise<OverlayResult<R>>;
}
