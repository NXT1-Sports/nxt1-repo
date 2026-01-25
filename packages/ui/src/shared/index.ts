/**
 * @fileoverview Shared Components Barrel Export
 * @module @nxt1/ui/shared
 *
 * General-purpose UI components used across the application.
 */

export { NxtLogoComponent, type LogoSize, type LogoVariant } from './logo';

export {
  NxtImageComponent,
  type ImageFit,
  type ImageLoading,
  type ImageVariant,
  type ImageState,
} from './image';

export { NxtIconComponent, type IconName, type UIIconName, type BrandIconName } from './icon';

export { NxtChipComponent, type ChipSize, type ChipVariant } from './chip';

export { NxtValidationSummaryComponent, type ValidationSummaryVariant } from './validation-summary';

export { NxtFormFieldComponent } from './form-field';

export { NxtTeamLogoPickerComponent } from './team-logo-picker';

export { NxtColorPickerComponent } from './color-picker';

export {
  NxtBottomSheetComponent,
  NxtBottomSheetService,
  type BottomSheetAction,
  type BottomSheetConfig,
  type BottomSheetResult,
  type BottomSheetVariant,
} from './bottom-sheet';
