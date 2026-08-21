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

  /**
   * Action button layout.
   * - `vertical`: Stacked full-width buttons (default)
   * - `horizontal`: Side-by-side buttons for compact confirmations
   * - `row`: Status text left + small buttons right (e.g. update check)
   */
  actionsLayout?: 'vertical' | 'horizontal' | 'row';

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

  /** Breakpoint at which backdrop becomes visible [0-1] */
  backdropBreakpoint?: number;

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

// ============================================
// CONTENT SHEET TYPES (Full Component Injection)
// ============================================

/**
 * Configuration for opening a full-content sheet modal.
 * Use this when you need to inject an entire component into the sheet,
 * rather than just showing actions/confirmations.
 *
 * @example
 * ```typescript
 * const result = await bottomSheet.openSheet({
 *   component: EditProfileModalComponent,
 *   componentProps: { userId: '123' },
 *   ...SHEET_PRESETS.TALL,
 * });
 * ```
 */
export interface ContentSheetConfig<T = unknown> {
  /** The Angular component to render inside the sheet */
  component: unknown;

  /** Props to pass to the component */
  componentProps?: Record<string, unknown>;

  /**
   * Modal breakpoints for draggable resize.
   * - [0, 1] = Simple open/close (default)
   * - [0, 0.5, 0.75, 1] = Multi-step draggable
   */
  breakpoints?: number[];

  /** Initial breakpoint position (0-1). Default: 0.75 */
  initialBreakpoint?: number;

  /** Show native drag handle bar. Default: true */
  showHandle?: boolean;

  /**
   * Whether scroll gestures inside the sheet should expand or move the sheet.
   * Default: false for content sheets so inner content scrolls without dragging
   * the entire modal toward dismissal.
   */
  expandToScroll?: boolean;

  /**
   * Handle behavior when tapped:
   * - 'none': No action on tap
   * - 'cycle': Cycle through breakpoints on tap
   */
  handleBehavior?: 'none' | 'cycle';

  /** Whether backdrop tap dismisses sheet. Default: false for content sheets */
  backdropDismiss?: boolean;

  /**
   * Breakpoint at which backdrop becomes visible.
   * Useful for sheets that start small.
   */
  backdropBreakpoint?: number;

  /**
   * Custom dismiss guard. Return false to prevent dismiss.
   * Useful for unsaved changes confirmation.
   * Matches Ionic's ModalOptions.canDismiss signature.
   */
  canDismiss?: boolean | ((data?: T, role?: string) => Promise<boolean>);

  /** Additional CSS classes for customization */
  cssClass?: string | string[];
}

/**
 * Result from a content sheet dismissal.
 */
export interface ContentSheetResult<T = unknown> {
  /** The data returned when the sheet was dismissed */
  data?: T;

  /** How the sheet was dismissed: 'save', 'cancel', 'backdrop', 'gesture' */
  role?: string;
}
