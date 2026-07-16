/**
 * @fileoverview Privacy Page - Mobile App
 * @module @nxt1/mobile/features/privacy
 * @version 2.0.0
 *
 * Thin wrapper that uses the shared PrivacyContentShellComponent from @nxt1/ui.
 * Follows the standard mobile shell pattern with transparent ion-header spacer.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonContent, IonHeader, IonToolbar, NavController } from '@ionic/angular/standalone';
import { LEGAL_URLS } from '@nxt1/core';
import { NxtPageHeaderComponent } from '@nxt1/ui';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, NxtPageHeaderComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-page-header title="Privacy Policy" [showBack]="true" (backClick)="onBack()" />
      <div class="legal-embed-shell">
        <iframe
          [src]="termlyUrl"
          class="legal-embed-frame"
          title="Privacy Policy"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </div>
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
      ion-content::part(scroll) {
        overflow: hidden;
      }
      .legal-embed-shell {
        height: calc(100% - 56px);
        min-height: 0;
        background: #ffffff;
        color-scheme: light;
      }
      .legal-embed-frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #ffffff;
        color-scheme: light;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  private readonly nav = inject(NavController);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly termlyUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    LEGAL_URLS.PRIVACY
  );

  protected onBack(): void {
    this.nav.back();
  }
}
