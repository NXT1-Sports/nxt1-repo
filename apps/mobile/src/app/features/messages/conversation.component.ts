/**
 * @fileoverview Conversation Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/messages
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Conversation shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation (NavController)
 * - Route parameter extraction
 * - Haptic feedback
 */

import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ConversationShellComponent,
  NxtLoggingService,
  HapticsService,
  NxtToastService,
} from '@nxt1/ui';

@Component({
  selector: 'app-conversation',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ConversationShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-conversation-shell
        [conversationId]="conversationId()"
        (backClick)="onBack()"
        (infoClick)="onInfo()"
        (callClick)="onCall()"
        (videoClick)="onVideo()"
      />
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
        --background: var(--nxt1-color-bg-primary);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationComponent {
  private readonly navController = inject(NavController);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ConversationComponent');
  private readonly toast = inject(NxtToastService);

  /** Conversation ID from route parameter */
  readonly conversationId = input.required<string>();

  /** Navigate back to activity */
  protected async onBack(): Promise<void> {
    await this.haptics.impact('light');
    await this.navController.navigateBack('/activity');
  }

  /** Open conversation info/details */
  protected onInfo(): void {
    this.logger.debug('Conversation info requested');
    this.toast.info('Profile view coming soon');
  }

  /** Initiate voice call */
  protected onCall(): void {
    this.logger.debug('Voice call requested');
    this.toast.info('Voice calls coming soon');
  }

  /** Initiate video call */
  protected onVideo(): void {
    this.logger.debug('Video call requested');
    this.toast.info('Video calls coming soon');
  }
}
