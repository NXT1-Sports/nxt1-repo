/**
 * @fileoverview About Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/about
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared About content
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
import { AboutContentShellComponent } from '@nxt1/ui';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    AboutContentShellComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>About NXT1 Sports</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <nxt1-about-content-shell />
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {}
