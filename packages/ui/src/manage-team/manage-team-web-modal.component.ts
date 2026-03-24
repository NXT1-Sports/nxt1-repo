/**
 * @fileoverview Manage Team Web Modal Wrapper
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Thin wrapper around ManageTeamShellComponent for use inside
 * NxtOverlayService on desktop web.
 *
 * Why a wrapper?
 * - NxtOverlayService auto-subscribes to `close` output to dismiss.
 * - ManageTeamShellComponent emits `close` (cancel) and `save` (success)
 *   as separate outputs. This wrapper bridges `save` → `close` with data
 *   so the overlay captures both paths.
 * - Adds unsaved-changes confirmation on close.
 *
 * ⭐ WEB DESKTOP ONLY — Mobile uses ManageTeamBottomSheetService ⭐
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ManageTeamShellComponent } from './manage-team-shell.component';
import { ManageTeamService } from './manage-team.service';
import { NxtModalService } from '../services/modal';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtModalHeaderComponent } from '../components/overlay/modal-header.component';

@Component({
  selector: 'nxt1-manage-team-web-modal',
  standalone: true,
  imports: [ManageTeamShellComponent, NxtModalHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-mt-web-modal">
      <!-- Shared modal header — owns close + save chrome -->
      <nxt1-modal-header
        [title]="modalTitle()"
        closePosition="left"
        [showBorder]="true"
        (closeModal)="onShellClose()"
      >
        <button
          modalHeaderAction
          type="button"
          class="nxt1-web-modal-save-btn"
          [class.nxt1-web-modal-save-btn--active]="manageTeamService.hasUnsavedChanges()"
          [disabled]="manageTeamService.isSaving()"
          (click)="onHeaderActionClick()"
          aria-label="Save changes"
        >
          @if (manageTeamService.isSaving()) {
            <span class="nxt1-web-modal-save-spinner" aria-hidden="true"></span>
          } @else {
            <span>{{ manageTeamService.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
          }
        </button>
      </nxt1-modal-header>

      <!-- Shell renders body only — header/footer suppressed via headless=true -->
      <nxt1-manage-team-shell
        [headless]="true"
        [teamId]="teamId()"
        [showTabs]="true"
        [showProgress]="true"
        (close)="onShellClose()"
        (save)="onShellSave()"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .nxt1-mt-web-modal {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      /* Save button in the modal header action slot */
      .nxt1-web-modal-save-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease;
        white-space: nowrap;
      }

      .nxt1-web-modal-save-btn--active {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-web-modal-save-btn:hover:not(:disabled):not(.nxt1-web-modal-save-btn--active) {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-web-modal-save-btn:hover:not(:disabled).nxt1-web-modal-save-btn--active {
        opacity: 0.9;
      }

      .nxt1-web-modal-save-btn:active:not(:disabled) {
        transform: scale(0.97);
      }

      .nxt1-web-modal-save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .nxt1-web-modal-save-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* Inline CSS spinner for loading state (no Ionic) */
      .nxt1-web-modal-save-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid transparent;
        border-top-color: currentcolor;
        border-radius: 50%;
        animation: nxt1WebModalSaveSpin 0.7s linear infinite;
      }

      @keyframes nxt1WebModalSaveSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nxt1-web-modal-save-btn {
          transition: none;
        }

        .nxt1-web-modal-save-btn:active:not(:disabled) {
          transform: none;
        }

        .nxt1-web-modal-save-spinner {
          animation: none;
          opacity: 0.7;
        }
      }
    `,
  ],
})
export class ManageTeamWebModalComponent {
  readonly teamId = input<string | null>(null);

  /**
   * NxtOverlayService auto-subscribes to `close` output.
   * Emitting here triggers the overlay to animate out and resolve `ref.closed`.
   */
  readonly close = output<{ saved: boolean }>();

  /** Reference to the shell to call requestSave() for the headless save path. */
  private readonly shellRef = viewChild(ManageTeamShellComponent);

  private readonly modal = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamWebModal');

  /** Exposed to template for save-button state bindings. */
  protected readonly manageTeamService = inject(ManageTeamService);

  /** Dynamic modal title based on team name. */
  protected readonly modalTitle = computed(() => {
    const name = this.manageTeamService.teamName();
    return name ? `Manage ${name}` : 'Manage Team';
  });

  /**
   * Header action button handler.
   * - "Save" (has unsaved changes): delegates to the shell's requestSave() so the
   *   actual API call and analytics run, then the shell emits `save` → onShellSave().
   * - "Done" (nothing changed): closes immediately with saved=false so the parent
   *   does NOT trigger an unnecessary team refresh.
   */
  protected async onHeaderActionClick(): Promise<void> {
    if (this.manageTeamService.hasUnsavedChanges()) {
      await this.shellRef()?.requestSave();
    } else {
      this.logger.info('Manage team modal closed (no changes)');
      this.close.emit({ saved: false });
    }
  }

  /** User clicked close/cancel in the shell. Guard unsaved changes. */
  protected async onShellClose(): Promise<void> {
    if (this.manageTeamService.hasUnsavedChanges()) {
      const discard = await this.modal.confirm({
        title: 'Discard Changes?',
        message: 'You have unsaved changes that will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        destructive: true,
      });
      if (!discard) return;
    }
    this.logger.info('Manage team modal closed without saving');
    this.close.emit({ saved: false });
  }

  /** Shell completed a successful save — close the overlay and signal saved=true. */
  protected onShellSave(): void {
    this.logger.info('Manage team modal saved');
    this.close.emit({ saved: true });
  }
}
