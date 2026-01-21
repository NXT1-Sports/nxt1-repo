/**
 * @fileoverview Position Picker Types
 * @module @nxt1/ui/shared/position-picker
 * @version 1.0.0
 *
 * TypeScript interfaces for the position picker modal system.
 * These types ensure type safety across the modal service and component.
 */

import type { PositionGroup } from '@nxt1/core/constants';

/**
 * Configuration options for opening the position picker modal.
 */
export interface PositionPickerConfig {
  /** Sport identifier (e.g., 'football', 'basketball') */
  sport: string;

  /** Currently selected positions */
  selectedPositions: string[];

  /** Position groups organized by category */
  positionGroups: PositionGroup[];

  /** Maximum number of positions allowed (default: 5) */
  maxPositions?: number;

  /** Modal title (default: 'Select Positions') */
  title?: string;

  /** Whether to show position count in title */
  showCount?: boolean;
}

/**
 * Result returned when the position picker is dismissed.
 */
export interface PositionPickerResult {
  /** Whether the user confirmed the selection (true) or cancelled (false) */
  confirmed: boolean;

  /** The selected positions (empty array if cancelled) */
  positions: string[];
}

/**
 * Internal state for the position picker component.
 */
export interface PositionPickerState {
  /** Sport being edited */
  sport: string;

  /** Position groups to display */
  positionGroups: PositionGroup[];

  /** Currently selected positions (working copy) */
  selectedPositions: string[];

  /** Maximum positions allowed */
  maxPositions: number;

  /** Modal title */
  title: string;
}

/**
 * Default configuration values.
 */
export const POSITION_PICKER_DEFAULTS = {
  maxPositions: 5,
  title: 'Select Positions',
  showCount: true,
} as const;
