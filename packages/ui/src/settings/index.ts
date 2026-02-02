/**
 * @fileoverview Settings Module - Barrel Export
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Exports all Settings feature components and services.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// Service
export { SettingsService } from './settings.service';

// Components
export { SettingsShellComponent, type SettingsUser } from './settings-shell.component';
export {
  SettingsSectionComponent,
  type SettingsSectionToggleEvent,
} from './settings-section.component';
export {
  SettingsItemComponent,
  type SettingsToggleEvent,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
  type SettingsSelectEvent,
  type SettingsCopyEvent,
} from './settings-item.component';
export { SettingsSkeletonComponent } from './settings-skeleton.component';
