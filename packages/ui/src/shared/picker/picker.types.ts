/**
 * @fileoverview Unified Picker Types - Shared type definitions for the picker system
 * @module @nxt1/ui/shared/picker
 * @version 1.0.0
 *
 * This module defines the core types used by the unified picker architecture.
 * The picker system consists of a single reusable shell component that can display
 * different content types (sports, positions, etc.) via a shared service.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    NxtPickerShellComponent                   │
 * │   ┌─────────────────────────────────────────────────────┐   │
 * │   │  Header (title, count badge, close button)          │   │
 * │   ├─────────────────────────────────────────────────────┤   │
 * │   │  Search Bar (optional, configurable)                │   │
 * │   ├─────────────────────────────────────────────────────┤   │
 * │   │  Content Area (ngContent - receives picker content) │   │
 * │   │   ┌─────────────────────────────────────────────┐   │   │
 * │   │   │  SportPickerContent | PositionPickerContent │   │   │
 * │   │   └─────────────────────────────────────────────┘   │   │
 * │   ├─────────────────────────────────────────────────────┤   │
 * │   │  Footer (cancel/confirm buttons)                    │   │
 * │   └─────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import type { Type } from '@angular/core';

// ============================================
// PICKER VARIANT TYPES
// ============================================

/**
 * Available picker content types.
 * Each type determines which content component is rendered inside the shell.
 */
export type PickerType = 'sport' | 'position';

// ============================================
// BASE CONFIGURATION
// ============================================

/**
 * Base configuration shared across all picker types.
 * Contains common settings for the picker shell.
 */
export interface PickerBaseConfig {
  /** Custom title for the picker header */
  readonly title?: string;

  /** Whether to show the search bar */
  readonly showSearch?: boolean;

  /** Placeholder text for the search bar */
  readonly searchPlaceholder?: string;

  /** Whether to show the count badge in header (e.g., "3/5") */
  readonly showCount?: boolean;

  /** Maximum number of selections allowed (for multi-select pickers) */
  readonly maxSelections?: number;

  /** Whether multiple selections are allowed */
  readonly multiSelect?: boolean;

  /** Custom CSS class for the modal */
  readonly cssClass?: string;

  /** Whether backdrop dismisses the picker */
  readonly backdropDismiss?: boolean;
}

// ============================================
// SPORT PICKER CONFIGURATION
// ============================================

/**
 * Configuration specific to the sport picker.
 */
export interface SportPickerConfig extends PickerBaseConfig {
  /** Sports already selected (to show as disabled/added) */
  readonly selectedSports?: readonly string[];

  /** Maximum number of sports allowed */
  readonly maxSports?: number;

  /** Available sports list (optional, uses DEFAULT_SPORTS if not provided) */
  readonly availableSports?: readonly SportItem[];
}

/**
 * Sport item for display in the picker.
 */
export interface SportItem {
  readonly name: string;
  readonly icon: string;
}

/**
 * Result returned when sport picker closes.
 */
export interface SportPickerResult {
  /** Whether the user confirmed (vs cancelled/dismissed) */
  readonly confirmed: boolean;

  /** The selected sport name (null if cancelled) */
  readonly sport: string | null;
}

// ============================================
// POSITION PICKER CONFIGURATION
// ============================================

/**
 * Position group for categorized display.
 */
export interface PositionGroup {
  readonly category: string;
  readonly positions: readonly string[];
}

/**
 * Configuration specific to the position picker.
 */
export interface PositionPickerConfig extends PickerBaseConfig {
  /** The sport context (affects available positions) */
  readonly sport: string;

  /** Currently selected positions */
  readonly selectedPositions?: readonly string[];

  /** Position groups for categorized display */
  readonly positionGroups?: readonly PositionGroup[];

  /** Maximum positions allowed */
  readonly maxPositions?: number;
}

/**
 * Result returned when position picker closes.
 */
export interface PositionPickerResult {
  /** Whether the user confirmed (vs cancelled/dismissed) */
  readonly confirmed: boolean;

  /** The selected positions (empty array if cancelled) */
  readonly positions: string[];
}

// ============================================
// UNIFIED PICKER RESULT
// ============================================

/**
 * Discriminated union of all picker results.
 * Use type guards to narrow down the specific result type.
 */
export type PickerResult = SportPickerResult | PositionPickerResult;

// ============================================
// PICKER SHELL CONFIGURATION
// ============================================

/**
 * Internal configuration passed to the picker shell.
 * This is used by the service to configure the shell component.
 */
export interface PickerShellConfig {
  /** The type of picker content to display */
  readonly type: PickerType;

  /** Title displayed in the header */
  readonly title: string;

  /** Whether to show search functionality */
  readonly showSearch: boolean;

  /** Search placeholder text */
  readonly searchPlaceholder: string;

  /** Whether to show count badge */
  readonly showCount: boolean;

  /** Current selection count */
  readonly currentCount: number;

  /** Maximum selection count */
  readonly maxCount: number;

  /** Whether this is a multi-select picker */
  readonly multiSelect: boolean;

  /** Confirm button text */
  readonly confirmText: string;

  /** Cancel button text */
  readonly cancelText: string;

  /** The content component type to render */
  readonly contentComponent: Type<unknown>;

  /** Props to pass to the content component */
  readonly contentProps: Record<string, unknown>;
}

// ============================================
// PICKER CONTENT COMPONENT INTERFACE
// ============================================

/**
 * Interface that all picker content components must implement.
 * This ensures consistent communication between shell and content.
 */
export interface PickerContentComponent<T = unknown> {
  /** Current search query (updated by shell) */
  searchQuery: string;

  /** Method called when search query changes */
  onSearchChange?(query: string): void;

  /** Get the current selection */
  getSelection(): T;

  /** Check if selection is valid for confirmation */
  isSelectionValid(): boolean;
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default configuration values for sport picker.
 */
export const SPORT_PICKER_DEFAULTS: Required<
  Pick<
    SportPickerConfig,
    | 'title'
    | 'showSearch'
    | 'searchPlaceholder'
    | 'showCount'
    | 'maxSports'
    | 'multiSelect'
    | 'backdropDismiss'
  >
> = {
  title: 'Select Sport',
  showSearch: true,
  searchPlaceholder: 'Search sports...',
  showCount: false,
  maxSports: 5,
  multiSelect: false,
  backdropDismiss: true,
} as const;

/**
 * Default configuration values for position picker.
 */
export const POSITION_PICKER_DEFAULTS: Required<
  Pick<
    PositionPickerConfig,
    | 'title'
    | 'showSearch'
    | 'searchPlaceholder'
    | 'showCount'
    | 'maxPositions'
    | 'multiSelect'
    | 'backdropDismiss'
  >
> = {
  title: 'Select Positions',
  showSearch: false,
  searchPlaceholder: 'Search positions...',
  showCount: true,
  maxPositions: 5,
  multiSelect: true,
  backdropDismiss: true,
} as const;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if result is a SportPickerResult.
 */
export function isSportPickerResult(result: PickerResult): result is SportPickerResult {
  return 'sport' in result;
}

/**
 * Type guard to check if result is a PositionPickerResult.
 */
export function isPositionPickerResult(result: PickerResult): result is PositionPickerResult {
  return 'positions' in result;
}
