/**
 * @fileoverview Messages Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/messages
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Messages shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  MessagesShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  HapticsService,
  type MessagesUser,
} from '@nxt1/ui';
import type { Conversation } from '@nxt1/core';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, MessagesShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-messages-shell
        [user]="userInfo()"
        [showBack]="true"
        (back)="onBack()"
        (avatarClick)="onAvatarClick()"
        (conversationClick)="onConversationClick($event)"
        (compose)="onCompose()"
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
export class MessagesComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('MessagesComponent');

  private readonly authUser = this.authFlow.user;
  readonly profile = this.authFlow.profile;

  /** Transform auth user to MessagesUser interface */
  protected readonly userInfo = computed<MessagesUser | null>(() => {
    const user = this.authUser();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
    };
  });

  /** Open sidenav (Twitter/X pattern) */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /** Navigate to conversation thread */
  protected async onConversationClick(conversation: Conversation): Promise<void> {
    this.logger.debug('Conversation selected', { conversationId: conversation.id });
    await this.haptics.impact('light');
    await this.navController.navigateForward(`/messages/${conversation.id}`);
  }

  /** Navigate back */
  protected onBack(): void {
    void this.navController.back();
  }

  /** Navigate to compose new message */
  protected async onCompose(): Promise<void> {
    this.logger.debug('Compose new message');
    await this.haptics.impact('light');
    await this.navController.navigateForward('/messages/new');
  }
}
