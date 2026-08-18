/**
 * @fileoverview Release Notes Modal Component — Ionic bottom-sheet wrapper (mobile)
 * @module @nxt1/ui/release-notes
 *
 * Thin Ionic wrapper. Receives `note` via Ionic componentProps and dismisses
 * via ModalController so the sheet closes with proper back-animation.
 */

import { Component, ChangeDetectionStrategy, Input, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtReleaseNotesContentComponent } from './release-notes-content.component';
import type { SystemReleaseNote } from '@nxt1/core';

@Component({
  selector: 'nxt1-release-notes-modal',
  standalone: true,
  imports: [NxtReleaseNotesContentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nxt1-release-notes-content [note]="note" (close)="onClose($event)" /> `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow-y: auto;
        background: var(--nxt1-color-bg-primary, #0d0d0d);
      }
    `,
  ],
})
export class NxtReleaseNotesModalComponent {
  private readonly modalCtrl = inject(ModalController);

  @Input() note: SystemReleaseNote | null = null;

  protected onClose(event: { action: 'dismiss' | 'cta' }): void {
    void this.modalCtrl.dismiss({ action: event.action }, event.action);
  }
}
