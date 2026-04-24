/**
 * @fileoverview Page Header Types
 * @module @nxt1/ui/components/page-header
 *
 * Type definitions for the professional page header component.
 */

import { DEFAULT_NAVIGATION_SURFACE_CONFIG } from '@nxt1/core';

/**
 * Header visual style variants
 */
export type PageHeaderVariant = 'default' | 'transparent' | 'blur' | 'solid';

/**
 * Left-side control variant for the page header.
 * - 'avatar': Shows user profile image / initials (Twitter/X style). Default.
 * - 'hamburger': Shows a hamburger menu icon that emits menuClick.
 */
export type PageHeaderLeftVariant = 'avatar' | 'hamburger';

/**
 * Header action button configuration
 */
export interface PageHeaderAction {
  /** Unique identifier for the action */
  readonly id: string;
  /** Ionicon name for the button */
  readonly icon: string;
  /** Accessible label */
  readonly label?: string;
  /** Optional badge count (notifications, messages, etc.) */
  readonly badge?: number;
  /** Whether the action is disabled */
  readonly disabled?: boolean;
  /** Danger styling (for destructive actions) */
  readonly danger?: boolean;
}

/**
 * Full header configuration
 */
export interface PageHeaderConfig {
  /** Visual style variant */
  readonly variant?: PageHeaderVariant;
  /** Enable iOS-style large title collapse on scroll */
  readonly collapsible?: boolean;
  /** Enable translucent blur effect (iOS style) */
  readonly translucent?: boolean;
  /** Show border at bottom */
  readonly bordered?: boolean;
  /**
   * Whether to use glass (translucent) or solid background.
   * - true: Translucent "Liquid Glass" effect with backdrop blur (iOS 26 style)
   * - false: Solid opaque background (default)
   */
  readonly glass?: boolean;
  /** Custom background color */
  readonly backgroundColor?: string;
  /** Custom text color */
  readonly textColor?: string;
  /** Safe area handling mode */
  readonly safeArea?: 'auto' | 'always' | 'never';
}

/**
 * Default header configuration
 */
export const DEFAULT_PAGE_HEADER_CONFIG: PageHeaderConfig = {
  variant: 'transparent',
  collapsible: false,
  bordered: false,
  ...DEFAULT_NAVIGATION_SURFACE_CONFIG,
  safeArea: 'auto',
};
