/**
 * @fileoverview NxtModalService - Public API
 * @module @nxt1/ui/services/modal
 *
 * Unified native modal system for NXT1 platform.
 * Intelligently selects between native OS modals and Ionic components.
 *
 * @example
 * ```typescript
 * import { NxtModalService, type ConfirmConfig } from '@nxt1/ui';
 *
 * @Component({...})
 * export class MyComponent {
 *   private readonly modal = inject(NxtModalService);
 *
 *   async confirmDelete(): Promise<void> {
 *     const confirmed = await this.modal.confirm({
 *       title: 'Delete?',
 *       destructive: true,
 *     });
 *   }
 * }
 * ```
 */

export { NxtModalService } from './modal.service';
export type {
  AlertConfig,
  ConfirmConfig,
  PromptConfig,
  PromptResult,
  ActionSheetConfig,
  ActionSheetAction,
  ActionSheetResult,
  LoadingConfig,
  ActiveModal,
  ModalCapabilities,
  ModalPreference,
} from './modal.types';
