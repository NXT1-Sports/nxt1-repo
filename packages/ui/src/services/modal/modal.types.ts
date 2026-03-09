/**
 * @fileoverview NxtModalService Types - Unified Modal System
 * @module @nxt1/ui/services/modal
 * @version 1.0.0
 *
 * Type definitions for the unified NXT1 Modal service that intelligently
 * chooses between native OS modals and Ionic components based on complexity
 * and platform capabilities.
 *
 * Design Philosophy:
 * - Simple interactions → Native OS dialogs (iOS UIAlertController, Android AlertDialog)
 * - Complex UX → Ionic components (full control, rich content)
 * - Seamless fallback → Web uses Ionic, mobile uses native when possible
 *
 * @example
 * ```typescript
 * import type { AlertConfig, ConfirmConfig, ActionSheetConfig } from '@nxt1/ui';
 *
 * const alertConfig: AlertConfig = {
 *   title: 'Success',
 *   message: 'Your profile has been updated.',
 * };
 *
 * const confirmConfig: ConfirmConfig = {
 *   title: 'Delete Post?',
 *   message: 'This action cannot be undone.',
 *   destructive: true,
 * };
 * ```
 */

// ============================================
// ALERT CONFIG
// ============================================

/**
 * Configuration for alert dialogs (single button acknowledgment).
 * Native: iOS UIAlertController, Android AlertDialog
 * Web: Ionic Alert
 */
export interface AlertConfig {
  /** Dialog title - displayed prominently */
  title: string;

  /** Message body - supports longer explanatory text */
  message?: string;

  /** Custom button label (default: "OK") */
  buttonText?: string;

  /** Optional icon name (Ionicons) - web/Ionic only */
  icon?: string;
}

// ============================================
// CONFIRM CONFIG
// ============================================

/**
 * Configuration for confirmation dialogs (two button yes/no).
 * Native: iOS UIAlertController, Android AlertDialog
 * Web: Ionic Alert or Bottom Sheet
 */
export interface ConfirmConfig {
  /** Dialog title - the question being asked */
  title: string;

  /** Optional message/description providing context */
  message?: string;

  /** Label for confirm button (default: "Confirm" or "Delete" if destructive) */
  confirmText?: string;

  /** Label for cancel button (default: "Cancel") */
  cancelText?: string;

  /** Whether this is a destructive action (red styling) */
  destructive?: boolean;

  /** Optional icon name (Ionicons) - web/Ionic only */
  icon?: string;

  /**
   * Force a specific implementation:
   * - 'native': Use OS native dialog (mobile only)
   * - 'ionic': Use Ionic alert/bottom sheet
   * - 'auto': Smart selection based on platform (default)
   */
  preferNative?: 'native' | 'ionic' | 'auto';
}

// ============================================
// PROMPT CONFIG
// ============================================

/**
 * Configuration for prompt dialogs (text input).
 * Native: iOS UIAlertController with text field, Android AlertDialog with EditText
 * Web: Ionic Alert with input
 */
export interface PromptConfig {
  /** Dialog title */
  title: string;

  /** Optional message/instructions */
  message?: string;

  /** Placeholder text for input field */
  placeholder?: string;

  /** Pre-filled input value */
  defaultValue?: string;

  /** Label for submit button (default: "OK") */
  submitText?: string;

  /** Label for cancel button (default: "Cancel") */
  cancelText?: string;

  /** Input type (default: "text") */
  inputType?: 'text' | 'number' | 'email' | 'tel' | 'url' | 'password';

  /** Use a multi-line textarea instead of single-line input */
  multiline?: boolean;

  /** Number of visible rows for textarea (default: 4) */
  rows?: number;

  /** Maximum input length */
  maxLength?: number;

  /** Whether input is required (non-empty) */
  required?: boolean;

  /**
   * Force a specific implementation:
   * - 'native': Use OS native dialog (mobile only)
   * - 'ionic': Use Ionic alert (CSS-themeable)
   * - 'auto': Smart selection based on platform (default)
   */
  preferNative?: 'native' | 'ionic' | 'auto';
}

/**
 * Result from prompt dialog.
 */
export interface PromptResult {
  /** Whether user submitted (vs cancelled) */
  confirmed: boolean;

  /** The text value entered (empty string if cancelled) */
  value: string;
}

// ============================================
// ACTION SHEET CONFIG
// ============================================

/**
 * Single action in an action sheet.
 */
export interface ActionSheetAction {
  /** Action label displayed to user */
  text: string;

  /** Optional icon (Ionicons name) - iOS shows icons */
  icon?: string;

  /** Whether this is a destructive action (red text) */
  destructive?: boolean;

  /** Whether this is the cancel action (styled differently) */
  cancel?: boolean;

  /** Optional data to include in result */
  data?: unknown;
}

/**
 * Configuration for action sheets (multiple choice menu).
 * Native: iOS UIActionSheet, Android BottomSheetDialog
 * Web: Ionic Action Sheet
 */
export interface ActionSheetConfig {
  /** Optional title displayed at top */
  title?: string;

  /** Optional subtitle/message below title */
  message?: string;

  /** List of action buttons */
  actions: ActionSheetAction[];

  /** Header element for card-style (iOS) - web/Ionic only */
  presentingElement?: HTMLElement;

  /**
   * Force a specific implementation:
   * - 'native': Use OS native action sheet (mobile only)
   * - 'ionic': Use Ionic action sheet (CSS-themeable)
   * - 'auto': Smart selection based on platform (default)
   */
  preferNative?: 'native' | 'ionic' | 'auto';
}

/**
 * Result from action sheet selection.
 */
export interface ActionSheetResult {
  /** Whether an action was selected (vs dismissed) */
  selected: boolean;

  /** Index of selected action (-1 if dismissed) */
  index: number;

  /** The selected action object (null if dismissed) */
  action: ActionSheetAction | null;

  /** Optional data from the selected action */
  data?: unknown;
}

// ============================================
// LOADING CONFIG (Bonus)
// ============================================

/**
 * Configuration for loading indicator.
 * Native: Activity indicator
 * Web: Ionic Loading
 */
export interface LoadingConfig {
  /** Message to display (optional) */
  message?: string;

  /** Whether backdrop prevents interaction (default: true) */
  backdropDismiss?: boolean;

  /** Maximum duration before auto-dismiss (ms) - safety timeout */
  duration?: number;

  /** Spinner style */
  spinner?: 'circular' | 'dots' | 'lines' | 'crescent';
}

// ============================================
// SERVICE STATE
// ============================================

/**
 * Tracks currently active modals for management.
 */
export interface ActiveModal {
  /** Unique identifier */
  id: string;

  /** Type of modal */
  type: 'alert' | 'confirm' | 'prompt' | 'action-sheet' | 'loading' | 'bottom-sheet';

  /** Timestamp when opened */
  openedAt: number;

  /** Dismiss function */
  dismiss: () => Promise<void>;
}

// ============================================
// MODAL PREFERENCE
// ============================================

/**
 * User/app preference for modal implementation.
 */
export type ModalPreference = 'native' | 'ionic' | 'auto';

/**
 * Platform-specific modal capabilities.
 */
export interface ModalCapabilities {
  /** Supports native dialogs */
  nativeDialogs: boolean;

  /** Supports native action sheets */
  nativeActionSheets: boolean;

  /** Supports haptic feedback on modals */
  haptics: boolean;

  /** Platform identifier */
  platform: 'ios' | 'android' | 'web';
}
