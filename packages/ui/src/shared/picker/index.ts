/**
 * @fileoverview Unified Picker Module - Public API
 * @module @nxt1/ui/shared/picker
 * @version 1.0.0
 *
 * This module exports the unified picker system that provides consistent
 * modal pickers for sports, positions, and other selection use cases.
 *
 * Architecture:
 * - Single picker shell component for consistent UI chrome
 * - Swappable content components for different selection types
 * - Single service API for all picker types
 *
 * Usage:
 * ```typescript
 * import { NxtPickerService, SportPickerResult, PositionPickerResult } from '@nxt1/ui';
 *
 * private readonly picker = inject(NxtPickerService);
 *
 * // Sport picker
 * const sportResult = await this.picker.openSportPicker({
 *   selectedSports: ['Football'],
 * });
 *
 * // Position picker
 * const positionResult = await this.picker.openPositionPicker({
 *   sport: 'Football',
 *   selectedPositions: ['QB'],
 *   maxPositions: 5,
 * });
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// Types
export type {
  PickerType,
  PickerBaseConfig,
  SportPickerConfig,
  SportItem,
  SportPickerResult,
  PositionGroup,
  PositionPickerConfig,
  PositionPickerResult,
  PickerResult,
  PickerShellConfig,
  PickerContentComponent,
} from './picker.types';

export {
  SPORT_PICKER_DEFAULTS,
  POSITION_PICKER_DEFAULTS,
  isSportPickerResult,
  isPositionPickerResult,
} from './picker.types';

// Components (generally not needed directly - use service)
export { NxtPickerShellComponent } from './picker-shell.component';
export { NxtPickerComponent } from './picker.component';
export { NxtSportPickerContentComponent } from './sport-picker-content.component';
export { NxtPositionPickerContentComponent } from './position-picker-content.component';

// Service (primary API)
export { NxtPickerService } from './picker.service';
