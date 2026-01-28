/**
 * @fileoverview Position Picker Public API
 * @module @nxt1/ui/components/position-picker
 *
 * Barrel export for the position picker shared component.
 *
 * Usage:
 * ```typescript
 * import {
 *   NxtPositionPickerService,
 *   NxtPositionPickerComponent,
 *   type PositionPickerConfig,
 *   type PositionPickerResult,
 * } from '@nxt1/ui';
 * ```
 */

// Component (rarely needed directly - service handles creation)
export { NxtPositionPickerComponent } from './position-picker.component';

// Service (main API for consumers)
export { NxtPositionPickerService } from './position-picker.service';

// Types
export type {
  PositionPickerConfig,
  PositionPickerResult,
  PositionPickerState,
} from './position-picker.types';

export { POSITION_PICKER_DEFAULTS } from './position-picker.types';
