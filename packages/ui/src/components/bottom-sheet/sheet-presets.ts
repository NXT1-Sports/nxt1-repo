/**
 * @fileoverview Bottom Sheet Presets — Standardized breakpoint configurations
 * @module @nxt1/ui/components/bottom-sheet
 * @version 1.0.0
 *
 * Professional-grade preset system for consistent sheet behavior.
 * Every `openSheet()` and `ModalController.create()` call should use one of
 * these presets instead of ad-hoc breakpoint values.
 *
 * Presets control:
 * - **breakpoints** — Snap points the user can drag to
 * - **initialBreakpoint** — Where the sheet opens
 * - **backdropBreakpoint** — When the backdrop becomes visible
 *
 * Why presets matter:
 * - Same drag/snap behavior across the entire app
 * - Consistent visual rhythm (users learn one interaction model)
 * - Faster feature development (pick a preset, done)
 * - Fewer regressions (one source of truth)
 *
 * Usage:
 * ```typescript
 * import { SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
 *
 * await this.bottomSheet.openSheet({
 *   ...SHEET_PRESETS.STANDARD,
 *   component: MyComponent,
 * });
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

/**
 * Type for a single sheet preset configuration.
 * Contains the breakpoint values that define sheet sizing/dragging behavior.
 */
export interface SheetPreset {
  /** Snap points the user can drag to (0 = closed, 1 = full height) */
  readonly breakpoints: number[];
  /** Where the sheet opens initially */
  readonly initialBreakpoint: number;
  /** When the backdrop becomes visible (default: 0.5) */
  readonly backdropBreakpoint: number;
}

/**
 * Standardized sheet presets for ALL bottom sheets in the app.
 *
 * | Preset       | Opens at | Snaps to            | Use for                              |
 * |-------------|----------|---------------------|--------------------------------------|
 * | `LOW`       | 35%      | 0%, 35%             | Confirm dialogs, binary decisions    |
 * | `COMPACT`   | 35%      | 0%, 35%             | Quick action menus, share options    |
 * | `HALF`      | 50%      | 0%, 50%, 75%, 100%  | Pickers, position selector           |
 * | `STANDARD`  | 92%      | 0%, 50%, 92%        | Feature sheets (default for most)    |
 * | `TALL`      | 75%      | 0%, 50%, 75%, 100%  | Edit profile, QR code, manage team   |
 * | `FULL`      | 100%     | 0%, 100%            | Filters, forms that need full screen |
 */
export const SHEET_PRESETS = {
  /**
   * LOW — Compact confirmation (35% of screen)
   * Use for: sign out confirmation, quick yes/no prompts
   */
  LOW: {
    breakpoints: [0, 0.35],
    initialBreakpoint: 0.35,
    backdropBreakpoint: 0,
  },

  /**
   * **Compact** — Small peek sheet (35% of screen).
   * Use for: quick action menus, share options, profile "more" menus.
   */
  COMPACT: {
    breakpoints: [0, 0.35],
    initialBreakpoint: 0.35,
    backdropBreakpoint: 0,
  },

  /**
   * **Half** — Mid-height sheet (50% of screen).
   * Use for: pickers, position selector, selection lists.
   */
  HALF: {
    breakpoints: [0, 0.5, 0.75, 1],
    initialBreakpoint: 0.5,
    backdropBreakpoint: 0.5,
  },

  /**
   * **Tall** — Three-quarter sheet (75% of screen).
   * Use for: edit profile, QR code, manage team, medium-complexity forms.
   */
  TALL: {
    breakpoints: [0, 0.5, 0.75, 1],
    initialBreakpoint: 0.75,
    backdropBreakpoint: 0.5,
  },

  /**
   * **Standard** — Near-full sheet (92% of screen, shows parent context).
   * This is the **default** for most feature sheets.
   * Use for: Agent X operations, invite, activity log, help.
   */
  STANDARD: {
    breakpoints: [0, 0.5, 0.92],
    initialBreakpoint: 0.92,
    backdropBreakpoint: 0.5,
  },

  /**
   * **Full** — Full-height sheet (100% of screen).
   * Use for: filters, forms that need maximum space, biometric prompts.
   */
  FULL: {
    breakpoints: [0, 1],
    initialBreakpoint: 1,
    backdropBreakpoint: 0.5,
  },
} satisfies Record<string, SheetPreset>;

/** Union type of all preset names for type-safe references. */
export type SheetPresetName = keyof typeof SHEET_PRESETS;
