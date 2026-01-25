/**
 * @fileoverview Bottom Sheet Module Barrel Export
 * @module @nxt1/ui/shared/bottom-sheet
 *
 * Exports all bottom sheet related components, services, and types.
 *
 * Usage:
 * ```typescript
 * import {
 *   NxtBottomSheetComponent,
 *   NxtBottomSheetService,
 *   BottomSheetConfig,
 *   BottomSheetResult,
 *   BottomSheetAction,
 * } from '@nxt1/ui';
 * ```
 */

// Components
export { NxtBottomSheetComponent } from './bottom-sheet.component';

// Services
export { NxtBottomSheetService } from './bottom-sheet.service';

// Types
export type {
  BottomSheetAction,
  BottomSheetConfig,
  BottomSheetResult,
  BottomSheetVariant,
} from './bottom-sheet.types';
