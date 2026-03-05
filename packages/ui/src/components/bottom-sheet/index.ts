/**
 * @fileoverview Bottom Sheet Module Barrel Export
 * @module @nxt1/ui/components/bottom-sheet
 *
 * Exports all bottom sheet related components, services, and types.
 *
 * Two patterns supported:
 * 1. Action Sheets: Confirmations, alerts, action menus (show/confirm/alert)
 * 2. Content Sheets: Full component injection (openSheet)
 *
 * Usage:
 * ```typescript
 * import {
 *   NxtBottomSheetComponent,
 *   NxtBottomSheetService,
 *   BottomSheetConfig,
 *   BottomSheetResult,
 *   ContentSheetConfig,
 *   ContentSheetResult,
 * } from '@nxt1/ui';
 *
 * // Action sheet
 * const confirmed = await bottomSheet.confirm('Delete?', 'Cannot undo');
 *
 * // Content sheet (inject any component)
 * const result = await bottomSheet.openSheet({
 *   component: MyComponent,
 *   ...SHEET_PRESETS.TALL,
 * });
 * ```
 */

// Components
export { NxtBottomSheetComponent } from './bottom-sheet.component';
export {
  NxtSheetHeaderComponent,
  type SheetHeaderIconShape,
  type SheetHeaderClosePosition,
} from './sheet-header.component';

// Services
export { NxtBottomSheetService } from './bottom-sheet.service';

// Types
export type {
  BottomSheetAction,
  BottomSheetConfig,
  BottomSheetResult,
  BottomSheetVariant,
  ContentSheetConfig,
  ContentSheetResult,
} from './bottom-sheet.types';

// Presets
export { SHEET_PRESETS, type SheetPreset, type SheetPresetName } from './sheet-presets';
