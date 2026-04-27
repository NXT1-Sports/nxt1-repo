/**
 * @fileoverview Activity Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/activity
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Activity shell
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
  ActivityShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtBottomSheetService,
  SHEET_PRESETS,
  AgentXOperationChatComponent,
  type ActivityUser,
} from '@nxt1/ui';
import type { ActivityItem, InboxEmailProvider, AgentTaskActivityMetadata } from '@nxt1/core';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { MobileEmailConnectionService } from '../../core/services/api/email-connection.service';
import { ProfileService } from '../../core/services/state/profile.service';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ActivityShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-activity-shell
        [user]="userInfo()"
        [showBack]="true"
        (back)="onBack()"
        (avatarClick)="onAvatarClick()"
        (itemNavigate)="onItemNavigate($event)"
        (connectProviderRequest)="onConnectProvider($event)"
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
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileService = inject(ProfileService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly emailConnection = inject(MobileEmailConnectionService);

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;
    const connectedEmails = this.profileService.user()?.connectedEmails ?? [];

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      email: user.email,
      connectedEmails,
      uid: user.uid,
    };
  });

  /**
   * Handle back navigation.
   */
  protected onBack(): void {
    void this.navController.back();
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Uses NavController for native page transitions.
   *
   * For agent_task items, opens the thread in a bottom sheet
   * so users can view the conversation and any generated media.
   */
  protected onItemNavigate(item: ActivityItem): void {
    if (!item.deepLink) {
      this.logger.debug('Item clicked without deepLink', { id: item.id, type: item.type });
      return;
    }

    this.logger.debug('Navigating to item', {
      id: item.id,
      type: item.type,
      deepLink: item.deepLink,
    });

    // Normalize deep link: canonical route is /agent-x.
    const normalizedLink = item.deepLink.replace(/^\/agent(?=[/?]|$)/, '/agent-x');

    const threadId = this.resolveAgentThreadId(item, normalizedLink);
    if (item.type === 'agent_task' && threadId) {
      this.logger.info('Opening agent task from activity in bottom sheet', {
        id: item.id,
        threadId,
      });

      void this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: item.id,
          contextTitle: item.title,
          contextIcon: 'sparkles',
          contextType: 'operation',
          threadId,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      return;
    }

    void this.navController.navigateForward(normalizedLink);
  }

  /**
   * Handle connect email provider request.
   * Uses EmailConnectionService to connect Gmail or Microsoft.
   * Native SDKs automatically show account picker for user selection.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    const user = this.authFlow.user();
    if (!user?.uid) {
      this.logger.warn('User not authenticated, cannot connect email provider');
      return;
    }

    // Delegate to EmailConnectionService
    // Service handles account selection, OAuth flow, API calls, and error handling
    await this.emailConnection.connectProvider(provider, user.uid);
  }

  private resolveAgentThreadId(item: ActivityItem, normalizedLink: string): string | null {
    const metadata = item.metadata as AgentTaskActivityMetadata | undefined;
    if (metadata?.threadId?.trim()) {
      return metadata.threadId.trim();
    }

    if (!normalizedLink.startsWith('/agent-x')) {
      return null;
    }

    try {
      const url = new URL(normalizedLink, 'https://nxt1.local');
      return url.searchParams.get('thread');
    } catch (error) {
      this.logger.warn('Failed to parse agent deep link', {
        deepLink: item.deepLink,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
