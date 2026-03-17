/**
 * @fileoverview Privacy Page - Mobile App
 * @module @nxt1/mobile/features/privacy
 * @version 1.0.0
 *
 * Embeds Termly-hosted Privacy Policy in WebView.
 * Content stays up-to-date without app redeployment.
 */

import { Component, ChangeDetectionStrategy, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>Privacy Policy</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <iframe
        [src]="termlyUrl"
        class="h-full w-full border-0"
        title="Privacy Policy"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly termlyUrl: SafeResourceUrl;

  constructor() {
    this.termlyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.PRIVACY);
  }
}
