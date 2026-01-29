/**
 * @fileoverview Option Scroller Types
 * @module @nxt1/ui/components/option-scroller
 *
 * Type definitions for the professional option scroller component.
 * Modeled after Twitter/TikTok "For You" / "Following" navigation pattern.
 */

/**
 * Individual option/tab configuration
 */
export interface OptionScrollerItem {
  /** Unique identifier for the option */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Optional icon name (Ionicon) */
  readonly icon?: string;
  /** Optional badge count */
  readonly badge?: number;
  /** Whether the option is disabled */
  readonly disabled?: boolean;
}

/**
 * Visual style variants
 */
export type OptionScrollerVariant =
  | 'default' // Standard underline indicator (Twitter style)
  | 'pill' // Pill/capsule background (TikTok style)
  | 'minimal'; // Subtle, no visible indicator background

/**
 * Indicator animation style
 */
export type OptionScrollerIndicatorStyle =
  | 'slide' // Smooth sliding animation
  | 'fade' // Fade transition
  | 'spring'; // Spring physics animation

/**
 * Size variants
 */
export type OptionScrollerSize = 'sm' | 'md' | 'lg';

/**
 * Option scroller configuration
 */
export interface OptionScrollerConfig {
  /** Visual style variant */
  readonly variant?: OptionScrollerVariant;
  /** Indicator animation style */
  readonly indicatorStyle?: OptionScrollerIndicatorStyle;
  /** Size variant */
  readonly size?: OptionScrollerSize;
  /** Enable swipe gestures between options */
  readonly swipeEnabled?: boolean;
  /** Show divider below the scroller */
  readonly showDivider?: boolean;
  /** Stretch options to fill width equally */
  readonly stretchToFill?: boolean;
  /** Center options when they don't fill the width */
  readonly centered?: boolean;
  /** Allow horizontal scrolling for many options */
  readonly scrollable?: boolean;
  /** Custom indicator color (uses primary by default) */
  readonly indicatorColor?: string;
  /** Custom active text color */
  readonly activeTextColor?: string;
  /** Custom inactive text color */
  readonly inactiveTextColor?: string;
}

/**
 * Selection change event
 */
export interface OptionScrollerChangeEvent {
  /** The newly selected option */
  readonly option: OptionScrollerItem;
  /** Index of the selected option */
  readonly index: number;
  /** Previous option (if any) */
  readonly previousOption?: OptionScrollerItem;
  /** Previous index */
  readonly previousIndex?: number;
  /** Whether the change was from a swipe gesture */
  readonly fromSwipe: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_OPTION_SCROLLER_CONFIG: Required<OptionScrollerConfig> = {
  variant: 'default',
  indicatorStyle: 'slide',
  size: 'md',
  swipeEnabled: true,
  showDivider: true,
  stretchToFill: true,
  centered: false,
  scrollable: false,
  indicatorColor: '',
  activeTextColor: '',
  inactiveTextColor: '',
};

/**
 * Size configuration mapping
 */
export const OPTION_SCROLLER_SIZES: Record<
  OptionScrollerSize,
  { height: number; fontSize: number; padding: number }
> = {
  sm: { height: 40, fontSize: 13, padding: 12 },
  md: { height: 48, fontSize: 15, padding: 16 },
  lg: { height: 56, fontSize: 17, padding: 20 },
};
