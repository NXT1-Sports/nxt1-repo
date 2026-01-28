/**
 * @fileoverview NxtBottomSheet Types
 * @module @nxt1/ui/components/bottom-sheet
 * @version 1.0.0
 *
 * Type definitions for the NXT1 Bottom Sheet component system.
 * These types are 100% portable and can be used across web and mobile.
 *
 * @example
 * ```typescript
 * import type { BottomSheetConfig, BottomSheetResult } from '@nxt1/ui';
 *
 * const config: BottomSheetConfig = {
 *   title: 'Confirm Action',
 *   actions: [{ label: 'OK', role: 'primary' }],
 * };
 * ```
 */

/**
 * Bottom sheet action button configuration.
 * Represents a single button in the sheet's action area.
 */
export interface BottomSheetAction {
  /** Button label text displayed to the user */
  label: string;

  /**
   * Button visual role determining styling:
   * - `primary`: Filled accent color button (main CTA)
   * - `secondary`: Outlined/surface button (alternative action)
   * - `cancel`: Text-only button (dismiss action)
   * - `destructive`: Red filled button (dangerous action)
   */
  role: 'primary' | 'secondary' | 'cancel' | 'destructive';

  /** Optional Ionicons icon name to display before label */
  icon?: string;

  /** Whether button shows loading spinner (disables interaction) */
  loading?: boolean;

  /** Whether button is disabled */
  disabled?: boolean;

  /** Async handler called when button is tapped */
  handler?: () => void | Promise<void>;
}

/**
 * Bottom sheet configuration options.
 * Passed to NxtBottomSheetService.show() to customize appearance.
 */
export interface BottomSheetConfig {
  /** Title displayed prominently at top of sheet */
  title?: string;

  /** Subtitle or description text below title */
  subtitle?: string;

  /** Optional Ionicons icon name displayed above title */
  icon?: string;

  /** Custom icon component for complex icons (SVGs, etc.) */
  iconComponent?: unknown;

  /** Whether to show close button in header (default: true) */
  showClose?: boolean;

  /** Whether backdrop tap dismisses sheet (default: true) */
  backdropDismiss?: boolean;

  /** Action buttons displayed at bottom */
  actions?: BottomSheetAction[];

  /** Additional CSS class(es) for the modal */
  cssClass?: string;

  /** Whether this is a destructive action - applies error theme */
  destructive?: boolean;

  /** Presenting element for card-style presentation (iOS) */
  presentingElement?: HTMLElement;

  /** Modal breakpoints [0-1] for sheet presentation */
  breakpoints?: number[];

  /** Initial breakpoint position [0-1] */
  initialBreakpoint?: number;

  /** Whether the modal can be dismissed via gesture/backdrop */
  canDismiss?: boolean;
}

/**
 * Bottom sheet dismissal result.
 * Returned from NxtBottomSheetService.show() promise.
 */
export interface BottomSheetResult<T = unknown> {
  /** Whether user confirmed (primary/destructive action) vs cancelled */
  confirmed: boolean;

  /**
   * How the sheet was dismissed:
   * - `confirm`: User tapped primary/destructive action
   * - `cancel`: User tapped cancel button
   * - `backdrop`: User tapped backdrop
   * - `close`: User tapped close button
   */
  reason: 'confirm' | 'cancel' | 'backdrop' | 'close';

  /** Optional data returned from the action handler */
  data?: T;
}

/**
 * Predefined bottom sheet variants for common use cases.
 * Can be used to apply preset styling/behavior.
 */
export type BottomSheetVariant =
  | 'default'
  | 'confirmation'
  | 'destructive'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';
