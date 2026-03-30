/**
 * @fileoverview Terms Page - Mobile App
 * @module @nxt1/mobile/features/terms
 * @version 2.0.0
 *
 * Thin wrapper that uses the shared TermsContentShellComponent from @nxt1/ui.
 * Follows the standard mobile shell pattern with transparent ion-header spacer.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { IonContent, IonHeader, IonToolbar, NavController } from '@ionic/angular/standalone';
import { TermsContentShellComponent } from '@nxt1/ui';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, TermsContentShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-terms-content-shell [showBack]="true" (back)="onBack()" />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  private readonly nav = inject(NavController);

  protected onBack(): void {
    this.nav.back();
  }
}
