/**
 * @fileoverview Privacy Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/privacy
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Privacy content
 * from @nxt1/ui and handles platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual content lives in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific navigation (Ionic)
 * - Mobile-specific layout (ion-header, ion-content)
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { PrivacyContentShellComponent } from '@nxt1/ui';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    PrivacyContentShellComponent,
  ],
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
      <nxt1-privacy-content-shell />
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {}
